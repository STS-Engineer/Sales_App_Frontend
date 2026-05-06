import { mapBackendStatusToPipelineStage, mapBackendStatusToUi } from "./rfq.js";

export const KPI_PHASES = ["RFQ", "In costing", "Offer", "PO", "Prototype"];

export const KPI_PHASE_COLORS = {
  RFQ: "#046eaf",
  "In costing": "#ef7807",
  Offer: "#0e4e78",
  PO: "#1f9d6b",
  Prototype: "#7c3aed"
};

export const KPI_STATUS_COLORS = {
  Potential: "#60a5fa",
  "New RFQ": "#0284c7",
  Validation: "#0369a1",
  Feasability: "#f59e0b",
  Pricing: "#f97316",
  "Offer preparation": "#8b5cf6",
  "Offer validation": "#7c3aed",
  "Get PO": "#10b981",
  "PO accepted": "#059669",
  "Mission accepted": "#14b8a6",
  "Mission not accepted": "#f97316",
  "Get prototype orders": "#6366f1",
  "Prototype ongoing": "#4f46e5",
  Lost: "#94a3b8",
  Cancelled: "#64748b"
};

export const KPI_TIMEFRAME_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "365d", label: "Last 12 months" },
  { value: "ytd", label: "Year to date" }
];

const KPI_PRODUCT_LINE_ORDER = ["ASS", "BRU", "SEA", "ADM", "FRI", "CHO"];
const KPI_PRODUCT_LINE_COLORS = {
  ASS: "#a884e8",
  BRU: "#8aa8c0",
  SEA: "#f4b16a",
  ADM: "#84ccae",
  FRI: "#60a5fa",
  CHO: "#7c8cff"
};
const KPI_PRODUCT_LINE_ALIASES = new Map([
  ["ASS", "ASS"],
  ["ASSEMBLY", "ASS"],
  ["BRU", "BRU"],
  ["BRUSH", "BRU"],
  ["BRUSHES", "BRU"],
  ["SEA", "SEA"],
  ["SEAL", "SEA"],
  ["SEALS", "SEA"],
  ["ADM", "ADM"],
  ["ADVANCED MATERIAL", "ADM"],
  ["ADVANCED MATERIALS", "ADM"],
  ["FRI", "FRI"],
  ["FRICTION", "FRI"],
  ["CHO", "CHO"],
  ["CHOKE", "CHO"],
  ["CHOKES", "CHO"]
]);
const KPI_PRODUCT_LINE_RANK = new Map(
  KPI_PRODUCT_LINE_ORDER.map((productLine, index) => [productLine, index])
);

const TERMINAL_STATUSES = new Set(["Lost", "Cancelled"]);
const POSITIVE_OUTCOME_STATUSES = new Set([
  "PO accepted",
  "Mission accepted",
  "Get prototype orders",
  "Prototype ongoing"
]);
const AT_RISK_STATUSES = new Set([
  "Validation",
  "Feasability",
  "Pricing",
  "Offer validation"
]);

const KPI_PHASE_GROUP_MAP = {
  RFQ: "RFQ",
  "In costing": "In costing",
  Offer: "Offer",
  "Offer preparation": "Offer",
  "Offer validation": "Offer",
  PO: "PO",
  "Get PO": "PO",
  "PO accepted": "PO",
  "Mission accepted": "PO",
  "Mission not accepted": "PO",
  Prototype: "Prototype",
  "Get prototype orders": "Prototype",
  "Prototype ongoing": "Prototype"
};

const KPI_PHASE_FROM_BACKEND = {
  RFQ: "RFQ",
  COSTING: "In costing",
  OFFER: "Offer",
  PO: "PO",
  PROTOTYPE: "Prototype",
  CLOSED: "RFQ"
};

const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit"
});

const normalizeText = (value, fallback) => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const normalizeProductLine = (value) => {
  const key = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

  if (!key) return "";

  return KPI_PRODUCT_LINE_ALIASES.get(key) || "";
};

const sortProductLines = (productLines = []) =>
  [...productLines].sort((left, right) => {
    const leftRank = KPI_PRODUCT_LINE_RANK.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = KPI_PRODUCT_LINE_RANK.get(right) ?? Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.localeCompare(right);
  });

const parseAmount = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  let text = String(value).trim();
  if (!text) return 0;
  text = text.replace(/\s/g, "");

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    text = text.replace(",", ".");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const diffInDays = (left, right) => {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.round((left.getTime() - right.getTime()) / msPerDay));
};

const getMonthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const getMonthLabel = (date) => monthLabelFormatter.format(date);

const resolveKpiPhase = (rfq) => {
  const rawPhase = typeof rfq?.phase === "string" ? rfq.phase : rfq?.phase?.value;
  if (rawPhase && KPI_PHASE_FROM_BACKEND[rawPhase]) {
    return KPI_PHASE_FROM_BACKEND[rawPhase];
  }

  const pipelineStage = mapBackendStatusToPipelineStage(rfq);
  return KPI_PHASE_GROUP_MAP[pipelineStage] || "RFQ";
};

