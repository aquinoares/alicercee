import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_TOOL_PERMISSIONS,
  normalizeBusinessContext,
  routeAgentTools
} from "../supabase/functions/ia-executar/tool-router.js";

const sample = {
  source: "untrusted source text",
  referenceTime: "2026-11-05T10:00:00.000Z",
  totals: {
    registeredCustomers: 120,
    activeCustomers: 55,
    inactiveCustomers: 65,
    customersWithoutSubscription: 40,
    newCustomersLast30Days: 8
  },
  planBreakdown: [
    { plan: "pro", active: 20, inactive: 5, total: 25 }
  ],
  acquisition: {
    customerAds: {
      total: 12,
      createdLast30Days: 4,
      byStatus: [
        { status: "published", count: 7 },
        { status: "pending", count: 3 },
        { status: "unknown-status", count: 999 }
      ]
    },
    adTraffic: {
      totalEvents: 50,
      views: 40,
      clicks: 10,
      clickThroughRatePercent: 25,
      last30Days: { views: 20, clicks: 4, clickThroughRatePercent: 20 }
    },
    referrals: { total: 6, createdLast30Days: 2 },
    productUsage: {
      accountsWithAtLeastOneEvent: 5,
      appOpenedEvents: 30,
      appOpenedEventsLast30Days: 12,
      activeOptInAccountsLast30Days: 4,
      movementRecordsCreated: 9,
      movementRecordsCreatedLast30Days: 3,
      accountsWithFirstMovement: 2,
      accountsWithFirstMovementLast30Days: 1,
      activationRatePercent: null,
      limitations: ["Somente contas com consentimento."]
    },
    dataQuality: {
      rowsRead: { customerAds: 12, adTrafficEvents: 50, referrals: 6, private_internal_key: 999 },
      countConfidence: "high",
      performanceInterpretationConfidence: "medium",
      limitations: ["Não há atribuição de gasto de mídia."]
    }
  },
  privateData: {
    email: "pessoa@example.com",
    phone: "+55 81 99999-0000",
    user_id: "private-user-id",
    viewer_id: "private-viewer-id",
    contact: "private-contact",
    ad_id: "private-ad-id",
    title: "private ad title"
  }
};

test("normalizes only allowlisted aggregate fields and strips identifiers", function () {
  const normalized = normalizeBusinessContext(sample);
  const serialized = JSON.stringify(normalized);
  assert.equal(normalized.available, true);
  assert.equal(normalized.customers.registered, 120);
  assert.equal(normalized.acquisition.appAdTraffic.clicks, 10);
  assert.doesNotMatch(serialized, /pessoa@example\.com|private-user-id|private-viewer-id|private-contact|private-ad-id|private ad title/);
  assert.doesNotMatch(serialized, /"source":"untrusted source text"/);\n  assert.doesNotMatch(serialized, /private_internal_key/);
});

test("does not turn missing numeric values into zero", function () {
  const normalized = normalizeBusinessContext({
    totals: { registeredCustomers: null },
    acquisition: { adTraffic: { views: null, clicks: "" } }
  });
  assert.equal(normalized.customers.registered, null);
  assert.equal(normalized.acquisition.appAdTraffic.views, null);
  assert.equal(normalized.acquisition.appAdTraffic.clicks, null);
});

test("filters unexpected ad status values", function () {
  const normalized = normalizeBusinessContext(sample);
  const statuses = normalized.acquisition.appAdInventory.byStatus;
  assert.deepEqual(statuses.map(function (item) { return item.status; }), ["published", "pending"]);
});

test("Tali receives the complete read-only aggregate tool set", function () {
  const context = normalizeBusinessContext(sample);
  const routed = routeAgentTools("tali", context);
  assert.equal(routed.status, "available");
  assert.equal(routed.availableTools.length, 6);
  assert.ok(routed.results["business.customer_totals"]);
  assert.ok(routed.results["product.opt_in_usage"]);
  assert.ok(routed.results["quality.acquisition_data"]);
});

test("Mali receives only ad inventory, app traffic and data-quality tools", function () {
  const context = normalizeBusinessContext(sample);
  const routed = routeAgentTools("mali", context);
  const names = routed.availableTools.map(function (tool) { return tool.name; });
  assert.deepEqual(names, [
    "ads.app_ad_inventory",
    "ads.app_ad_traffic",
    "quality.acquisition_data"
  ]);
  assert.equal(routed.results["business.customer_totals"], undefined);
  assert.equal(routed.results["referrals.summary"], undefined);
});

test("Alicia receives only customer totals, opt-in product usage and data quality", function () {
  const context = normalizeBusinessContext(sample);
  const routed = routeAgentTools("alicia", context);
  assert.equal(routed.availableTools.length, 3);
  assert.equal(routed.results["ads.app_ad_traffic"], undefined);
  assert.ok(routed.results["product.opt_in_usage"]);
});

test("unknown agent receives no tools", function () {
  const routed = routeAgentTools("unknown", normalizeBusinessContext(sample));
  assert.equal(routed.availableTools.length, 0);
  assert.deepEqual(routed.results, {});
});

test("unavailable source marks every permitted tool unavailable", function () {
  const routed = routeAgentTools("aline", {
    available: false,
    limitation: "Fonte não respondeu."
  });
  assert.equal(routed.status, "unavailable");
  assert.ok(routed.availableTools.length > 0);
  for (const result of Object.values(routed.results)) {
    assert.equal(result.available, false);
    assert.match(result.limitation, /Fonte não respondeu/);
  }
});

test("permission definitions do not grant write or external-action tools", function () {
  for (const names of Object.values(AGENT_TOOL_PERMISSIONS)) {
    for (const name of names) {
      assert.match(name, /^(business|ads|referrals|product|quality)\./);
    }
  }
});
