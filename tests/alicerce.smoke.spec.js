import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const supabaseMock = readFileSync(new URL('./fixtures/supabase-mock.js', import.meta.url), 'utf8');
const classificationBenchmark = JSON.parse(readFileSync(new URL('./fixtures/classification-benchmark-ptbr.json', import.meta.url), 'utf8'));
const classificationContextBenchmark = JSON.parse(readFileSync(new URL('./fixtures/classification-context-40-ptbr.json', import.meta.url), 'utf8'));
const bankDescriptionBenchmark = JSON.parse(readFileSync(new URL('./fixtures/bank-description-benchmark-ptbr.json', import.meta.url), 'utf8'));
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


async function prepararConferenciaGasto(page, dados, cartoes) {
  await prepararTelaSemNuvem(page, 'home');
  await page.evaluate(function (config) {
    Store.userId = null;
    Store.cards = config.cartoes || [];
    Store.movements = [];
    Store.installments = [];
    Store.loans = [];
    Store.screenData = config.dados;
    Store.screen = 'addGastoDoubt';
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  }, { dados: dados, cartoes: cartoes || [] });
  await expect(page.locator('#btn-save-gasto-doubt')).toBeVisible();
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


test('confirma um gasto após reclassificar categoria e subcategoria', async function ({ page }) {
  const dados = {
    interpretation: {
      amount: 76.5,
      categoria: 'comida',
      subcategoria: 'mercado',
      merchant: 'Corrida de teste',
      item: 'Deslocamento de teste'
    },
    amountInput: 76.5,
    itemInput: 'Deslocamento de teste',
    localInput: 'Corrida de teste',
    date: '2026-10-31',
    paymentMethod: 'pix'
  };
  await prepararConferenciaGasto(page, dados, []);

  await page.locator('#edit-gasto-category-search').fill('Transporte');
  await page.locator('#gasto-category-suggestions button').filter({ hasText: 'Transporte' }).click();
  await expect(page.locator('#edit-gasto-category')).toHaveValue('transporte');

  await page.locator('#edit-gasto-subcategory-search').fill('Uber');
  await page.locator('#gasto-subcategory-suggestions button').filter({ hasText: 'Uber' }).click();
  await expect(page.locator('#edit-gasto-subcategory')).toHaveValue('uber');

  await page.locator('#btn-save-gasto-doubt').click();
  const resultado = await page.evaluate(function () {
    return {
      screen: Store.screen,
      movements: Store.movements,
      installments: Store.installments,
      upserts: window.__alicerceMockUpserts,
      learning: Store.learning
    };
  });
  expect(resultado.screen).toBe('home');
  expect(resultado.movements).toHaveLength(1);
  expect(resultado.movements[0]).toMatchObject({
    tipo: 'despesa',
    categoria: 'transporte',
    subcategoria: 'uber',
    descricao: 'Deslocamento de teste',
    estabelecimento: 'Corrida de teste',
    valor: 76.5,
    paymentMethod: 'pix',
    status: 'pago'
  });
  expect(resultado.installments).toEqual([]);
  expect(resultado.upserts).toEqual([]);
  expect(resultado.learning['corrida de teste::deslocamento de teste']).toMatchObject({
    categoria: 'transporte',
    subcategoria: 'uber',
    scope: 'merchant_item'
  });
});

test('registra compra no crédito à vista como uma parcela na fatura', async function ({ page }) {
  const cartao = {
    id: 'cartao-credito-a-vista',
    nome: 'Cartão fictício',
    fechamento: 20,
    vencimento: 27,
    limite: 2500,
    ativo: true
  };
  const dados = {
    interpretation: {
      amount: 89.9,
      categoria: 'comida',
      subcategoria: 'restaurante',
      merchant: 'Restaurante fictício',
      item: 'Almoço de teste'
    },
    amountInput: 89.9,
    itemInput: 'Almoço de teste',
    localInput: 'Restaurante fictício',
    date: '2026-10-31',
    paymentMethod: 'cartao',
    cardId: cartao.id,
    cardOwnerType: 'meu',
    cardType: 'credito',
    installment: false,
    installments: 1
  };
  await prepararConferenciaGasto(page, dados, [cartao]);

  await page.locator('#btn-save-gasto-doubt').click();
  const resultado = await page.evaluate(function () {
    return {
      screen: Store.screen,
      movements: Store.movements,
      installments: Store.installments,
      upserts: window.__alicerceMockUpserts
    };
  });
  expect(resultado.screen).toBe('cartoes');
  expect(resultado.movements).toEqual([]);
  expect(resultado.installments).toHaveLength(1);
  expect(resultado.installments[0]).toMatchObject({
    cardId: cartao.id,
    tipo: 'cartao',
    categoria: 'comida',
    subcategoria: 'restaurante',
    descricao: 'Almoço de teste',
    parcelaAtual: 1,
    parcelas: 1,
    valor: 89.9,
    status: 'pendente',
    responsavel: 'Eu',
    dataCompra: '2026-10-31'
  });
  expect(resultado.installments[0].data).toBe('2026-11-27');
  expect(resultado.upserts).toEqual([]);
});

test('divide compra de crédito em parcelas com soma exata do valor original', async function ({ page }) {
  const cartao = {
    id: 'cartao-credito-parcelado',
    nome: 'Cartão parcelado fictício',
    fechamento: 20,
    vencimento: 27,
    limite: 3000,
    ativo: true
  };
  const dados = {
    interpretation: {
      amount: 100,
      categoria: 'vestuario',
      subcategoria: 'roupas',
      merchant: 'Loja fictícia',
      item: 'Compra parcelada de teste'
    },
    amountInput: 100,
    itemInput: 'Compra parcelada de teste',
    localInput: 'Loja fictícia',
    date: '2026-10-31',
    paymentMethod: 'cartao',
    cardId: cartao.id,
    cardOwnerType: 'meu',
    cardType: 'credito',
    installment: true,
    installments: 3
  };
  await prepararConferenciaGasto(page, dados, [cartao]);

  await page.locator('#btn-save-gasto-doubt').click();
  const resultado = await page.evaluate(function () {
    return {
      screen: Store.screen,
      installments: Store.installments,
      upserts: window.__alicerceMockUpserts
    };
  });
  expect(resultado.screen).toBe('cartoes');
  expect(resultado.installments).toHaveLength(3);
  expect(resultado.installments.map(function (item) { return item.valor; })).toEqual([33.33, 33.33, 33.34]);
  expect(resultado.installments.reduce(function (sum, item) { return Math.round((sum + item.valor) * 100) / 100; }, 0)).toBe(100);
  expect(resultado.installments.map(function (item) { return item.parcelaAtual; })).toEqual([1, 2, 3]);
  expect(resultado.installments.map(function (item) { return item.parcelas; })).toEqual([3, 3, 3]);
  expect(resultado.installments.map(function (item) { return item.data; })).toEqual([
    '2026-11-27',
    '2026-12-27',
    '2027-01-27'
  ]);
  expect(resultado.installments.every(function (item) {
    return item.cardId === cartao.id && item.compraId === resultado.installments[0].compraId;
  })).toBe(true);
  expect(resultado.upserts).toEqual([]);
});

test('edita os dados de um cartão e persiste as alterações localmente', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'editCard');
  await page.evaluate(function () {
    Store.userId = 'e2e-editar-cartao';
    Store.cards = [{
      id: 'cartao-editar',
      userId: Store.userId,
      nome: 'Cartão antigo',
      fechamento: 10,
      vencimento: 17,
      limite: 1000,
      ativo: true
    }];
    Store.screenData = { id: 'cartao-editar' };
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  });

  await page.locator('#edit-card-nome').fill('Cartão atualizado');
  await page.locator('#edit-card-fechamento').fill('18');
  await page.locator('#edit-card-vencimento').fill('25');
  await page.locator('#edit-card-limite').fill('4200');
  await page.locator('button[onclick="saveEditCard(\'cartao-editar\')"]').click();

  const resultado = await page.evaluate(function () {
    return {
      cards: Store.cards,
      stored: JSON.parse(localStorage.getItem('alicerce_e2e-editar-cartao_cards') || '[]'),
      upserts: window.__alicerceMockUpserts
    };
  });
  expect(resultado.cards[0]).toMatchObject({
    id: 'cartao-editar',
    nome: 'Cartão atualizado',
    fechamento: 18,
    vencimento: 25,
    limite: 4200
  });
  expect(resultado.stored[0]).toMatchObject({
    id: 'cartao-editar',
    nome: 'Cartão atualizado',
    fechamento: 18,
    vencimento: 25,
    limite: 4200
  });
  expect(resultado.upserts).toEqual([]);
});

test('exclui cartão e remove apenas parcelas e empréstimos vinculados', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'cartoes');
  await page.evaluate(function () {
    Store.userId = 'e2e-excluir-cartao';
    Store.cards = [
      { id: 'cartao-excluir', nome: 'Cartão a excluir', fechamento: 10, vencimento: 17, limite: 1000 },
      { id: 'cartao-preservar', nome: 'Cartão a preservar', fechamento: 20, vencimento: 27, limite: 2000 }
    ];
    Store.installments = [
      { id: 'parcela-excluir', tipo: 'cartao', cardId: 'cartao-excluir', valor: 50, data: '2026-11-17' },
      { id: 'parcela-preservar', tipo: 'cartao', cardId: 'cartao-preservar', valor: 75, data: '2026-11-27' }
    ];
    Store.loans = [
      { id: 'reembolso-excluir', tipo: 'emprestei', fromCard: true, cardId: 'cartao-excluir' },
      { id: 'emprestimo-preservar', tipo: 'peguei', fromCard: false, cardId: 'cartao-preservar' }
    ];
  });
  page.on('dialog', async function (dialog) {
    await dialog.accept();
  });

  await page.evaluate(function () {
    cc2ExcluirCartao('cartao-excluir');
  });

  const resultado = await page.evaluate(function () {
    return {
      cards: Store.cards,
      installments: Store.installments,
      loans: Store.loans,
      storedCards: JSON.parse(localStorage.getItem('alicerce_e2e-excluir-cartao_cards') || '[]'),
      storedInstallments: JSON.parse(localStorage.getItem('alicerce_e2e-excluir-cartao_installments') || '[]'),
      storedLoans: JSON.parse(localStorage.getItem('alicerce_e2e-excluir-cartao_loans') || '[]'),
      upserts: window.__alicerceMockUpserts
    };
  });
  expect(resultado.cards.map(function (item) { return item.id; })).toEqual(['cartao-preservar']);
  expect(resultado.installments.map(function (item) { return item.id; })).toEqual(['parcela-preservar']);
  expect(resultado.loans.map(function (item) { return item.id; })).toEqual(['emprestimo-preservar']);
  expect(resultado.storedCards.map(function (item) { return item.id; })).toEqual(['cartao-preservar']);
  expect(resultado.storedInstallments.map(function (item) { return item.id; })).toEqual(['parcela-preservar']);
  expect(resultado.storedLoans.map(function (item) { return item.id; })).toEqual(['emprestimo-preservar']);
  expect(resultado.upserts).toEqual([]);
});


test('recarrega gastos e cartões do armazenamento cloud simulado sem depender do cache local', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');

  const resultado = await page.evaluate(async function () {
    var uid = 'cloud-user-restauracao';
    var movimentos = [{
      id: 'cloud-gasto-1',
      userId: uid,
      tipo: 'despesa',
      categoria: 'comida',
      subcategoria: 'mercado',
      descricao: 'Mercado sincronizado',
      purpose: 'obra',
      analysis: {
        origin: 'receipt_ocr',
        purchaseId: 'compra-mercado-cloud-1',
        items: [{ name: 'Arroz', quantity: 2, unit: 'kg', unitPrice: 10, total: 20 }],
        metrics: { fuelLiters: 0 }
      },
      valor: 145.7,
      data: '2026-10-31',
      status: 'pago'
    }];
    var cartoes = [{
      id: 'cloud-cartao-1',
      userId: uid,
      nome: 'Cartão sincronizado',
      fechamento: 18,
      vencimento: 25,
      limite: 3200,
      ativo: true
    }];

    window.__alicerceMockSessionUserId = uid;
    var gravaGastos = await Repository.cloudSet(uid, 'movements', movimentos);
    var gravaCartoes = await Repository.cloudSet(uid, 'cards', cartoes);

    localStorage.removeItem(Repository._key(uid, 'movements'));
    localStorage.removeItem(Repository._key(uid, 'cards'));
    localStorage.setItem('alicerce_' + uid + '_financialMigrationVersion', String(financialMigrationVersion));

    await Store.init(uid);

    return {
      gravaGastos: gravaGastos,
      gravaCartoes: gravaCartoes,
      userId: Store.userId,
      movimentos: Store.movements,
      cartoes: Store.cards,
      cacheMovimentos: Repository.get(uid, 'movements', []),
      cacheCartoes: Repository.get(uid, 'cards', []),
      analyticalRows: AlicerceIA._rows(),
      cloudRows: window.__alicerceMockCloudRows,
      upserts: window.__alicerceMockUpserts
    };
  });

  expect(resultado.gravaGastos).toEqual({ ok: true });
  expect(resultado.gravaCartoes).toEqual({ ok: true });
  expect(resultado.userId).toBe('cloud-user-restauracao');
  expect(resultado.movimentos).toHaveLength(1);
  expect(resultado.movimentos[0]).toMatchObject({
    id: 'cloud-gasto-1',
    descricao: 'Mercado sincronizado',
    purpose: 'obra',
    valor: 145.7
  });
  expect(resultado.cartoes).toHaveLength(1);
  expect(resultado.cartoes[0]).toMatchObject({
    id: 'cloud-cartao-1',
    nome: 'Cartão sincronizado',
    limite: 3200
  });
  expect(resultado.cacheMovimentos).toEqual(resultado.movimentos);
  expect(resultado.cacheCartoes).toEqual(resultado.cartoes);
  expect(resultado.analyticalRows[0]).toMatchObject({
    purpose: 'obra',
    purchaseId: 'compra-mercado-cloud-1',
    origin: 'receipt_ocr',
    items: [{ name: 'Arroz', quantity: 2, unit: 'kg', unitPrice: 10, total: 20 }]
  });
  expect(resultado.cloudRows).toHaveLength(2);
  expect(resultado.upserts).toHaveLength(2);
  expect(resultado.upserts.every(function (item) {
    return item.table === 'alicerce_data' && item.payload.user_id === 'cloud-user-restauracao';
  })).toBe(true);
});

