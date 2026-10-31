import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const supabaseMock = readFileSync(new URL('./fixtures/supabase-mock.js', import.meta.url), 'utf8');
const supabaseCdn = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.min.js';
const supabaseProject = 'https://hwmpwvbvgiqotdzkmgwh.supabase.co';

const themes = [
  { name: 'azul', text: '#F5F5F5' },
  { name: 'claro', text: '#15161A' },
  { name: 'marinho', text: '#13294B' },
  { name: 'moderno', text: '#F0F4FF' }
];

test.beforeEach(async function ({ page }) {
  await page.route(supabaseCdn, async function (route) {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: supabaseMock
    });
  });

  /* Bloqueia qualquer tentativa de acesso à API real durante os testes. */
  await page.route(supabaseProject + '/**', async function (route) {
    await route.abort('blockedbyclient');
  });
});

async function abrirAbertura(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#alicerce-auth-boot-gate')).toHaveCount(0);
  await expect(page.locator('#livingSplash')).toBeVisible();
}

async function registrarAxe(page, testInfo, nome) {
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const resumo = {
    estado: nome,
    url: page.url(),
    totalViolacoes: resultado.violations.length,
    violacoes: resultado.violations.map(function (item) {
      return {
        id: item.id,
        impacto: item.impact,
        regra: item.help,
        quantidadeElementos: item.nodes.length,
        seletores: item.nodes.slice(0, 10).map(function (node) { return node.target; })
      };
    }),
    incompletas: resultado.incomplete.map(function (item) {
      return { id: item.id, regra: item.help };
    })
  };

  await testInfo.attach('axe-' + nome + '.json', {
    body: Buffer.from(JSON.stringify(resumo, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  console.log('[axe:' + nome + '] ' + resumo.totalViolacoes + ' violações; relatório anexado ao teste.');
  expect(resultado.violations).toBeInstanceOf(Array);
}

test('restaura sem sessão persistida e libera a abertura do Alicerce', async function ({ page }) {
  await abrirAbertura(page);
  await expect(page.locator('#loginLiving')).toBeHidden();
  await expect(page.getByRole('button', { name: /começar/i })).toBeVisible();
});

test('mostra retorno seguro quando o login recebe credenciais inválidas', async function ({ page }) {
  await abrirAbertura(page);
  await page.locator('#calGlassBtn').click();
  await expect(page.locator('#loginLiving')).toBeVisible();

  await page.locator('#login-email').fill('teste@exemplo.com');
  await page.locator('#login-pass').fill('senha-invalida');
  await page.locator('#loginLiving .login-btn').click();

  await expect(page.locator('#alicerce-auth-feedback')).toContainText('E-mail ou senha incorretos.');
  await expect(page.locator('#loginLiving')).toBeVisible();
  await expect(page.locator('#alicerce-auth-boot-gate')).toHaveCount(0);

  const chamada = await page.evaluate(function () { return window.__alicerceMockSignIn; });
  expect(chamada).toEqual({ email: 'teste@exemplo.com', passwordWasProvided: true });
});

test('mantém o layout dentro das larguras comuns de celular', async function ({ page }, testInfo) {
  await abrirAbertura(page);

  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width: width, height: 844 });
    const metricas = await page.evaluate(function () {
      return {
        viewport: window.innerWidth,
        documento: document.documentElement.scrollWidth,
        aplicativo: document.getElementById('app').getBoundingClientRect().width
      };
    });

    await testInfo.attach('abertura-' + width + 'px.json', {
      body: Buffer.from(JSON.stringify(metricas, null, 2), 'utf8'),
      contentType: 'application/json'
    });
    await testInfo.attach('abertura-' + width + 'px.png', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });

    expect(metricas.viewport).toBe(width);
    expect(metricas.aplicativo).toBeLessThanOrEqual(width + 1);
    expect(metricas.documento).toBeLessThanOrEqual(width + 1);
  }
});

test('registra baseline axe nas quatro opções de tema, na abertura e no login', async function ({ page }, testInfo) {
  await abrirAbertura(page);

  for (const theme of themes) {
    await page.evaluate(function (name) {
      document.body.setAttribute('data-theme', name);
    }, theme.name);

    const textColor = await page.evaluate(function () {
      return getComputedStyle(document.body).getPropertyValue('--text').trim().toUpperCase();
    });
    expect(textColor).toBe(theme.text.toUpperCase());
    await registrarAxe(page, testInfo, 'abertura-' + theme.name);
  }

  await page.locator('#calGlassBtn').click();
  await expect(page.locator('#loginLiving')).toBeVisible();

  for (const theme of themes) {
    await page.evaluate(function (name) {
      document.body.setAttribute('data-theme', name);
    }, theme.name);
    await registrarAxe(page, testInfo, 'login-' + theme.name);
  }
});
