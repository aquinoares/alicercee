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

async function prepararTelaSemNuvem(page, screen) {
  await abrirAbertura(page);
  await page.evaluate(function (screenName) {
    Store.userId = null;
    Store.userEmail = '';
    Store.lang = 'pt';
    Store.theme = 'azul';
    Store.screenData = null;
    Store.subscription = null;
    Store.settings = { lang: 'pt', theme: 'azul' };
    Store.movements = [];
    Store.cards = [];
    Store.loans = [];
    Store.installments = [];
    Store.commitments = [];
    Store.financing = [];
    Store.consortium = [];
    Store.extraIncome = [];
    Store.insurance = [];
    Store.familyPeople = [];
    Store.familyCategories = [];
    Store.doctors = [];
    Store.medications = [];
    Store.doseLogs = [];
    Store.learning = {};
    Store.screen = screenName;
    document.body.setAttribute('data-theme', 'azul');
    var app = document.getElementById('app');
    app.classList.remove('hidden');
    app.innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  }, screen);
  await expect(page.locator('#app')).toBeVisible();
}

async function registrarAxe(page, testInfo, nome) {
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const violacoes = resultado.violations.map(function (item) {
    return {
      id: item.id,
      impacto: item.impact,
      regra: item.help,
      quantidadeElementos: item.nodes.length,
      elementos: item.nodes.slice(0, 12).map(function (node) {
        return {
          seletores: node.target,
          resumo: node.failureSummary
        };
      })
    };
  });

  const resumo = {
    estado: nome,
    url: page.url(),
    totalViolacoes: violacoes.length,
    violacoes: violacoes,
    incompletas: resultado.incomplete.map(function (item) {
      return { id: item.id, regra: item.help };
    })
  };

  await testInfo.attach('axe-' + nome + '.json', {
    body: Buffer.from(JSON.stringify(resumo, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  console.log('[axe:' + nome + '] ' + JSON.stringify(violacoes));
  expect(resultado.violations).toBeInstanceOf(Array);
  if (nome.indexOf('tela-') === 0) {
    expect(violacoes, 'A tela ' + nome + ' deve começar sem violações axe.').toEqual([]);
  }
}

test('restaura sem sessão persistida e libera a abertura do Alicerce', async function ({ page }) {
  await abrirAbertura(page);
  await expect(page.locator('#loginLiving')).toBeHidden();
  await expect(page.locator('#calGlassBtn')).toBeVisible();
  await expect(page.locator('#calGlassBtn')).toHaveAttribute('type', 'button');
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

test('não bloqueia o zoom do navegador no celular', async function ({ page }) {
  await abrirAbertura(page);
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('width=device-width');
  expect(viewport).toContain('initial-scale=1');
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no/i);
  expect(viewport).not.toMatch(/maximum-scale\s*=\s*1(?:\.0+)?(?:,|$)/i);
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

test('renderiza Home, Gastos, Cartões e Configurações com estado isolado', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  await expect(page.locator('.balance-grid')).toBeVisible();
  await expect(page.locator('.section-title')).toContainText(/compromissos/i);

  await prepararTelaSemNuvem(page, 'gastos');
  await expect(page.locator('#alicerce-gastos-screen')).toBeVisible();
  await expect(page.locator('#alicerce-gastos-screen')).toContainText('Meus gastos');

  await prepararTelaSemNuvem(page, 'cartoes');
  await expect(page.locator('.ccr-head')).toBeVisible();
  await expect(page.locator('.cc2-empty')).toBeVisible();

  await prepararTelaSemNuvem(page, 'config');
  await expect(page.locator('h2')).toContainText(/configura/i);
  await expect(page.locator('#alicerce-config-theme')).toHaveCount(1);
  await expect(page.locator('#alicerce-config-lang')).toHaveCount(1);
  await expect(page.getByLabel(/aparência/i)).toHaveCount(1);
  await expect(page.getByLabel(/idioma/i)).toHaveCount(1);
  await expect(page.locator('#alicerce-config-theme option')).toHaveCount(4);
  await expect(page.locator('#alicerce-config-lang option')).toHaveCount(3);
});

test('gera prévias dos PDFs de Gastos e Visão Financeira sem abrir janela externa', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'gastos');
  await page.evaluate(function () {
    var hoje = Clock.now();
    var data = String(hoje.getFullYear()) + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-15';
    Store.userId = 'alicerce-e2e-local';
    Store.movements = [
      {
        id: 'e2e-expense-1',
        userId: Store.userId,
        tipo: 'despesa',
        status: 'pago',
        data: data,
        valor: 123.45,
        categoria: 'comida',
        subcategoria: 'mercado',
        descricao: 'Compra de teste Alicerce'
      },
      {
        id: 'e2e-income-1',
        userId: Store.userId,
        tipo: 'receita',
        status: 'recebido',
        data: data,
        valor: 250.00,
        descricao: 'Entrada de teste Alicerce'
      }
    ];
    document.getElementById('app').innerHTML = renderHeader() + renderGastos() + renderBottomNav();
  });

  const popupInicial = page.context().pages().length;
  await page.locator('#alicerce-gastos-screen button[aria-label="Exportar extrato em PDF"]').click();
  await expect(page.locator('#alicerce-gastos-pdf-preview')).toBeVisible();
  const gastosBody = page.frameLocator('#al-gastos-pdf-frame').locator('body');
  await expect(gastosBody).toContainText('RELATÓRIO DE GASTOS');
  await expect(gastosBody).toContainText('Compra de teste Alicerce');
  await expect(page.locator('#al-gastos-pdf-print')).toBeEnabled();
  await page.locator('#al-gastos-pdf-close').click();
  await expect(page.locator('#alicerce-gastos-pdf-preview')).toHaveCount(0);

  await page.evaluate(function () {
    generateMonthlyPDF();
  });
  await expect(page.locator('#alicerce-pdf-visao-preview')).toBeVisible();
  const monthlyBody = page.frameLocator('#al-pdf-preview-frame').locator('body');
  await expect(monthlyBody).toContainText('Relatório de análise financeira');
  await expect(monthlyBody).toContainText('Comida');
  await expect(monthlyBody).toContainText('R$ 123,45');
  await expect(monthlyBody).toContainText('R$ 250,00');
  await expect(page.locator('#al-pdf-preview-print')).toBeEnabled();
  await page.locator('#al-pdf-preview-close').click();
  await expect(page.locator('#alicerce-pdf-visao-preview')).toHaveCount(0);

  expect(page.context().pages().length).toBe(popupInicial);
});


test('envia cadastro com sucesso usando autenticação simulada', async function ({ page }) {
  await abrirAbertura(page);
  await page.locator('#calGlassBtn').click();
  await expect(page.locator('#loginLiving')).toBeVisible();

  await page.locator('#login-email').fill('novo-usuario@exemplo.com');
  await page.locator('#login-pass').fill('senha-ficticia-123');
  await page.evaluate(function () {
    window.history.replaceState({}, '', '/?ref=convite123');
  });
  await page.locator('#signupBtn').click();

  await expect(page.locator('#alicerce-auth-feedback')).toContainText('Cadastro enviado.');
  const chamada = await page.evaluate(function () { return window.__alicerceMockSignUp; });
  expect(chamada).toEqual({
    email: 'novo-usuario@exemplo.com',
    passwordWasProvided: true,
    referralCode: 'convite123'
  });
  const upserts = await page.evaluate(function () { return window.__alicerceMockUpserts; });
  expect(upserts).toEqual([]);
});

test('solicita recuperação de senha e usa o endereço de retorno do app', async function ({ page }) {
  await abrirAbertura(page);
  await page.locator('#calGlassBtn').click();
  await expect(page.locator('#loginLiving')).toBeVisible();

  await page.locator('#login-email').fill('recuperar@exemplo.com');
  await page.locator('#forgotBtn').click();

  await expect(page.locator('#alicerce-auth-feedback')).toContainText('Se este e-mail estiver cadastrado');
  const chamada = await page.evaluate(function () { return window.__alicerceMockPasswordReset; });
  expect(chamada.email).toBe('recuperar@exemplo.com');
  expect(chamada.redirectTo).toBe(new URL(page.url()).origin + '/');
  const upserts = await page.evaluate(function () { return window.__alicerceMockUpserts; });
  expect(upserts).toEqual([]);
});

test('salva um gasto manual e mantém o registro no armazenamento local após recarregar', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'gastoManual');
  await page.evaluate(function () {
    Store.userId = 'e2e-persistencia';
    Store.movements = [];
  });

  await page.locator('#gm-desc').fill('Mercado de teste Alicerce');
  await page.locator('#gm-val').fill('42.90');
  await page.locator('#gm-date').fill('2026-10-31');
  await page.locator('#gm-cat').selectOption('comida');
  await page.locator('#gm-sub').selectOption('mercado');
  await page.locator('#gm-estab').fill('Mercado fictício');
  await page.locator('button[onclick="saveManualGasto()"]').click();

  const antesDoReload = await page.evaluate(function () {
    return {
      movimentos: Store.movements,
      armazenado: JSON.parse(localStorage.getItem('alicerce_e2e-persistencia_movements') || '[]'),
      upserts: window.__alicerceMockUpserts
    };
  });
  expect(antesDoReload.movimentos).toHaveLength(1);
  expect(antesDoReload.movimentos[0]).toMatchObject({
    userId: 'e2e-persistencia',
    tipo: 'despesa',
    categoria: 'comida',
    subcategoria: 'mercado',
    descricao: 'Mercado de teste Alicerce',
    valor: 42.9
  });
  expect(antesDoReload.armazenado).toHaveLength(1);
  expect(antesDoReload.upserts).toEqual([]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const depoisDoReload = await page.evaluate(function () {
    return JSON.parse(localStorage.getItem('alicerce_e2e-persistencia_movements') || '[]');
  });
  expect(depoisDoReload).toHaveLength(1);
  expect(depoisDoReload[0]).toMatchObject({
    userId: 'e2e-persistencia',
    descricao: 'Mercado de teste Alicerce',
    valor: 42.9
  });
});

test('cadastra um cartão e mantém os dados no armazenamento local após recarregar', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'addCard');
  await page.evaluate(function () {
    Store.userId = 'e2e-persistencia';
    Store.cards = [];
  });

  await page.locator('#add-card-nome').fill('Cartão fictício');
  await page.locator('#add-card-fechamento').fill('20');
  await page.locator('#add-card-vencimento').fill('27');
  await page.locator('#add-card-limite').fill('2500');
  await page.locator('button[onclick="saveNewCard()"]').click();

  const antesDoReload = await page.evaluate(function () {
    return {
      cards: Store.cards,
      armazenado: JSON.parse(localStorage.getItem('alicerce_e2e-persistencia_cards') || '[]'),
      upserts: window.__alicerceMockUpserts
    };
  });
  expect(antesDoReload.cards).toHaveLength(1);
  expect(antesDoReload.cards[0]).toMatchObject({
    userId: 'e2e-persistencia',
    nome: 'Cartão fictício',
    fechamento: 20,
    vencimento: 27,
    limite: 2500
  });
  expect(antesDoReload.armazenado).toHaveLength(1);
  expect(antesDoReload.upserts).toEqual([]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const depoisDoReload = await page.evaluate(function () {
    return JSON.parse(localStorage.getItem('alicerce_e2e-persistencia_cards') || '[]');
  });
  expect(depoisDoReload).toHaveLength(1);
  expect(depoisDoReload[0]).toMatchObject({
    userId: 'e2e-persistencia',
    nome: 'Cartão fictício',
    limite: 2500
  });
});

test('registra baseline axe nas telas financeiras principais em celular', async function ({ page }, testInfo) {
  for (const screen of ['home', 'gastos', 'cartoes', 'config']) {
    await prepararTelaSemNuvem(page, screen);
    await page.setViewportSize({ width: 390, height: 844 });
    await registrarAxe(page, testInfo, 'tela-' + screen);
  }
});
