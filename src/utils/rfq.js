const STATUS_MAP = {
  DRAFT_GRP_1: "New RFQ",
  DRAFT_GRP_2: "New RFQ",
  DRAFT_GRP_3: "New RFQ",
  PENDING_VALIDATION: "Validation",
  POTENTIAL: "New RFQ",
  NEW_RFQ: "New RFQ",
  PENDING_FOR_VALIDATION: "Validation",
  REVISION_REQUESTED: "Validation",
  IN_COSTING_FEASIBILITY: "feasibility",
  IN_COSTING_PRICING: "Pricing",
  FEASIBILITY: "feasibility",
  PRICING: "Pricing",
  OFFER_PREPARATION: "Offer preparation",
  OFFER_VALIDATION: "Offer validation",
  PREPARATION: "Offer preparation",
  VALIDATION: "Offer validation",
  NEGOTIATION_GET_PO: "Get PO",
  NEGOTIATION_PROTOTYPE_REQUESTED: "Get prototype orders",
  NEGOTIATION_PROTOTYPE_ORDER: "Prototype ongoing",
  NEGOTIATION_PROTO_ONGOING: "Prototype ongoing",
  GET_PO: "Get PO",
  GET_PROTOTYPE: "Get prototype orders",
  PROTOTYPE_ONGOING: "Prototype ongoing",
  NEGOTIATION_PO_ACCEPTED: "PO accepted",
  PO_ACCEPTED: "PO accepted",
  MISSION_PREPARATION: "Mission accepted",
  PLANT_REVIEW: "Mission accepted",
  MANAGED_BY_PLANTS: "Mission accepted",
  MISSION_ACCEPTED: "Mission accepted",
  MISSION_NOT_ACCEPTED: "Mission not accepted",
  PO_SECURED: "PO accepted",
  RFI_COMPLETED: "RFI completed",
  REJECTED: "Mission not accepted",
  LOST: "Lost",
  CANCELED: "Cancelled",
  CANCELLED: "Cancelled"
};
 
const PIPELINE_STAGE_MAP = {
  DRAFT_GRP_1: "RFQ",
  DRAFT_GRP_2: "RFQ",
  DRAFT_GRP_3: "RFQ",
  PENDING_VALIDATION: "RFQ",
  POTENTIAL: "RFQ",
  NEW_RFQ: "RFQ",
  PENDING_FOR_VALIDATION: "RFQ",
  REVISION_REQUESTED: "RFQ",
  IN_COSTING_FEASIBILITY: "In costing",
  IN_COSTING_PRICING: "In costing",
  FEASIBILITY: "In costing",
  PRICING: "In costing",
  OFFER_PREPARATION: "Offer preparation",
  OFFER_VALIDATION: "Offer validation",
  PREPARATION: "Offer preparation",
  VALIDATION: "Offer validation",
  NEGOTIATION_GET_PO: "Get PO",
  NEGOTIATION_PROTOTYPE_REQUESTED: "Get prototype orders",
  NEGOTIATION_PROTOTYPE_ORDER: "Prototype ongoing",
  NEGOTIATION_PROTO_ONGOING: "Prototype ongoing",
  GET_PO: "Get PO",
  GET_PROTOTYPE: "Get prototype orders",
  PROTOTYPE_ONGOING: "Prototype ongoing",
  NEGOTIATION_PO_ACCEPTED: "PO accepted",
  PO_ACCEPTED: "PO accepted",
  MISSION_PREPARATION: "Mission accepted",
  PLANT_REVIEW: "Mission accepted",
  MANAGED_BY_PLANTS: "Mission accepted",
  MISSION_ACCEPTED: "Mission accepted",
  MISSION_NOT_ACCEPTED: "Mission not accepted",
  PO_SECURED: "PO accepted",
  RFI_COMPLETED: "In costing",
  REJECTED: "Mission not accepted",
  LOST: "Lost",
  CANCELED: "Cancelled",
  CANCELLED: "Cancelled"
};
 
const normalizeStatusValue = (value) =>
  typeof value === "string" ? value : value?.value;
 
const formatDateParts = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
 
