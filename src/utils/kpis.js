import { mapBackendStatusToPipelineStage, mapBackendStatusToUi } from "./rfq.js";

export const KPI_PHASES = ["Request", "In costing", "Offer", "PO", "Prototype"];

export const KPI_PHASE_COLORS = {
  Request: "#046eaf",
  "In costing": "#ef7807",
  Offer: "#0e4e78",
  PO: "#1f9d6b",
  Prototype: "#7c3aed"
};

const KPI_DOCUMENT_TYPE_ORDER = ["RFQ", "RFI", "POTENTIAL"];
const KPI_DOCUMENT_TYPE_LABELS = {
  RFQ: "RFQ",
  RFI: "RFI",
  POTENTIAL: "Potential"
};
const KPI_DOCUMENT_TYPE_COLORS = {
  RFQ: "#046eaf",
  RFI: "#f97316",
  POTENTIAL: "#eab308"
};

export const KPI_STATUS_COLORS = {
  Potential: "#60a5fa",
  "New RFQ": "#0284c7",
  "New request": "#0284c7",
  Validation: "#0369a1",
  "Pending for validation": "#0369a1",
  Feasability: "#f59e0b",
  Pricing: "#f97316",
  "RFI completed": "#1f9d6b",
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

const KPI_STATUS_ORDER = [
  "New request",
  "Pending for validation",
  "Feasability",
  "Pricing",
  "RFI completed",
  "Offer preparation",
  "Offer validation",
  "Get PO",
  "PO accepted",
  "Mission accepted",
  "Mission not accepted",
  "Get prototype orders",
  "Prototype ongoing",
  "Cancelled",
  "Lost"
];

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

export const KPI_SECTOR_ORDER = ["Automotive", "Non automotive"];
export const KPI_SECTOR_COLORS = {
  "Automotive": "#046eaf",
  "Non automotive": "#ef7807"
};

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
  RFQ: "Request",
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
  RFQ: "Request",
  COSTING: "In costing",
  OFFER: "Offer",
  PO: "PO",
  PROTOTYPE: "Prototype",
  CLOSED: "Request"
};

const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit"
});

const normalizeText = (value, fallback) => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const normalizeDocumentType = (value) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "RFI") return "RFI";
  if (normalized === "POTENTIAL") return "POTENTIAL";
  return "RFQ";
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

const normalizeKpiStatusLabel = (status) => {
  if (status === "New RFQ") return "New request";
  if (status === "Validation") return "Pending for validation";
  return status;
};

const normalizeChartEntityKey = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const pickPreferredChartLabel = (currentLabel, nextLabel) => {
  const current = String(currentLabel ?? "").trim();
  const next = String(nextLabel ?? "").trim();

  if (!current) return next;
  if (!next) return current;

  const currentHasUppercase = /[A-Z]/.test(current);
  const nextHasUppercase = /[A-Z]/.test(next);

  if (!currentHasUppercase && nextHasUppercase) {
    return next;
  }

  return current;
};

const KPI_STATUS_RANK = new Map(
  KPI_STATUS_ORDER.map((status, index) => [status, index])
);

const sortKpiStatuses = (statuses = []) =>
  [...statuses].sort((left, right) => {
    const leftRank = KPI_STATUS_RANK.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = KPI_STATUS_RANK.get(right) ?? Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.localeCompare(right);
  });

const resolveSeriesColor = (label, index, colorMap, fallbackColor = "#046eaf") =>
  colorMap?.[label] ||
  [fallbackColor, "#0e4e78", "#ef7807", "#1f9d6b", "#7c3aed", "#0891b2"][index % 6];

const resolveKpiPhase = (rfq) => {
  const rawPhase = typeof rfq?.phase === "string" ? rfq.phase : rfq?.phase?.value;
  if (rawPhase && KPI_PHASE_FROM_BACKEND[rawPhase]) {
    return KPI_PHASE_FROM_BACKEND[rawPhase];
  }

  const pipelineStage = mapBackendStatusToPipelineStage(rfq);
  return KPI_PHASE_GROUP_MAP[pipelineStage] || "Request";
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
      color: entry.color || resolveSeriesColor(entry.label, index, colorMap, fallbackColor)
    }));

const normalizeSector = (value) => {
  if (!value) return "";
  const normalized = String(value).trim().toLowerCase().replace(/[-_\s]+/g, " ");
  if (normalized.includes("non") && normalized.includes("auto")) return "Non automotive";
  if (normalized.includes("auto")) return "Automotive";
  return "";
};