test('isola dados na nuvem entre usuários e bloqueia gravação com sessão incompatível', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');

  const resultado = await page.evaluate(async function () {
    var usuarioA = 'cloud-user-a';
    var usuarioB = 'cloud-user-b';
    window.__alicerceMockSessionUserId = usuarioA;
    var gravaA = await Repository.cloudSet(usuarioA, 'movements', [{
      id: 'gasto-privado-a',
      descricao: 'Dado privado A',
      valor: 10
    }]);

    window.__alicerceMockSessionUserId = usuarioB;
    var gravaB = await Repository.cloudSet(usuarioB, 'movements', [{
      id: 'gasto-privado-b',
      descricao: 'Dado privado B',
      valor: 20
    }]);

    window.__alicerceMockSessionUserId = usuarioA;
    var leituraBComoA = await Repository.cloudLoadAll(usuarioB);
    var leituraAComoA = await Repository.cloudLoadAll(usuarioA);
    var tentativaGravacaoBComoA = await Repository.cloudSet(usuarioB, 'movements', [{
      id: 'nao-deve-ser-gravado',
      descricao: 'Tentativa cruzada',
      valor: 999
    }]);

    window.__alicerceMockSessionUserId = usuarioB;
    var leituraBComoB = await Repository.cloudLoadAll(usuarioB);

    return {
      gravaA: gravaA,
      gravaB: gravaB,
      leituraBComoA: leituraBComoA,
      leituraAComoA: leituraAComoA,
      tentativaGravacaoBComoA: tentativaGravacaoBComoA,
      leituraBComoB: leituraBComoB,
      upserts: window.__alicerceMockUpserts,
      cloudRows: window.__alicerceMockCloudRows
    };
  });

  expect(resultado.gravaA).toEqual({ ok: true });
  expect(resultado.gravaB).toEqual({ ok: true });
  expect(resultado.leituraBComoA).toEqual({});
  expect(resultado.leituraAComoA.movements[0]).toMatchObject({
    id: 'gasto-privado-a',
    descricao: 'Dado privado A'
  });
  expect(resultado.tentativaGravacaoBComoA).toEqual({ ok: true, semNuvem: true });
  expect(resultado.leituraBComoB.movements[0]).toMatchObject({
    id: 'gasto-privado-b',
    descricao: 'Dado privado B'
  });
  expect(resultado.upserts).toHaveLength(2);
  expect(resultado.cloudRows).toHaveLength(2);
});

test('reporta falha de sincronização cloud sem apagar o dado local', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');

  const resultado = await page.evaluate(async function () {
    var uid = 'cloud-user-falha';
    var movimento = [{
      id: 'gasto-local-preservado',
      descricao: 'Continua no dispositivo',
      valor: 31.5
    }];
    window.__alicerceMockSessionUserId = uid;
    window.__alicerceMockUpsertError = 'falha simulada de rede';

    Repository.set(uid, 'movements', movimento);
    var local = Repository.get(uid, 'movements', []);
    var cloud = await Repository.cloudSet(uid, 'cards', []);

    window.__alicerceMockUpsertError = null;
    return {
      local: local,
      cloud: cloud,
      cloudRows: window.__alicerceMockCloudRows
    };
  });

  expect(resultado.local).toEqual([{
    id: 'gasto-local-preservado',
    descricao: 'Continua no dispositivo',
    valor: 31.5
  }]);
  expect(resultado.cloud).toEqual({ ok: false });
  expect(resultado.cloudRows).toEqual([]);
});

test('registra baseline axe nas telas financeiras principais em celular', async function ({ page }, testInfo) {
  for (const screen of ['home', 'gastos', 'cartoes', 'config']) {
    await prepararTelaSemNuvem(page, screen);
    await page.setViewportSize({ width: 390, height: 844 });
    await registrarAxe(page, testInfo, 'tela-' + screen);
  }
});


test('classifica o produto antes da categoria ampla do supermercado', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const resultado = await page.evaluate(function () {
    Store.learning = {
      carrefour: { categoria: 'comida', subcategoria: 'mercado' }
    };
    const shampoo = Interpreter.interpretLocal('Valor: 42 | Item: Shampoo | Local: Carrefour');
    const detergente = Interpreter.interpretLocal('Valor: 18 | Item: Detergente | Local: Carrefour');
    const legacyForItem = Store.getLearned('Carrefour', 'Shampoo');
    Store.learnCorrection('Carrefour', 'comida', 'mercado', 'Shampoo');
    const explicitCorrection = Interpreter.interpretLocal('Valor: 42 | Item: Shampoo | Local: Carrefour');
    return {
      shampoo: shampoo,
      detergente: detergente,
      legacyForItem: legacyForItem,
      explicitCorrection: explicitCorrection
    };
  });

  expect(resultado.shampoo).toMatchObject({
    categoria: 'beleza',
    subcategoria: 'cosmeticos',
    source: 'item',
    confidence: 'high'
  });
  expect(resultado.detergente).toMatchObject({
    categoria: 'casa_dia_a_dia',
    subcategoria: 'produtos_limpeza',
    source: 'item'
  });
  expect(resultado.legacyForItem).toBeNull();
  expect(resultado.explicitCorrection).toMatchObject({ categoria: 'comida', subcategoria: 'mercado', source: 'learning' });
});

test('interpreta descrições bancárias ruidosas sem confundir IDs com valores ou inventar produtos', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const resultado = await page.evaluate(function (cases) {
    return cases.map(function (example) {
      const actual = Interpreter.interpretLocal(example.text);
      return {
        id: example.id,
        merchant: actual ? actual.merchant : null,
        amount: actual ? actual.amount : null,
        item: actual ? actual.item : null,
        categoria: actual ? actual.categoria : null,
        subcategoria: actual ? actual.subcategoria : null,
        confidence: actual ? actual.confidence : null,
        source: actual ? actual.source : null
      };
    });
  }, bankDescriptionBenchmark);

  const mismatches = [];
  resultado.forEach(function (actual, index) {
    const expected = bankDescriptionBenchmark[index];
    ['merchant','amount','item','categoria','subcategoria','confidence'].forEach(function (field) {
      if (actual[field] !== expected[field]) {
        mismatches.push({
          id: expected.id,
          field: field,
          expected: expected[field],
          actual: actual[field]
        });
      }
    });
  });
  const identified = resultado.filter(function (item) {
    return item.categoria && item.subcategoria;
  }).length;
  console.log('[benchmark-bank-ptbr] ' + JSON.stringify({
    total: resultado.length,
    exact: resultado.length - mismatches.length,
    mismatches: mismatches,
    identified: identified,
    unknownKeptUnclassified: resultado.filter(function (item) {
      return item.categoria === null && item.subcategoria === null && item.confidence === 'low';
    }).length
  }));

  expect(mismatches).toEqual([]);
});

test('calibra confiança pela evidência e não pelo nome da loja isoladamente', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const resultado = await page.evaluate(function () {
    Store.learning = {};
    const merchantOnly = Interpreter.interpretLocal('PAG*CARREFOUR 00482 39,90');
    const productEvidence = Interpreter.interpretLocal('Valor: 42 | Item: Shampoo | Local: Carrefour');
    const unknown = Interpreter.interpretLocal('PAGAMENTO 99,90 COD 004827');
    Store.learnCorrection('Carrefour', 'comida', 'mercado', 'Shampoo');
    const learned = Interpreter.interpretLocal('Valor: 42 | Item: Shampoo | Local: Carrefour');
    return {
      merchantOnly: merchantOnly,
      productEvidence: productEvidence,
      unknown: unknown,
      learned: learned
    };
  });

  expect(resultado.merchantOnly).toMatchObject({
    categoria: 'comida',
    subcategoria: 'mercado',
    confidence: 'medium',
    source: 'dictionary'
  });
  expect(resultado.productEvidence).toMatchObject({
    categoria: 'beleza',
    subcategoria: 'cosmeticos',
    confidence: 'high',
    source: 'item'
  });
  expect(resultado.unknown).toMatchObject({
    merchant: null,
    categoria: null,
    subcategoria: null,
    confidence: 'low',
    source: 'partial'
  });
  expect(resultado.learned).toMatchObject({
    categoria: 'comida',
    subcategoria: 'mercado',
    confidence: 'high',
    source: 'learning'
  });
});

test('mede o benchmark brasileiro curado por categoria e subcategoria', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const resultado = await page.evaluate(function (cases) {
    return cases.map(function (example) {
      const actual = Interpreter.interpretLocal(example.text);
      return {
        id: example.id,
        expected: example.categoria + '/' + example.subcategoria,
        actual: actual ? actual.categoria + '/' + actual.subcategoria : 'sem_classificacao',
        source: actual ? actual.source : null,
        confidence: actual ? actual.confidence : null
      };
    });
  }, classificationBenchmark);

  const groups = {};
  const subgroups = {};
  resultado.forEach(function (item) {
    const category = item.expected.split('/')[0];
    if (!groups[category]) groups[category] = { total: 0, correct: 0 };
    if (!subgroups[item.expected]) subgroups[item.expected] = { total: 0, correct: 0 };
    groups[category].total++;
    subgroups[item.expected].total++;
    if (item.actual === item.expected) {
      groups[category].correct++;
      subgroups[item.expected].correct++;
    }
  });
  const totalCorrect = resultado.filter(function (item) {
    return item.actual === item.expected;
  }).length;
  console.log('[benchmark-ptbr] ' + JSON.stringify({
    total: resultado.length,
    correct: totalCorrect,
    accuracy: resultado.length ? Number((totalCorrect / resultado.length * 100).toFixed(1)) : 0,
    byCategory: groups,
    bySubcategory: subgroups
  }));

  expect(resultado.filter(function (item) {
    return item.actual !== item.expected;
  })).toEqual([]);
});

test('reconhece lanches e estabelecimentos de fast food com subcategorias válidas', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const resultado = await page.evaluate(function () {
    return {
      lanche: Interpreter.interpretLocal('Valor: 23 | Item: Coxinha | Local: Lanchonete do Ze'),
      fastFood: Interpreter.interpretLocal('Valor: 39 | Item: Big Mac | Local: McDonald\'s'),
      almoco: Interpreter.interpretLocal('Valor: 48 | Item: Almoco | Local: Restaurante Central')
    };
  });

  expect(resultado.lanche).toMatchObject({ categoria: 'comida', subcategoria: 'lanchonete' });
  expect(resultado.fastFood).toMatchObject({ categoria: 'comida', subcategoria: 'fast_food' });
  expect(resultado.almoco).toMatchObject({ categoria: 'comida', subcategoria: 'restaurante' });
});

test('normaliza descritores brasileiros e reaproveita aprendizado sem misturar produtos', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const resultado = await page.evaluate(function () {
    const keyPairs = [
      [
        alicerLearningKey('CARREFOUR EXPRESS LOJA 023', 'Shampoo'),
        alicerLearningKey('Carrefour', 'Shampoo')
      ],
      [
        alicerLearningKey('Drogaria Pague Menos Filial 18', 'Dipirona'),
        alicerLearningKey('Pague Menos', 'Dipirona')
      ],
      [
        alicerLearningKey('MC DONALDS LJ 31', 'Big Mac'),
        alicerLearningKey("McDonald's", 'Big Mac')
      ],
      [
        alicerLearningKey('CELPE 123456', 'Conta de luz'),
        alicerLearningKey('Neoenergia Pernambuco', 'Conta de luz')
      ]
    ];
    const unknownA = normalizeAlicerMerchantIdentity('Mercadinho São João Loja 12');
    const unknownB = normalizeAlicerMerchantIdentity('MERCADINHO SAO JOAO FILIAL 07');
    const unknownDifferent = normalizeAlicerMerchantIdentity('Mercadinho São Pedro Loja 07');
    const extracted = [
      Interpreter.extractMerchant('COMPRA DEBITO MC DONALDS LOJA 031 NSU 123456'),
      Interpreter.extractMerchant('PAGAMENTO CELPE NSU 884433'),
      Interpreter.extractMerchant('PIX COMPESA ID 123456')
    ];

    Store.learning = {};
    Store.learnCorrection('Carrefour Express Loja 23', 'comida', 'mercado', 'Shampoo');
    const corrected = Interpreter.interpretLocal('Valor: 42 | Item: Shampoo | Local: CARREFOUR LJ 07');
    const otherProduct = Interpreter.interpretLocal('Valor: 18 | Item: Detergente | Local: Carrefour Express Filial 2');

    return {
      keyPairs: keyPairs,
      unknownA: unknownA,
      unknownB: unknownB,
      unknownDifferent: unknownDifferent,
      extracted: extracted,
      corrected: corrected,
      otherProduct: otherProduct
    };
  });

  resultado.keyPairs.forEach(function (pair) {
    expect(pair[0]).toBe(pair[1]);
  });
  expect(resultado.unknownA).toBe('mercadinho sao joao');
  expect(resultado.unknownB).toBe(resultado.unknownA);
  expect(resultado.unknownDifferent).not.toBe(resultado.unknownA);
  expect(resultado.extracted).toEqual(['Mcdonald s', 'Neoenergia', 'Compesa']);
  expect(resultado.corrected).toMatchObject({
    categoria: 'comida',
    subcategoria: 'mercado',
    source: 'learning'
  });
  expect(resultado.otherProduct).toMatchObject({
    categoria: 'casa_dia_a_dia',
    subcategoria: 'produtos_limpeza',
    source: 'item'
  });
});