export const sanitizeDateForInput = (dateStr) => {
  if (dateStr === null || dateStr === undefined) return "";
  const text = String(dateStr).trim();
  if (!text) return "";
 
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsedIsoDate = new Date(`${year}-${month}-${day}T00:00:00`);
    if (Number.isNaN(parsedIsoDate.getTime())) return "";
    if (
      parsedIsoDate.getFullYear() !== Number(year) ||
      parsedIsoDate.getMonth() + 1 !== Number(month) ||
      parsedIsoDate.getDate() !== Number(day)
    ) {
      return "";
    }
    return `${year}-${month}-${day}`;
  }
 
  const parsedDate = new Date(text);
  if (Number.isNaN(parsedDate.getTime())) return "";
  return formatDateParts(parsedDate);
};
 
export const sanitizeNumberForInput = (value) => {
  if (value === null || value === undefined) return "";
  let text = String(value).trim();
  if (!text) return "";
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
    const commaCount = (text.match(/,/g) || []).length;
    if (commaCount === 1 && /,\d{1,2}$/.test(text)) {
      text = text.replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  }
 
  const parsed = parseFloat(text);
  return Number.isNaN(parsed) ? "" : parsed;
};
 
export const createEmptyProductItem = () => ({
  product: "",
  application: "",
  partNumber: "",
  productLine: "",
  costingData: "",
  drawing: [],
  poDate: "",
  ppapDate: "",
  sop: "",
  revisionLevel: "",
  quantity: "",
  targetPrice: "",
  currency: "",
  targetPriceIsEstimated: null,
  targetTo: ""
});
 
export const createEmptyVolumeItem = () => ({
  targetPrice: "",
  priceSource: "",
  deliveryZone: "",
  plant: "",
  country: "",
  volumes: {}
});
 
export const DELIVERY_ZONE_OPTIONS = [
  { value: "Europe", label: "Europe" },
  { value: "Africa", label: "Africa" },
  { value: "India", label: "India" },
  { value: "North America", label: "North America" },
  { value: "South America", label: "South America" },
  { value: "China / South Pacific", label: "China / South Pacific" },
  { value: "Korea / Japan", label: "Korea / Japan" }
];
 
const DELIVERY_ZONE_OPTION_VALUES = new Set(
  DELIVERY_ZONE_OPTIONS.map((option) => option.value)
);
 
export const getDeliveryZoneOptions = (currentValue = "") => {
  const baseOptions = [
    { value: "", label: "" },
    ...DELIVERY_ZONE_OPTIONS
  ];
  const normalizedCurrentValue =
    typeof currentValue === "string" ? currentValue.trim() : "";
 
  if (
    !normalizedCurrentValue ||
    DELIVERY_ZONE_OPTION_VALUES.has(normalizedCurrentValue)
  ) {
    return baseOptions;
  }
 
  return [
    { value: "", label: "Not selected yet" },
    { value: normalizedCurrentValue, label: `${normalizedCurrentValue} (Legacy)` },
    ...DELIVERY_ZONE_OPTIONS
  ];
};
 
const extractSopYear = (sop) => {
  if (!sop && sop !== 0) return NaN;
  const match = String(sop).match(/\b(19\d{2}|20\d{2})\b/);
  return match ? parseInt(match[1], 10) : NaN;
};

const pickNonEmptyValue = (...values) => {
  for (const value of values) {
    if (value === 0 || value === false) return value;
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return undefined;
};
 
const normalizeEstimatedFlag = (value) => {
  if (value === true || value === false) return value;
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "yes", "y", "estimated", "estimated by avocarbon"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n", "official", "official customer price", "given by customer"].includes(normalized)) {
    return false;
  }
  return null;
};
 
export const normalizeAutomotiveType = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";
 
  const normalized = text
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
 
  if (normalized === "1") return "Automotive";
  if (normalized === "2") return "Non automotive";
  if (normalized.includes("non") && normalized.includes("auto")) {
    return "Non automotive";
  }
  if (normalized.includes("auto")) {
    return "Automotive";
  }
 
  return text;
};
 
export const calculateProductTargetTo = (product = {}) => {
  const quantity = sanitizeNumberForInput(product.quantity);
  const targetPrice = sanitizeNumberForInput(product.targetPrice);
  if (quantity === "" || targetPrice === "") return "";
  const targetTo = Number(quantity) * Number(targetPrice);
  return Number.isFinite(targetTo) ? targetTo : "";
};
 
export const calculateTotalTargetTo = (products = []) =>
  products.reduce((total, product) => {
    const targetTo = calculateProductTargetTo(product);
    return total + (targetTo === "" ? 0 : Number(targetTo));
  }, 0);
 