const buildRecentMonthWindow = (records, size = 8, now = new Date()) => {
  const sortedDates = records
    .map((record) => record.createdAt)
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime());
  const latestRecordDate = sortedDates.length ? sortedDates[sortedDates.length - 1] : now;

  const anchor = new Date(latestRecordDate.getFullYear(), latestRecordDate.getMonth(), 1);

  return Array.from({ length: size }, (_, index) => {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - (size - 1 - index), 1);
    return {
      key: getMonthKey(date),
      label: getMonthLabel(date)
    };
  });
};

const buildRankedSeries = (entries, { limit = 6, colorMap, fallbackColor = "#046eaf" } = {}) =>
  entries
    .filter((entry) => entry.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, limit)
    .map((entry, index) => ({
      ...entry,
      color:
        entry.color ||
        colorMap?.[entry.label] ||
        [fallbackColor, "#0e4e78", "#ef7807", "#1f9d6b", "#7c3aed", "#0891b2"][index % 6]
    }));

export const buildKpiRecords = (rfqs = []) =>
  rfqs.map((rfq) => {
    const data = rfq?.rfq_data || {};
    const potential = rfq?.potential || {};
    const status = mapBackendStatusToUi(rfq);
    const phaseKey = resolveKpiPhase(rfq);
    const createdAt = parseDate(rfq?.created_at);
    const normalizedProductLine = normalizeProductLine(
      data.product_line_acronym || rfq?.product_line_acronym || data.product_name
    );
    const amount = parseAmount(
      data.to_total ??
        data.toTotal ??
        data.to_total_local ??
        data.target_price_eur ??
        data.targetPrice
    );

    return {
      id: rfq?.rfq_id || "",
      displayId: normalizeText(data.systematic_rfq_id, "Draft"),
      customer: normalizeText(data.customer_name || potential.customer, "No customer"),
      creator: normalizeText(rfq?.created_by_email, "Unknown owner"),
      validator: normalizeText(
        data.zone_manager_email || rfq?.zone_manager_email || data.validator_email,
        "No validator"
      ),
      productLine: normalizeText(normalizedProductLine, "Not set"),
      productName: normalizeText(data.product_name || data.product_line_acronym, "Not set"),
      application: normalizeText(data.application || potential.application, "Not set"),
      amount,
      phaseKey,
      status,
      createdAt,
      createdAtLabel: createdAt ? createdAt.toISOString() : "",
      monthKey: createdAt ? getMonthKey(createdAt) : "",
      isTerminal: TERMINAL_STATUSES.has(status)
    };
  });

export const getKpiFilterOptions = (records = []) => {
  const productLines = sortProductLines(
    Array.from(
      new Set(records.map((record) => record.productLine).filter((value) => value && value !== "Not set"))
    )
  );

  const creators = Array.from(
    new Set(records.map((record) => record.creator).filter((value) => value && value !== "Unknown owner"))
  ).sort((left, right) => left.localeCompare(right));

  return { productLines, creators };
};

export const filterKpiRecords = (records = [], filters = {}, now = new Date()) => {
  const {
    timeframe = "all",
    phase = "all",
    productLine = "all",
    creator = "all"
  } = filters;

  return records.filter((record) => {
    if (phase !== "all" && record.phaseKey !== phase) return false;
    if (productLine !== "all" && record.productLine !== productLine) return false;
    if (creator !== "all" && record.creator !== creator) return false;

    if (timeframe === "all") return true;
    if (!record.createdAt) return false;

    if (timeframe === "ytd") {
      return record.createdAt.getFullYear() === now.getFullYear();
    }

    const days = timeframe === "30d" ? 30 : timeframe === "90d" ? 90 : 365;
    return diffInDays(now, record.createdAt) <= days;
  });
};

