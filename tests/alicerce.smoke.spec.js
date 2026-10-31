import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const supabaseMock = readFileSync(new URL('./fixtures/supabase-mock.js', import.meta.url), 'utf8');
const classificationBenchmark = JSON.parse(readFileSync(new URL('./fixtures/classification-benchmark-ptbr.json', import.meta.url), 'utf8'));
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


test('Alicerce IA responde perguntas sobre gastos por subcategoria e respeita a conta ativa', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'home');
  await page.evaluate(function () {
    Store.userId = 'ia-conta-teste-a';
    Store.settings = Object.assign({}, Store.settings, { alicerceLegalAcceptance: { termsVersion: '2026-10-20-v1', privacyVersion: '2026-10-20-v1', acceptedAt: '2026-10-31T12:00:00.000Z' } });
    Store.lang = 'pt';
    Store.movements = [
      { id: 'ia-1', tipo: 'despesa', categoria: 'comida', subcategoria: 'lanchonete', descricao: 'Lanche', estabelecimento: 'Lanchonete Central', valor: 48.50, data: Clock.today(), status: 'pago' },
      { id: 'ia-2', tipo: 'despesa', categoria: 'moradia', subcategoria: 'energia', descricao: 'Conta de luz', estabelecimento: 'Neoenergia', valor: 20, data: Clock.today(), status: 'pago' }
    ];
    Store.installments = [];
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  });

  await expect(page.locator('#alicerce-ai-card')).toBeVisible();
  await expect(page.locator('#alicerce-ai-insight')).toContainText(/lanchonete/i);
  await page.locator('#alicerce-ai-question').fill('Quanto gastei com lanche este mês?');
  await page.locator('.alicerce-ai-button').click();
  await expect(page.locator('#alicerce-ai-answer')).toContainText('48,50');

  await page.evaluate(function () {
    Store.userId = 'ia-conta-teste-b';
    Store.movements = [];
    Store.installments = [];
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
  });
  await expect(page.locator('#alicerce-ai-answer')).toHaveCount(0);
  await expect(page.locator('#alicerce-ai-question')).toHaveValue('');
  await expect(page.locator('#alicerce-ai-insight')).not.toContainText('48,50');
});

test('Alicerce IA também aparece na Visão Financeira e compara períodos equivalentes', async function ({ page }) {
  await prepararTelaSemNuvem(page, 'visao');
  const resultado = await page.evaluate(function () {
    var agora = Clock.now();
    var anoAtual = agora.getFullYear();
    var mesAtual = agora.getMonth();
    var mesAnterior = new Date(anoAtual, mesAtual - 1, 1);
    var diaAnterior = Math.min(agora.getDate(), new Date(mesAnterior.getFullYear(), mesAnterior.getMonth() + 1, 0).getDate());
    var dia = String(diaAnterior).padStart(2, '0');
    var dataAnterior = mesAnterior.getFullYear() + '-' +
      String(mesAnterior.getMonth() + 1).padStart(2, '0') + '-' + dia;
    var dataAtual = Clock.today();
    Store.userId = 'ia-conta-comparacao';
    Store.settings = Object.assign({}, Store.settings, { alicerceLegalAcceptance: { termsVersion: '2026-10-20-v1', privacyVersion: '2026-10-20-v1', acceptedAt: '2026-10-31T12:00:00.000Z' } });
    Store.movements = [
      { id: 'ia-prev', tipo: 'despesa', categoria: 'comida', subcategoria: 'mercado', descricao: 'Compras', valor: 100, data: dataAnterior },
      { id: 'ia-now', tipo: 'despesa', categoria: 'comida', subcategoria: 'mercado', descricao: 'Compras', valor: 150, data: dataAtual }
    ];
    Store.installments = [];
    document.getElementById('app').innerHTML = renderHeader() + renderScreen() + renderBottomNav();
    return { insight: AlicerceIA.insight(), month: dataAtual.slice(0, 7) };
  });

  await expect(page.locator('#alicerce-ai-card')).toBeVisible();
  expect(resultado.insight).toContain('50%');
  await page.locator('#alicerce-ai-question').fill('Compare com o mês passado');
  await page.locator('.alicerce-ai-button').click();
  await expect(page.locator('#alicerce-ai-answer')).toContainText('50%');
});