const normalizeProductItem = (item = {}) => {
  const product = pickNonEmptyValue(item.product);
  const application = pickNonEmptyValue(item.application);
  const partNumber = pickNonEmptyValue(
    item.part_number,
    item.partNumber,
    item.customer_pn,
    item.customerPn
  );
  const productLine = pickNonEmptyValue(
    item.product_line,
    item.productLine,
    item.product_line_acronym
  );
  const costingData = pickNonEmptyValue(item.costing_data, item.costingData);
  const poDate = pickNonEmptyValue(item.po_date, item.poDate, item.drawing_po_date, item.drawingPoDate);
  const ppapDate = pickNonEmptyValue(item.ppap_date, item.ppapDate);
  const sop = pickNonEmptyValue(item.sop, item.sop_year, item.sopYear);
  const revisionLevel = pickNonEmptyValue(
    item.revision_level,
    item.revisionLevel,
    item.revision
  );
  const quantity = sanitizeNumberForInput(
    pickNonEmptyValue(
      item.quantity,
      item.qty,
      item.annual_volume,
      item.annualVolume,
      item.qty_per_year,
      item.qtyPerYear
    )
  );
  const targetPrice = sanitizeNumberForInput(
    pickNonEmptyValue(
      item.target_price,
      item.targetPrice
    )
  );
  const currency = pickNonEmptyValue(
    item.currency,
    item.target_price_currency,
    item.targetPriceCurrency
  );
  const targetPriceIsEstimated = normalizeEstimatedFlag(
    pickNonEmptyValue(
      item.target_price_is_estimated,
      item.targetPriceIsEstimated,
      item.price_source,
      item.priceSource
    )
  );
  const normalized = {
    product: product ?? "",
    application: application ?? "",
    partNumber: partNumber ?? "",
    productLine: productLine ?? "",
    costingData: costingData ?? "",
    components: pickNonEmptyValue(item.components) ?? "",
    drawing: null,
    poDate: poDate ?? "",
    ppapDate: ppapDate ?? "",
    sop: sop != null ? String(sop) : "",
    revisionLevel: revisionLevel ?? "",
    quantity,
    targetPrice,
    currency: String(currency || "").trim().toUpperCase(),
    targetPriceIsEstimated,
    targetTo: ""
  };
  normalized.targetTo = calculateProductTargetTo(normalized);
  return normalized;
};
 
const hasProductValue = (product = {}) =>
  ["product", "application", "partNumber", "productLine", "costingData", "revisionLevel", "quantity", "targetPrice", "targetPriceIsEstimated"].some((key) => {
    const value = product[key];
    return value === 0 || String(value ?? "").trim() !== "";
  });
 
export const normalizeProductsFromRfqData = (data = {}) => {
  const rawProducts = Array.isArray(data.products) ? data.products : [];
  const rawVolumes = Array.isArray(data.volumes) ? data.volumes : [];
  const legacyTargetPriceIsEstimated = pickNonEmptyValue(
    data.target_price_is_estimated,
    data.targetPriceIsEstimated
  );
  const normalizedProducts = rawProducts
    .map((item, i) => {
      const vol = rawVolumes[i] || {};
      const existingQty = pickNonEmptyValue(item?.quantity, item?.qty, item?.annual_volume, item?.annualVolume, item?.qty_per_year, item?.qtyPerYear);
      let derivedQty = existingQty;
      if (!existingQty) {
        const sop = extractSopYear(item?.sop || item?.sop_year || item?.sopYear);
        const volumeMap = (typeof vol.volumes === "object" && vol.volumes !== null) ? vol.volumes : {};
        if (!Number.isNaN(sop) && sop > 1900) {
          const total = Array.from({ length: 5 }, (_, j) => sop + j)
            .reduce((sum, year) => sum + Number(volumeMap[year] || 0), 0);
          if (total > 0) derivedQty = total;
        } else {
          const total = Object.values(volumeMap).reduce((sum, v) => sum + Number(v || 0), 0);
          if (total > 0) derivedQty = total;
        }
      }
      return normalizeProductItem({
        ...item,
        quantity: derivedQty,
        target_price: pickNonEmptyValue(
          item?.target_price,
          item?.targetPrice,
          vol.target_price,
          vol.targetPrice
        ),
        target_price_is_estimated: pickNonEmptyValue(
          item?.target_price_is_estimated,
          item?.targetPriceIsEstimated,
          legacyTargetPriceIsEstimated,
          vol.price_source,
          vol.priceSource
        )
      });
    })
    .filter(hasProductValue);
 
  if (normalizedProducts.length) {
    return normalizedProducts;
  }
 
  const legacyProduct = normalizeProductItem({
    part_number: data.customer_pn || data.customerPn,
    revision_level: data.revision_level || data.revisionLevel,
    quantity: data.annual_volume || data.qty_per_year || data.qtyPerYear,
    target_price: pickNonEmptyValue(
      data.target_price_local,
      data.targetPriceLocal,
      data.target_price_eur,
      data.targetPriceEur,
      data.targetPrice
    ),
    currency: data.target_price_currency || data.targetPriceCurrency,
    target_price_is_estimated: legacyTargetPriceIsEstimated
  });
  return hasProductValue(legacyProduct) ? [legacyProduct] : [createEmptyProductItem()];
};
 