test('mantém todas as regras e o dicionário dentro da taxonomia oficial', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const resultado = await page.evaluate(function () {
    const invalidMerchants = Object.keys(Interpreter.merchantDict).filter(function (key) {
      const item = Interpreter.merchantDict[key];
      return !alicerClassificationPairIsValid(item.c, item.s);
    });
    const invalidRules = Interpreter.rules.filter(function (rule) {
      return rule.c && rule.s && !alicerClassificationPairIsValid(rule.c, rule.s);
    }).map(function (rule) {
      return { category: rule.c, subcategory: rule.s };
    });
    return {
      invalidMerchants: invalidMerchants,
      invalidRules: invalidRules,
      allCategories: Object.keys(ALICERCE_CATEGORIES)
    };
  });

  expect(resultado.invalidMerchants).toEqual([]);
  expect(resultado.invalidRules).toEqual([]);
  expect(resultado.allCategories).toContain('beleza');
  expect(resultado.allCategories).toContain('animais');
});

test('não transforma uma sugestão apenas confirmada em aprendizado permanente', async function ({ page }) {
  const dados = {
    interpretation: {
      amount: 42,
      categoria: 'comida',
      subcategoria: 'mercado',
      merchant: 'Carrefour',
      item: 'Arroz'
    },
    amountInput: 42,
    itemInput: 'Arroz',
    localInput: 'Carrefour',
    date: '2026-10-31',
    paymentMethod: 'pix'
  };
  await prepararConferenciaGasto(page, dados, []);
  await page.locator('#btn-save-gasto-doubt').click();

  const resultado = await page.evaluate(function () {
    return {
      movements: Store.movements,
      learning: Store.learning
    };
  });
  expect(resultado.movements).toHaveLength(1);
  expect(resultado.learning).toEqual({});
});

test('formulário manual utiliza a taxonomia completa e subcategorias correspondentes', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const resultado = await page.evaluate(function () {
    document.getElementById('app').innerHTML = renderGastoManual();
    const categories = Array.prototype.map.call(
      document.getElementById('gm-cat').options,
      function (item) { return item.value; }
    );
    updateSubcats('beleza');
    const beautySubs = Array.prototype.map.call(
      document.getElementById('gm-sub').options,
      function (item) { return item.value; }
    );
    return { categories: categories, beautySubs: beautySubs };
  });

  expect(resultado.categories).toContain('beleza');
  expect(resultado.categories).toContain('animais');
  expect(resultado.categories).toContain('casa_dia_a_dia');
  expect(resultado.beautySubs).toContain('unhas');
  expect(resultado.beautySubs).toContain('cosmeticos');
});


test('usa um gasto manual confirmado como exemplo de aprendizado da própria conta', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const resultado = await page.evaluate(function () {
    Store.userId = 'e2e-aprendizado-manual';
    Store.learning = {};
    document.getElementById('app').innerHTML = renderGastoManual();
    document.getElementById('gm-desc').value = 'Shampoo';
    document.getElementById('gm-val').value = '52';
    document.getElementById('gm-date').value = '2026-10-31';
    document.getElementById('gm-cat').value = 'beleza';
    updateSubcats('beleza');
    document.getElementById('gm-sub').value = 'cosmeticos';
    document.getElementById('gm-estab').value = 'Carrefour';
    saveManualGasto();

    return {
      movement: Store.movements[0],
      learned: Store.getLearned('Carrefour', 'Shampoo'),
      learning: Store.learning
    };
  });

  expect(resultado.movement).toMatchObject({
    categoria: 'beleza',
    subcategoria: 'cosmeticos',
    descricao: 'Shampoo',
    estabelecimento: 'Carrefour'
  });
  expect(resultado.learned).toMatchObject({
    categoria: 'beleza',
    subcategoria: 'cosmeticos',
    scope: 'merchant_item'
  });
});



test('Alicia usa o nome informado no perfil e não transforma o e-mail em nome', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'conta');
  const initial = await page.evaluate(function () {
    Store.userId = 'perfil-alicia-teste';
    Store.userEmail = 'lo08973623@example.com';
    Store.lang = 'pt';
    Store.settings = { lang: 'pt', theme: 'azul' };
    var now = new Date();
    var morning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
    Clock.setOffset(morning.getTime() - Date.now());
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
    return AlicerceIA.saudacao();
  });
  expect(initial).toBe('Bom dia!');
  await expect(page.locator('#conta-display-name')).toBeVisible();
  await page.locator('#conta-display-name').fill('Ana Costa');
  await page.locator('#conta-display-name-save').click();
  await expect(page.locator('#conta-name')).toHaveText('Ana Costa');
  const greeting = await page.evaluate(function () {
    return {
      greeting: AlicerceIA.saudacao(),
      saved: Store.settings.displayName
    };
  });
  expect(greeting.greeting).toBe('Bom dia, Ana');
  expect(greeting.saved).toBe('Ana Costa');
});

test('Alicia lê a foto localmente, preenche o texto para revisão e descarta a referência ao arquivo', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  await page.evaluate(function () {
    Store.userId = 'ocr-alicia-teste';
    Store.userEmail = 'lo08973623@example.com';
    Store.settings = Object.assign({}, Store.settings, {
      displayName: 'Ana Costa',
      alicerceLegalAcceptance: {
        termsVersion: '2026-10-20-v1',
        privacyVersion: '2026-10-20-v1',
        acceptedAt: '2026-10-31T12:00:00.000Z'
      }
    });
    Store.movements = [];
    Store.installments = [];
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
    window.__aliciaOcrTest = { filename: '', terminated: false };
    window.Tesseract = {
      createWorker: async function () {
        return {
          recognize: async function (file) {
            window.__aliciaOcrTest.filename = file.name;
            return { data: { text: 'MERCADO CENTRAL\nLEITE 2 UNIDADES\nTOTAL R$ 18,90' } };
          },
          terminate: async function () {
            window.__aliciaOcrTest.terminated = true;
          }
        };
      }
    };
  });

  await page.locator('#alicerce-ai-open-assistant').click();
  await expect(page.locator('#alicerce-assistant-camera')).toBeVisible();
  await page.locator('#alicerce-assistant-photo').setInputFiles({
    name: 'nota.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('imagem temporária de teste')
  });
  await expect(page.locator('#alicerce-assistant-status')).toContainText('Texto extraído no aparelho');
  await expect(page.locator('#alicerce-assistant-input')).toHaveValue(/MERCADO CENTRAL/);
  await expect(page.locator('#alicerce-assistant-input')).toHaveValue(/R\$ 18,90/);
  const state = await page.evaluate(function () {
    var fileInput = document.getElementById('alicerce-assistant-photo');
    return {
      fileValue: fileInput.value,
      fileCount: fileInput.files ? fileInput.files.length : -1,
      movements: Store.movements.length,
      filename: window.__aliciaOcrTest.filename,
      terminated: window.__aliciaOcrTest.terminated
    };
  });
  expect(state.fileValue).toBe('');
  expect(state.fileCount).toBe(0);
  expect(state.movements).toBe(0);
  expect(state.filename).toBe('nota.jpg');
  expect(state.terminated).toBe(true);
});

test('Assistente Alicerce apresenta saudação personalizada, cartão compacto, conversa organizada e isolamento por conta', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const greetingChecks = await page.evaluate(function () {
    Store.userId = 'ia-conta-teste-a';
    Store.userEmail = 'maria.silva@example.com';
    Store.lang = 'pt';
    Store.settings = Object.assign({}, Store.settings, {
      displayName: 'Maria Silva',
      alicerceLegalAcceptance: {
        termsVersion: '2026-10-20-v1',
        privacyVersion: '2026-10-20-v1',
        acceptedAt: '2026-10-31T12:00:00.000Z'
      }
    });
    function greetingAt(hour) {
      var now = new Date();
      var target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
      Clock.setOffset(target.getTime() - Date.now());
      return AlicerceIA.saudacao();
    }
    var result = {
      morning: greetingAt(9),
      afternoon: greetingAt(14),
      night: greetingAt(20)
    };
    greetingAt(9);
    Store.loans = [];
    Store.movements = [
      { id: 'ia-1', tipo: 'despesa', categoria: 'comida', subcategoria: 'lanchonete', descricao: 'Lanche', estabelecimento: 'Lanchonete Central', valor: 48.50, data: Clock.today(), status: 'pago' },
      { id: 'ia-2', tipo: 'despesa', categoria: 'moradia', subcategoria: 'energia', descricao: 'Conta de luz', estabelecimento: 'Neoenergia', valor: 20, data: Clock.today(), status: 'pago' }
    ];
    Store.installments = [];
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
    return result;
  });

  expect(greetingChecks.morning).toBe('Bom dia, Maria');
  expect(greetingChecks.afternoon).toBe('Boa tarde, Maria');
  expect(greetingChecks.night).toBe('Boa noite, Maria');

  await expect(page.locator('#alicerce-ai-card')).toBeVisible();
  await expect(page.locator('#alicerce-ai-open-assistant')).toBeVisible();
  await expect(page.locator('#alicerce-ai-card')).toContainText('Bom dia, Maria');
  await expect(page.locator('#alicerce-ai-card')).not.toContainText(/Tire dúvidas|Um olhar sobre sua conta|SEU ASSISTENTE FINANCEIRO/i);
  const launcherHeight = await page.locator('#alicerce-ai-card').evaluate(function (el) { return el.getBoundingClientRect().height; });
  expect(launcherHeight).toBeLessThan(80);
  await expect(page.locator('#alicerce-assistant-page')).toHaveCount(0);

  await page.locator('#alicerce-ai-open-assistant').click();
  await expect(page.locator('#alicerce-assistant-page')).toBeVisible();
  await expect(page.locator('.alicerce-assistant-heading')).toContainText('Alicia');
  await expect(page.locator('.alicerce-assistant-heading')).toContainText('Sua assistente financeira');
  await expect(page.locator('.alicerce-assistant-back')).toContainText('Início');
  await expect(page.locator('.alicerce-assistant-avatar img')).toHaveAttribute('src', '/assets/alicia-assistente.webp');
  await expect(page.locator('.alicerce-assistant-avatar img')).toHaveCSS('object-fit', 'contain');
  await expect(page.locator('.alicerce-assistant-avatar img')).toHaveCSS('width', '54px');
  await expect(page.locator('.alicerce-assistant-avatar img')).toHaveCSS('height', '54px');
  await expect(page.locator('.alicerce-assistant-avatar')).toHaveCSS('border-width', '2px');
  await expect(page.locator('.alicerce-assistant-avatar')).toHaveCSS('border-radius', '13px');
  await expect(page.locator('.alicerce-assistant-heading')).toHaveCSS('border-width', '1px');
  await expect(page.locator('#alicerce-assistant-messages')).toContainText('Oi, Maria! Tudo bem com você?');
  await expect(page.locator('#alicerce-assistant-messages')).toContainText('Estou aqui para ajudar a entender seu dinheiro.');
  await expect(page.locator('#alicerce-assistant-messages')).toContainText('O que vamos olhar hoje?');
  await expect(page.locator('.alicerce-assistant-speak')).toBeVisible();
  await expect(page.locator('.alicerce-assistant-chat-panel')).toBeVisible();
  await expect(page.locator('#alicerce-assistant-camera')).toBeVisible();
  await expect(page.locator('#alicerce-assistant-input')).toBeVisible();

  await page.locator('#alicerce-assistant-input').fill('Quanto gastei com lanche este mês?');
  await page.locator('#alicerce-assistant-send').click();
  await expect(page.locator('#alicerce-assistant-messages')).toContainText('48,50');
  await expect(page.locator('.alicerce-assistant-message.user')).toContainText('Quanto gastei com lanche este mês?');
  await expect(page.locator('.alicerce-assistant-message.assistant')).toContainText('48,50');
  await expect(page.locator('.alicerce-assistant-message-avatar')).toHaveCount(1);

  const stateAfterSwitch = await page.evaluate(function () {
    Store.userId = 'ia-conta-teste-b';
    Store.userEmail = 'joao.silva@example.com';
    Store.settings = Object.assign({}, Store.settings, { displayName: 'Joao Silva' });
    Store.movements = [];
    Store.installments = [];
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
    return {
      messages: AlicerceIA._messages,
      question: AlicerceIA._question,
      answer: AlicerceIA._answer,
      greeting: AlicerceIA.saudacao()
    };
  });

  expect(stateAfterSwitch.messages).toEqual([]);
  expect(stateAfterSwitch.question).toBe('');
  expect(stateAfterSwitch.answer).toBe('');
  expect(stateAfterSwitch.greeting).toBe('Bom dia, Joao');
  await expect(page.locator('#alicerce-assistant-page')).toBeVisible();
  await expect(page.locator('.alicerce-assistant-heading')).toContainText('Alicia');
  await expect(page.locator('#alicerce-assistant-messages')).not.toContainText('48,50');
  await expect(page.locator('#alicerce-assistant-input')).toBeVisible();
});

