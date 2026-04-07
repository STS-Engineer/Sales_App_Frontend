const STATUS_MAP = {
  DRAFT_GRP_1: "Potential",
  DRAFT_GRP_2: "New RFQ",
  DRAFT_GRP_3: "New RFQ",
  PENDING_VALIDATION: "Validation",
  POTENTIAL: "Potential",
  NEW_RFQ: "New RFQ",
  PENDING_FOR_VALIDATION: "Validation",
  IN_COSTING_FEASIBILITY: "Feasability",
  IN_COSTING_PRICING: "Pricing",
  FEASIBILITY: "Feasability",
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
  REJECTED: "Mission not accepted",
  LOST: "Lost",
  CANCELED: "Cancelled",
  CANCELLED: "Cancelled"
};
 
const normalizeStatusValue = (value) =>
  typeof value === "string" ? value : value?.value;

const normalizeDateInputValue = (value) => {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const slashMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month}-${day}`;
  }

  return text;
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
  if (!raw) return "Potential";
  return STATUS_MAP[raw] || raw;
};
 
export const mapBackendStatusToPipelineStage = (rfqOrStatus) => {
  const raw = resolveBackendStateKey(rfqOrStatus);
  if (!raw) return "RFQ";
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
 
  return {
    id: rfq?.rfq_id || "",
    status: mapBackendStatusToUi(rfq),
    customer: pickFirst(data.customer_name, data.customer, data.client),
    application: pickFirst(data.application),
    productName: pickFirst(data.product_name, data.product_line_acronym),
    productLine: pickFirst(data.product_line_acronym, data.product_name),
    costingData: pickFirst(data.costing_data, data.costingData),
    customerPn: pickFirst(data.customer_pn, data.customerPn),
    revisionLevel: pickFirst(data.revision_level, data.revisionLevel),
    deliveryZone: pickFirst(data.delivery_zone, data.deliveryZone),
    plant: pickFirst(data.delivery_plant, data.plant),
    country: pickFirst(data.country),
    poDate: normalizeDateInputValue(
      pickFirst(data.po_date, data.poDate)
    ),
    ppapDate: normalizeDateInputValue(
      pickFirst(data.ppap_date, data.ppapDate)
    ),
    sop: pickFirst(data.sop_year, data.sop),
    qtyPerYear: pickFirst(data.annual_volume, data.qty_per_year, data.qtyPerYear),
    rfqReceptionDate: normalizeDateInputValue(
      pickFirst(data.rfq_reception_date, data.rfqReceptionDate)
    ),
    expectedQuotationDate: normalizeDateInputValue(
      pickFirst(data.quotation_expected_date, data.expectedQuotationDate)
    ),
    contactName: pickFirst(data.contact_name, data.contact_first_name, data.contactName),
    contactFunction: pickFirst(data.contact_role, data.contactFunction),
    contactPhone: pickFirst(data.contact_phone, data.contactPhone),
    contactEmail: pickFirst(data.contact_email, data.contactEmail),
    targetPrice: pickFirst(data.target_price_eur, data.targetPrice),
    expectedDeliveryConditions: pickFirst(
      data.expected_delivery_conditions,
      data.expectedDeliveryConditions
    ),
    expectedPaymentTerms: pickFirst(
      data.expected_payment_terms,
      data.expectedPaymentTerms
    ),
    businessTrigger: pickFirst(data.business_trigger, data.businessTrigger),
    customerToolingConditions: pickFirst(
      data.customer_tooling_conditions,
      data.customerToolingConditions
    ),
    entryBarriers: pickFirst(data.entry_barriers, data.entryBarriers),
    designResponsible: pickFirst(
      data.responsibility_design,
      data.design_responsible,
      data.designResponsible
    ),
    validationResponsible: pickFirst(
      data.responsibility_validation,
      data.validation_responsible,
      data.validationResponsible
    ),
    designOwner: pickFirst(
      data.product_ownership,
      data.design_owner,
      data.designOwner
    ),
    developmentCosts: pickFirst(
      data.pays_for_development,
      data.development_costs,
      data.developmentCosts
    ),
    technicalCapacity: pickFirst(
      data.capacity_available,
      data.technical_capacity,
      data.technicalCapacity
    ),
    scope: pickFirst(data.scope),
    customerStatus: pickFirst(data.customer_status, data.customerStatus),
    strategicNote: pickFirst(data.strategic_note, data.strategicNote),
    finalRecommendation: pickFirst(
      data.is_feasible,
      data.final_recommendation,
      data.finalRecommendation
    ),
    toTotal: pickFirst(data.to_total, data.toTotal),
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

  return {
    potentialSystematicId: pickFirst(
      data.potential_systematic_id,
      data.potentialSystematicId
    ),
    customer: pickFirst(data.customer, data.customer_name, data.customerName),
    potentialCustomerLocation: pickFirst(
      data.customer_location,
      data.customerLocation,
      data.potential_customer_location,
      data.potentialCustomerLocation
    ),
    application: pickFirst(data.application),
    contactName: pickFirst(data.contact_name, data.contactName),
    contactEmail: pickFirst(data.contact_email, data.contactEmail),
    contactPhone: pickFirst(data.contact_phone, data.contactPhone),
    contactFunction: pickFirst(
      data.contact_function,
      data.contactFunction,
      data.contact_role
    ),
    potentialIndustry: pickFirst(data.industry_served, data.potentialIndustry),
    potentialProductType: pickFirst(
      data.planned_product_type,
      data.potentialProductType
    ),
    potentialEngagementReason: pickFirst(
      data.engagement_reasons,
      data.potentialEngagementReason
    ),
    potentialIdeaOwner: pickFirst(data.idea_source, data.potentialIdeaOwner),
    potentialCurrentSupplier: pickFirst(
      data.current_supplier,
      data.potentialCurrentSupplier
    ),
    potentialWinReason: pickFirst(data.main_win_reason, data.potentialWinReason),
    potentialWinDetails: pickFirst(
      data.win_rationale_details,
      data.potentialWinDetails
    ),
    potentialTechnicalCapability: pickFirst(
      data.technical_capabilities,
      data.potentialTechnicalCapability
    ),
    potentialStrategyFit: pickFirst(data.strategic_fit, data.potentialStrategyFit),
    potentialStrategyFitDetails: pickFirst(
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
    potentialDevelopmentEffort: pickFirst(
      data.development_effort,
      data.potentialDevelopmentEffort
    ),
    potentialSideEffects: pickFirst(data.side_effects, data.potentialSideEffects),
    potentialRiskDoAssessment: pickFirst(
      data.risks_to_do,
      data.potentialRiskDoAssessment,
      data.potential_risk_do_assessment
    ),
    potentialRiskNotDoAssessment: pickFirst(
      data.risks_not_to_do,
      data.potentialRiskNotDoAssessment,
      data.potential_risk_not_do_assessment
    )
  };
};

export const mapRfqToRow = (rfq) => {
  const data = rfq?.rfq_data || {};
  const potential = rfq?.potential || {};
  const toTotalRaw = data.to_total;
  const toTotal =
    typeof toTotalRaw === "string" && toTotalRaw.trim() !== ""
      ? Number(toTotalRaw)
      : toTotalRaw;

  return {
    id: rfq?.rfq_id,
    displayId: data.systematic_rfq_id || "Draft - Pending",
    customer: data.customer_name || potential.customer,
    client: data.customer_name || potential.customer,
    productName: data.product_name || data.product_line_acronym,
    productLine: data.product_line_acronym || data.product_name,
    item: data.product_name || data.product_line_acronym,
    application: data.application || potential.application,
    deliveryZone: data.delivery_zone,
    location: data.delivery_zone || potential.customer_location,
    toTotal: Number.isFinite(toTotal) ? toTotal : toTotalRaw,
    status: mapBackendStatusToUi(rfq),
    potentialSystematicId: potential.potential_systematic_id || "",
    potentialCustomer: potential.customer || "",
    potentialApplication: potential.application || "",
    potentialLocation: potential.customer_location || ""
  };
};

export const mapChatHistory = (history = []) =>
  history
    .filter(
      (entry) =>
        (entry?.role === "assistant" || entry?.role === "user") &&
        !(entry?.role === "assistant" && Array.isArray(entry?.tool_calls) && entry.tool_calls.length > 0) &&
        typeof entry?.content === "string" &&
        entry.content.trim() !== ""
    )
    .map((entry) => ({ role: entry.role, content: entry.content }));