export const normalizeProductsForPayload = (products = []) =>
  (Array.isArray(products) ? products : [])
    .map(normalizeProductItem)
    .filter(hasProductValue)
    .map((product) => ({
      product: String(product.product || "").trim(),
      application: String(product.application || "").trim(),
      part_number: String(product.partNumber || "").trim(),
      product_line: String(product.productLine || "").trim(),
      costing_data: String(product.costingData || "").trim(),
      components: String(product.components || "").trim(),
      po_date: String(product.poDate || "").trim(),
      ppap_date: String(product.ppapDate || "").trim(),
      sop: product.sop === "" ? null : Number(product.sop) || null,
      revision_level: String(product.revisionLevel || "").trim(),
      quantity: product.quantity === "" ? null : Number(product.quantity),
      target_price: product.targetPrice === "" ? null : Number(product.targetPrice),
      currency: String(product.currency || "").trim().toUpperCase(),
      target_price_is_estimated: normalizeEstimatedFlag(product.targetPriceIsEstimated),
      target_to: calculateProductTargetTo(product) === ""
        ? null
        : Number(calculateProductTargetTo(product))
    }));
 
export const normalizeVolumesForPayload = (volumes = []) =>
  (Array.isArray(volumes) ? volumes : []).map((v) => ({
    target_price: v.targetPrice === "" ? null : Number(v.targetPrice),
    price_source: v.priceSource || null,
    delivery_zone: String(v.deliveryZone || "").trim(),
    plant: String(v.plant || "").trim(),
    country: String(v.country || "").trim(),
    volumes: (v.volumes && typeof v.volumes === "object") ? { ...v.volumes } : {}
  }));
 
const sanitizeIntegerForInput = (value) => {
  if (value === null || value === undefined) return "";
  const cleaned = String(value).replace(/[\s,]/g, "");
  const parsed = parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? "" : parsed;
};
 
const resolveBackendStateKey = (rfqOrStatus) => {
  if (!rfqOrStatus) return "";
  if (typeof rfqOrStatus === "string") {
    return normalizeStatusValue(rfqOrStatus);
  }
  return (
    normalizeStatusValue(rfqOrStatus.sub_status) ||
    normalizeStatusValue(rfqOrStatus.status) ||
    ""
  );
};
 
export const mapBackendStatusToUi = (rfqOrStatus) => {
  const raw = resolveBackendStateKey(rfqOrStatus);
  if (!raw) return "New RFQ";
  return STATUS_MAP[raw] || raw;
};
 
export const mapBackendStatusToPipelineStage = (rfqOrStatus) => {
  const raw = resolveBackendStateKey(rfqOrStatus);
  if (!raw) return "RFQ";
 
  const TERMINAL_SUBS = new Set(["CANCELED", "CANCELLED", "LOST"]);
  if (TERMINAL_SUBS.has(raw) && rfqOrStatus && typeof rfqOrStatus === "object") {
    const PHASE_MAP = { RFQ: "RFQ", COSTING: "In costing", OFFER: "Offer", PO: "PO", PROTOTYPE: "Prototype", CLOSED: "RFQ" };
    const phase = typeof rfqOrStatus.phase === "string" ? rfqOrStatus.phase : rfqOrStatus.phase?.value;
    if (phase && PHASE_MAP[phase]) return PHASE_MAP[phase];
  }

  if (raw === "PENDING_FOR_VALIDATION" && rfqOrStatus && typeof rfqOrStatus === "object") {
    const RESUBMISSION_PHASE_MAP = { COSTING: "In costing", OFFER: "Offer", PO: "PO", PROTOTYPE: "Prototype" };
    const phase = typeof rfqOrStatus.phase === "string" ? rfqOrStatus.phase : rfqOrStatus.phase?.value;
    if (phase && RESUBMISSION_PHASE_MAP[phase]) return RESUBMISSION_PHASE_MAP[phase];
  }

  return PIPELINE_STAGE_MAP[raw] || raw;
};
 