test('Alicia chama a pessoa na tela inicial e abre a análise que motivou o aviso', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  await page.evaluate(function () {
    Store.userId = 'ia-home-proactive';
    Store.userEmail = 'ewerton@example.com';
    Store.lang = 'pt';
    Store.settings = Object.assign({}, Store.settings, {
      displayName: 'Ewerton Aquino',
      alicerceLegalAcceptance: {
        termsVersion: '2026-10-20-v1',
        privacyVersion: '2026-10-20-v1',
        acceptedAt: '2026-10-31T12:00:00.000Z'
      }
    });
    Store.loans = [];
    Store.installments = [];
    var now = Clock.now();
    var previousDate = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), 28));
    function format(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    Store.movements = [
      { id: 'home-proactive-old-1', tipo: 'despesa', status: 'pago', categoria: 'moradia', subcategoria: 'aluguel', descricao: 'Aluguel', valor: 60, data: format(previousDate) },
      { id: 'home-proactive-old-2', tipo: 'despesa', status: 'pago', categoria: 'moradia', subcategoria: 'aluguel', descricao: 'Aluguel', valor: 60, data: format(previousDate) },
      { id: 'home-proactive-now-1', tipo: 'despesa', status: 'pago', categoria: 'moradia', subcategoria: 'aluguel', descricao: 'Aluguel', valor: 150, data: Clock.today() },
      { id: 'home-proactive-now-2', tipo: 'despesa', status: 'pago', categoria: 'moradia', subcategoria: 'aluguel', descricao: 'Aluguel', valor: 100, data: Clock.today() }
    ];
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  });

  const callout = page.locator('#alicerce-ai-launcher-title');
  await expect(callout).toHaveClass(/is-proactive/);
  await expect(callout).toHaveAttribute('data-full-text', 'Ewerton, tenho uma mensagem para você');
  const calloutColor = await callout.evaluate(function (element) {
    var channels = getComputedStyle(element).color.match(/[0-9]+/g) || [];
    return channels.map(Number);
  });
  expect(calloutColor.length).toBeGreaterThanOrEqual(3);
  expect(calloutColor[0]).toBeGreaterThan(calloutColor[1] * 1.4);
  await expect(page.locator('.alicerce-ai-launcher-cta')).toContainText('Conversar');

  await page.locator('#alicerce-ai-open-assistant').click();
  await expect(page.locator('#alicerce-assistant-page')).toBeVisible();
  await expect(page.locator('#alicerce-assistant-messages')).toContainText('Seus gastos com Moradia aumentaram');
  await expect(page.locator('#alicerce-assistant-messages')).toContainText('R$ 250,00');
  await expect(page.locator('#alicerce-assistant-messages')).toContainText('R$ 120,00');
  const consumed = await page.evaluate(function () { return AlicerceIA._proactiveConsumed; });
  expect(consumed).toBe(true);
});

test('Assistente mantém o assunto quando a pessoa pergunta por outro período', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  await page.evaluate(function () {
    Store.userId = 'ia-contexto-teste';
    Store.userEmail = 'maria.silva@example.com';
    Store.lang = 'pt';
    Store.settings = Object.assign({}, Store.settings, { alicerceLegalAcceptance: { termsVersion: '2026-10-20-v1', privacyVersion: '2026-10-20-v1', acceptedAt: '2026-10-31T12:00:00.000Z' } });
    Store.loans = [];
    Store.installments = [];
    var now = Clock.now();
    var day = now.getDay() || 7;
    var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
    var previousMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7);
    function format(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    Store.movements = [
      { id: 'bar-esta-semana-1', tipo: 'despesa', status: 'pago', categoria: 'comida', subcategoria: 'bar', descricao: 'Bebidas', estabelecimento: 'Bar Central', valor: 300, data: format(monday) },
      { id: 'bar-esta-semana-2', tipo: 'despesa', status: 'pago', categoria: 'comida', subcategoria: 'bar', descricao: 'Bebidas', estabelecimento: 'Bar Central', valor: 200, data: Clock.today() },
      { id: 'bar-semana-passada', tipo: 'despesa', status: 'pago', categoria: 'comida', subcategoria: 'bar', descricao: 'Bebidas', estabelecimento: 'Bar Central', valor: 200, data: format(previousMonday) },
      { id: 'mercado-semana-passada', tipo: 'despesa', status: 'pago', categoria: 'comida', subcategoria: 'mercado', descricao: 'Compras para casa', estabelecimento: 'Mercado do Bairro', valor: 100, data: format(previousMonday) }
    ];
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  });

  await page.locator('#alicerce-ai-open-assistant').click();
  await page.locator('#alicerce-assistant-input').fill('Quanto gastei com bar esta semana?');
  await page.locator('#alicerce-assistant-send').click();
  await expect(page.locator('.alicerce-assistant-message.assistant').last()).toContainText('R$ 500,00');

  await page.locator('#alicerce-assistant-input').fill('E na semana passada?');
  await page.locator('#alicerce-assistant-send').click();
  await expect(page.locator('.alicerce-assistant-message.assistant').last()).toContainText('R$ 200,00');
  await expect(page.locator('.alicerce-assistant-message.assistant').last()).toContainText('No período consultado');
  await expect(page.locator('.alicerce-assistant-message.assistant').last()).not.toContainText('R$ 300,00');
  await expect(page.locator('.alicerce-assistant-message.user').last()).toContainText('E na semana passada?');
});

test('Visão Financeira apresenta pontos principais e permite abrir análises com um toque', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'visao');
  const resultado = await page.evaluate(function () {
    var agora = Clock.now();
    var mesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    var diaAnterior = Math.min(agora.getDate(), new Date(mesAnterior.getFullYear(), mesAnterior.getMonth() + 1, 0).getDate());
    var dia = String(diaAnterior).padStart(2, '0');
    var dataAnterior = mesAnterior.getFullYear() + '-' +
      String(mesAnterior.getMonth() + 1).padStart(2, '0') + '-' + dia;
    var dataAtual = Clock.today();
    Store.userId = 'ia-conta-comparacao';
    Store.settings = Object.assign({}, Store.settings, { alicerceLegalAcceptance: { termsVersion: '2026-10-20-v1', privacyVersion: '2026-10-20-v1', acceptedAt: '2026-10-31T12:00:00.000Z' } });
    Store.movements = [
      { id: 'ia-prev', tipo: 'despesa', categoria: 'comida', subcategoria: 'mercado', descricao: 'Compras', estabelecimento: 'Mercado Bom', valor: 100, data: dataAnterior, status: 'pago' },
      { id: 'ia-now', tipo: 'despesa', categoria: 'comida', subcategoria: 'mercado', descricao: 'Compras', estabelecimento: 'Mercado Bom', valor: 150, data: dataAtual, status: 'pago' }
    ];
    Store.installments = [];
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
    return { monthInsight: AlicerceIA.insight(), total: AlicerceIA._sum(AlicerceIA._periodRows(0)) };
  });

  await expect(page.locator('#alicerce-ai-dashboard')).toBeVisible();
  await expect(page.locator('#visao-ai-total')).toContainText('150,00');
  await expect(page.locator('#visao-ai-compare')).toContainText('50%');
  await expect(page.locator('#visao-ai-biggest')).toContainText('Comida');
  await expect(page.locator('#alicerce-ai-card')).toHaveCount(0);
  await expect(page.locator('#alicerce-ai-question')).toHaveCount(0);
  await expect(page.locator('details.visao-details')).not.toHaveAttribute('open', '');
  expect(resultado.monthInsight).toContain('50%');

  await page.locator('#visao-ai-compare').click();
  await expect(page.locator('#visao-ai-answer')).toContainText('50%');
  await expect(page.locator('#visao-ai-answer')).toContainText('150,00');

  await page.locator('#visao-ai-merchant-0').click();
  await expect(page.locator('#visao-ai-answer')).toContainText('Mercado Bom');
  await expect(page.locator('#visao-ai-answer')).toContainText('150,00');
});

test('Alicerce IA respeita o motor financeiro e exclui pendencias, transferencias e cartao emprestado', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    var today = Clock.today();
    Store.loans = [{ id: 'loan-emprestado', tipo: 'emprestei', fromCard: true }];
    Store.movements = [
      { id: 'realizado', tipo: 'despesa', categoria: 'comida', subcategoria: 'mercado', valor: 75, data: today, status: 'pago' },
      { id: 'pendente', tipo: 'despesa', categoria: 'comida', subcategoria: 'mercado', valor: 999, data: today, status: 'pendente' },
      { id: 'transferencia', tipo: 'transferencia', direction: 'saida', valor: 500, data: today, status: 'pago' },
      { id: 'cartao-emprestado', tipo: 'despesa', categoria: 'comida', subcategoria: 'mercado', valor: 400, data: today, status: 'pago', loanId: 'loan-emprestado' }
    ];
    Store.installments = [
      { id: 'parcela-propria', tipo: 'cartao', compraId: 'compra-propria', categoria: 'comida', subcategoria: 'mercado', descricao: 'Compra pessoal', valor: 20, data: today, status: 'pendente' },
      { id: 'parcela-emprestada', tipo: 'cartao', compraId: 'compra-emprestada', categoria: 'comida', subcategoria: 'mercado', valor: 300, data: today, status: 'pendente', loanId: 'loan-emprestado' }
    ];
    return {
      rows: AlicerceIA._rows(),
      total: AlicerceIA._sum(AlicerceIA._rows())
    };
  });
  expect(result.total).toBe(95);
  expect(result.rows).toHaveLength(2);
  expect(result.rows.map(function (row) { return row.source; }).sort()).toEqual(['card', 'movement']);
});

test('motor preserva metadados estruturados de compras e separa aporte de consumo', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    Store.userId = 'motor-metadados-compra';
    Store.loans = [];
    Store.installments = [];
    Store.movements = [];
    var movement = Store.addMovement({
      tipo: 'despesa',
      status: 'pago',
      categoria: 'comida',
      subcategoria: 'feira',
      descricao: 'Feira de sábado',
      valor: 45,
      data: Clock.today(),
      analysis: {
        origin: 'manual',
        purchaseId: 'feira-001',
        items: [
          { name: 'Tomate', quantity: 1.5, unit: 'kg', unitPrice: 6, total: 9 },
          { name: '', quantity: -2, unitPrice: 'inválido' }
        ],
        metrics: { fuelLiters: -5, unitPrice: 5.89, odometerKm: 120000, vehicleId: 'carro-1' }
      }
    });
    var investment = {
      id: 'aporte-nao-consumo',
      tipo: 'despesa',
      status: 'pago',
      categoria: 'financeiro',
      subcategoria: 'investimento',
      descricao: 'Aporte corretora',
      valor: 500,
      data: Clock.today(),
      analysis: { financialRole: 'investment_contribution' }
    };
    Store.movements.push(investment);
    Repository.set(Store.userId, 'movements', Store.movements);
    return {
      movement: movement,
      stored: Repository.get(Store.userId, 'movements', []),
      rows: Store.getAnalysisEntries(),
      spending: Store.getSpendingAnalysis(Number(Clock.today().slice(5, 7)), Number(Clock.today().slice(0, 4)))
    };
  });
  expect(result.movement.analysis).toMatchObject({
    version: 1,
    origin: 'manual',
    purchaseId: 'feira-001',
    items: [{ name: 'Tomate', quantity: 1.5, unit: 'kg', unitPrice: 6, total: 9 }],
    metrics: { unitPrice: 5.89, odometerKm: 120000, vehicleId: 'carro-1' }
  });
  expect(result.stored[0].analysis.purchaseId).toBe('feira-001');
  expect(result.rows).toHaveLength(1);
  expect(result.spending.financeiro).toBeUndefined();
  expect(result.rows[0]).toMatchObject({
    purpose: '',
    purchaseId: 'feira-001',
    items: [{ name: 'Tomate', total: 9 }],
    metrics: { unitPrice: 5.89, odometerKm: 120000 }
  });
});

