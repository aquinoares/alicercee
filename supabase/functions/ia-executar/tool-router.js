const TOOL_DEFINITIONS = Object.freeze({
  "business.customer_totals": "Resumo agregado de clientes, assinaturas, novos cadastros e planos.",
  "ads.app_ad_inventory": "Resumo do inventário de anúncios cadastrados dentro do Alicerce, por status.",
  "ads.app_ad_traffic": "Visualizações, cliques e CTR agregados dos anúncios dentro do aplicativo.",
  "referrals.summary": "Contagem agregada de indicações efetivamente registradas.",
  "product.opt_in_usage": "Eventos agregados de uso apenas das contas que aceitaram compartilhar esses eventos.",
  "quality.acquisition_data": "Cobertura, confiança e limitações conhecidas das fontes de aquisição."
});

export const AGENT_TOOL_PERMISSIONS = Object.freeze({
  hera: Object.freeze([
    "business.customer_totals",
    "ads.app_ad_inventory",
    "ads.app_ad_traffic",
    "referrals.summary",
    "quality.acquisition_data"
  ]),
  tali: Object.freeze([
    "business.customer_totals",
    "ads.app_ad_inventory",
    "ads.app_ad_traffic",
    "referrals.summary",
    "product.opt_in_usage",
    "quality.acquisition_data"
  ]),
  aline: Object.freeze([
    "business.customer_totals",
    "ads.app_ad_inventory",
    "ads.app_ad_traffic",
    "referrals.summary",
    "product.opt_in_usage",
    "quality.acquisition_data"
  ]),
  mali: Object.freeze([
    "ads.app_ad_inventory",
    "ads.app_ad_traffic",
    "quality.acquisition_data"
  ]),
  alicia: Object.freeze([
    "business.customer_totals",
    "product.opt_in_usage",
    "quality.acquisition_data"
  ])
});

const GLOBAL_LIMITATIONS = Object.freeze([
  "Visualizações e cliques são eventos, não pessoas únicas nem leads.",
  "CTR é cliques divididos por visualizações; não comprova cadastro, assinatura ou compra.",
  "Esta fonte não contém gasto de mídia, leads capturados, pedidos ou receita atribuída; CAC, CPL, ROI e ROAS não podem ser calculados.",
  "Os eventos de uso incluem somente contas com consentimento opcional e não representam toda a base.",
  "customer_ads e ad_traffic_events representam anúncios/eventos dentro do aplicativo; não comprovam desempenho de campanhas externas pagas.",
  "A fonte agregada não entrega nomes, e-mails, telefones, contatos, identificadores de usuários ou conteúdo individual de anúncios."
]);

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeText(value, maxLength) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function safeTextList(value, maximum, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(function (item) { return typeof item === "string"; })
    .slice(0, maximum)
    .map(function (item) { return item.slice(0, maxLength); });
}

function safeCountMap(value) {
  const source = objectOrEmpty(value);
  const result = {};
  Object.keys(source).slice(0, 12).forEach(function (key) {
    result[key.slice(0, 40)] = numberOrNull(source[key]);
  });
  return result;
}

function safeStatusCounts(value) {
  const allowed = new Set(["pending", "approved", "published", "rejected", "expired", "unknown"]);
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map(function (item) {
    const row = objectOrEmpty(item);
    const status = safeText(row.status, 24).toLowerCase();
    if (!allowed.has(status)) return null;
    return { status: status, count: numberOrNull(row.count) };
  }).filter(Boolean);
}

function safePlanBreakdown(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map(function (item) {
    const row = objectOrEmpty(item);
    return {
      plan: safeText(row.plan, 40) || "não informado",
      active: numberOrNull(row.active),
      inactive: numberOrNull(row.inactive),
      total: numberOrNull(row.total)
    };
  });
}

function safeTrafficWindow(value) {
  const source = objectOrEmpty(value);
  return {
    views: numberOrNull(source.views),
    clicks: numberOrNull(source.clicks),
    clickThroughRatePercent: numberOrNull(source.clickThroughRatePercent)
  };
}