export const mapRfqDataToForm = (rfq) => {
  const data = rfq?.rfq_data || {};
  const pickValue = (value) => {
    if (value === 0 || value === false) return value;
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    return value;
  };
  const pickFirst = (...values) => {
    for (const value of values) {
      const picked = pickValue(value);
      if (picked !== undefined) return picked;
    }
    return undefined;
  };
  const pickText = (...values) => {
    const v = pickFirst(...values);
    return typeof v === "string" && v.length > 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  };
  const products = normalizeProductsFromRfqData(data);
  const firstProduct = products[0] || createEmptyProductItem();
  const productsHaveValues = products.some(hasProductValue);
  const totalTargetTo = pickFirst(
    data.total_target_to,
    productsHaveValues ? calculateTotalTargetTo(products) : undefined
  );
  const mappedVolumes = Array.isArray(data.volumes) && data.volumes.length > 0
    ? data.volumes.map((v) => ({
        targetPrice: sanitizeNumberForInput(pickFirst(v.target_price, v.targetPrice)) ?? "",
        priceSource: String(pickFirst(v.price_source, v.priceSource) || ""),
        deliveryZone: String(v.delivery_zone || v.deliveryZone || ""),
        plant: String(v.plant || ""),
        country: String(v.country || ""),
        volumes: (v.volumes && typeof v.volumes === "object") ? { ...v.volumes } : {}
      }))
    : [];
  // Always keep volumes aligned with products — pad with empty rows if needed
  const volumes = products.map((_, i) => mappedVolumes[i] || createEmptyVolumeItem());
 
  return {
    id: rfq?.rfq_id || "",
    status: mapBackendStatusToUi(rfq),
    automotiveType: normalizeAutomotiveType(
      pickFirst(data.automotive_type, data.automotiveType)
    ),
    customer: pickText(data.customer_name, data.customer, data.client),
    application: pickText(data.application, firstProduct.application),
    productName: pickText(data.product_name, data.product_line_acronym, firstProduct.product),
    productLine: pickText(data.product_line_acronym, firstProduct.productLine) || "",
    projectName: pickText(data.project_name, data.projectName),
    costingData: pickText(data.costing_data, data.costingData),
    products,
    volumes,
    customerPn: pickFirst(firstProduct.partNumber, data.customer_pn, data.customerPn),
    revisionLevel: pickFirst(firstProduct.revisionLevel, data.revision_level, data.revisionLevel),
    deliveryZone: pickText(data.delivery_zone, data.deliveryZone, volumes[0]?.deliveryZone),
    plant: pickText(data.delivery_plant, data.plant, volumes[0]?.plant),
    country: pickText(data.country, volumes[0]?.country),
    poDate: sanitizeDateForInput(
      pickFirst(data.po_date, data.poDate)
    ),
    ppapDate: sanitizeDateForInput(
      pickFirst(data.ppap_date, data.ppapDate)
    ),
    sop: sanitizeIntegerForInput(
      pickFirst(data.sop_year, data.sop, firstProduct.sop)
    ),
    qtyPerYear: sanitizeIntegerForInput(
      pickFirst(firstProduct.quantity, data.annual_volume, data.qty_per_year, data.qtyPerYear)
    ),
    rfqReceptionDate: sanitizeDateForInput(
      pickFirst(data.rfq_reception_date, data.rfqReceptionDate)
    ),
    expectedQuotationDate: sanitizeDateForInput(
      pickFirst(data.quotation_expected_date, data.expectedQuotationDate)
    ),
    contactName: pickText(data.contact_name, data.contact_first_name, data.contactName),
    contactFunction: pickText(data.contact_role, data.contactFunction),
    contactPhone: pickFirst(data.contact_phone, data.contactPhone),
    contactEmail: pickFirst(data.contact_email, data.contactEmail),
    targetPrice: sanitizeNumberForInput(
      pickFirst(
        firstProduct.targetPrice,
        data.target_price_local,
        data.targetPriceLocal,
        data.target_price_eur,
        data.targetPriceEur,
        data.targetPrice
      )
    ),
    targetPriceLocal: sanitizeNumberForInput(
      pickFirst(
        data.target_price_local,
        data.targetPriceLocal,
        firstProduct.targetPrice
      )
    ),
    targetPriceCurrency: pickFirst(
      firstProduct.currency,
      data.target_price_currency,
      data.targetPriceCurrency
    ),
    targetPriceNote: pickText(data.target_price_note, data.targetPriceNote),
    expectedDeliveryConditions: pickText(
      data.expected_delivery_conditions,
      data.expectedDeliveryConditions
    ),
    expectedPaymentTerms: pickText(
      data.expected_payment_terms,
      data.expectedPaymentTerms
    ),
    typeOfPackaging: pickText(
      data.type_of_packaging,
      data.typeOfPackaging
    ),
    businessTrigger: pickText(data.business_trigger, data.businessTrigger),
    customerToolingConditions: pickText(
      data.customer_tooling_conditions,
      data.customerToolingConditions
    ),
    entryBarriers: pickText(data.entry_barriers, data.entryBarriers),
    designResponsible: pickText(
      data.responsibility_design,
      data.design_responsible,
      data.designResponsible
    ),
    validationResponsible: pickText(
      data.responsibility_validation,
      data.validation_responsible,
      data.validationResponsible
    ),
    designOwner: pickText(
      data.product_ownership,
      data.design_owner,
      data.designOwner
    ),
    developmentCosts: pickText(
      data.pays_for_development,
      data.development_costs,
      data.developmentCosts
    ),
    technicalCapacity: pickText(
      data.capacity_available,
      data.technical_capacity,
      data.technicalCapacity
    ),
    scope: pickText(data.scope),
    strategicNote: pickText(data.strategic_note, data.strategicNote),
    finalRecommendation: pickText(
      data.is_feasible,
      data.final_recommendation,
      data.finalRecommendation
    ),
    toTotal: sanitizeNumberForInput(
      pickFirst(data.to_total, data.toTotal, totalTargetTo !== undefined ? Number(totalTargetTo) / 1000 : undefined)
    ),
    toTotalLocal: sanitizeNumberForInput(
      pickFirst(data.to_total_local, data.toTotalLocal)
    ),
    validatorEmail: pickFirst(
      data.zone_manager_email,
      rfq?.zone_manager_email,
      data.validator_email,
      data.validatorEmail
    )
  };
};
 