export const buildKpiRecords = (requests = []) =>
  requests.map((request) => {
    const data = request?.rfq_data || {};
    const potential = request?.potential || {};
    const status = mapBackendStatusToUi(request);
    const phaseKey = resolveKpiPhase(request);
    const createdAt = parseDate(request?.created_at);
    const normalizedProductLine = normalizeProductLine(
      data.product_line_acronym || request?.product_line_acronym || data.product_name
    );
    const amount = parseAmount(
      data.to_total ??
        data.toTotal ??
        data.to_total_local ??
        data.target_price_eur ??
        data.targetPrice
    );

    return {
      id: request?.rfq_id || "",
      displayId: normalizeText(data.systematic_rfq_id, "Draft"),
      documentType: normalizeDocumentType(request?.document_type),
      customer: normalizeText(data.customer_name || potential.customer, "No customer"),
      creator: normalizeText(request?.created_by_email, "Unknown owner"),
      validator: normalizeText(
        data.zone_manager_email || request?.zone_manager_email || data.validator_email,
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
      isTerminal: TERMINAL_STATUSES.has(status),
      sector: normalizeSector(data.automotive_type || data.automotiveType)
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

  const sectors = KPI_SECTOR_ORDER.filter(sector =>
    records.some(r => r.sector === sector)
  );
  return { productLines, creators, sectors };
};

export const filterKpiRecords = (records = [], filters = {}, now = new Date()) => {
  const {
    timeframe = "all",
    phase = "all",
    productLine = "all",
    creator = "all",
    sector = "all"
  } = filters;

  return records.filter((record) => {
    if (phase !== "all" && record.phaseKey !== phase) return false;
    if (productLine !== "all" && record.productLine !== productLine) return false;
    if (creator !== "all" && record.creator.toLowerCase() !== creator.toLowerCase()) return false;
    if (sector !== "all" && record.sector !== sector) return false;

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
  const totalRequests = records.length;
  const activeRequests = records.filter((record) => !record.isTerminal).length;
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
  const atRiskRequests = records.filter((record) => {
    if (record.isTerminal || !record.createdAt) return false;
    return AT_RISK_STATUSES.has(record.status) && diffInDays(now, record.createdAt) >= 45;
  }).length;

  const wonRequests = records.filter((record) => POSITIVE_OUTCOME_STATUSES.has(record.status)).length;
  const closedRequests = records.filter((record) => record.isTerminal).length;
  const winRate =
    wonRequests + closedRequests > 0
      ? (wonRequests / (wonRequests + closedRequests)) * 100
      : 0;

  const phaseDistribution = KPI_PHASES.map((phase) => {
    const phaseRecords = records.filter((record) => record.phaseKey === phase);
    const phaseAmount = phaseRecords.reduce((sum, record) => sum + record.amount, 0);
    return {
      label: phase,
      value: phaseRecords.length,
      amount: phaseAmount,
      share: totalRequests ? phaseRecords.length / totalRequests : 0,
      color: KPI_PHASE_COLORS[phase]
    };
  });

  const typeDistribution = KPI_DOCUMENT_TYPE_ORDER.map((documentType) => {
    const typeRecords = records.filter((record) => record.documentType === documentType);
    return {
      label: KPI_DOCUMENT_TYPE_LABELS[documentType],
      value: typeRecords.length,
      share: totalRequests ? typeRecords.length / totalRequests : 0,
      color: KPI_DOCUMENT_TYPE_COLORS[documentType]
    };
  });

  const statusCounts = records.reduce((accumulator, record) => {
    const statusLabel = normalizeKpiStatusLabel(record.status);
    accumulator.set(statusLabel, (accumulator.get(statusLabel) || 0) + 1);
    return accumulator;
  }, new Map());

  const statusDistribution = buildRankedSeries(
    Array.from(statusCounts.entries()).map(([label, value]) => ({ label, value })),
    { limit: 8, colorMap: KPI_STATUS_COLORS, fallbackColor: "#0e4e78" }
  );

  const normalizedStatuses = sortKpiStatuses(Array.from(statusCounts.keys()));
  const phaseStatusDistribution = {
    legend: normalizedStatuses.map((label, index) => ({
      label,
      color: resolveSeriesColor(label, index, KPI_STATUS_COLORS, "#0e4e78")
    })),
    columns: KPI_PHASES.map((phase) => {
      const phaseRecords = records.filter((record) => record.phaseKey === phase);
      const phaseStatusCounts = phaseRecords.reduce((accumulator, record) => {
        const statusLabel = normalizeKpiStatusLabel(record.status);
        accumulator.set(statusLabel, (accumulator.get(statusLabel) || 0) + 1);
        return accumulator;
      }, new Map());

      return {
        label: phase,
        total: phaseRecords.length,
        segments: normalizedStatuses
          .map((label, index) => ({
            label,
            value: phaseStatusCounts.get(label) || 0,
            color: resolveSeriesColor(label, index, KPI_STATUS_COLORS, "#0e4e78")
          }))
          .filter((segment) => segment.value > 0)
      };
    })
  };

  const typePhaseDistribution = {
    legend: KPI_PHASES.map((phase) => ({
      label: phase,
      color: KPI_PHASE_COLORS[phase]
    })),
    columns: KPI_DOCUMENT_TYPE_ORDER.map((documentType) => {
      const typeLabel = KPI_DOCUMENT_TYPE_LABELS[documentType];
      const typeRecords = records.filter((record) => record.documentType === documentType);
      const typePhaseCounts = typeRecords.reduce((accumulator, record) => {
        accumulator.set(record.phaseKey, (accumulator.get(record.phaseKey) || 0) + 1);
        return accumulator;
      }, new Map());

      return {
        label: typeLabel,
        total: typeRecords.length,
        segments: KPI_PHASES.map((phase) => ({
          label: phase,
          value: typePhaseCounts.get(phase) || 0,
          color: KPI_PHASE_COLORS[phase]
        })).filter((segment) => segment.value > 0)
      };
    })
  };

  const customerMap = new Map();
  const validatorMap = new Map();
  const creatorMap = new Map();

  records.forEach((record) => {
    const customerKey = normalizeChartEntityKey(record.customer);
    const customerEntry = customerMap.get(customerKey) || {
      label: record.customer,
      value: 0,
      secondaryValue: 0
    };
    customerEntry.label = pickPreferredChartLabel(customerEntry.label, record.customer);
    customerEntry.value += record.amount;
    customerEntry.secondaryValue += 1;
    customerMap.set(customerKey, customerEntry);

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

  const sectorDistribution = KPI_SECTOR_ORDER.map(sectorLabel => {
    const sectorRecords = records.filter(r => r.sector === sectorLabel);
    const count = sectorRecords.length;
    const openAmt = sectorRecords
      .filter(r => !r.isTerminal)
      .reduce((s, r) => s + r.amount, 0);
    const won = sectorRecords.filter(r => POSITIVE_OUTCOME_STATUSES.has(r.status)).length;
    const closed = sectorRecords.filter(r => r.isTerminal).length;
    const winRate = (won + closed) > 0 ? (won / (won + closed)) * 100 : 0;
    const ageSamples = sectorRecords.filter(r => r.createdAt);
    const avgAging = ageSamples.length
      ? ageSamples.reduce((s, r) => s + diffInDays(now, r.createdAt), 0) / ageSamples.length
      : 0;
    const atRisk = sectorRecords.filter(r => {
      if (r.isTerminal || !r.createdAt) return false;
      return AT_RISK_STATUSES.has(r.status) && diffInDays(now, r.createdAt) >= 45;
    }).length;
    return {
      label: sectorLabel,
      value: count,
      openAmount: openAmt,
      winRate,
      avgAging,
      atRisk,
      share: totalRequests ? count / totalRequests : 0,
      color: KPI_SECTOR_COLORS[sectorLabel]
    };
  });

  const biggestOpportunity =
    [...records].sort((left, right) => right.amount - left.amount)[0] || null;
  const busiestPhase =
    [...phaseDistribution].sort((left, right) => right.value - left.value)[0] || null;
  return {
    totalRequests,
    activeRequests,
    closedRequests,
    totalAmount,
    openAmount,
    averageAmount,
    averageAgeDays,
    atRiskRequests,
    winRate,
    phaseDistribution,
    typeDistribution,
    phaseStatusDistribution,
    typePhaseDistribution,
    statusDistribution,
    topCustomers,
    topCustomersByVolume,
    validatorLoad,
    creatorLoad,
    productLineDistribution,
    monthlyVolume,
    monthlyValue,
    biggestOpportunity,
    busiestPhase,
    sectorDistribution
  };
};