const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

function parseTimestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function countRecent(rows, cutoff) {
  return rows.filter(function (row) {
    const timestamp = parseTimestamp(row && row.created_at);
    return timestamp !== null && timestamp >= cutoff;
  }).length;
}

function percentage(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function distinctAccounts(rows) {
  const ids = new Set();
  rows.forEach(function (row) {
    const id = row && typeof row.user_id === "string" ? row.user_id : "";
    if (id) ids.add(id);
  });
  return ids.size;
}

export function aggregateGrowthSignals(input) {
  const settings = input && typeof input === "object" ? input : {};
  const referenceDate = settings.referenceTime === undefined
    ? new Date()
    : new Date(settings.referenceTime);
  const referenceMs = referenceDate.getTime();
  if (!Number.isFinite(referenceMs)) {
    throw new TypeError("referenceTime precisa ser uma data válida.");
  }

  const adRows = Array.isArray(settings.adRows) ? settings.adRows : [];
  const trafficRows = Array.isArray(settings.trafficRows) ? settings.trafficRows : [];
  const referralRows = Array.isArray(settings.referralRows) ? settings.referralRows : [];
  const usageRows = Array.isArray(settings.usageRows) ? settings.usageRows : [];
  const cutoff = referenceMs - WINDOW_DAYS * DAY_MS;

  const statusCounts = new Map();
  adRows.forEach(function (row) {
    const status = String(row && row.status || "unknown").trim().toLowerCase() || "unknown";
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  });
  const byStatus = Array.from(statusCounts.entries())
    .map(function (entry) { return { status: entry[0], count: entry[1] }; })
    .sort(function (left, right) { return left.status.localeCompare(right.status); });

  const views = trafficRows.filter(function (row) {
    return String(row && row.event_type || "").toLowerCase() === "view";
  });
  const clicks = trafficRows.filter(function (row) {
    return String(row && row.event_type || "").toLowerCase() === "click";
  });
  const viewsLast30Days = countRecent(views, cutoff);
  const clicksLast30Days = countRecent(clicks, cutoff);

  const appOpenRows = usageRows.filter(function (row) {
    return String(row && row.event_name || "") === "app_opened";
  });
  const movementRows = usageRows.filter(function (row) {
    return String(row && row.event_name || "") === "movement_created";
  });
  const firstMovementRows = usageRows.filter(function (row) {
    return String(row && row.event_name || "") === "first_movement_created";
  });
  const appOpenRowsLast30Days = appOpenRows.filter(function (row) {
    const timestamp = parseTimestamp(row && row.created_at);
    return timestamp !== null && timestamp >= cutoff;
  });
  const firstMovementRowsLast30Days = firstMovementRows.filter(function (row) {
    const timestamp = parseTimestamp(row && row.created_at);
    return timestamp !== null && timestamp >= cutoff;
  });

  return {
    source: "public.customer_ads + public.ad_traffic_events + public.referrals + public.alicerce_product_events",
    referenceTime: referenceDate.toISOString(),
    referenceWindowDays: WINDOW_DAYS,
    customerAds: {
      total: adRows.length,
      createdLast30Days: countRecent(adRows, cutoff),
      byStatus: byStatus
    },
    adTraffic: {
      totalEvents: trafficRows.length,
      views: views.length,
      clicks: clicks.length,
      clickThroughRatePercent: percentage(clicks.length, views.length),
      last30Days: {
        views: viewsLast30Days,
        clicks: clicksLast30Days,
        clickThroughRatePercent: percentage(clicksLast30Days, viewsLast30Days)
      },
      formula: "CTR = cliques / visualizações × 100"
    },
    referrals: {
      total: referralRows.length,
      createdLast30Days: countRecent(referralRows, cutoff),
      source: "public.referrals"
    },
    productUsage: {
      source: "public.alicerce_product_events",
      trackingBasis: "explicit_opt_in",
      accountsWithAtLeastOneEvent: distinctAccounts(usageRows),
      appOpenedEvents: appOpenRows.length,
      appOpenedEventsLast30Days: countRecent(appOpenRows, cutoff),
      activeOptInAccountsLast30Days: distinctAccounts(appOpenRowsLast30Days),
      movementRecordsCreated: movementRows.length,
      movementRecordsCreatedLast30Days: countRecent(movementRows, cutoff),
      accountsWithFirstMovement: distinctAccounts(firstMovementRows),
      accountsWithFirstMovementLast30Days: distinctAccounts(firstMovementRowsLast30Days),
      activationRatePercent: null,
      limitations: [
        "Estes números incluem somente contas que aceitaram o compartilhamento opcional de eventos; não representam todos os clientes cadastrados.",
        "Não calcular taxa de ativação dividindo primeiras movimentações consentidas pelo total de contas; os denominadores não são comparáveis.",
        "movement_created conta registros gravados, incluindo parcelas individuais; não equivale a pedidos ou compras únicas.",
        "first_movement_created representa o primeiro registro em movements ou installments e é limitado a uma ocorrência por conta."
      ]
    },
    dataQuality: {
      rowsRead: {
        customerAds: adRows.length,
        adTrafficEvents: trafficRows.length,
        referrals: referralRows.length,
        productUsageEvents: usageRows.length
      },
      countConfidence: "high",
      performanceInterpretationConfidence: trafficRows.length < 30 ? "low" : "medium",
      limitations: [
        "Visualizações e cliques são contagens de eventos, não pessoas únicas.",
        "CTR mede somente clique dividido por visualização; não comprova cadastro, primeira movimentação, assinatura ou compra.",
        "A tabela de indicações conta somente indicações efetivamente gravadas em public.referrals; perfis/códigos de indicação não equivalem a indicações convertidas.",
        "Não há gasto de mídia, leads, pedidos nem receita atribuída nesta fonte. CAC, CPL, ROI e ROAS continuam indisponíveis.",
        "Amostra de tráfego inferior a 30 eventos deve ser tratada como sinal inicial, não como tendência confiável.",
        "Os eventos de uso são opt-in e não representam necessariamente o comportamento de toda a base de clientes."
      ]
    }
  };
}