export const mapPotentialToForm = (potential) => {
  const data = potential || {};
  const pickValue = (value) => {
    if (value === 0 || value === false) return value;
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    return value;
  };
  const pickFirst = (...values) => {
    for (const value of values) {
      const picked = pickValue(value);
      if (picked !== undefined) return picked;
    }
    return undefined;
  };
  const pickText = (...values) => {
    const v = pickFirst(...values);
    return typeof v === "string" && v.length > 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  };
 
  return {
    potentialSystematicId: pickFirst(
      data.potential_systematic_id,
      data.potentialSystematicId
    ),
    potentialCustomer: pickText(
      data.customer,
      data.customer_name,
      data.customerName
    ),
    potentialCustomerLocation: pickText(
      data.customer_location,
      data.customerLocation,
      data.potential_customer_location,
      data.potentialCustomerLocation
    ),
    potentialApplication: pickText(data.application),
    potentialContactName: pickText(data.contact_name, data.contactName),
    potentialContactEmail: pickFirst(data.contact_email, data.contactEmail),
    potentialContactPhone: pickFirst(data.contact_phone, data.contactPhone),
    potentialContactFunction: pickText(
      data.contact_function,
      data.contactFunction,
      data.contact_role
    ),
    potentialIndustry: pickText(data.industry_served, data.potentialIndustry),
    potentialProductType: pickText(
      data.planned_product_type,
      data.potentialProductType
    ),
    potentialEngagementReason: pickText(
      data.engagement_reasons,
      data.potentialEngagementReason
    ),
    potentialIdeaOwner: pickText(data.idea_source, data.potentialIdeaOwner),
    potentialCurrentSupplier: pickText(
      data.current_supplier,
      data.potentialCurrentSupplier
    ),
    potentialWinReason: pickText(data.main_win_reason, data.potentialWinReason),
    potentialWinDetails: pickText(
      data.win_rationale_details,
      data.potentialWinDetails
    ),
    potentialTechnicalCapability: pickText(
      data.technical_capabilities,
      data.potentialTechnicalCapability
    ),
    potentialStrategyFit: pickText(data.strategic_fit, data.potentialStrategyFit),
    potentialStrategyFitDetails: pickText(
      data.strategic_fit_details,
      data.potentialStrategyFitDetails
    ),
    potentialBusinessSalesKeur: pickFirst(
      data.sales_keur,
      data.potentialBusinessSalesKeur
    ),
    potentialBusinessMarginPercent: pickFirst(
      data.margin_percentage,
      data.potentialBusinessMarginPercent
    ),
    potentialStartOfProduction: pickFirst(
      data.start_of_production,
      data.potentialStartOfProduction
    ),
    potentialDevelopmentEffort: pickText(
      data.development_effort,
      data.potentialDevelopmentEffort
    ),
    potentialSideEffects: pickText(data.side_effects, data.potentialSideEffects),
    potentialRiskDoAssessment: pickText(
      data.risks_to_do,
      data.potentialRiskDoAssessment,
      data.potential_risk_do_assessment
    ),
    potentialRiskNotDoAssessment: pickText(
      data.risks_not_to_do,
      data.potentialRiskNotDoAssessment,
      data.potential_risk_not_do_assessment
    )
  };
};
 