test('motor oferece base estruturada para comparacoes de combustivel, manutencao e itens de nota', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    Store.loans = [];
    Store.installments = [];
    Store.movements = [
      {
        id: 'abastecimento-1', tipo: 'despesa', status: 'pago', categoria: 'transporte',
        subcategoria: 'combustivel', descricao: 'Gasolina', valor: 174, data: Clock.today(),
        analysis: { origin: 'manual', metrics: { fuelLiters: 30, unitPrice: 5.8, odometerKm: 120000, vehicleId: 'carro-1', fullTank: true } }
      },
      {
        id: 'abastecimento-2', tipo: 'despesa', status: 'pago', categoria: 'transporte',
        subcategoria: 'combustivel', descricao: 'Gasolina', valor: 236, data: Clock.today(),
        analysis: { origin: 'manual', metrics: { fuelLiters: 40, unitPrice: 5.9, odometerKm: 120500, vehicleId: 'carro-1', fullTank: true } }
      },
      {
        id: 'manutencao-1', tipo: 'despesa', status: 'pago', categoria: 'transporte',
        subcategoria: 'manutencao', descricao: 'Troca de oleo', valor: 280, data: Clock.today(),
        analysis: { origin: 'manual', metrics: { vehicleId: 'carro-1', odometerKm: 120500, maintenanceType: 'troca de oleo' } }
      },
      {
        id: 'nota-1', tipo: 'despesa', status: 'pago', categoria: 'comida',
        subcategoria: 'mercado', descricao: 'Nota supermercado 1', valor: 26, data: Clock.today(),
        analysis: { origin: 'receipt_ocr', items: [{ name: 'Arroz', quantity: 5, unit: 'kg', unitPrice: 5.2, total: 26 }] }
      },
      {
        id: 'nota-2', tipo: 'despesa', status: 'pago', categoria: 'comida',
        subcategoria: 'mercado', descricao: 'Nota supermercado 2', valor: 24, data: Clock.today(),
        analysis: { origin: 'receipt_ocr', items: [{ name: 'Arroz', quantity: 4, unit: 'kg', unitPrice: 6, total: 24 }] }
      }
    ];
    var rows = AlicerceIA._rows();
    return {
      vehicle: AlicerceIA._vehicleSummary(rows),
      items: AlicerceIA._analyzePurchaseItems(rows),
      fuelAnswer: AlicerceIA.responder('Qual meu preço médio por litro de combustível?'),
      maintenanceAnswer: AlicerceIA.responder('Quanto gastei com manutenção?'),
      itemAnswer: AlicerceIA.responder('Qual foi o preço do arroz?')
    };
  });
  expect(result.vehicle.fuel).toMatchObject({ purchases: 2, total: 410, liters: 70, fullTankIntervals: 1 });
  expect(result.vehicle.fuel.averagePricePerLiter).toBeCloseTo(410 / 70, 2);
  expect(result.vehicle.fuel.averageKmPerLiter).toBeCloseTo(12.5, 2);
  expect(result.vehicle.maintenance).toMatchObject({ purchases: 1, total: 280 });
  expect(result.items[0]).toMatchObject({ item: 'Arroz', unit: 'kg', quantity: 9, total: 50, purchases: 2 });
  expect(result.items[0].averageUnitPrice).toBeCloseTo(50 / 9, 2);
  expect(result.fuelAnswer).toContain('70,00 litros');
  expect(result.fuelAnswer).toContain('12,5 km/l');
  expect(result.maintenanceAnswer).toContain('R$ 280,00');
  expect(result.itemAnswer).toContain('R$ 5,56');
});

test('Alicerce IA identifica um gasto muito acima da mediana pessoal quando existe historico suficiente', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    var now = Clock.now();
    function format(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    Store.loans = [];
    Store.installments = [];
    Store.movements = [];
    [20, 22, 18, 20, 21].forEach(function (amount, index) {
      var date = new Date(now.getFullYear(), now.getMonth() - (index + 1), 10);
      Store.movements.push({
        id: 'historico-' + index, tipo: 'despesa', status: 'pago',
        categoria: 'comida', subcategoria: 'lanchonete',
        valor: amount, data: format(date), descricao: 'Lanche'
      });
    });
    Store.movements.push({
      id: 'fora-padrao', tipo: 'despesa', status: 'pago',
      categoria: 'comida', subcategoria: 'lanchonete',
      valor: 150, data: Clock.today(), descricao: 'Lanche especial'
    });
    return {
      anomalies: AlicerceIA._detectAnomalies(AlicerceIA._rows()),
      insight: AlicerceIA.insight()
    };
  });
  expect(result.anomalies).toHaveLength(1);
  expect(result.anomalies[0]).toMatchObject({ amount: 150, median: 20, category: 'comida' });
  expect(result.insight).toContain('R$ 150,00');
  expect(result.insight).toContain('R$ 20,00');
});

test('Alicerce IA nao chama um gasto de anormal sem cinco registros anteriores comparaveis', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    var now = Clock.now();
    function format(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    Store.loans = [];
    Store.installments = [];
    Store.movements = [20, 22, 18, 1000].map(function (amount, index) {
      var date = index === 3 ? now : new Date(now.getFullYear(), now.getMonth() - (index + 1), 10);
      return {
        id: 'historico-curto-' + index, tipo: 'despesa', status: 'pago',
        categoria: 'comida', subcategoria: 'lanchonete',
        valor: amount, data: format(date)
      };
    });
    return AlicerceIA._detectAnomalies(AlicerceIA._rows());
  });
  expect(result).toEqual([]);
});

test('Alicerce IA entende periodos, estabelecimentos e aumentos por categoria', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    var now = Clock.now();
    function format(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    var previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var currentDate = Clock.today();
    var previousMonthDate = format(previousMonth);
    var yesterdayDate = format(yesterday);
    Store.loans = [];
    Store.installments = [];
    Store.movements = [
      { id: 'last-month', tipo: 'despesa', status: 'pago', categoria: 'comida', subcategoria: 'mercado', descricao: 'Compra antiga', estabelecimento: 'Mercado Bom', valor: 100, data: previousMonthDate },
      { id: 'yesterday', tipo: 'despesa', status: 'pago', categoria: 'comida', subcategoria: 'padaria', descricao: 'Pao', estabelecimento: 'Padaria Central', valor: 15, data: yesterdayDate },
      { id: 'today-a', tipo: 'despesa', status: 'pago', categoria: 'comida', subcategoria: 'mercado', descricao: 'Feira', estabelecimento: 'Mercado Bom', valor: 90, data: currentDate },
      { id: 'today-b', tipo: 'despesa', status: 'pago', categoria: 'comida', subcategoria: 'mercado', descricao: 'Mercado', estabelecimento: 'Mercado Bom', valor: 105, data: currentDate }
    ];
    return {
      lastMonth: AlicerceIA.responder('Quanto gastei no mês passado?'),
      yesterday: AlicerceIA.responder('Quanto gastei ontem?'),
      merchant: AlicerceIA.responder('Qual estabelecimento levou mais dinheiro?'),
      categoryRise: AlicerceIA.insight(),
      expectedLastMonth: previousMonthDate.slice(0, 7)===yesterdayDate.slice(0, 7)?'R$ 115,00':'R$ 100,00',
      expectedRisePercent: Math.round(((195+(yesterdayDate.slice(0,7)===currentDate.slice(0,7)?15:0))-100)/100*100)
    };
  });
  expect(result.lastMonth).toContain(result.expectedLastMonth);
  expect(result.yesterday).toContain('R$ 15,00');
  expect(result.merchant).toContain('Mercado Bom');
  expect(result.categoryRise).toContain('aumentaram '+result.expectedRisePercent+'%');
});


test('Alicia reconhece compras frequentes de feira mesmo sem nota fiscal e com valores variáveis', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    var now = Clock.now();
    function format(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    Store.loans = [];
    Store.installments = [];
    Store.movements = [30, 42, 38, 50].map(function (amount, index) {
      var date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (index * 7));
      return {
        id: 'feira-semanal-' + index,
        tipo: 'despesa',
        status: 'pago',
        categoria: 'comida',
        subcategoria: 'feira',
        descricao: 'Compra de frutas e verduras',
        valor: amount,
        data: format(date)
      };
    });
    Store.movements.push({
      id: 'restaurante-isolado',
      tipo: 'despesa',
      status: 'pago',
      categoria: 'comida',
      subcategoria: 'restaurante',
      descricao: 'Almoço',
      valor: 75,
      data: Clock.today()
    });
    return {
      patterns: AlicerceIA._detectFrequentPurchases(AlicerceIA._rows()),
      answer: AlicerceIA.responder('Qual o padrão das compras de feira?')
    };
  });
  expect(result.patterns).toHaveLength(1);
  expect(result.patterns[0]).toMatchObject({
    item: 'feira e hortifruti',
    purchases: 4,
    weeks: 4,
    total: 160,
    average: 40
  });
  expect(result.answer).toContain('4 compras');
  expect(result.answer).toContain('4 semanas');
  expect(result.answer).toContain('R$ 160,00');
  expect(result.answer).toContain('R$ 40,00');
});

test('Alicerce IA identifica pagamentos possivelmente recorrentes sem modelo ou API externa', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    var now = Clock.now();
    function format(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    Store.loans = [];
    Store.installments = [];
    Store.movements = [89.90, 89.90, 94.90].map(function (amount, index) {
      var date = new Date(now.getFullYear(), now.getMonth() - (2 - index), Math.min(10, now.getDate()));
      return {
        id: 'internet-recorrente-' + index, tipo: 'despesa', status: 'pago',
        categoria: 'moradia', subcategoria: 'internet',
        estabelecimento: 'NET FIBRA', descricao: 'Internet residencial',
        valor: amount, data: format(date)
      };
    });
    return {
      recurring: AlicerceIA._detectRecurring(AlicerceIA._rows()),
      insight: AlicerceIA.insight(),
      answer: AlicerceIA.responder('Quais pagamentos parecem recorrentes?')
    };
  });
  expect(result.recurring).toHaveLength(1);
  expect(result.recurring[0].merchant).toBe('NET FIBRA');
  expect(result.recurring[0].months).toBe(3);
  expect(result.recurring[0].amount).toBeCloseTo(89.90, 2);
  expect(result.insight).toContain('NET FIBRA');
  expect(result.answer).toContain('NET FIBRA');
});

test('Alicerce IA separa conta mensal variavel de assinatura com valor fixo', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    var now = Clock.now();
    function format(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    Store.loans = [];
    Store.installments = [];
    Store.movements = [30, 90, 170].map(function (amount, index) {
      var date = new Date(now.getFullYear(), now.getMonth() - (2 - index), Math.min(10, now.getDate()));
      return {
        id: 'internet-variavel-' + index, tipo: 'despesa', status: 'pago',
        categoria: 'moradia', subcategoria: 'internet',
        estabelecimento: 'NET FIBRA', valor: amount, data: format(date)
      };
    });
    return {
      fixedRecurring: AlicerceIA._detectRecurring(AlicerceIA._rows()),
      monthlyPatterns: AlicerceIA._detectMonthlyPatterns(AlicerceIA._rows()),
      answer: AlicerceIA.responder('Quais despesas se repetem mensalmente?')
    };
  });
  expect(result.fixedRecurring).toEqual([]);
  expect(result.monthlyPatterns).toHaveLength(1);
  expect(result.monthlyPatterns[0]).toMatchObject({ merchant: 'NET FIBRA', months: 3, minimum: 30, maximum: 170 });
  expect(result.answer).toContain('3 dos últimos 6 meses');
  expect(result.answer).toContain('R$ 30,00');
  expect(result.answer).toContain('R$ 170,00');
});


test('publica manifesto PWA e ícones com tamanhos válidos', async function ({ page }) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');
  const manifestResponse = await page.request.get(new URL('/manifest.webmanifest', page.url()).toString());
  expect(manifestResponse.ok()).toBeTruthy();
  expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe('Alicerce');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.icons.map(function (icon) { return icon.sizes; })).toEqual(['192x192', '512x512']);
  for (const icon of manifest.icons) {
    const response = await page.request.get(new URL(icon.src, page.url()).toString());
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/png');
    const png = await response.body();
    expect(png.toString('hex', 0, 8)).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(Number(icon.sizes.split('x')[0]));
    expect(png.readUInt32BE(20)).toBe(Number(icon.sizes.split('x')[1]));
  }
});

test('orienta primeiro acesso no iPhone e mantém a opção de instalação no menu', async function ({ page }) {
  await page.addInitScript(function () {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: function () { return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'; } });
    Object.defineProperty(navigator, 'platform', { configurable: true, get: function () { return 'iPhone'; } });
  });
  await abrirAbertura(page);
  await page.evaluate(function () {
    Store.userId = 'pwa-ios-test-user';
    Store.screen = 'home';
    var welcome = document.getElementById('livingSplash');
    if (welcome) welcome.classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    window.AlicercePWA.check();
  });
  await expect(page.locator('#al-install-onboarding')).toBeVisible();
  await expect(page.locator('#al-install-onboarding')).toContainText('Compartilhar');
  await expect(page.locator('#al-install-onboarding')).toContainText('Adicionar à Tela de Início');
  await page.evaluate(function () { renderMenu(); toggleMenu(); });
  await expect(page.locator('#menu-panel .al-install-menu-item')).toBeVisible();
  await expect(page.locator('#menu-panel .al-install-menu-item')).toContainText('Adicionar à tela inicial');
  await expect(page.locator('#menu-panel .al-install-menu-divider')).toBeVisible();
  const menuOrder = await page.locator('#menu-panel .al-install-menu-item').evaluate(function (item) {
    return item.previousElementSibling && item.previousElementSibling.classList.contains('al-install-menu-divider') &&
      item.parentElement.children[2] === item;
  });
  expect(menuOrder).toBe(true);
});

test('exibe o atalho de instalação na prévia aberta pelo computador', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  await page.evaluate(function () { renderMenu(); toggleMenu(); });
  await expect(page.locator('#menu-panel .al-install-menu-item')).toBeVisible();
  await expect(page.locator('#menu-panel .al-install-menu-item')).toContainText('Adicionar à tela inicial');
  await page.locator('#menu-panel .al-install-menu-item').click();
  await expect(page.locator('#al-install-onboarding')).toBeVisible();
  await expect(page.locator('#al-install-onboarding')).toContainText('navegador do telefone');
});