export function normalizeBusinessContext(payload) {
  const root = objectOrEmpty(payload);
  if (!Object.keys(root).length) {
    return { available: false, limitation: "A fonte agregada não retornou um objeto válido." };
  }

  const totals = objectOrEmpty(root.totals);
  const acquisition = objectOrEmpty(root.acquisition);
  const ads = objectOrEmpty(acquisition.customerAds);
  const traffic = objectOrEmpty(acquisition.adTraffic);
  const referrals = objectOrEmpty(acquisition.referrals);
  const usage = objectOrEmpty(acquisition.productUsage);
  const quality = objectOrEmpty(acquisition.dataQuality);
  const recentTraffic = objectOrEmpty(traffic.last30Days);

  const referenceTime = safeText(root.referenceTime, 40);
  const referenceTimeValid = referenceTime && Number.isFinite(Date.parse(referenceTime));

  return {
    available: true,
    source: "Supabase alicerce-team-insights",
    referenceTime: referenceTimeValid ? referenceTime : null,
    customers: {
      registered: numberOrNull(totals.registeredCustomers),
      active: numberOrNull(totals.activeCustomers),
      inactive: numberOrNull(totals.inactiveCustomers),
      withoutSubscription: numberOrNull(totals.customersWithoutSubscription),
      newLast30Days: numberOrNull(totals.newCustomersLast30Days),
      plans: safePlanBreakdown(root.planBreakdown)
    },
    acquisition: {
      appAdInventory: {
        total: numberOrNull(ads.total),
        createdLast30Days: numberOrNull(ads.createdLast30Days),
        byStatus: safeStatusCounts(ads.byStatus)
      },
      appAdTraffic: {
        totalEvents: numberOrNull(traffic.totalEvents),
        views: numberOrNull(traffic.views),
        clicks: numberOrNull(traffic.clicks),
        clickThroughRatePercent: numberOrNull(traffic.clickThroughRatePercent),
        last30Days: safeTrafficWindow(recentTraffic),
        formula: "CTR = cliques / visualizações × 100"
      },
      referrals: {
        total: numberOrNull(referrals.total),
        createdLast30Days: numberOrNull(referrals.createdLast30Days)
      },
      productUsage: {
        trackingBasis: "explicit_opt_in",
        accountsWithAtLeastOneEvent: numberOrNull(usage.accountsWithAtLeastOneEvent),
        appOpenedEvents: numberOrNull(usage.appOpenedEvents),
        appOpenedEventsLast30Days: numberOrNull(usage.appOpenedEventsLast30Days),
        activeOptInAccountsLast30Days: numberOrNull(usage.activeOptInAccountsLast30Days),
        movementRecordsCreated: numberOrNull(usage.movementRecordsCreated),
        movementRecordsCreatedLast30Days: numberOrNull(usage.movementRecordsCreatedLast30Days),
        accountsWithFirstMovement: numberOrNull(usage.accountsWithFirstMovement),
        accountsWithFirstMovementLast30Days: numberOrNull(usage.accountsWithFirstMovementLast30Days),
        activationRatePercent: numberOrNull(usage.activationRatePercent),
        limitations: safeTextList(usage.limitations, 10, 300)
      },
      dataQuality: {
        rowsRead: safeCountMap(quality.rowsRead),
        countConfidence: safeText(quality.countConfidence, 16) || "unknown",
        performanceInterpretationConfidence: safeText(quality.performanceInterpretationConfidence, 16) || "unknown",
        limitations: safeTextList(quality.limitations, 12, 300)
      }
    }
  };
}