export const mapRfqToRow = (rfq) => {
  const data = rfq?.rfq_data || {};
  const potential = rfq?.potential || {};
  const totalTargetToRaw = data.total_target_to;
  const totalTargetTo =
    typeof totalTargetToRaw === "string" && totalTargetToRaw.trim() !== ""
      ? Number(totalTargetToRaw)
      : totalTargetToRaw;
  const derivedToTotal = Number.isFinite(totalTargetTo) ? totalTargetTo / 1000 : undefined;
  const explicitToTotalRaw = data.to_total ?? data.toTotal;
  const explicitToTotal =
    typeof explicitToTotalRaw === "string" && explicitToTotalRaw.trim() !== ""
      ? Number(explicitToTotalRaw)
      : explicitToTotalRaw;
  const toTotal =
    explicitToTotal === 0 && Number.isFinite(derivedToTotal) && derivedToTotal > 0
      ? derivedToTotal
      : Number.isFinite(explicitToTotal)
        ? explicitToTotal
        : derivedToTotal ?? explicitToTotalRaw;
 
  return {
    id: rfq?.rfq_id,
    documentType: normalizeDocumentTypeValue(rfq?.document_type),
    sector: normalizeAutomotiveType(data.automotive_type || data.automotiveType || ""),
    displayId: data.systematic_rfq_id || "Draft - Pending",
    creator: (() => {
      const raw = rfq?.created_by_name || rfq?.created_by_email || "";
      return raw.includes("@") ? raw.split("@")[0] : raw;
    })(),
    customer: data.customer_name || potential.customer,
    client: data.customer_name || potential.customer,
    productName: data.product_name || data.product_line_acronym,
    productLine: data.product_line_acronym || "",
    item: data.product_name || data.product_line_acronym,
    application: data.application || potential.application,
    deliveryZone: data.delivery_zone,
    location: data.delivery_zone || potential.customer_location,
    validator:
      rfq?.zone_manager_name ||
      data.zone_manager_email ||
      rfq?.zone_manager_email ||
      data.validator_email ||
      "",
    validatorRole: data.validator_role || "",
    toTotal: Number.isFinite(toTotal) ? toTotal : explicitToTotalRaw,
    createdAt: rfq?.created_at || null,
    status: mapBackendStatusToUi(rfq),
    pipelineStage: mapBackendStatusToPipelineStage(rfq),
    potentialSystematicId: potential.potential_systematic_id || "",
    potentialCustomer: potential.customer || "",
    potentialApplication: potential.application || "",
    potentialLocation: potential.customer_location || ""
  };
};
 
const normalizeDocumentTypeValue = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "RFI") return "RFI";
  if (normalized === "POTENTIAL") return "POTENTIAL";
  return "RFQ";
};
 
const normalizeInitialDocumentGreeting = (content, documentType) => {
  const normalizedDocumentType = normalizeDocumentTypeValue(documentType);
  if (normalizedDocumentType !== "RFI") return content;
  const text = String(content || "");
  const looksLikeInitialGreeting =
    /sales assistant/i.test(text) ||
    /how would you like to proceed/i.test(text) ||
    /guide me step by step/i.test(text) ||
    /whole paragraph/i.test(text);
  return looksLikeInitialGreeting ? text.replace(/\bRFQ\b/g, "RFI") : text;
};
 