test('usa o aviso nativo de instalação quando o Android disponibiliza o evento', async function ({ page }) {
  await page.addInitScript(function () {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: function () { return 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'; } });
  });
  await abrirAbertura(page);
  await page.evaluate(function () {
    window.__alicercePwaPrompted = false;
    var promptEvent = new Event('beforeinstallprompt', { cancelable: true });
    promptEvent.prompt = function () { window.__alicercePwaPrompted = true; return Promise.resolve(); };
    promptEvent.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(promptEvent);
    Store.userId = 'pwa-android-test-user';
    Store.screen = 'home';
    var welcome = document.getElementById('livingSplash');
    if (welcome) welcome.classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    window.AlicercePWA.check();
  });
  await expect(page.locator('#al-install-onboarding')).toBeVisible();
  await expect(page.locator('#al-install-primary')).toHaveText('Instalar agora');
  await page.locator('#al-install-primary').click();
  await expect.poll(function () { return page.evaluate(function () { return window.__alicercePwaPrompted; }); }).toBe(true);
});

test('não oferece instalação novamente quando a Alicerce já está instalada', async function ({ page }) {
  await page.addInitScript(function () {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: function () { return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'; } });
    Object.defineProperty(navigator, 'platform', { configurable: true, get: function () { return 'iPhone'; } });
    Object.defineProperty(navigator, 'standalone', { configurable: true, get: function () { return true; } });
  });
  await abrirAbertura(page);
  await page.evaluate(function () {
    Store.userId = 'pwa-installed-test-user';
    Store.screen = 'home';
    document.getElementById('app').classList.remove('hidden');
    window.AlicercePWA.check();
  });
  await expect(page.locator('#al-install-onboarding')).toBeHidden();
  await expect(page.locator('#menu-panel .al-install-menu-item')).toHaveCount(0);
});

test('Alicia usa voz remota fixa Francisca e só envia o texto após consentimento', async function ({ page }) {
  await page.addInitScript(function () {
    window.__alicerceRemoteVoiceTest = { calls: [], plays: 0, pauses: 0 };
    window.Audio = function (url) {
      this.src = url;
      this.play = async function () { window.__alicerceRemoteVoiceTest.plays += 1; };
      this.pause = function () { window.__alicerceRemoteVoiceTest.pauses += 1; };
      this.removeAttribute = function () { this.src = ''; };
      this.load = function () {};
    };
  });

  await prepararTelaSemNuvem(page, 'assistente');
  await page.evaluate(function () {
    Store.userId = 'tts-remote-pt-test';
    Store.lang = 'pt';
    Store.settings = { lang: 'pt', theme: 'azul' };
    window.alicerceSupabase = {
      auth: { getSession: async function () {
        return { data: { session: { access_token: 'mock-session-token' } } };
      } },
      functions: { invoke: async function (name, options) {
        window.__alicerceRemoteVoiceTest.calls.push({ name: name, body: options.body });
        return {
          data: new Blob([new Uint8Array([73, 68, 51, 4, 5, 6])], { type: 'application/octet-stream' }),
          error: null
        };
      } }
    };
    AlicerceIA._resetUser();
    AlicerceIA._messages.push({
      role: 'assistant',
      text: 'Você gastou R$ 300,00 com alimentação e sua variação foi de 25%.'
    });
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  });

  const speakButton = page.locator('.alicerce-assistant-speak');
  await expect(speakButton).toBeVisible();
  expect(await page.evaluate(function () { return AlicerceIA._ttsVoiceId; })).toBe('pt-BR-FranciscaNeural');

  await speakButton.click();
  await expect(page.locator('#alicerce-assistant-privacy')).toContainText('somente o texto desta resposta');
  await expect(page.locator('#alicerce-assistant-privacy')).toContainText('Microsoft Edge');
  expect(await page.evaluate(function () { return window.__alicerceRemoteVoiceTest.calls.length; })).toBe(0);

  await page.locator('.alicerce-assistant-privacy-confirm').click();
  await expect.poll(function () {
    return page.evaluate(function () { return window.__alicerceRemoteVoiceTest.calls.length; });
  }).toBe(1);

  const request = await page.evaluate(function () { return window.__alicerceRemoteVoiceTest.calls[0]; });
  expect(request.name).toBe('alicia-tts');
  expect(request.body.text).toBe('Você gastou 300 reais com alimentação e sua variação foi de 25 por cento.');
  await expect(speakButton).toContainText('Parar');
  await expect(speakButton).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(function () {
    return page.evaluate(function () { return window.__alicerceRemoteVoiceTest.plays; });
  }).toBe(1);

  await speakButton.click();
  await expect(speakButton).toContainText('Ouvir resposta');
  await expect(speakButton).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(function () {
    return page.evaluate(function () { return window.__alicerceRemoteVoiceTest.pauses; });
  }).toBe(1);
});

test('Alicia prepara valores financeiros para fala sem mudar o texto exibido', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'assistente');
  const prepared = await page.evaluate(function () {
    Store.lang = 'pt';
    return {
      thousands: AlicerceIA.prepararFala('Você gastou R$ 3.000,00.'),
      cents: AlicerceIA.prepararFala('Foram R$ 48,50 no mercado.'),
      percent: AlicerceIA.prepararFala('Aumento de 25%.'),
      source: 'Você gastou R$ 3.000,00.'
    };
  });
  expect(prepared.thousands).toBe('Você gastou 3.000 reais.');
  expect(prepared.cents).toBe('Foram 48 reais e 50 centavos no mercado.');
  expect(prepared.percent).toBe('Aumento de 25 por cento.');
  expect(prepared.source).toBe('Você gastou R$ 3.000,00.');
});

test('Alicia mantém o texto e não usa voz do aparelho quando o serviço remoto falha', async function ({ page }) {
  await page.addInitScript(function () {
    window.__alicerceRemoteVoiceFailure = { nativeSpoken: 0, calls: 0 };
    window.SpeechSynthesisUtterance = function (text) { this.text = text; };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false,
        pending: false,
        getVoices: function () {
          return [{ name: 'Voz diferente do aparelho', lang: 'pt-BR', localService: true }];
        },
        speak: function () { window.__alicerceRemoteVoiceFailure.nativeSpoken += 1; },
        cancel: function () { this.speaking = false; this.pending = false; }
      }
    });
  });

  await prepararTelaSemNuvem(page, 'assistente');
  await page.evaluate(function () {
    Store.userId = 'tts-remote-failure-test';
    Store.lang = 'pt';
    Store.settings = { lang: 'pt', theme: 'azul' };
    window.alicerceSupabase = {
      auth: { getSession: async function () {
        return { data: { session: { access_token: 'mock-session-token' } } };
      } },
      functions: { invoke: async function () {
        window.__alicerceRemoteVoiceFailure.calls += 1;
        return { data: null, error: new Error('Falha simulada no serviço remoto.') };
      } }
    };
    AlicerceIA._resetUser();
    AlicerceIA._messages.push({
      role: 'assistant',
      text: 'Você gastou R$ 75,00 com transporte.'
    });
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  });

  await page.locator('.alicerce-assistant-speak').click();
  await expect(page.locator('#alicerce-assistant-privacy')).toContainText('serviço de voz online');
  await page.locator('.alicerce-assistant-privacy-confirm').click();
  await expect(page.locator('#alicerce-assistant-status')).toContainText('Não foi possível gerar a voz da Alicia');
  const result = await page.evaluate(function () {
    return {
      nativeSpoken: window.__alicerceRemoteVoiceFailure.nativeSpoken,
      calls: window.__alicerceRemoteVoiceFailure.calls,
      textStillVisible: document.querySelector('.alicerce-assistant-message.assistant').textContent.indexOf('75,00')>=0,
      pressed: document.querySelector('.alicerce-assistant-speak').getAttribute('aria-pressed')
    };
  });
  expect(result.nativeSpoken).toBe(0);
  expect(result.calls).toBe(1);
  expect(result.textStillVisible).toBe(true);
  expect(result.pressed).toBe('false');
});

test('Alicia oferece voz somente em português brasileiro', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'assistente');
  await page.evaluate(function () {
    Store.lang = 'en';
    Store.settings = { lang: 'en', theme: 'azul' };
    window.__alicerceRemoteLanguageCalls = 0;
    window.alicerceSupabase = {
      auth: { getSession: async function () {
        return { data: { session: { access_token: 'mock' } } };
      } },
      functions: { invoke: async function () {
        window.__alicerceRemoteLanguageCalls += 1;
        return { data: new Blob(['x']), error: null };
      } }
    };
    AlicerceIA._resetUser();
    AlicerceIA._messages.push({ role: 'assistant', text: 'Your spending increased this month.' });
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  });
  await page.locator('.alicerce-assistant-speak').click();
  await expect(page.locator('#alicerce-assistant-status')).toContainText('only in Brazilian Portuguese');
  await expect(page.locator('#alicerce-assistant-privacy')).toBeHidden();
  expect(await page.evaluate(function () { return window.__alicerceRemoteLanguageCalls; })).toBe(0);
});
test('Alicia prepara uma despesa pelo chat e só grava após a confirmação financeira existente', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'assistente');
  await page.evaluate(function () {
    Store.userId = 'alicia-chat-expense-test';
    Store.lang = 'pt';
    Store.cards = [];
    Store.movements = [];
    Store.installments = [];
    Store.settings = {
      lang: 'pt',
      theme: 'azul',
      alicerceLegalAcceptance: {
        termsVersion: '2026-10-20-v1',
        privacyVersion: '2026-10-20-v1',
        acceptedAt: '2026-10-31T12:00:00.000Z'
      }
    };
    AlicerceIA._resetUser();
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  });

  await page.locator('#alicerce-assistant-input').fill('Comprei um lanche por R$ 45,90 na padaria no Pix');
  await page.locator('#alicerce-assistant-send').click();
  await expect(page.locator('#btn-save-gasto-doubt')).toBeVisible();

  const draft = await page.evaluate(function () {
    return {
      movements: Store.movements.length,
      amount: Store.screenData && Store.screenData.amountInput,
      item: Store.screenData && Store.screenData.itemInput,
      local: Store.screenData && Store.screenData.localInput,
      paymentMethod: Store.screenData && Store.screenData.paymentMethod,
      category: Store.screenData && Store.screenData.interpretation && Store.screenData.interpretation.categoria,
      subcategory: Store.screenData && Store.screenData.interpretation && Store.screenData.interpretation.subcategoria
    };
  });
  expect(draft.movements).toBe(0);
  expect(draft.amount).toBe(45.9);
  expect(draft.item).toBe('lanche');
  expect(draft.local).toBe('padaria');
  expect(draft.paymentMethod).toBe('pix');
  expect(draft.category).toBe('comida');
  expect(draft.subcategory).toBe('lanchonete');

  await page.locator('#btn-save-gasto-doubt').click();
  await expect(page.locator('#btn-save-gasto-doubt')).toHaveCount(0);
  const saved = await page.evaluate(function () {
    return {
      count: Store.movements.length,
      value: Store.movements[0] && Store.movements[0].valor,
      category: Store.movements[0] && Store.movements[0].categoria,
      subcategory: Store.movements[0] && Store.movements[0].subcategoria,
      paymentMethod: Store.movements[0] && Store.movements[0].paymentMethod
    };
  });
  expect(saved.count).toBe(1);
  expect(saved.value).toBe(45.9);
  expect(saved.category).toBe('comida');
  expect(saved.subcategory).toBe('lanchonete');
  expect(saved.paymentMethod).toBe('pix');
});

test('Alicia pergunta a finalidade e usa o contexto para classificar materiais antes de salvar', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'assistente');
  await page.evaluate(function () {
    Store.userId = 'alicia-chat-purpose-test';
    Store.lang = 'pt';
    Store.cards = [];
    Store.movements = [];
    Store.installments = [];
    Store.settings = {
      lang: 'pt',
      theme: 'azul',
      alicerceLegalAcceptance: {
        termsVersion: '2026-10-20-v1',
        privacyVersion: '2026-10-20-v1',
        acceptedAt: '2026-10-31T12:00:00.000Z'
      }
    };
    AlicerceIA._resetUser();
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  });

  const input = page.locator('#alicerce-assistant-input');
  const send = page.locator('#alicerce-assistant-send');

  async function verifyPurpose(purpose, category, subcategory) {
    await input.fill('Comprei material por oitenta reais');
    await send.click();
    await expect(page.locator('.alicerce-assistant-message.assistant').last()).toContainText('qual era a finalidade');
    expect(await page.evaluate(function () {
      return AlicerceIA._pendingExpenseDraft && AlicerceIA._pendingExpenseDraft.awaiting;
    })).toBe('purpose');

    await input.fill('para ' + purpose);
    await send.click();
    await expect(page.locator('#btn-save-gasto-doubt')).toBeVisible();

    const draft = await page.evaluate(function () {
      return {
        movements: Store.movements.length,
        amount: Store.screenData && Store.screenData.amountInput,
        item: Store.screenData && Store.screenData.itemInput,
        purpose: Store.screenData && Store.screenData.purpose,
        category: Store.screenData && Store.screenData.interpretation && Store.screenData.interpretation.categoria,
        subcategory: Store.screenData && Store.screenData.interpretation && Store.screenData.interpretation.subcategoria
      };
    });

    expect(draft.movements).toBe(0);
    expect(draft.amount).toBe(80);
    expect(draft.item).toBe('material');
    expect(draft.purpose).toBe(purpose);
    expect(draft.category).toBe(category);
    expect(draft.subcategory).toBe(subcategory);
    await expect(page.locator('.gasto-review')).toContainText('Finalidade informada: ' + purpose);

    await page.locator('#btn-save-gasto-doubt').click();
    await expect(page.locator('#btn-save-gasto-doubt')).toHaveCount(0);
    const saved = await page.evaluate(function () {
      var movement = Store.movements[0] || null;
      var stored = Repository.get(Store.userId, 'movements', []);
      var analyticalRow = AlicerceIA._rows()[0] || null;
      return {
        movementCount: Store.movements.length,
        purpose: movement && movement.purpose,
        storedPurpose: stored[0] && stored[0].purpose,
        analyticalPurpose: analyticalRow && analyticalRow.purpose
      };
    });
    expect(saved.movementCount).toBe(1);
    expect(saved.purpose).toBe(purpose);
    expect(saved.storedPurpose).toBe(purpose);
    expect(saved.analyticalPurpose).toBe(purpose);

    await page.evaluate(function () {
      Store.movements = [];
      Repository.set(Store.userId, 'movements', []);
      go('assistente');
    });
    await expect(input).toBeVisible();
  }

  await verifyPurpose('obra', 'moradia', 'manutencao');
  await verifyPurpose('escola', 'educacao', 'material_escolar');
  await verifyPurpose('trabalho', 'trabalho', 'equipamentos');
});