function resultFor(toolName, context) {
  const customers = context.customers || {};
  const acquisition = context.acquisition || {};
  if (toolName === "business.customer_totals") {
    return {
      available: true,
      source: "public.subscriptions + Supabase Auth (agregado)",
      data: {
        registeredCustomers: customers.registered,
        activeSubscriptions: customers.active,
        inactiveSubscriptions: customers.inactive,
        customersWithoutSubscription: customers.withoutSubscription,
        newCustomersLast30Days: customers.newLast30Days,
        planBreakdown: customers.plans
      }
    };
  }
  if (toolName === "ads.app_ad_inventory") {
    const data = acquisition.appAdInventory || {};
    return {
      available: true,
      source: "public.customer_ads (contagem agregada)",
      interpretation: "Inventário de anúncios publicados/cadastrados dentro do aplicativo; não é gasto nem campanha externa de mídia paga.",
      data: {
        total: data.total,
        createdLast30Days: data.createdLast30Days,
        byStatus: data.byStatus
      }
    };
  }
  if (toolName === "ads.app_ad_traffic") {
    const data = acquisition.appAdTraffic || {};
    return {
      available: true,
      source: "public.ad_traffic_events (contagem agregada)",
      interpretation: "Eventos de visualização e clique dentro do aplicativo; não são pessoas únicas e não identificam qual conteúdo externo gerou o acesso.",
      data: {
        totalEvents: data.totalEvents,
        views: data.views,
        clicks: data.clicks,
        clickThroughRatePercent: data.clickThroughRatePercent,
        last30Days: data.last30Days,
        formula: data.formula
      }
    };
  }
  if (toolName === "referrals.summary") {
    const data = acquisition.referrals || {};
    return {
      available: true,
      source: "public.referrals (contagem agregada)",
      interpretation: "Conta somente indicações efetivamente gravadas; perfis/códigos de convite não equivalem a indicações convertidas.",
      data: {
        totalReferrals: data.total,
        createdLast30Days: data.createdLast30Days
      }
    };
  }
  if (toolName === "product.opt_in_usage") {
    const data = acquisition.productUsage || {};
    return {
      available: true,
      source: "public.alicerce_product_events (eventos agregados com consentimento opcional)",
      interpretation: "Não representa necessariamente toda a base de clientes.",
      data: {
        trackingBasis: data.trackingBasis,
        accountsWithAtLeastOneEvent: data.accountsWithAtLeastOneEvent,
        appOpenedEvents: data.appOpenedEvents,
        appOpenedEventsLast30Days: data.appOpenedEventsLast30Days,
        activeOptInAccountsLast30Days: data.activeOptInAccountsLast30Days,
        movementRecordsCreated: data.movementRecordsCreated,
        movementRecordsCreatedLast30Days: data.movementRecordsCreatedLast30Days,
        accountsWithFirstMovement: data.accountsWithFirstMovement,
        accountsWithFirstMovementLast30Days: data.accountsWithFirstMovementLast30Days,
        activationRatePercent: data.activationRatePercent,
        limitations: data.limitations
      }
    };
  }
  if (toolName === "quality.acquisition_data") {
    const data = acquisition.dataQuality || {};
    return {
      available: true,
      source: "Supabase alicerce-team-insights",
      data: {
        rowsRead: data.rowsRead,
        countConfidence: data.countConfidence,
        performanceInterpretationConfidence: data.performanceInterpretationConfidence,
        sourceLimitations: data.limitations,
        globalLimitations: GLOBAL_LIMITATIONS.slice()
      }
    };
  }
  return { available: false, limitation: "Ferramenta não registrada." };
}

export function routeAgentTools(agentId, businessContext) {
  const allowed = AGENT_TOOL_PERMISSIONS[agentId] || [];
  const contextAvailable = Boolean(businessContext && businessContext.available === true);
  const results = {};

  allowed.forEach(function (toolName) {
    results[toolName] = contextAvailable
      ? resultFor(toolName, businessContext)
      : {
          available: false,
          limitation: businessContext && businessContext.limitation
            ? safeText(businessContext.limitation, 240)
            : "Os agregados do Supabase não estão disponíveis nesta execução."
        };
  });

  return {
    version: 1,
    executionMode: "server_preexecuted_read_only_context",
    agentId: agentId,
    status: contextAvailable ? "available" : "unavailable",
    availableTools: allowed.map(function (toolName) {
      return {
        name: toolName,
        description: TOOL_DEFINITIONS[toolName],
        access: "read_only"
      };
    }),
    results: results,
    globalLimitations: GLOBAL_LIMITATIONS.slice()
  };
}