export const buildKpiSummary = (records = [], now = new Date(), productLineUniverse = []) => {
  const totalRfqs = records.length;
  const activeRfqs = records.filter((record) => !record.isTerminal).length;
  const amountRecords = records.filter((record) => record.amount > 0);
  const totalAmount = amountRecords.reduce((sum, record) => sum + record.amount, 0);
  const openAmount = records
    .filter((record) => !record.isTerminal)
    .reduce((sum, record) => sum + record.amount, 0);
  const averageAmount = amountRecords.length ? totalAmount / amountRecords.length : 0;
  const ageSamples = records.filter((record) => record.createdAt);
  const averageAgeDays = ageSamples.length
    ? ageSamples.reduce((sum, record) => sum + diffInDays(now, record.createdAt), 0) / ageSamples.length
    : 0;
  const atRiskRfqs = records.filter((record) => {
    if (record.isTerminal || !record.createdAt) return false;
    return AT_RISK_STATUSES.has(record.status) && diffInDays(now, record.createdAt) >= 45;
  }).length;

  const wonRfqs = records.filter((record) => POSITIVE_OUTCOME_STATUSES.has(record.status)).length;
  const lostRfqs = records.filter((record) => record.isTerminal).length;
  const winRate = wonRfqs + lostRfqs > 0 ? (wonRfqs / (wonRfqs + lostRfqs)) * 100 : 0;

  const phaseDistribution = KPI_PHASES.map((phase) => {
    const phaseRecords = records.filter((record) => record.phaseKey === phase);
    const phaseAmount = phaseRecords.reduce((sum, record) => sum + record.amount, 0);
    return {
      label: phase,
      value: phaseRecords.length,
      amount: phaseAmount,
      share: totalRfqs ? phaseRecords.length / totalRfqs : 0,
      color: KPI_PHASE_COLORS[phase]
    };
  });

  const statusCounts = records.reduce((accumulator, record) => {
    accumulator.set(record.status, (accumulator.get(record.status) || 0) + 1);
    return accumulator;
  }, new Map());

  const statusDistribution = buildRankedSeries(
    Array.from(statusCounts.entries()).map(([label, value]) => ({ label, value })),
    { limit: 8, colorMap: KPI_STATUS_COLORS, fallbackColor: "#0e4e78" }
  );

  const customerMap = new Map();
  const validatorMap = new Map();
  const creatorMap = new Map();

  records.forEach((record) => {
    const customerEntry = customerMap.get(record.customer) || {
      label: record.customer,
      value: 0,
      secondaryValue: 0
    };
    customerEntry.value += record.amount;
    customerEntry.secondaryValue += 1;
    customerMap.set(record.customer, customerEntry);

    const validatorEntry = validatorMap.get(record.validator) || {
      label: record.validator,
      value: 0,
      secondaryValue: 0
    };
    validatorEntry.value += 1;
    validatorEntry.secondaryValue += record.amount;
    validatorMap.set(record.validator, validatorEntry);

    const creatorEntry = creatorMap.get(record.creator) || {
      label: record.creator,
      value: 0,
      secondaryValue: 0
    };
    creatorEntry.value += 1;
    creatorEntry.secondaryValue += record.amount;
    creatorMap.set(record.creator, creatorEntry);
  });

  const topCustomers = buildRankedSeries(Array.from(customerMap.values()), {
    limit: 6,
    fallbackColor: "#046eaf"
  });
  const topCustomersByVolume = buildRankedSeries(
    Array.from(customerMap.values()).map((entry) => ({
      ...entry,
      value: entry.secondaryValue,
      secondaryValue: entry.value
    })),
    {
      limit: 6,
      fallbackColor: "#0891b2"
    }
  );
  const validatorLoad = buildRankedSeries(Array.from(validatorMap.values()), {
    limit: 6,
    fallbackColor: "#ef7807"
  });
  const creatorLoad = buildRankedSeries(Array.from(creatorMap.values()), {
    limit: 6,
    fallbackColor: "#0e4e78"
  });
  const productLineMap = new Map();

  records.forEach((record) => {
    if (!record.productLine || record.productLine === "Not set") return;

    const productLineEntry = productLineMap.get(record.productLine) || {
      label: record.productLine,
      value: 0,
      secondaryValue: 0
    };
    productLineEntry.value += 1;
    productLineEntry.secondaryValue += record.amount;
    productLineMap.set(record.productLine, productLineEntry);
  });

  const productLineLabels = productLineUniverse.length
    ? sortProductLines(productLineUniverse)
    : sortProductLines(Array.from(productLineMap.keys()));

  const productLineDistribution = productLineLabels.map((label) => {
    const entry = productLineMap.get(label);

    return {
      label,
      value: entry?.value || 0,
      secondaryValue: entry?.secondaryValue || 0,
      color: KPI_PRODUCT_LINE_COLORS[label] || "#7c3aed"
    };
  });

  const monthWindow = buildRecentMonthWindow(records, 8, now);
  const monthlyVolume = monthWindow.map((month) => {
    const monthRecords = records.filter((record) => record.monthKey === month.key);
    return {
      ...month,
      value: monthRecords.length
    };
  });

  const monthlyValue = monthWindow.map((month) => {
    const monthRecords = records.filter((record) => record.monthKey === month.key);
    return {
      ...month,
      value: monthRecords.reduce((sum, record) => sum + record.amount, 0)
    };
  });

  const biggestOpportunity =
    [...records].sort((left, right) => right.amount - left.amount)[0] || null;
  const busiestPhase =
    [...phaseDistribution].sort((left, right) => right.value - left.value)[0] || null;
  return {
    totalRfqs,
    activeRfqs,
    totalAmount,
    openAmount,
    averageAmount,
    averageAgeDays,
    atRiskRfqs,
    winRate,
    phaseDistribution,
    statusDistribution,
    topCustomers,
    topCustomersByVolume,
    validatorLoad,
    creatorLoad,
    productLineDistribution,
    monthlyVolume,
    monthlyValue,
    biggestOpportunity,
    busiestPhase
  };
};