test('Alicia não registra automaticamente compras parceladas ou no cartão pelo chat', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'assistente');
  await page.evaluate(function () {
    Store.userId = 'alicia-chat-card-guard';
    Store.lang = 'pt';
    Store.cards = [];
    Store.movements = [];
    Store.settings = {
      lang: 'pt',
      theme: 'azul',
      alicerceLegalAcceptance: {
        termsVersion: '2026-10-20-v1',
        privacyVersion: '2026-10-20-v1',
        acceptedAt: '2026-10-31T12:00:00.000Z'
      }
    };
    AlicerceIA._resetUser();
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  });

  await page.locator('#alicerce-assistant-input').fill('Comprei um celular por R$ 1.500,00 no cartão em 10 parcelas');
  await page.locator('#alicerce-assistant-send').click();
  await expect(page.locator('#alicerce-assistant-page')).toBeVisible();
  await expect(page.locator('.alicerce-assistant-message.assistant')).toContainText('ainda não registro parcelamentos diretamente pelo chat');
  const result = await page.evaluate(function () {
    return {
      movements: Store.movements.length,
      installments: Store.installments.length,
      screen: Store.screen
    };
  });
  expect(result.movements).toBe(0);
  expect(result.installments).toBe(0);
  expect(result.screen).toBe('assistente');
});

test('Alicia limita a conversa a duas interações, permite limpar e leva aos relatórios da Visão financeira', async function ({ page }) {
  await page.setViewportSize({ width: 375, height: 812 });
  await prepararTelaSemNuvem(page, 'assistente');
  await page.evaluate(function () {
    Store.userId = 'alicia-historico-limite';
    Store.lang = 'pt';
    Store.settings = {
      lang: 'pt',
      theme: 'azul',
      displayName: 'Ewerton',
      alicerceLegalAcceptance: {
        termsVersion: '2026-10-20-v1',
        privacyVersion: '2026-10-20-v1',
        acceptedAt: '2026-10-31T12:00:00.000Z'
      }
    };
    Store.movements = [];
    Store.installments = [];
    AlicerceIA._resetUser();
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  });

  await expect(page.locator('#alicerce-assistant-financial')).toBeVisible();
  for (const question of ['Quanto gastei este mês?', 'Onde gastei mais?', 'Compare com o mês passado']) {
    await page.locator('#alicerce-assistant-input').fill(question);
    await page.locator('#alicerce-assistant-send').click();
  }

  const historyLength = await page.evaluate(function () { return AlicerceIA._messages.length; });
  expect(historyLength).toBe(4);
  await expect(page.locator('.alicerce-assistant-message.user')).toHaveCount(2);
  await expect(page.locator('.alicerce-assistant-message.assistant')).toHaveCount(2);
  await expect(page.locator('#alicerce-assistant-clear')).toBeVisible();

  const mobileLayout = await page.evaluate(function () {
    var page = document.getElementById('alicerce-assistant-page');
    var input = document.getElementById('alicerce-assistant-input');
    return {
      width: page.clientWidth,
      scrollWidth: page.scrollWidth,
      inputFontSize: window.getComputedStyle(input).fontSize
    };
  });
  expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(mobileLayout.width);
  expect(mobileLayout.inputFontSize).toBe('16px');

  await page.locator('#alicerce-assistant-clear').click();
  await expect(page.locator('#alicerce-assistant-clear')).toHaveCount(0);
  const cleared = await page.evaluate(function () { return AlicerceIA._messages.length; });
  expect(cleared).toBe(0);

  await page.locator('#alicerce-assistant-input').fill('Quero um relatório em PDF');
  await page.locator('#alicerce-assistant-send').click();
  await expect(page.locator('#alicerce-assistant-messages')).toContainText('Visão financeira');
  await page.locator('#alicerce-assistant-financial').click();
  await expect(page.locator('.visao-financeira')).toBeVisible();
});

test('Alicia exibe avisos de privacidade somente quando a pessoa aciona ditado, foto ou leitura em voz', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'assistente');
  await page.evaluate(function () {
    Store.userId = 'alicia-privacy-notices';
    Store.lang = 'pt';
    Store.settings = { lang: 'pt', theme: 'azul', displayName: 'Ewerton' };
    AlicerceIA._resetUser();
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  });

  const notice = page.locator('#alicerce-assistant-privacy');
  await expect(notice).toBeHidden();

  await page.locator('#alicerce-assistant-input').focus();
  await expect(notice).toContainText('Você também pode usar o microfone do teclado para ditar no campo de mensagem.');

  await page.locator('#alicerce-assistant-camera').click();
  await expect(notice).toContainText('as fotos são lidas no próprio aparelho');
  await expect(notice).toContainText('não são enviadas nem armazenadas');
  await page.locator('.alicerce-assistant-privacy-cancel').click();
  await expect(notice).toBeHidden();

  await page.locator('.alicerce-assistant-speak').click();
  await expect(notice).toContainText('somente o texto desta resposta');
  await expect(notice).toContainText('serviço de voz online');
  await expect(notice).toContainText('valores financeiros');
  await page.locator('.alicerce-assistant-privacy-cancel').click();
  await expect(notice).toBeHidden();
});

test('classifica 40 exemplos complementares de gastos cotidianos brasileiros', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const resultado = await page.evaluate(function (cases) {
    Store.learning = {};
    return cases.map(function (example) {
      const actual = Interpreter.interpretLocal(example.text);
      return {
        id: example.id,
        expected: example.categoria + '/' + example.subcategoria,
        actual: actual && actual.categoria && actual.subcategoria ? actual.categoria + '/' + actual.subcategoria : 'sem_classificacao',
        confidence: actual && actual.confidence,
        source: actual && actual.source
      };
    });
  }, classificationContextBenchmark);
  const mismatches = resultado.filter(function (actual) {
    return actual.actual !== actual.expected || actual.confidence !== 'high' || actual.source !== 'item';
  });
  console.log('[benchmark-context-40] ' + JSON.stringify({
    total: resultado.length,
    correct: resultado.length - mismatches.length,
    mismatches: mismatches
  }));
  expect(resultado).toHaveLength(40);
  expect(mismatches).toEqual([]);
});

test('separa natureza, compromisso, recorrência, comportamento e contexto', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    var rows = [
      { id: 'rent', data: Clock.today(), valor: 1200, categoria: 'moradia', subcategoria: 'aluguel', local: 'Imobiliaria Central', descricao: 'Aluguel' },
      { id: 'netflix', data: Clock.today(), valor: 39.90, categoria: 'lazer', subcategoria: 'streaming', local: 'Netflix', descricao: 'Assinatura Netflix' },
      { id: 'uber', data: Clock.today(), valor: 28, categoria: 'transporte', subcategoria: 'uber', local: 'Uber', descricao: 'Corrida' },
      { id: 'market', data: Clock.today(), valor: 190, categoria: 'comida', subcategoria: 'mercado', local: 'Carrefour', descricao: 'Compra' },
      { id: 'work-uber', data: Clock.today(), valor: 32, categoria: 'transporte', subcategoria: 'uber', local: 'Uber', descricao: 'Corrida para o trabalho', purpose: 'trabalho' },
      { id: 'bar', data: Clock.today(), valor: 78, categoria: 'comida', subcategoria: 'bar', local: 'Bel do Bar', descricao: 'Bel do Bar' }
    ];
    var profiles = AlicerceIA._expenseRecurrenceProfiles(rows);
    return rows.map(function (row) {
      return { id: row.id, dimensions: AlicerceIA._classifyExpenseDimensions(row, profiles) };
    });
  });
  var byId = {};
  result.forEach(function (item) { byId[item.id] = item.dimensions; });
  expect(byId.rent).toMatchObject({ nature: 'essential', commitment: 'undetermined', flexibility: 'low' });
  expect(byId.netflix).toMatchObject({ nature: 'discretionary', commitment: 'undetermined', flexibility: 'high' });
  expect(byId.uber).toMatchObject({ nature: 'undetermined', context: 'undetermined', flexibility: 'undetermined' });
  expect(byId.market).toMatchObject({ nature: 'undetermined', context: 'undetermined' });
  expect(byId['work-uber']).toMatchObject({ nature: 'essential', context: 'work' });
  expect(byId.bar).toMatchObject({ nature: 'discretionary', flexibility: 'high' });
});

test('distingue recorrência observada de contrato e identifica valores fixos ou variáveis', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    var now = Clock.now();
    function monthDate(offset, day) {
      var dayValue=offset===0?Math.min(day||10,now.getDate()):(day||10);
      var date = new Date(now.getFullYear(), now.getMonth() - offset, dayValue);
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }
    var fixed = [89.90, 89.90, 89.90].map(function (amount, index) {
      return { id: 'stream-' + index, data: monthDate(2 - index), valor: amount, categoria: 'lazer', subcategoria: 'streaming', local: 'Netflix', descricao: 'Netflix' };
    });
    var variable = [30, 90, 170].map(function (amount, index) {
      return { id: 'internet-' + index, data: monthDate(2 - index), valor: amount, categoria: 'moradia', subcategoria: 'internet', local: 'Net Fibra', descricao: 'Internet residencial' };
    });
    var installments = { id: 'installment', data: monthDate(0), valor: 200, categoria: 'eletronicos', subcategoria: 'celular', local: 'Loja', descricao: 'Celular parcelado', installmentCount: 10 };
    var rows = fixed.concat(variable).concat([installments]);
    var profiles = AlicerceIA._expenseRecurrenceProfiles(rows);
    return {
      fixed: AlicerceIA._classifyExpenseDimensions(fixed[2], profiles),
      variable: AlicerceIA._classifyExpenseDimensions(variable[2], profiles),
      installment: AlicerceIA._classifyExpenseDimensions(installments, profiles)
    };
  });
  expect(result.fixed).toMatchObject({ recurrence: 'recurring', behavior: 'fixed', commitment: 'undetermined' });
  expect(result.variable).toMatchObject({ recurrence: 'recurring', behavior: 'variable', commitment: 'undetermined' });
  expect(result.installment).toMatchObject({ commitment: 'contractual', nature: 'undetermined' });
});

test('preserva perfil confirmado pelo usuário e ignora valores fora da lista permitida', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    Store.userId = 'financial-profile-test';
    Store.movements = [{
      id: 'profile-1', tipo: 'despesa', status: 'pago', data: Clock.today(), valor: 32,
      categoria: 'transporte', subcategoria: 'uber', estabelecimento: 'Uber', descricao: 'Corrida',
      analysis: {
        expenseProfile: {
          source: 'user_confirmed',
          nature: 'essential',
          commitment: 'non_contractual',
          flexibility: 'low',
          context: 'work',
          confidence: { nature: 'high', context: 'high' },
          injectedField: 'should-not-survive'
        }
      }
    }];
    var row = Store.getAnalysisEntries()[0];
    return { row: row, dimensions: AlicerceIA._classifyExpenseDimensions(row, {}) };
  });
  expect(result.row.expenseProfile).toMatchObject({ source: 'user_confirmed', nature: 'essential', context: 'work' });
  expect(result.row.expenseProfile.injectedField).toBeUndefined();
  expect(result.dimensions).toMatchObject({
    nature: 'essential', commitment: 'non_contractual', flexibility: 'low', context: 'work',
    confidence: { nature: 'high', context: 'high' }
  });
});

test('agrega essenciais, discricionários e indeterminados sem recomendar cortes com dados incompletos', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    var now = Clock.now();
    function date(offset) {
      var dayValue=offset===0?Math.min(10,now.getDate()):10;
      var d = new Date(now.getFullYear(), now.getMonth() - offset, dayValue);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    var history = [];
    [0, 1, 2].forEach(function (offset) {
      history.push({ id: 'netflix-' + offset, data: date(offset), valor: 45, categoria: 'lazer', subcategoria: 'streaming', local: 'Netflix', descricao: 'Netflix' });
    });
    [0, 1, 2].forEach(function (offset) {
      history.push({ id: 'bar-' + offset, data: date(offset), valor: 100, categoria: 'comida', subcategoria: 'bar', local: 'Bel do Bar', descricao: 'Bel do Bar' });
    });
    var current = history.filter(function (row) { return row.data.slice(0, 7) === date(0).slice(0, 7); });
    current.push({ id: 'rent', data: date(0), valor: 300, categoria: 'moradia', subcategoria: 'aluguel', local: 'Imobiliaria', descricao: 'Aluguel' });
    current.push({ id: 'bar-extra-1', data: date(0), valor: 100, categoria: 'comida', subcategoria: 'bar', local: 'Bel do Bar', descricao: 'Bel do Bar' });
    current.push({ id: 'bar-extra-2', data: date(0), valor: 100, categoria: 'comida', subcategoria: 'bar', local: 'Bel do Bar', descricao: 'Bel do Bar' });
    var clear = AlicerceIA._financialReality(current, history);
    current.push({ id: 'market', data: date(0), valor: 900, categoria: 'comida', subcategoria: 'mercado', local: 'Carrefour', descricao: 'Compra' });
    var uncertain = AlicerceIA._financialReality(current, history);
    return { clear: clear, uncertain: uncertain };
  });
  expect(result.clear.essential).toBe(300);
  expect(result.clear.discretionary).toBe(345);
  expect(result.clear.reviewOpportunity).toBe(true);
  expect(result.uncertain.undetermined).toBe(900);
  expect(result.uncertain.reviewOpportunity).toBe(false);
  expect(result.uncertain.needsContext).toBe(true);
});