const INTERNAL_TOOL_MARKER_KEYS = new Set([
  "fieldstoupdate",
  "fields_to_update",
  "appendproducts",
  "append_products",
  "tooluses",
  "tool_uses",
  "tool_calls",
  "recipientname",
  "recipient_name",
  "toolcallid",
  "tool_call_id",
  "toolname",
  "tool_name"
]);
 
const tryParseExactJsonPayload = (content) => {
  const text = String(content || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
 
const payloadContainsInternalToolMarkers = (payload) => {
  if (Array.isArray(payload)) {
    return payload.some(payloadContainsInternalToolMarkers);
  }
  if (!payload || typeof payload !== "object") {
    return false;
  }
 
  const keys = Object.keys(payload).map((key) => String(key).toLowerCase());
  if (keys.some((key) => INTERNAL_TOOL_MARKER_KEYS.has(key))) {
    return true;
  }
 
  return Object.values(payload).some(payloadContainsInternalToolMarkers);
};
 
const findJsonBlockEnd = (content, startIndex) => {
  const opening = content[startIndex];
  const closing = opening === "{" ? "}" : "]";
  const stack = [closing];
  let inString = false;
  let escapeNext = false;
 
  for (let index = startIndex + 1; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (char === "\\") {
        escapeNext = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
 
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      stack.push("}");
      continue;
    }
    if (char === "[") {
      stack.push("]");
      continue;
    }
    if (char === "}" || char === "]") {
      if (!stack.length || char !== stack[stack.length - 1]) {
        return null;
      }
      stack.pop();
      if (!stack.length) {
        return index + 1;
      }
    }
  }
 
  return null;
};
 
const stripLeadingInternalToolPayload = (content) => {
  const text = String(content || "").trim();
  if (!text || !["{", "["].includes(text[0])) {
    return text;
  }
 
  const blockEnd = findJsonBlockEnd(text, 0);
  if (!blockEnd) {
    return text;
  }
 
  const leadingPayload = tryParseExactJsonPayload(text.slice(0, blockEnd));
  if (!payloadContainsInternalToolMarkers(leadingPayload)) {
    return text;
  }
 
  return text.slice(blockEnd).trim();
};
 
const isTechnicalErrorLine = (line) => {
  const normalized = line.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith("oops")) return true;
  if (/silently\.?\s*$/.test(normalized)) return true;
  if (/^failed to parse as json\s*:/.test(normalized)) return true;
  if (/tool call arguments must be valid json/.test(normalized)) return true;
  if (/^error\s*:\s*(tool|function|call|json|parse)/.test(normalized)) return true;
  return false;
};

const stripTechnicalErrorLines = (content) => {
  const lines = String(content || "").split("\n");
  const filtered = lines.filter((line) => !isTechnicalErrorLine(line));
  return filtered.join("\n").trim();
};

export const sanitizeAssistantChatContent = (content) => {
  let text = String(content || "").trim();
  if (!text) return "";

  text = stripTechnicalErrorLines(text);
  if (!text) return "";

  text = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (match, payloadText) => {
    const payload = tryParseExactJsonPayload(payloadText);
    return payloadContainsInternalToolMarkers(payload) ? "" : match;
  }).trim();

  const payload = tryParseExactJsonPayload(text);
  if (payloadContainsInternalToolMarkers(payload)) {
    return "";
  }

  return stripLeadingInternalToolPayload(text);
};
 
export const mapChatHistory = (history = [], documentType = "RFQ") => {
  let firstAssistantChecked = false;
 
  return history.reduce((messages, entry) => {
    if (
      (entry?.role !== "assistant" && entry?.role !== "user") ||
      (entry?.role === "assistant" && Array.isArray(entry?.tool_calls) && entry.tool_calls.length > 0) ||
      typeof entry?.content !== "string"
    ) {
      return messages;
    }
 
    let content = entry.content.trim();
    if (!content) {
      return messages;
    }
 
    if (entry.role === "assistant") {
      content = sanitizeAssistantChatContent(content);
      if (!content) {
        return messages;
      }
      if (!firstAssistantChecked) {
        content = normalizeInitialDocumentGreeting(content, documentType);
        firstAssistantChecked = true;
      }
    }
 
    if (!content.trim()) {
      return messages;
    }
 
    messages.push({ role: entry.role, content });
    return messages;
  }, []);
};