test('Alicia explica a realidade financeira e mantém a análise no painel da Visão Financeira', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    var now = Clock.now();
    var data = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(Math.min(12, now.getDate())).padStart(2, '0');
    Store.userId = 'financial-reality-dashboard-test';
    Store.lang = 'pt';
    Store.movements = [
      { id: 'rent', tipo: 'despesa', status: 'pago', data: data, valor: 1000, categoria: 'moradia', subcategoria: 'aluguel', estabelecimento: 'Imobiliaria' },
      { id: 'streaming', tipo: 'despesa', status: 'pago', data: data, valor: 40, categoria: 'lazer', subcategoria: 'streaming', estabelecimento: 'Netflix' },
      { id: 'market', tipo: 'despesa', status: 'pago', data: data, valor: 250, categoria: 'comida', subcategoria: 'mercado', estabelecimento: 'Carrefour' }
    ];
    var answer = AlicerceIA.responder('Quanto custa manter minha vida?');
    var html = AlicerceIA.renderDashboard();
    return { answer: answer, html: html };
  });
  expect(result.answer).toContain('essenciais estimadas');
  expect(result.answer).toContain('indeterminadas');
  expect(result.html).toContain('visao-ai-financial-reality');
  expect(result.html).toContain('Essenciais estimados');
  expect(result.html).toContain('Indeterminados');
});


test('Alicia permite confirmar a natureza e a finalidade de um gasto sem alterar a classificação ou o valor', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  await page.evaluate(function () {
    Store.userId = 'financial-profile-ui-movement';
    Store.lang = 'pt';
    Store.settings = {
      lang: 'pt',
      theme: 'azul',
      displayName: 'Teste',
      alicerceLegalAcceptance: {
        termsVersion: '2026-10-20-v1',
        privacyVersion: '2026-10-20-v1',
        acceptedAt: '2026-10-31T12:00:00.000Z'
      }
    };
    Store.movements = [{
      id: 'movement-unknown',
      tipo: 'despesa',
      status: 'pago',
      data: Clock.today(),
      valor: 42.50,
      categoria: 'transporte',
      subcategoria: 'uber',
      estabelecimento: 'Uber',
      descricao: 'Corrida'
    }];
    Store.installments = [];
    AlicerceIA._resetUser();
    go('visao');
  });

  await expect(page.locator('#visao-ai-review-undetermined')).toBeVisible();
  await page.locator('#visao-ai-review-undetermined').click();
  await expect(page.locator('#financial-profile-item-0')).toBeVisible();
  await page.locator('#financial-profile-item-0').click();
  await expect(page.locator('#financial-profile-save')).toBeVisible();

  await page.locator('#financial-profile-nature').selectOption('essential');
  await page.locator('#financial-profile-context').selectOption('work');
  await page.locator('#financial-profile-flexibility').selectOption('low');
  await page.locator('#financial-profile-commitment').selectOption('non_contractual');
  await page.locator('#financial-profile-purpose').fill('Deslocamento para o trabalho');
  await page.locator('#financial-profile-save').click();

  const saved = await page.evaluate(function () {
    var movement = Store.movements[0];
    var analysis = Store.getAnalysisEntries()[0];
    return {
      amount: movement.valor,
      category: movement.categoria,
      subcategory: movement.subcategoria,
      profile: analysis.expenseProfile,
      purpose: movement.purpose,
      status: movement.status
    };
  });
  expect(saved).toMatchObject({
    amount: 42.50,
    category: 'transporte',
    subcategory: 'uber',
    status: 'pago',
    purpose: 'Deslocamento para o trabalho',
    profile: {
      source: 'user_confirmed',
      nature: 'essential',
      context: 'work',
      flexibility: 'low',
      commitment: 'non_contractual'
    }
  });
  await expect(page.locator('body')).toContainText('Não há gastos indeterminados neste mês');
});

test('A confirmação de uma compra no cartão é aplicada a todas as parcelas da mesma compra', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  await page.evaluate(function () {
    var today = Clock.today();
    var date = new Date(today + 'T00:00:00');
    date.setMonth(date.getMonth() + 1);
    var nextMonth = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    Store.userId = 'financial-profile-ui-card';
    Store.lang = 'pt';
    Store.settings = {
      lang: 'pt',
      theme: 'azul',
      displayName: 'Teste',
      alicerceLegalAcceptance: {
        termsVersion: '2026-10-20-v1',
        privacyVersion: '2026-10-20-v1',
        acceptedAt: '2026-10-31T12:00:00.000Z'
      }
    };
    Store.movements = [];
    Store.installments = [
      {
        id: 'card-installment-1', tipo: 'cartao', compraId: 'purchase-profile-1',
        cardId: 'card-1', categoria: 'transporte', subcategoria: 'uber',
        descricao: 'Compra parcelada', local: 'Uber', valor: 60,
        data: today, dataCompra: today, parcelaAtual: 1, parcelas: 2, status: 'pago'
      },
      {
        id: 'card-installment-2', tipo: 'cartao', compraId: 'purchase-profile-1',
        cardId: 'card-1', categoria: 'transporte', subcategoria: 'uber',
        descricao: 'Compra parcelada', local: 'Uber', valor: 60,
        data: nextMonth, dataCompra: today, parcelaAtual: 2, parcelas: 2, status: 'pendente'
      }
    ];
    AlicerceIA._resetUser();
    go('visao');
  });

  await expect(page.locator('#visao-ai-review-undetermined')).toBeVisible();
  await page.locator('#visao-ai-review-undetermined').click();
  await page.locator('#financial-profile-item-0').click();
  await page.locator('#financial-profile-nature').selectOption('discretionary');
  await page.locator('#financial-profile-context').selectOption('leisure');
  await page.locator('#financial-profile-flexibility').selectOption('high');
  await page.locator('#financial-profile-save').click();

  const saved = await page.evaluate(function () {
    return Store.installments.map(function (item) {
      return {
        id: item.id,
        value: item.valor,
        category: item.categoria,
        purchaseId: item.compraId,
        profile: item.analysis && item.analysis.expenseProfile
      };
    });
  });
  expect(saved).toHaveLength(2);
  saved.forEach(function (item) {
    expect(item).toMatchObject({
      value: 60,
      category: 'transporte',
      purchaseId: 'purchase-profile-1',
      profile: { source: 'user_confirmed', nature: 'discretionary', context: 'leisure', flexibility: 'high' }
    });
  });
});


test('A confirmação explícita de “Ainda não sei” não é sobrescrita pelas regras automáticas', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  const result = await page.evaluate(function () {
    var row = {
      id: 'unknown-confirmed',
      data: Clock.today(),
      valor: 39.90,
      categoria: 'lazer',
      subcategoria: 'streaming',
      local: 'Netflix',
      descricao: 'Assinatura',
      expenseProfile: {
        version: 1,
        source: 'user_confirmed',
        nature: 'undetermined',
        confidence: { nature: 'low' }
      }
    };
    return AlicerceIA._classifyExpenseDimensions(row, {});
  });
  expect(result).toMatchObject({
    nature: 'undetermined',
    confidence: { nature: 'low' },
    evidence: { nature: 'user_confirmed' }
  });
});

test('Alicia revisa gastos sem contexto pelo chat e salva a finalidade sem alterar os dados financeiros', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'assistente');
  const result = await page.evaluate(async function () {
    Store.userId = 'alicia-review-chat-test';
    Store.lang = 'pt';
    Store.settings = {
      lang: 'pt',
      theme: 'azul',
      displayName: 'Teste',
      alicerceLegalAcceptance: {
        termsVersion: '2026-10-20-v1',
        privacyVersion: '2026-10-20-v1',
        acceptedAt: '2026-10-31T12:00:00.000Z'
      }
    };
    Store.movements = [{
      id: 'review-chat-uber',
      tipo: 'despesa',
      status: 'pago',
      data: Clock.today(),
      valor: 42.50,
      categoria: 'transporte',
      subcategoria: 'uber',
      estabelecimento: 'Uber',
      descricao: 'Corrida por aplicativo'
    }];
    Store.installments = [];
    Store.loans = [];
    AlicerceIA._resetUser();

    await AlicerceIA.enviarMensagem('Quais gastos ainda precisam de contexto?');
    var firstPrompt = AlicerceIA._messages[AlicerceIA._messages.length - 1].text;
    await AlicerceIA.enviarMensagem('Uber para ir ao trabalho');

    var movement = Store.movements[0];
    var analysisRow = Store.getAnalysisEntries()[0];
    var dimensions = AlicerceIA._classifyExpenseDimensions(analysisRow, {});
    return {
      firstPrompt: firstPrompt,
      movement: {
        amount: movement.valor,
        date: movement.data,
        category: movement.categoria,
        subcategory: movement.subcategoria,
        purpose: movement.purpose
      },
      profile: analysisRow.expenseProfile,
      dimensions: dimensions,
      pendingReview: AlicerceIA._pendingFinancialReview
    };
  });

  expect(result.firstPrompt).toContain('Corrida por aplicativo');
  expect(result.firstPrompt).toContain('finalidade');
  expect(result.movement).toMatchObject({
    amount: 42.50,
    category: 'transporte',
    subcategory: 'uber',
    purpose: 'Uber para ir ao trabalho'
  });
  expect(result.profile).toMatchObject({
    source: 'user_confirmed',
    context: 'work'
  });
  expect(result.profile.nature).toBeUndefined();
  expect(result.dimensions).toMatchObject({
    context: 'work',
    nature: 'essential',
    evidence: { nature: 'user_stated_purpose' }
  });
  expect(result.pendingReview).toBeNull();
});

test('Alicia mantém a resposta ainda não sei como indeterminada e continua para o próximo gasto', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'assistente');
  const result = await page.evaluate(async function () {
    Store.userId = 'alicia-review-unknown-test';
    Store.lang = 'pt';
    Store.settings = {
      lang: 'pt',
      theme: 'azul',
      displayName: 'Teste',
      alicerceLegalAcceptance: {
        termsVersion: '2026-10-20-v1',
        privacyVersion: '2026-10-20-v1',
        acceptedAt: '2026-10-31T12:00:00.000Z'
      }
    };
    Store.movements = [
      {
        id: 'review-market',
        tipo: 'despesa',
        status: 'pago',
        data: Clock.today(),
        valor: 90,
        categoria: 'comida',
        subcategoria: 'mercado',
        estabelecimento: 'Carrefour',
        descricao: 'Compra no mercado'
      },
      {
        id: 'review-uber',
        tipo: 'despesa',
        status: 'pago',
        data: Clock.today(),
        valor: 40,
        categoria: 'transporte',
        subcategoria: 'uber',
        estabelecimento: 'Uber',
        descricao: 'Corrida por aplicativo'
      }
    ];
    Store.installments = [];
    Store.loans = [];
    AlicerceIA._resetUser();

    await AlicerceIA.enviarMensagem('Quais gastos ainda precisam de contexto?');
    var firstPrompt = AlicerceIA._messages[AlicerceIA._messages.length - 1].text;
    await AlicerceIA.enviarMensagem('Ainda não sei');
    var secondPrompt = AlicerceIA._messages[AlicerceIA._messages.length - 1].text;
    var market = Store.movements[0];
    return {
      firstPrompt: firstPrompt,
      secondPrompt: secondPrompt,
      marketProfile: Store.getAnalysisEntries().filter(function (row) {
        return row.id === 'review-market';
      })[0].expenseProfile,
      nextId: AlicerceIA._pendingFinancialReview && AlicerceIA._pendingFinancialReview.current
        ? AlicerceIA._pendingFinancialReview.current.id
        : null,
      marketAmount: market.valor,
      marketCategory: market.categoria
    };
  });

  expect(result.firstPrompt).toContain('Compra no mercado');
  expect(result.secondPrompt).toContain('Corrida por aplicativo');
  expect(result.nextId).toBe('review-uber');
  expect(result.marketProfile).toMatchObject({
    source: 'user_confirmed',
    nature: 'undetermined',
    confidence: { nature: 'low' }
  });
  expect(result.marketProfile.context).toBeUndefined();
  expect(result.marketAmount).toBe(90);
  expect(result.marketCategory).toBe('comida');
});

test('Alicia respeita negações ao confirmar natureza e flexibilidade', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'assistente');
  const result = await page.evaluate(function () {
    var discretionary = AlicerceIA._financialReviewProfileFromReply(
      'Não é essencial, é discricionário. Não posso cancelar.'
    );
    var essential = AlicerceIA._financialReviewProfileFromReply(
      'Não é discricionário, é essencial.'
    );
    var correctedContext = AlicerceIA._financialReviewProfileFromReply(
      'Não era lazer, foi trabalho.'
    );
    var unknownWithContext = AlicerceIA._financialReviewProfileFromReply(
      'Ainda não sei, mas era para o trabalho.'
    );
    return {
      discretionary: discretionary.profile,
      essential: essential.profile,
      correctedContext: correctedContext.profile,
      unknownWithContext: unknownWithContext.profile
    };
  });

  expect(result.discretionary).toMatchObject({
    nature: 'discretionary',
    flexibility: 'low',
    confidence: { nature: 'high', flexibility: 'high' }
  });
  expect(result.essential).toMatchObject({
    nature: 'essential',
    confidence: { nature: 'high' }
  });
  expect(result.correctedContext).toMatchObject({
    context: 'work',
    confidence: { context: 'high' }
  });
  expect(result.unknownWithContext).toMatchObject({
    nature: 'undetermined',
    context: 'work',
    confidence: { nature: 'low', context: 'high' }
  });
});
