import { useEffect, useMemo, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { Check, Eye, Files, MessageSquare, Pencil, SendHorizontal, Trash2, Upload, X } from "lucide-react";
import { getUserProfile } from "../utils/session.js";
import { useNavigate, useSearchParams } from "react-router-dom";
import costingTemplate from "../assets/costing_template.xlsm?url";
import feasibilityTemplate from "../assets/feasibility_template.xlsm?url";
import ChatPanel from "../components/ChatPanel.jsx";
import FormField from "../components/FormField.jsx";
import TopBar from "../components/TopBar.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import {
  advanceRfqStatus,
  authorizedFetch,
  createRfq,
  downloadCostingTemplate,
  downloadOfferTemplate,
  deleteRfqFile,
  editOfferChatMessage,
  editRfqChatMessage,
  getCostingMessages,
  getRfqAuditLogs,
  getRfqDiscussion,
  getRfq,
  postCostingMessage,
  postRfqDiscussion,
  proceedToFormalRfq,
  requestRevision,
  sendChat,
  sendOfferChat,
  sendPotentialChat,
  submitCostingFileAction,
  submitCostingReview,
  submitCostingValidation,
  submitRevision,
  updateRfqData,
  uploadPricingBomFile,
  uploadPricingFinalPriceFile,
  validateRfq,
  uploadRfqFile
} from "../api";
import {
  mapBackendStatusToUi,
  mapBackendStatusToPipelineStage,
  mapChatHistory,
  mapPotentialToForm,
  mapRfqDataToForm
} from "../utils/rfq.js";

const COSTING_READ_ONLY_ROLES = ["COSTING_TEAM", "RND", "PLM"];
const RFQ_CREATOR_ROLES = ["OWNER", "COMMERCIAL", "ZONE_MANAGER"];

const initialForm = {
  id: "",
  customer: "",
  client: "",
  contact: "",
  email: "",
  phone: "",
  application: "",
  productName: "",
  productLine: "",
  projectName: "",
  customerPn: "",
  costingData: "",
  deliveryZone: "",
  revisionLevel: "",
  plant: "",
  country: "",
  poDate: "",
  ppapDate: "",
  sop: "",
  qtyPerYear: "",
  contactName: "",
  contactFunction: "",
  contactPhone: "",
  contactEmail: "",
  rfqReceptionDate: "",
  expectedQuotationDate: "",
  targetPrice: "",
  targetPriceLocal: "",
  targetPriceCurrency: "",
  targetPriceIsEstimated: false,
  targetPriceNote: "",
  expectedDeliveryConditions: "",
  expectedPaymentTerms: "",
  typeOfPackaging: "",
  businessTrigger: "",
  customerToolingConditions: "",
  entryBarriers: "",
  designResponsible: "",
  validationResponsible: "",
  designOwner: "",
  developmentCosts: "",
  technicalCapacity: "",
  scope: "",
  strategicNote: "",
  finalRecommendation: "",
  toTotal: "",
  toTotalLocal: "",
  validatorEmail: "",
  item: "",
  quantity: "",
  budget: "",
  dueDate: "",
  status: "Potential",
  owner: "",
  notes: "",
  location: "",
  potentialSystematicId: "",
  potentialCustomer: "",
  potentialCustomerLocation: "",
  potentialApplication: "",
  potentialContactName: "",
  potentialContactFunction: "",
  potentialContactPhone: "",
  potentialContactEmail: "",
  potentialIndustry: "",
  potentialProductType: "",
  potentialEngagementReason: "",
  potentialIdeaOwner: "",
  potentialCurrentSupplier: "",
  potentialWinReason: "",
  potentialWinDetails: "",
  potentialTechnicalCapability: "",
  potentialStrategyFit: "",
  potentialStrategyFitDetails: "",
  potentialBusinessSalesKeur: "",
  potentialBusinessMarginPercent: "",
  potentialStartOfProduction: "",
  potentialDevelopmentEffort: "",
  potentialSideEffects: "",
  potentialRiskDoAssessment: "",
  potentialRiskNotDoAssessment: ""
};

const STEPS = [
  {
    id: "step-client",
    label: "Client Data Collection, Delivery, and Contact",
    accent: "tide"
  },
  {
    id: "step-request",
    label: "Collection of Commercial Expectations",
    accent: "sun"
  },
  {
    id: "step-schedule",
    label: "Collection of Commercial Questions",
    accent: "mint"
  },
  {
    id: "step-notes",
    label: "RFQ validation and submission",
    accent: "ink"
  }
];

const STEP_FIELDS = {
  "step-client": [
    "customer",
    "productName",
    "productLine",
    "projectName",
    "deliveryZone",
    "plant",
    "country",
    "poDate",
    "ppapDate",
    "sop",
    "qtyPerYear",
    "rfqReceptionDate",
    "expectedQuotationDate",
    "contactName",
    "contactFunction",
    "contactPhone",
    "contactEmail"
  ],
  "step-request": [
    "targetPrice",
    "expectedDeliveryConditions",
    "expectedPaymentTerms",
    "typeOfPackaging",
    "businessTrigger",
    "customerToolingConditions",
    "entryBarriers"
  ],
  "step-schedule": [
    "designResponsible",
    "validationResponsible",
    "designOwner",
    "developmentCosts",
    "technicalCapacity",
    "scope",
    "strategicNote",
    "finalRecommendation"
  ],
  "step-notes": ["toTotal", "validatorEmail"]
};

const RFQ_FORM_FIELD_NAMES = [...new Set(Object.values(STEP_FIELDS).flat())];
const RFQ_FIELD_TO_STEP_MAP = Object.fromEntries(
  Object.entries(STEP_FIELDS).flatMap(([stepId, fields]) =>
    fields.map((fieldName) => [fieldName, stepId])
  )
);
const STEP_ORDER_INDEX = Object.fromEntries(
  STEPS.map((step, index) => [step.id, index])
);
const AUTOFILL_REVEAL_HIGHLIGHT_CLASSES =
  "ring-2 ring-tide/30 ring-offset-2 ring-offset-white transition-shadow";

const STEP_STYLES = {
  tide: {
    bar: "bg-tide",
    text: "text-tide",
    ring: "border-tide/40",
    bg: "bg-tide/10"
  },
  sun: {
    bar: "bg-sun",
    text: "text-sun",
    ring: "border-sun/40",
    bg: "bg-sun/10"
  },
  mint: {
    bar: "bg-mint",
    text: "text-mint",
    ring: "border-mint/40",
    bg: "bg-mint/10"
  },
  ink: {
    bar: "bg-ink",
    text: "text-ink",
    ring: "border-ink/30",
    bg: "bg-ink/5"
  }
};

const PIPELINE_STAGES = [
  {
    key: "RFQ",
    label: "RFQ",
    subPhases: ["RFQ form", "Validation"]
  },
  {
    key: "In costing",
    label: "In costing",
    subPhases: ["Feasability", "Pricing"]
  },
  {
    key: "Offer",
    label: "Offer",
    subPhases: ["Offer preparation", "Offer validation"]
  },
  {
    key: "PO",
    label: "PO",
    subPhases: ["Get PO", "PO accepted", "Mission status"]
  },
  {
    key: "Prototype",
    label: "Prototype",
    subPhases: ["Get prototype orders", "Prototype ongoing"]
  }
];

const GROUPED_PIPELINE_STAGE_MAP = {
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

const SUBPHASE_ALIASES = {
  RFQ: "RFQ form",
  Potential: "RFQ form",
  "New RFQ": "RFQ form",
  "Mission accepted": "Mission status",
  "Mission not accepted": "Mission status"
};

const STATUS_CHOICES = [
  "RFQ",
  "In costing",
  "Offer preparation",
  "Offer validation",
  "Get PO",
  "PO accepted",
  "Mission accepted",
  "Mission not accepted",
  "Get prototype orders",
  "Prototype ongoing",
  "Lost",
  "Cancelled"
];

const normalizeAssessmentValue = (value) => {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
};

const collectAssessmentValues = (source, keys = []) =>
  keys
    .map((key) => normalizeAssessmentValue(source?.[key]))
    .filter((value) => value !== undefined);

const pickAssessmentArray = (source, keys = []) => {
  for (const key of keys) {
    const value = source?.[key];
    if (!Array.isArray(value)) continue;
    const normalized = value
      .map((item) => normalizeAssessmentValue(item))
      .filter((item) => item !== undefined);
    if (normalized.length) {
      return normalized;
    }
  }
  return [];
};

const resolveAssessmentValue = (rfqData, { directKeys, arrayKeys, numberedKeys, legacyKeys }) => {
  const directValue = collectAssessmentValues(rfqData, directKeys)[0];
  if (directValue) return directValue;

  const fromArray = pickAssessmentArray(rfqData, arrayKeys);
  if (fromArray.length) return fromArray.join("\n\n");

  const fromNumbered = collectAssessmentValues(rfqData, numberedKeys);
  if (fromNumbered.length) return fromNumbered.join("\n\n");

  return collectAssessmentValues(rfqData, legacyKeys).join("\n\n");
};

const extractPotentialAssessmentFields = (rfqData = {}) => {
  return {
    potentialRiskDoAssessment: resolveAssessmentValue(rfqData, {
      directKeys: ["potential_risk_do_assessment", "potentialRiskDoAssessment"],
      arrayKeys: ["potential_risk_do_assessments", "potentialRiskDoAssessments"],
      numberedKeys: [
        "potential_risk_do_assessment_1",
        "potentialRiskDoAssessment1",
        "potential_risk_do_assessment_2",
        "potentialRiskDoAssessment2",
        "potential_risk_do_assessment_3",
        "potentialRiskDoAssessment3"
      ],
      legacyKeys: [
        "potentialRiskDoIpLoss",
        "potentialRiskDoWasteMoneyTime",
        "potentialRiskDoCompetitionWar",
        "potentialRiskDoNoFutureProject",
        "potentialRiskDoLowProfitability",
        "potentialRiskDoLargeCustomerExposure",
        "potentialRiskDoPriceReductionPressure",
        "potentialRiskDoOther"
      ]
    }),
    potentialRiskNotDoAssessment: resolveAssessmentValue(rfqData, {
      directKeys: [
        "potential_risk_not_do_assessment",
        "potentialRiskNotDoAssessment"
      ],
      arrayKeys: [
        "potential_risk_not_do_assessments",
        "potentialRiskNotDoAssessments"
      ],
      numberedKeys: [
        "potential_risk_not_do_assessment_1",
        "potentialRiskNotDoAssessment1",
        "potential_risk_not_do_assessment_2",
        "potentialRiskNotDoAssessment2",
        "potential_risk_not_do_assessment_3",
        "potentialRiskNotDoAssessment3"
      ],
      legacyKeys: [
        "potentialRiskNotDoActivityOpportunity",
        "potentialRiskNotDoMarketReference",
        "potentialRiskNotDoGrowthFuel"
      ]
    })
  };
};

const calculatePotentialMarginKeur = (salesKeur, marginPercent) => {
  const rawSales = String(salesKeur ?? "").trim();
  const rawMargin = String(marginPercent ?? "").trim();
  if (!rawSales || !rawMargin) return "";

  const sales = Number(rawSales.replace(",", "."));
  const margin = Number(rawMargin.replace(",", "."));
  if (!Number.isFinite(sales) || !Number.isFinite(margin)) return "";

  const computed = (sales * margin) / 100;
  if (!Number.isFinite(computed)) return "";
  return computed.toFixed(2).replace(/\.?0+$/, "");
};

const RFQ_CHATBOT_INITIAL_GREETING =
  "Hello, I'm your sales assistant. I'll be helping you fill your RFQ. How would you like to proceed?\n1. Guide me step by step\n2. I will provide a whole paragraph";
const POTENTIAL_CHATBOT_INITIAL_GREETING =
  "Hello, I'm your potential opportunity assistant. I'll help you assess this opportunity before we open the formal RFQ.\n1. Guide me step by step\n2. I will provide a whole paragraph";
const OFFER_CHATBOT_GREETING_PREFIX = "Hello, I'm your offer preparation assistant.";
const OFFER_CHATBOT_INITIAL_GREETING =
  "Hello, I'm your offer preparation assistant. I can help you review the fields used in the offer Word template. Tell me what you want to update, or ask me to check what is still missing.";
const SELF_REVISION_REQUEST_COMMENT = "Self-update initiated by assigned validator.";
const SHARED_POTENTIAL_FIELDS = [
  { key: "potentialCustomer", label: "customer" },
  { key: "potentialCustomerLocation", label: "customer location" },
  { key: "potentialApplication", label: "application" },
  { key: "potentialContactName", label: "contact name" },
  { key: "potentialContactEmail", label: "contact email" },
  { key: "potentialContactPhone", label: "contact phone" },
  { key: "potentialContactFunction", label: "contact function" }
];
const PRICING_WORKFLOW_STATE_WAITING_BOM = "WAITING_BOM";
const PRICING_WORKFLOW_STATE_BOM_UPLOADED = "BOM_UPLOADED";
const PRICING_WORKFLOW_STATE_PRICING_UPLOADED = "PRICING_UPLOADED";
const PRICING_WORKFLOW_STATE_APPROVED = "APPROVED";
const PRICING_WORKFLOW_STATE_REJECTED = "REJECTED";
const FEASIBILITY_STATUS_OPTIONS = [
  { value: "FEASIBLE", label: "Feasible" },
  { value: "FEASIBLE_UNDER_CONDITION", label: "Feasible Under Condition" },
  { value: "NOT_FEASIBLE", label: "Not Feasible" }
];

const formatFeasibilityStatusLabel = (value) => {
  const normalizedValue = String(value || "").trim().toUpperCase();
  const matchedOption = FEASIBILITY_STATUS_OPTIONS.find(
    (option) => option.value === normalizedValue
  );
  if (matchedOption) {
    return matchedOption.label;
  }
  return normalizedValue
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

const getFeasibilityStatusBadgeClasses = (value) => {
  const normalizedValue = String(value || "").trim().toUpperCase();
  if (normalizedValue === "FEASIBLE") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalizedValue === "FEASIBLE_UNDER_CONDITION") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (normalizedValue === "NOT_FEASIBLE") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
};

const hasMeaningfulValue = (value) => {
  if (value === 0) return true;
  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
};

const getChangedRfqFormFields = (previousForm = {}, nextForm = {}) => {
  const changedFields = RFQ_FORM_FIELD_NAMES.filter((fieldName) => {
    const previousValue = previousForm?.[fieldName];
    const nextValue = nextForm?.[fieldName];
    return String(previousValue ?? "").trim() !== String(nextValue ?? "").trim();
  });

  if (!changedFields.length) {
    return [];
  }

  const filledFields = changedFields.filter((fieldName) =>
    hasMeaningfulValue(nextForm?.[fieldName])
  );
  return filledFields.length ? filledFields : changedFields;
};

const getRfqStepCompletionMap = (form = {}) =>
  Object.fromEntries(
    STEPS.map((step) => [
      step.id,
      (STEP_FIELDS[step.id] || []).every((fieldName) => hasMeaningfulValue(form?.[fieldName]))
    ])
  );

const buildStepRevealTarget = (stepId) =>
  stepId
    ? {
      stepId,
      mode: "step",
      fieldName: "",
      updatedFields: [],
      highlight: false
    }
    : null;

const buildRfqAutofillRevealTarget = (previousForm = {}, nextForm = {}) => {
  const changedFields = getChangedRfqFormFields(previousForm, nextForm);
  if (!changedFields.length) {
    return null;
  }

  const lastChangedField = changedFields[changedFields.length - 1];
  const targetStepId =
    RFQ_FIELD_TO_STEP_MAP[lastChangedField] ||
    RFQ_FIELD_TO_STEP_MAP[changedFields[0]] ||
    "step-client";

  return {
    stepId: targetStepId,
    mode: "field",
    fieldName: lastChangedField,
    updatedFields: changedFields,
    highlight: false
  };
};

const getMissingPotentialSharedFields = (form = {}) =>
  SHARED_POTENTIAL_FIELDS
    .filter(({ key }) => !hasMeaningfulValue(form?.[key]))
    .map(({ label }) => label);

const mergeChatWithAttachments = (serverMessages = [], prevMessages = []) => {
  if (!prevMessages.length) return serverMessages;
  const pending = prevMessages.filter(
    (msg) =>
      msg?.role === "user" ||
      (Array.isArray(msg.attachments) && msg.attachments.length)
  );
  if (!pending.length) return serverMessages;
  const used = new Set();
  const merged = serverMessages.map((msg) => {
    const matchIndex = pending.findIndex(
      (pendingMsg, idx) =>
        !used.has(idx) &&
        pendingMsg.role === msg.role &&
        pendingMsg.content === msg.content
    );
    if (matchIndex >= 0) {
      used.add(matchIndex);
      return { ...msg, attachments: pending[matchIndex].attachments };
    }
    return msg;
  });
  pending.forEach((pendingMsg, idx) => {
    if (!used.has(idx)) {
      merged.push(pendingMsg);
    }
  });
  return merged;
};

const normalizeRfqFiles = (rfq) => {
  const topLevelRfqFiles =
    Array.isArray(rfq?.rfq_files) && rfq.rfq_files.length > 0 ? rfq.rfq_files : null;
  const dataRfqFiles =
    Array.isArray(rfq?.rfq_data?.rfq_files) && rfq.rfq_data.rfq_files.length > 0
      ? rfq.rfq_data.rfq_files
      : null;
  const dataFiles =
    Array.isArray(rfq?.rfq_data?.files) && rfq.rfq_data.files.length > 0
      ? rfq.rfq_data.files
      : null;
  const topLevelFiles =
    Array.isArray(rfq?.files) && rfq.files.length > 0 ? rfq.files : null;
  const attachments =
    Array.isArray(rfq?.attachments) && rfq.attachments.length > 0
      ? rfq.attachments
      : null;
  const raw =
    topLevelRfqFiles ||
    dataRfqFiles ||
    dataFiles ||
    topLevelFiles ||
    attachments ||
    [];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    if (typeof entry === "string") {
      const name = entry.split("/").pop() || `file-${index + 1}`;
      return {
        id: `server-${name}-${index}`,
        name,
        url: entry,
        source: "server",
        size: "",
        updatedAt: "",
        owner: ""
      };
    }
    const name =
      entry?.name ||
      entry?.filename ||
      entry?.original_name ||
      entry?.file_name ||
      entry?.key ||
      `file-${index + 1}`;
    const url =
      entry?.url ||
      entry?.file_url ||
      entry?.download_url ||
      entry?.path ||
      entry?.link ||
      "";
    const id =
      entry?.id || entry?.file_id || entry?.uuid || entry?.key || name || index;
    return {
      id,
      name,
      url,
      fileRole: String(entry?.file_role || entry?.fileRole || "").trim().toUpperCase(),
      source: "server",
      size:
        entry?.size ||
        entry?.file_size ||
        entry?.content_length ||
        entry?.contentLength ||
        "",
      updatedAt:
        entry?.uploaded_at ||
        entry?.updated_at ||
        entry?.last_modified ||
        entry?.lastModified ||
        "",
      owner: entry?.uploaded_by || entry?.owner || entry?.created_by || ""
    };
  });
};

const normalizeCostingFiles = (rfq) => {
  const raw = rfq?.costing_files || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    const name =
      entry?.name ||
      entry?.filename ||
      entry?.original_name ||
      entry?.file_name ||
      `costing-file-${index + 1}`;
    const url =
      entry?.url ||
      entry?.file_url ||
      entry?.download_url ||
      entry?.path ||
      entry?.link ||
      "";
    const id =
      entry?.id || entry?.file_id || entry?.uuid || entry?.path || name || index;
    return {
      id,
      name,
      url,
      source: "server",
      size:
        entry?.size ||
        entry?.file_size ||
        entry?.content_length ||
        entry?.contentLength ||
        "",
      updatedAt:
        entry?.uploaded_at ||
        entry?.updated_at ||
        entry?.last_modified ||
        entry?.lastModified ||
        "",
      owner: entry?.uploaded_by || entry?.owner || entry?.created_by || ""
    };
  });
};

const normalizeCostingFileState = (rfq) => {
  const raw = rfq?.costing_file_state;
  if (!raw || typeof raw !== "object") return null;
  const normalizeStateFile = (fileSource, fallbackId, fallbackName, fallbackUpdatedAt, fallbackOwner) => {
    if (!fileSource || typeof fileSource !== "object") return null;
    const innerFile =
      fileSource?.file && typeof fileSource.file === "object"
        ? fileSource.file
        : fileSource;

    return {
      id:
        innerFile?.id ||
        innerFile?.file_id ||
        innerFile?.uuid ||
        innerFile?.path ||
        innerFile?.filename ||
        fallbackId,
      name:
        innerFile?.name ||
        innerFile?.filename ||
        innerFile?.original_name ||
        innerFile?.file_name ||
        fallbackName,
      url:
        innerFile?.url ||
        innerFile?.file_url ||
        innerFile?.download_url ||
        innerFile?.path ||
        innerFile?.link ||
        "",
      source: "server",
      size:
        innerFile?.size ||
        innerFile?.file_size ||
        innerFile?.content_length ||
        innerFile?.contentLength ||
        "",
      updatedAt:
        innerFile?.uploaded_at ||
        innerFile?.updated_at ||
        innerFile?.last_modified ||
        innerFile?.lastModified ||
        fileSource?.uploaded_at ||
        fallbackUpdatedAt ||
        "",
      owner:
        innerFile?.uploaded_by ||
        innerFile?.owner ||
        innerFile?.created_by ||
        fileSource?.uploaded_by ||
        fallbackOwner ||
        ""
    };
  };

  const normalizedFile = normalizeStateFile(
    raw?.file,
    "costing-file-state",
    "Costing file",
    raw?.action_at,
    raw?.action_by
  );
  const normalizedBomFile = normalizeStateFile(
    raw?.bom_file,
    "pricing-bom-file",
    "Pricing BOM file",
    raw?.validation_at,
    raw?.validation_by
  );
  const normalizedPricingFile = normalizeStateFile(
    raw?.pricing_file,
    "pricing-final-price-file",
    "Pricing final price file",
    raw?.validation_at,
    raw?.validation_by
  );

  let workflowState = String(raw?.workflow_state || "").trim().toUpperCase();
  if (!workflowState) {
    if (normalizedPricingFile) {
      workflowState = PRICING_WORKFLOW_STATE_PRICING_UPLOADED;
    } else if (normalizedBomFile) {
      workflowState = PRICING_WORKFLOW_STATE_BOM_UPLOADED;
    } else if (
      String(rfq?.phase || "").trim().toUpperCase() === "COSTING" &&
      String(rfq?.sub_status || "").trim().toUpperCase() === "PRICING"
    ) {
      workflowState = PRICING_WORKFLOW_STATE_WAITING_BOM;
    }
  }

  return {
    fileStatus: String(raw?.file_status || "").trim().toUpperCase() || "PENDING",
    feasibilityStatus: String(raw?.feasibility_status || "").trim().toUpperCase(),
    note: String(raw?.file_note || "").trim(),
    actionBy: String(raw?.action_by || "").trim(),
    actionAt: String(raw?.action_at || "").trim(),
    file: normalizedFile,
    workflowState,
    bomFile: normalizedBomFile,
    pricingFile: normalizedPricingFile,
    validationBy: String(raw?.validation_by || "").trim(),
    validationAt: String(raw?.validation_at || "").trim(),
    rejectionReason: String(raw?.rejection_reason || "").trim()
  };
};

const buildLegacyCostingFileState = (files = []) => {
  if (!Array.isArray(files) || !files.length) {
    return {
      fileStatus: "PENDING",
      feasibilityStatus: "",
      note: "",
      actionBy: "",
      actionAt: "",
      file: null
    };
  }
  const legacyCandidates = files.filter(
    (file) => !["PRICING_BOM", "PRICING_FINAL_PRICE"].includes(String(file?.fileRole || "").trim().toUpperCase())
  );
  if (!legacyCandidates.length) {
    return {
      fileStatus: "PENDING",
      feasibilityStatus: "",
      note: "",
      actionBy: "",
      actionAt: "",
      file: null
    };
  }
  const latest = legacyCandidates[legacyCandidates.length - 1];
  const safeLegacyUrl =
    typeof latest?.url === "string" &&
      (/^https?:\/\//i.test(latest.url) || latest.url.startsWith("/"))
      ? latest.url
      : "";
  return {
    fileStatus: "UPLOADED",
    feasibilityStatus: "",
    note: "Legacy costing upload recorded before notes were required.",
    actionBy: String(latest?.owner || "").trim(),
    actionAt: String(latest?.updatedAt || "").trim(),
    file: latest ? { ...latest, url: safeLegacyUrl } : null
  };
};

const getLatestCostingFileEntryByRole = (rfq, fileRole) => {
  const targetRole = String(fileRole || "").trim().toUpperCase();
  if (!targetRole) return null;
  const entries = Array.isArray(rfq?.costing_files) ? rfq.costing_files : [];
  const matches = entries.filter(
    (entry) => String(entry?.file_role || entry?.fileRole || "").trim().toUpperCase() === targetRole
  );
  return matches.length ? matches[matches.length - 1] : null;
};

const normalizePricingUpload = (raw, { fallbackId, fallbackName }) => {
  if (!raw || typeof raw !== "object") return null;
  const fileSource =
    raw?.file && typeof raw.file === "object"
      ? raw.file
      : raw;

  const normalizedFile =
    fileSource && typeof fileSource === "object"
      ? {
        id:
          fileSource?.id ||
          fileSource?.file_id ||
          fileSource?.uuid ||
          fileSource?.path ||
          fileSource?.filename ||
          fallbackId,
        name:
          fileSource?.name ||
          fileSource?.filename ||
          fileSource?.original_name ||
          fileSource?.file_name ||
          fallbackName,
        url:
          fileSource?.url ||
          fileSource?.file_url ||
          fileSource?.download_url ||
          fileSource?.path ||
          fileSource?.link ||
          "",
        source: "server",
        size:
          fileSource?.size ||
          fileSource?.file_size ||
          fileSource?.content_length ||
          fileSource?.contentLength ||
          "",
        updatedAt:
          fileSource?.uploaded_at ||
          fileSource?.updated_at ||
          fileSource?.last_modified ||
          fileSource?.lastModified ||
          raw?.uploaded_at ||
          "",
        owner:
          fileSource?.uploaded_by ||
          fileSource?.owner ||
          fileSource?.created_by ||
          raw?.uploaded_by ||
          ""
      }
      : null;

  return {
    note: String(raw?.note || raw?.file_note || "").trim(),
    uploadedBy: String(raw?.uploaded_by || fileSource?.uploaded_by || "").trim(),
    uploadedAt: String(raw?.uploaded_at || fileSource?.uploaded_at || "").trim(),
    file: normalizedFile
  };
};

const normalizePricingBomUpload = (rfq) =>
  normalizePricingUpload(
    rfq?.costing_file_state?.bom_file ||
    getLatestCostingFileEntryByRole(rfq, "PRICING_BOM") ||
    rfq?.rfq_data?.pricing_bom_upload,
    {
      fallbackId: "pricing-bom-file",
      fallbackName: "Pricing BOM file"
    }
  );

const normalizePricingFinalPriceUpload = (rfq) =>
  normalizePricingUpload(
    rfq?.costing_file_state?.pricing_file ||
    getLatestCostingFileEntryByRole(rfq, "PRICING_FINAL_PRICE") ||
    rfq?.rfq_data?.pricing_final_price_upload,
    {
      fallbackId: "pricing-final-price-file",
      fallbackName: "Pricing final price file"
    }
  );

const FILES_PREVIEW_LIMIT = 3;

const getFileExtension = (name = "") => {
  const extension = String(name).split(".").pop()?.trim() || "";
  return extension ? extension.toUpperCase() : "FILE";
};

const getFileAccentClasses = (name = "") => {
  const extension = getFileExtension(name).toLowerCase();
  if (["xls", "xlsx", "xlsm", "csv"].includes(extension)) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
  }
  if (extension === "pdf") {
    return "bg-red-50 text-red-700 ring-1 ring-red-100";
  }
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) {
    return "bg-sky-50 text-sky-700 ring-1 ring-sky-100";
  }
  return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
};

const parseFileTimestamp = (value) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const formatFileDate = (value, { withTime = false } = {}) => {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-GB", withTime
    ? {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
    : {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
};

const formatFileSize = (value) => {
  if (value === null || value === undefined || value === "") {
    return "Size unavailable";
  }
  if (typeof value === "string" && Number.isNaN(Number(value))) {
    return value;
  }
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) {
    return "Size unavailable";
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${size} B`;
};

const normalizeEmailValue = (value) => String(value || "").trim().toLowerCase();
const normalizeOfferSubPhase = (value) =>
  String(value || "").trim() === "Offer validation" ? "Offer preparation" : value;

const normalizeDiscussionMessage = (entry, index = 0) => {
  const content = String(entry?.content || entry?.message || "").trim();
  if (!content) return null;
  const createdAt =
    entry?.created_at ||
    entry?.createdAt ||
    entry?.timestamp ||
    new Date().toISOString();
  return {
    id:
      entry?.id ||
      entry?.message_id ||
      `discussion-${index}-${String(createdAt)}`,
    content,
    createdAt,
    authorEmail: String(entry?.author_email || entry?.authorEmail || "").trim(),
    authorName: String(entry?.author_name || entry?.authorName || "").trim(),
    authorRole: String(entry?.author_role || entry?.authorRole || "").trim(),
    recipientEmail: String(entry?.recipient_email || entry?.recipientEmail || "").trim()
  };
};

const mapDiscussionMessages = (messages = []) =>
  messages
    .map((entry, index) => normalizeDiscussionMessage(entry, index))
    .filter(Boolean)
    .sort(
      (left, right) =>
        parseFileTimestamp(left?.createdAt) - parseFileTimestamp(right?.createdAt)
    );

const formatDiscussionDate = (value) => {
  if (!value) return "Just now";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const getFileKind = (file) => {
  const type = file?.file?.type || "";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  const name = file?.name || "";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["txt", "md", "csv"].includes(ext)) return "text";
  return "file";
};

const DRAFT_CACHE_KEY = "rfq_draft_id";
const DRAFT_CACHE_TS_KEY = "rfq_draft_ts";
const DRAFT_CACHE_TTL_MS = 15000;
const DRAFT_PROMISE_TTL_MS = 20000;
const PRICING_FINAL_PRICE_SAVE_KEY_PREFIX = "rfq_pricing_final_price_saved";
const PRICING_FILE_DECISION_KEY_PREFIX = "rfq_pricing_file_decision";
const SELF_VALIDATION_PROMPT_KEY_PREFIX = "rfq_self_validation_prompt_seen";
const API_BASE = import.meta.env.VITE_API_URL || "https://sales-app-backend.azurewebsites.net";
const omitUndefinedValues = (obj = {}) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  );
const buildRfqDataPayloadFromForm = (form = {}) => ({
  customer_name: form.customer || "",
  application: form.application || "",
  product_name: form.productName || "",
  product_line_acronym: form.productLine || "",
  project_name: form.projectName || "",
  costing_data: form.costingData || "",
  customer_pn: form.customerPn || "",
  revision_level: form.revisionLevel || "",
  delivery_zone: form.deliveryZone || "",
  delivery_plant: form.plant || "",
  country: form.country || "",
  po_date: form.poDate || "",
  ppap_date: form.ppapDate || "",
  sop_year: form.sop || "",
  annual_volume: form.qtyPerYear || "",
  rfq_reception_date: form.rfqReceptionDate || "",
  quotation_expected_date: form.expectedQuotationDate || "",
  contact_name: form.contactName || "",
  contact_role: form.contactFunction || "",
  contact_phone: form.contactPhone || "",
  contact_email: form.contactEmail || "",
  target_price_eur: form.targetPrice || "",
  target_price_local: form.targetPriceLocal || "",
  target_price_currency: form.targetPriceCurrency || "",
  target_price_is_estimated: form.targetPriceIsEstimated || false,
  target_price_note: form.targetPriceNote || "",
  expected_delivery_conditions: form.expectedDeliveryConditions || "",
  expected_payment_terms: form.expectedPaymentTerms || "",
  type_of_packaging: form.typeOfPackaging || "",
  business_trigger: form.businessTrigger || "",
  customer_tooling_conditions: form.customerToolingConditions || "",
  entry_barriers: form.entryBarriers || "",
  responsibility_design: form.designResponsible || "",
  responsibility_validation: form.validationResponsible || "",
  product_ownership: form.designOwner || "",
  pays_for_development: form.developmentCosts || "",
  capacity_available: form.technicalCapacity || "",
  scope: form.scope || "",
  strategic_note: form.strategicNote || "",
  final_recommendation: form.finalRecommendation || "",
  to_total: form.toTotal || "",
  to_total_local: form.toTotalLocal || "",
  zone_manager_email: form.validatorEmail || ""
});
const buildRevisionGreeting = (revisionNotes = "") => {
  const note = String(revisionNotes || "").trim();
  if (!note || note === SELF_REVISION_REQUEST_COMMENT) {
    return "Please tell me your updates.";
  }
  return `The validator requested the following updates: ${note}. What would you like to change?`;
};
const withInitialChatMessage = (messages = [], greeting) => {
  const initialMessage = {
    role: "assistant",
    content: greeting
  };

  if (!Array.isArray(messages) || !messages.length) {
    return [{ ...initialMessage }];
  }

  const normalizedGreeting = String(greeting || "").trim();
  const isOfferGreeting = normalizedGreeting.startsWith(OFFER_CHATBOT_GREETING_PREFIX);
  const hasInitialGreeting = messages.some((message) => {
    if (message?.role !== "assistant") return false;
    const normalizedMessage = String(message.content || "").trim();
    if (!normalizedMessage) return false;
    if (normalizedMessage === normalizedGreeting) return true;
    return isOfferGreeting && normalizedMessage.startsWith(OFFER_CHATBOT_GREETING_PREFIX);
  });

  return hasInitialGreeting
    ? messages
    : [{ ...initialMessage }, ...messages];
};

const canUseStorage = () => typeof window !== "undefined";

const getDraftInitState = () => {
  if (typeof globalThis === "undefined") {
    return { promise: null, ts: 0 };
  }
  if (!globalThis.__rfqDraftInitState) {
    globalThis.__rfqDraftInitState = { promise: null, ts: 0 };
  }
  return globalThis.__rfqDraftInitState;
};

const readCachedDraftId = () => {
  if (!canUseStorage()) return "";
  const cachedId = window.sessionStorage.getItem(DRAFT_CACHE_KEY) || "";
  const cachedTs = Number(window.sessionStorage.getItem(DRAFT_CACHE_TS_KEY) || 0);
  if (!cachedId) return "";
  if (!cachedTs) return "";
  if (Date.now() - cachedTs > DRAFT_CACHE_TTL_MS) {
    return "";
  }
  return cachedId;
};

const writeCachedDraftId = (id) => {
  if (!canUseStorage()) return;
  if (!id) return;
  window.sessionStorage.setItem(DRAFT_CACHE_KEY, id);
  window.sessionStorage.setItem(DRAFT_CACHE_TS_KEY, String(Date.now()));
};

const clearCachedDraftId = () => {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(DRAFT_CACHE_KEY);
  window.sessionStorage.removeItem(DRAFT_CACHE_TS_KEY);
};

const getPricingFinalPriceSaveStorageKey = (rfqId) => {
  const normalizedRfqId = String(rfqId || "").trim();
  return normalizedRfqId
    ? `${PRICING_FINAL_PRICE_SAVE_KEY_PREFIX}:${normalizedRfqId}`
    : "";
};

const buildPricingFinalPriceSaveSignature = (rfqId, upload) => {
  const normalizedRfqId = String(rfqId || "").trim();
  const normalizedName = String(upload?.file?.name || "").trim();
  if (!normalizedRfqId || !normalizedName) {
    return "";
  }

  return JSON.stringify({
    rfqId: normalizedRfqId,
    fileId: String(upload?.file?.id || "").trim(),
    fileName: normalizedName,
    uploadedAt: String(upload?.uploadedAt || upload?.file?.updatedAt || "").trim(),
    fileUrl: String(upload?.file?.url || "").trim()
  });
};

const readPricingFinalPriceSaveSignature = (rfqId) => {
  if (!canUseStorage()) return "";
  const storageKey = getPricingFinalPriceSaveStorageKey(rfqId);
  if (!storageKey) return "";
  return window.sessionStorage.getItem(storageKey) || "";
};

const writePricingFinalPriceSaveSignature = (rfqId, signature) => {
  if (!canUseStorage()) return;
  const storageKey = getPricingFinalPriceSaveStorageKey(rfqId);
  if (!storageKey) return;
  if (!signature) {
    window.sessionStorage.removeItem(storageKey);
    return;
  }
  window.sessionStorage.setItem(storageKey, signature);
};

const clearPricingFinalPriceSaveSignature = (rfqId) => {
  if (!canUseStorage()) return;
  const storageKey = getPricingFinalPriceSaveStorageKey(rfqId);
  if (!storageKey) return;
  window.sessionStorage.removeItem(storageKey);
};

const resolveFileUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
};

const createEmptyValidationAudit = () => ({
  approvedAt: "",
  approvedBy: "",
  rejectedAt: "",
  rejectedBy: "",
  rejectionReason: ""
});

const normalizeAuditValue = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const getSelfValidationPromptStorageKey = (rfqId) => {
  const normalizedRfqId = String(rfqId || "").trim();
  return normalizedRfqId
    ? `${SELF_VALIDATION_PROMPT_KEY_PREFIX}:${normalizedRfqId}`
    : "";
};

const readSelfValidationPromptSignature = (rfqId) => {
  if (!canUseStorage()) return "";
  const storageKey = getSelfValidationPromptStorageKey(rfqId);
  if (!storageKey) return "";
  return window.sessionStorage.getItem(storageKey) || "";
};

const writeSelfValidationPromptSignature = (rfqId, signature) => {
  if (!canUseStorage()) return;
  const storageKey = getSelfValidationPromptStorageKey(rfqId);
  if (!storageKey) return;
  const normalizedSignature = normalizeAuditValue(signature);
  if (!normalizedSignature) {
    window.sessionStorage.removeItem(storageKey);
    return;
  }
  window.sessionStorage.setItem(storageKey, normalizedSignature);
};

const buildSelfValidationPromptSignature = (rfq, auditLogs = []) => {
  const normalizedRfqId = String(rfq?.rfq_id || "").trim();
  if (!normalizedRfqId) return "";

  const validationCycleLog = auditLogs.find((entry) => {
    const action = normalizeAuditValue(entry?.action);
    return (
      action.includes("RFQ submitted for validation") ||
      action.includes("Revision submitted -> RFQ/PENDING_FOR_VALIDATION")
    );
  });
  const subStatusValue =
    typeof rfq?.sub_status === "string" ? rfq.sub_status : rfq?.sub_status?.value;

  return JSON.stringify({
    rfqId: normalizedRfqId,
    cycleAnchor:
      normalizeAuditValue(validationCycleLog?.timestamp) ||
      normalizeAuditValue(rfq?.updated_at),
    creatorEmail: normalizeEmailValue(rfq?.created_by_email),
    validatorEmail: normalizeEmailValue(
      rfq?.zone_manager_email ||
      rfq?.rfq_data?.zone_manager_email ||
      rfq?.rfq_data?.validator_email
    ),
    subStatus: normalizeAuditValue(subStatusValue)
  });
};

const extractValidationAudit = (rfq, auditLogs = []) => {
  const approvedLog = auditLogs.find(
    (entry) =>
      typeof entry?.action === "string" && entry.action.includes("Validator approved")
  );
  const rejectedLog = auditLogs.find(
    (entry) =>
      typeof entry?.action === "string" && entry.action.includes("Validator rejected")
  );

  return {
    approvedAt: normalizeAuditValue(rfq?.approved_at),
    approvedBy: normalizeAuditValue(approvedLog?.performed_by),
    rejectedAt: normalizeAuditValue(rfq?.rejected_at),
    rejectedBy: normalizeAuditValue(rejectedLog?.performed_by),
    rejectionReason: normalizeAuditValue(rfq?.rejection_reason)
  };
};

const extractAuditReasonFromAction = (action) => {
  const text = normalizeAuditValue(action);
  if (!text.includes(":")) return "";
  return text.split(":").slice(1).join(":").trim();
};

const extractCostingReviewAudit = (rfq, auditLogs = []) => {
  const approvedLog = auditLogs.find(
    (entry) =>
      typeof entry?.action === "string" && entry.action.includes("Costing review approved")
  );
  const rejectedLog = auditLogs.find(
    (entry) =>
      typeof entry?.action === "string" && entry.action.includes("Costing review rejected")
  );

  return {
    approvedAt: normalizeAuditValue(approvedLog?.timestamp),
    approvedBy: normalizeAuditValue(approvedLog?.performed_by),
    rejectedAt: normalizeAuditValue(rejectedLog?.timestamp),
    rejectedBy: normalizeAuditValue(rejectedLog?.performed_by),
    rejectionReason:
      normalizeAuditValue(rfq?.rejection_reason) ||
      extractAuditReasonFromAction(rejectedLog?.action)
  };
};

const extractPricingFileDecisionAudit = (costingFileState) => {
  const workflowState = normalizeAuditValue(costingFileState?.workflowState).toUpperCase();
  const validationAt = normalizeAuditValue(costingFileState?.validationAt);
  const validationBy = normalizeAuditValue(costingFileState?.validationBy);
  const rejectionReason = normalizeAuditValue(costingFileState?.rejectionReason);

  if (workflowState === PRICING_WORKFLOW_STATE_APPROVED) {
    return {
      ...createEmptyValidationAudit(),
      approvedAt: validationAt,
      approvedBy: validationBy
    };
  }

  if (workflowState === PRICING_WORKFLOW_STATE_REJECTED) {
    return {
      ...createEmptyValidationAudit(),
      rejectedAt: validationAt,
      rejectedBy: validationBy,
      rejectionReason
    };
  }

  return createEmptyValidationAudit();
};

const formatValidationAuditValue = (value) => {
  const text = normalizeAuditValue(value);
  return text || "Not available";
};

const formatValidationAuditDate = (value) => {
  const text = normalizeAuditValue(value);
  if (!text) return "Not available";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }
  return parsed.toLocaleString();
};

const getPricingFileDecisionStorageKey = (rfqId) => {
  const normalizedRfqId = String(rfqId || "").trim();
  return normalizedRfqId
    ? `${PRICING_FILE_DECISION_KEY_PREFIX}:${normalizedRfqId}`
    : "";
};

const normalizeStoredValidationAudit = (audit = {}) => ({
  approvedAt: normalizeAuditValue(audit?.approvedAt),
  approvedBy: normalizeAuditValue(audit?.approvedBy),
  rejectedAt: normalizeAuditValue(audit?.rejectedAt),
  rejectedBy: normalizeAuditValue(audit?.rejectedBy),
  rejectionReason: normalizeAuditValue(audit?.rejectionReason)
});

const readPricingFileDecisionRecord = (rfqId) => {
  if (!canUseStorage()) {
    return { signature: "", audit: createEmptyValidationAudit() };
  }
  const storageKey = getPricingFileDecisionStorageKey(rfqId);
  if (!storageKey) {
    return { signature: "", audit: createEmptyValidationAudit() };
  }
  const rawValue = window.sessionStorage.getItem(storageKey) || "";
  if (!rawValue) {
    return { signature: "", audit: createEmptyValidationAudit() };
  }

  try {
    const parsed = JSON.parse(rawValue);
    return {
      signature: normalizeAuditValue(parsed?.signature),
      audit: normalizeStoredValidationAudit(parsed?.audit)
    };
  } catch {
    window.sessionStorage.removeItem(storageKey);
    return { signature: "", audit: createEmptyValidationAudit() };
  }
};

const writePricingFileDecisionRecord = (rfqId, signature, audit) => {
  if (!canUseStorage()) return;
  const storageKey = getPricingFileDecisionStorageKey(rfqId);
  if (!storageKey) return;
  const normalizedSignature = normalizeAuditValue(signature);
  if (!normalizedSignature) {
    window.sessionStorage.removeItem(storageKey);
    return;
  }
  window.sessionStorage.setItem(
    storageKey,
    JSON.stringify({
      signature: normalizedSignature,
      audit: normalizeStoredValidationAudit(audit)
    })
  );
};

const clearPricingFileDecisionRecord = (rfqId) => {
  if (!canUseStorage()) return;
  const storageKey = getPricingFileDecisionStorageKey(rfqId);
  if (!storageKey) return;
  window.sessionStorage.removeItem(storageKey);
};

const loadRfqSnapshot = async (targetId) => {
  const [rfq, auditLogs] = await Promise.all([
    getRfq(targetId),
    getRfqAuditLogs(targetId).catch(() => [])
  ]);
  return { rfq, auditLogs };
};

const normalizePipelineStageKey = (stage) => GROUPED_PIPELINE_STAGE_MAP[stage] || "";

export default function NewRfq() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const currentUserProfile = useMemo(() => getUserProfile(), []);
  const currentUserLabel =
    currentUserProfile?.name || currentUserProfile?.email || "You";
  const currentUserEmail = String(currentUserProfile?.email || "").trim();
  const currentUserRole = String(currentUserProfile?.role || "").trim();
  const normalizedCurrentUserEmail = normalizeEmailValue(currentUserEmail);
  const rfqIdParam = useMemo(() => searchParams.get("id"), [searchParams]);
  const [form, setForm] = useState(() => ({ ...initialForm }));
  const [saving, setSaving] = useState(false);
  const [rfqId, setRfqId] = useState("");
  const [rfqCreatorEmail, setRfqCreatorEmail] = useState("");
  const [potentialChatMessages, setPotentialChatMessages] = useState([]);
  const [rfqChatMessages, setRfqChatMessages] = useState([]);
  const [offerChatMessages, setOfferChatMessages] = useState([]);
  const [loadingRfq, setLoadingRfq] = useState(false);
  const [rfqError, setRfqError] = useState("");
  const [rfqSubStatus, setRfqSubStatus] = useState("");
  const [activeStage, setActiveStage] = useState("RFQ");
  const [selectedStage, setSelectedStage] = useState("RFQ");
  const [selectedSubPhase, setSelectedSubPhase] = useState("");
  const [activeRfqTab, setActiveRfqTab] = useState("new");
  const [activeStep, setActiveStep] = useState("step-client");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [chatWidth, setChatWidth] = useState(420);
  const [fulfilledSteps, setFulfilledSteps] = useState({});
  const [serverFiles, setServerFiles] = useState([]);
  const [localFiles, setLocalFiles] = useState([]);
  const [costingFiles, setCostingFiles] = useState([]);
  const [costingFileState, setCostingFileState] = useState(null);
  const [costingFileActionModalOpen, setCostingFileActionModalOpen] = useState(false);
  const [costingFileActionMode, setCostingFileActionMode] = useState("UPLOADED");
  const [costingFileActionNote, setCostingFileActionNote] = useState("");
  const [costingFeasibilityStatus, setCostingFeasibilityStatus] = useState("");
  const [costingFileActionDraft, setCostingFileActionDraft] = useState(null);
  const [costingFileActionPending, setCostingFileActionPending] = useState(false);
  const [pricingBomUpload, setPricingBomUpload] = useState(null);
  const [pricingBomModalOpen, setPricingBomModalOpen] = useState(false);
  const [pricingBomNote, setPricingBomNote] = useState("");
  const [pricingBomDraft, setPricingBomDraft] = useState(null);
  const [pricingBomPending, setPricingBomPending] = useState(false);
  const [pricingFinalPriceUpload, setPricingFinalPriceUpload] = useState(null);
  const [pricingFinalPriceModalOpen, setPricingFinalPriceModalOpen] = useState(false);
  const [pricingFinalPriceNote, setPricingFinalPriceNote] = useState("");
  const [pricingFinalPriceDraft, setPricingFinalPriceDraft] = useState(null);
  const [pricingFinalPricePending, setPricingFinalPricePending] = useState(false);
  const [pricingFinalPriceSaved, setPricingFinalPriceSaved] = useState(false);
  const [pricingFileValidationOpen, setPricingFileValidationOpen] = useState(false);
  const [pricingFileValidationActionId, setPricingFileValidationActionId] = useState("");
  const [pricingFileRejectModalOpen, setPricingFileRejectModalOpen] = useState(false);
  const [pricingFileRejectReason, setPricingFileRejectReason] = useState("");
  const [discussionMessages, setDiscussionMessages] = useState([]);
  const [discussionDraft, setDiscussionDraft] = useState("");
  const [discussionSending, setDiscussionSending] = useState(false);
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [discussionError, setDiscussionError] = useState("");
  const [discussionModalOpen, setDiscussionModalOpen] = useState(false);
  const [costingDiscussionMessages, setCostingDiscussionMessages] = useState([]);
  const [costingDiscussionDraft, setCostingDiscussionDraft] = useState("");
  const [costingDiscussionRecipient, setCostingDiscussionRecipient] = useState("");
  const [costingDiscussionSending, setCostingDiscussionSending] = useState(false);
  const [costingDiscussionLoading, setCostingDiscussionLoading] = useState(false);
  const [costingDiscussionError, setCostingDiscussionError] = useState("");
  const [isCostingDiscussionOpen, setIsCostingDiscussionOpen] = useState(false);
  const [filePreview, setFilePreview] = useState(null);
  const [fileDeleteTarget, setFileDeleteTarget] = useState(null);
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [fileActionId, setFileActionId] = useState("");
  const [filePreviewLoadingId, setFilePreviewLoadingId] = useState("");
  const [validationActionId, setValidationActionId] = useState("");
  const [validationSuccess, setValidationSuccess] = useState("");
  const [selfValidationPromptOpen, setSelfValidationPromptOpen] = useState(false);
  const [selfValidationPromptSignature, setSelfValidationPromptSignature] = useState("");
  const [revisionNotes, setRevisionNotes] = useState("");
  const [revisionRequestModalOpen, setRevisionRequestModalOpen] = useState(false);
  const [revisionComment, setRevisionComment] = useState("");
  const [revisionActionId, setRevisionActionId] = useState("");
  const [optimisticRevisionMode, setOptimisticRevisionMode] = useState(false);
  const [templateDownloadPending, setTemplateDownloadPending] = useState(false);
  const [templatePreviewPending, setTemplatePreviewPending] = useState(false);
  const [templatePreviewUrl, setTemplatePreviewUrl] = useState("");
  const [templatePreviewFilename, setTemplatePreviewFilename] = useState("");
  const [templatePreviewModalOpen, setTemplatePreviewModalOpen] = useState(false);
  const [offerTemplatePreviewPending, setOfferTemplatePreviewPending] = useState(false);
  const [offerTemplateDownloadPending, setOfferTemplateDownloadPending] = useState(false);
  const [offerTemplateReady, setOfferTemplateReady] = useState(false);
  const [offerTemplateFilename, setOfferTemplateFilename] = useState("");
  const [costingReviewActionId, setCostingReviewActionId] = useState("");
  const [costingRejectModalOpen, setCostingRejectModalOpen] = useState(false);
  const [costingRejectReason, setCostingRejectReason] = useState("");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rfqFormEditEnabled, setRfqFormEditEnabled] = useState(false);
  const [rfqValidationReached, setRfqValidationReached] = useState(false);
  const [validationAudit, setValidationAudit] = useState(createEmptyValidationAudit);
  const [costingReviewAudit, setCostingReviewAudit] = useState(createEmptyValidationAudit);
  const [pricingFileDecisionAudit, setPricingFileDecisionAudit] = useState(createEmptyValidationAudit);
  const [persistValidationView, setPersistValidationView] = useState(false);
  const [holdSelfValidationPrompt, setHoldSelfValidationPrompt] = useState(false);
  const [persistCostingReviewView, setPersistCostingReviewView] = useState(false);
  const [proceedingToFormalRfq, setProceedingToFormalRfq] = useState(false);
  const [costingSavePending, setCostingSavePending] = useState(false);
  const [costingFeasabilitySaved, setCostingFeasabilitySaved] = useState(false);
  const [pendingRfqAutofillReveal, setPendingRfqAutofillReveal] = useState(null);
  const rfqFileInputRef = useRef(null);
  const offerTemplateViewerRef = useRef(null);
  const localFilesRef = useRef([]);
  const rfqCreatePromiseRef = useRef(null);
  const resizeState = useRef({ startX: 0, startWidth: 420 });
  const previousStepCompletionRef = useRef({});
  const minChatWidth = 320;
  const maxChatWidth = 620;
  const stepIds = STEPS.map((step) => step.id);
  const lastStepIndex = Math.max(stepIds.length - 1, 0);
  const stepIndex = stepIds.indexOf(activeStep);
  const isFirstStep = stepIndex <= 0;
  const isLastStep = stepIndex === stepIds.length - 1;
  const activeStepData = STEPS[stepIndex] || STEPS[0];
  const groupedActiveStage = normalizePipelineStageKey(activeStage) || selectedStage || "RFQ";
  const stageIndex = Math.max(
    PIPELINE_STAGES.findIndex((stage) => stage.key === groupedActiveStage),
    0
  );
  const isRfqStage = selectedStage === "RFQ";
  const isTerminalStage = form.status === "Lost" || form.status === "Cancelled";
  const activeSubPhase = SUBPHASE_ALIASES[form.status] || form.status;
  const showNextPreview =
    !isTerminalStage && stageIndex < PIPELINE_STAGES.length - 1;
  const visibleStages = PIPELINE_STAGES.slice(
    0,
    stageIndex + 1 + (showNextPreview ? 1 : 0)
  );
  const isChatOnly = false;
  const mergedFiles = useMemo(
    () => [...serverFiles, ...localFiles],
    [serverFiles, localFiles]
  );
  const sortedFiles = useMemo(() => {
    return mergedFiles
      .map((file, index) => ({ file, index }))
      .sort((left, right) => {
        const timestampDiff =
          parseFileTimestamp(right.file.updatedAt) -
          parseFileTimestamp(left.file.updatedAt);
        if (timestampDiff !== 0) return timestampDiff;
        return right.index - left.index;
      })
      .map((entry) => entry.file);
  }, [mergedFiles]);
  const compactFiles = useMemo(
    () => sortedFiles.slice(0, FILES_PREVIEW_LIMIT),
    [sortedFiles]
  );
  const potentialMarginKeur = useMemo(
    () =>
      calculatePotentialMarginKeur(
        form.potentialBusinessSalesKeur,
        form.potentialBusinessMarginPercent
      ),
    [form.potentialBusinessSalesKeur, form.potentialBusinessMarginPercent]
  );
  const hasPersistedDraft = Boolean(rfqId || rfqIdParam || form.id);
  const isPotentialDraft = form.status === "Potential";
  const isRevisionRequested = rfqSubStatus === "REVISION_REQUESTED";
  const isRevisionModeActive = isRevisionRequested || optimisticRevisionMode;
  const isTargetPriceEstimated =
    form.targetPriceIsEstimated === true ||
    String(form.targetPriceIsEstimated ?? "").trim().toLowerCase() === "true";
  const assignedValidatorEmail = normalizeEmailValue(form.validatorEmail);
  const isAssignedValidatorUser =
    Boolean(assignedValidatorEmail) &&
    assignedValidatorEmail === normalizedCurrentUserEmail;
  const normalizedRfqCreatorEmail = normalizeEmailValue(rfqCreatorEmail);
  const isRfqCreatorUser =
    Boolean(normalizedRfqCreatorEmail) &&
    normalizedRfqCreatorEmail === normalizedCurrentUserEmail;
  const isCostingReadOnlyRole = COSTING_READ_ONLY_ROLES.includes(currentUserRole);
  const canCreateRfqDraft = RFQ_CREATOR_ROLES.includes(currentUserRole);
  const canEditRfqPhase = Boolean(
    currentUserRole === "OWNER" || isRfqCreatorUser || isAssignedValidatorUser
  );
  const canUseRfqActions = Boolean(
    isRfqStage &&
    !isCostingReadOnlyRole &&
    (hasPersistedDraft ? canEditRfqPhase : canCreateRfqDraft)
  );
  const isOfferStage = selectedStage === "Offer";
  const canEditOfferPhase = canEditRfqPhase;
  const canUseOfferActions = Boolean(
    isOfferStage && canEditOfferPhase && !isCostingReadOnlyRole
  );
  const isPotentialTabLocked = false;
  const isNewRfqTabLocked = hasPersistedDraft && isPotentialDraft;
  const isPotentialAssistantLocked =
    activeRfqTab === "potential" && hasPersistedDraft && !isPotentialDraft;
  const missingPotentialSharedFields = useMemo(
    () => getMissingPotentialSharedFields(form),
    [form]
  );
  const canProceedToFormalRfq = Boolean(
    (rfqId || rfqIdParam) &&
    canUseRfqActions &&
    isPotentialDraft &&
    !missingPotentialSharedFields.length &&
    !proceedingToFormalRfq
  );
  const hasRecordedValidationDecision = Boolean(
    validationAudit.approvedAt || validationAudit.rejectedAt
  );
  const isValidationRejected = Boolean(validationAudit.rejectedAt);
  const canDownloadCostingTemplate = Boolean(
    rfqId && validationAudit.approvedAt && !isValidationRejected
  );
  const templateDefaultFilename = rfqId
    ? `${rfqId}_costing_feasibility_template.pdf`
    : "costing_feasibility_template.pdf";
  const hasRecordedCostingReviewDecision = Boolean(
    costingReviewAudit.approvedAt || costingReviewAudit.rejectedAt
  );
  const isCostingReviewRejected = Boolean(costingReviewAudit.rejectedAt);
  const hasRecordedPricingFileDecision = Boolean(
    pricingFileDecisionAudit.approvedAt || pricingFileDecisionAudit.rejectedAt
  );
  const isPricingFileRejected = Boolean(pricingFileDecisionAudit.rejectedAt);
  const effectiveCostingFileState = useMemo(
    () => costingFileState || buildLegacyCostingFileState(costingFiles),
    [costingFileState, costingFiles]
  );
  const pricingWorkflowState = useMemo(() => {
    const explicitState = String(costingFileState?.workflowState || "").trim().toUpperCase();
    if (explicitState) return explicitState;
    if (costingFileState?.pricingFile || pricingFinalPriceUpload?.file) {
      return PRICING_WORKFLOW_STATE_PRICING_UPLOADED;
    }
    if (costingFileState?.bomFile || pricingBomUpload?.file) {
      return PRICING_WORKFLOW_STATE_BOM_UPLOADED;
    }
    if (
      selectedStage === "In costing" &&
      String(rfqSubStatus || "").trim().toUpperCase() === "PRICING"
    ) {
      return PRICING_WORKFLOW_STATE_WAITING_BOM;
    }
    return "";
  }, [
    costingFileState,
    pricingBomUpload,
    pricingFinalPriceUpload,
    rfqSubStatus,
    selectedStage
  ]);
  const validationButtonsDisabled = Boolean(
    validationActionId ||
    hasRecordedValidationDecision ||
    !(currentUserRole === "OWNER" || isAssignedValidatorUser)
  );
  const hideValidationActionButtons = Boolean(
    hasRecordedValidationDecision ||
    validationActionId === "approve" ||
    validationActionId === "reject"
  );

  const chatFallback = useMemo(() => {
    if (loadingRfq) {
      return [{ role: "assistant", content: "Loading RFQ..." }];
    }
    return [
      {
        role: "assistant",
        content:
          "Please select your preferred language.\n1- English\n2- FranÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ais\n3- ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡\n4- EspaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±ol\n5- Deutsch\n6- ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬"
      }
    ];
  }, [loadingRfq]);

  const activeChatGreeting =
    activeRfqTab === "potential"
      ? POTENTIAL_CHATBOT_INITIAL_GREETING
      : isOfferStage
        ? OFFER_CHATBOT_INITIAL_GREETING
      : isRevisionModeActive && activeRfqTab === "new"
        ? buildRevisionGreeting(revisionNotes)
        : RFQ_CHATBOT_INITIAL_GREETING;
  const activeChatMessages =
    activeRfqTab === "potential"
      ? potentialChatMessages
      : isOfferStage
        ? offerChatMessages
        : rfqChatMessages;
  const activeChatMessagesWithMeta = useMemo(
    () => activeChatMessages.map((message, index) => ({ ...message, chatEditIndex: index })),
    [activeChatMessages]
  );
  const chatFeed = useMemo(
    () => withInitialChatMessage(activeChatMessagesWithMeta, activeChatGreeting),
    [activeChatGreeting, activeChatMessagesWithMeta]
  );
  const stepCompletion = useMemo(() => {
    return Object.fromEntries(
      STEPS.map((step) => {
        const fields = STEP_FIELDS[step.id] || [];
        const complete = fields.every((field) => hasMeaningfulValue(form[field]));
        return [step.id, complete];
      })
    );
  }, [form]);

  useEffect(() => {
    setFulfilledSteps((prev) => {
      let changed = false;
      const next = { ...prev };
      STEPS.forEach((step) => {
        if (stepCompletion[step.id] && !next[step.id]) {
          next[step.id] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [stepCompletion]);

  useEffect(() => {
    setFulfilledSteps({});
  }, [rfqId]);

  useEffect(() => {
    previousStepCompletionRef.current = {};
  }, [rfqId]);

  useEffect(() => {
    if (!rfqError) return;
    showToast(rfqError, { type: "error", title: "RFQ update failed" });
    setRfqError("");
  }, [rfqError, showToast]);

  useEffect(() => {
    if (!validationSuccess) return;
    showToast(validationSuccess, { type: "success", title: "RFQ updated" });
    setValidationSuccess("");
  }, [validationSuccess, showToast]);

  const highestCompletedStepIndex = useMemo(() => {
    let highestIndex = -1;
    STEPS.forEach((step, index) => {
      if (stepCompletion[step.id] || fulfilledSteps[step.id]) {
        highestIndex = index;
      }
    });
    return highestIndex;
  }, [stepCompletion, fulfilledSteps]);
  const hasWorkflowMovedBeyondRfq = Boolean(activeStage && activeStage !== "RFQ");
  const isCancelledAfterRfqValidation = Boolean(
    normalizePipelineStageKey(activeStage) === "RFQ" &&
    form.status === "Cancelled" &&
    validationAudit.rejectedAt
  );
  const hasValidationLock =
    !isRevisionModeActive &&
    (
      activeSubPhase === "Validation" ||
      isCancelledAfterRfqValidation ||
      rfqValidationReached ||
      hasWorkflowMovedBeyondRfq
    );

  const reviewNavigationUnlocked =
    isRfqStage &&
    (hasValidationLock || selectedSubPhase === "Validation");

  const getActiveDisplaySubPhase = (stageKey) => {
    if (stageKey === "RFQ" && isRevisionModeActive) {
      return "RFQ form";
    }
    if (stageKey !== groupedActiveStage) return "";
    if (stageKey === "RFQ" && holdSelfValidationPrompt) {
      return "RFQ form";
    }
    if (stageKey === "RFQ" && isCancelledAfterRfqValidation) {
      return "Validation";
    }
    if (stageKey === "Offer") {
      return normalizeOfferSubPhase(activeSubPhase);
    }
    return activeSubPhase;
  };
  const rfqDisplaySubPhase = isRfqStage
    ? isRevisionModeActive
      ? "RFQ form"
      : selectedSubPhase || getActiveDisplaySubPhase("RFQ") || "RFQ form"
    : "";
  const isRfqFormView = isRfqStage && rfqDisplaySubPhase === "RFQ form";
  const unlockAllNewRfqSteps =
    activeRfqTab === "new" && isRfqStage && isRfqFormView;
  const isRfqValidationView =
    isRfqStage && !isRevisionModeActive && rfqDisplaySubPhase === "Validation";
  const highestUnlockedStepIndex = useMemo(() => {
    if (reviewNavigationUnlocked || unlockAllNewRfqSteps) {
      return lastStepIndex;
    }
    return Math.min(lastStepIndex, Math.max(0, highestCompletedStepIndex + 1));
  }, [
    reviewNavigationUnlocked,
    unlockAllNewRfqSteps,
    lastStepIndex,
    highestCompletedStepIndex
  ]);

  const stepStates = useMemo(() => {
    const entries = STEPS.map((step, index) => {
      const isLocked = index > highestUnlockedStepIndex;
      const isComplete = Boolean(stepCompletion[step.id] || fulfilledSteps[step.id]);
      const statusType = isLocked ? "locked" : isComplete ? "fulfilled" : "draft";
      return [step.id, { isLocked, isComplete, statusType }];
    });
    return Object.fromEntries(entries);
  }, [stepCompletion, fulfilledSteps, highestUnlockedStepIndex]);
  const allStepsComplete = useMemo(
    () => STEPS.every((step) => stepStates[step.id]?.isComplete),
    [stepStates]
  );
  const canOpenRfqValidation =
    hasValidationLock && !holdSelfValidationPrompt;
  const isCostingStage = selectedStage === "In costing";
  const canUseCostingActions = Boolean(
    isCostingStage &&
    ["OWNER", "COSTING_TEAM", "RND", "PLM"].includes(currentUserRole)
  );
  const costingDisplaySubPhase = isCostingStage
    ? selectedSubPhase || getActiveDisplaySubPhase("In costing") || "Feasability"
    : "";
  const isCostingFeasabilityView =
    isCostingStage && costingDisplaySubPhase === "Feasability";
  const isCostingPricingView =
    isCostingStage && costingDisplaySubPhase === "Pricing";
  const offerDisplaySubPhase = isOfferStage
    ? normalizeOfferSubPhase(
      selectedSubPhase || getActiveDisplaySubPhase("Offer") || "Offer preparation"
    )
    : "";
  const isOfferPreparationView =
    isOfferStage && offerDisplaySubPhase === "Offer preparation";
  const isOfferValidationLocked =
    isOfferStage && String(rfqSubStatus || "").trim().toUpperCase() === "VALIDATION";
  const hasCompletedCostingFileAction = Boolean(
    effectiveCostingFileState?.fileStatus &&
    effectiveCostingFileState.fileStatus !== "PENDING"
  );
  const canOpenCostingPricing = Boolean(
    activeSubPhase === "Pricing" || hasCompletedCostingFileAction
  );
  const canReviewCostingFeasability = Boolean(
    rfqId &&
    canUseCostingActions &&
    isCostingFeasabilityView &&
    (currentUserRole === "OWNER" || currentUserRole === "COSTING_TEAM")
  );
  const canManageCostingFeasibilityHandoff = Boolean(
    rfqId &&
    canUseCostingActions &&
    isCostingFeasabilityView &&
    (
      currentUserRole === "OWNER" ||
      currentUserRole === "COSTING_TEAM" ||
      currentUserRole === "RND"
    )
  );
  const hasSelectedCostingFeasibilityStatus = Boolean(
    String(costingFeasibilityStatus || "").trim()
  );
  const costingReviewButtonsDisabled = Boolean(
    !canReviewCostingFeasability || costingReviewActionId
  );
  const canSaveCostingFeasability = Boolean(
    canReviewCostingFeasability &&
    hasRecordedCostingReviewDecision &&
    !isCostingReviewRejected &&
    ["UPLOADED", "NA"].includes(effectiveCostingFileState?.fileStatus || "") &&
    !costingSavePending
  );
  const hasSavedCostingFeasability = Boolean(
    costingFeasabilitySaved ||
    normalizePipelineStageKey(activeStage) === "In costing" &&
    activeSubPhase === "Pricing"
  );
  const hasPricingBomUpload = Boolean(
    costingFileState?.bomFile || pricingBomUpload?.file
  );
  const hasPricingFinalPriceUpload = Boolean(
    costingFileState?.pricingFile || pricingFinalPriceUpload?.file
  );
  const canManagePricingBom = Boolean(
    rfqId &&
    canUseCostingActions &&
    isCostingPricingView &&
    pricingWorkflowState === PRICING_WORKFLOW_STATE_WAITING_BOM &&
    (currentUserRole === "OWNER" || currentUserRole === "COSTING_TEAM")
  );
  const canManagePricingFinalPrice = Boolean(
    rfqId &&
    canUseCostingActions &&
    isCostingPricingView &&
    hasPricingBomUpload &&
    (
      pricingWorkflowState === PRICING_WORKFLOW_STATE_BOM_UPLOADED ||
      pricingWorkflowState === PRICING_WORKFLOW_STATE_REJECTED
    ) &&
    (currentUserRole === "OWNER" || currentUserRole === "COSTING_TEAM")
  );
  const canSavePricingFinalPrice = Boolean(
    canManagePricingFinalPrice &&
    hasPricingFinalPriceUpload &&
    !pricingFinalPricePending &&
    !pricingFileValidationActionId
  );
  const canValidatePricingFile = Boolean(
    rfqId &&
    canUseCostingActions &&
    isCostingPricingView &&
    hasPricingFinalPriceUpload &&
    pricingWorkflowState === PRICING_WORKFLOW_STATE_PRICING_UPLOADED &&
    !hasRecordedPricingFileDecision &&
    (currentUserRole === "OWNER" || currentUserRole === "PLM")
  );
  const pricingFileValidationButtonsDisabled = Boolean(
    !canValidatePricingFile || pricingFileValidationActionId || hasRecordedPricingFileDecision
  );
  const showPricingFileValidationSection = Boolean(
    hasPricingFinalPriceUpload &&
    (
      pricingFileValidationOpen ||
      hasRecordedPricingFileDecision ||
      pricingWorkflowState === PRICING_WORKFLOW_STATE_PRICING_UPLOADED
    )
  );
  const knownCostingRecipients = useMemo(() => {
    const candidates = [
      currentUserEmail,
      rfqCreatorEmail,
      form.validatorEmail,
      ...costingDiscussionMessages.map((message) => message.authorEmail),
      ...costingDiscussionMessages.map((message) => message.recipientEmail)
    ];
    return [...new Set(
      candidates
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )];
  }, [
    costingDiscussionMessages,
    currentUserEmail,
    form.validatorEmail,
    rfqCreatorEmail
  ]);
  const isRfqFormReadOnly =
    hasValidationLock && !rfqFormEditEnabled;
  const lockNewRfqFields = !isRevisionModeActive;
  const potentialFieldReadOnly = true;
  const isOfferChatReadOnly =
    !canUseOfferActions || isOfferValidationLocked;
  const isChatLocked =
    isOfferStage
      ? isOfferChatReadOnly
      : (
        isChatOnly ||
        !canUseRfqActions ||
        hasValidationLock ||
        proceedingToFormalRfq ||
        isPotentialAssistantLocked
      );
  const chatReadOnlyMessage =
    isOfferStage
      ? !canUseOfferActions
        ? "This offer phase is read-only for your role"
        : "Offer preparation is read-only while the RFQ is in offer validation"
      : !canUseRfqActions
      ? "This phase is read-only for your role"
      : isPotentialAssistantLocked && activeRfqTab === "potential"
        ? "Potential assistant is locked because this RFQ has already been promoted to New RFQ."
        : "Chat is locked once the RFQ enters validation";
  const rfqFormFieldReadOnly =
    !canUseRfqActions || lockNewRfqFields || isChatOnly || isRfqFormReadOnly;
  const allowFileUpload = !saving && !rfqFormFieldReadOnly;
  const showRfqStepNavigation =
    activeRfqTab === "new" && isRfqStage && isRfqFormView;
  const showChatPanel =
    (isRfqStage && !isRfqValidationView && activeRfqTab !== "files") ||
    isOfferStage;
  const activeDiscussionPhase = useMemo(() => {
    if (activeRfqTab === "potential") return "POTENTIAL";
    if (activeRfqTab === "new") return "NEW_RFQ";
    return rfqSubStatus || (isPotentialDraft ? "POTENTIAL" : "NEW_RFQ");
  }, [activeRfqTab, isPotentialDraft, rfqSubStatus]);
  const canParticipateInDiscussion = Boolean(
    canUseRfqActions && (currentUserEmail || currentUserRole)
  );
  const canParticipateInCostingDiscussion = Boolean(
    canUseCostingActions && (currentUserEmail || currentUserRole)
  );
  const getNextIncompleteStepId = (stepId, completionMap = stepCompletion) => {
    const currentIndex = stepIds.indexOf(stepId);
    if (currentIndex < 0 || currentIndex >= stepIds.length - 1) {
      return "";
    }

    for (let index = currentIndex + 1; index < stepIds.length; index += 1) {
      const candidateStepId = stepIds[index];
      if (!completionMap[candidateStepId]) {
        return candidateStepId;
      }
    }

    return stepIds[currentIndex + 1] || "";
  };
  const handleStepViewChange = (stepId) => {
    const targetIndex = stepIds.indexOf(stepId);
    if (targetIndex < 0 || targetIndex > highestUnlockedStepIndex) {
      return;
    }
    setActiveStep(stepId);
    if (isRfqValidationView) {
      setSelectedStage("RFQ");
      setSelectedSubPhase("RFQ form");
    }
  };

  useEffect(() => {
    const nextSelectedStage = normalizePipelineStageKey(activeStage);
    if (nextSelectedStage) {
      if (persistValidationView || persistCostingReviewView) {
        return;
      }
      setSelectedStage(nextSelectedStage);
      setSelectedSubPhase(getActiveDisplaySubPhase(nextSelectedStage));
    }
  }, [
    activeStage,
    hasRecordedValidationDecision,
    holdSelfValidationPrompt,
    isRevisionModeActive,
    persistValidationView,
    persistCostingReviewView
  ]);

  useEffect(() => {
    const nextSelectedStage = normalizePipelineStageKey(activeStage);
    if (nextSelectedStage && selectedStage === nextSelectedStage) {
      if (persistValidationView && selectedStage === "RFQ") {
        return;
      }
      if (persistCostingReviewView && selectedStage === "In costing") {
        return;
      }
      setSelectedSubPhase(getActiveDisplaySubPhase(nextSelectedStage));
    }
  }, [
    activeSubPhase,
    allStepsComplete,
    activeStage,
    holdSelfValidationPrompt,
    isRevisionModeActive,
    selectedStage,
    persistValidationView,
    persistCostingReviewView
  ]);

  useEffect(() => {
    setRfqFormEditEnabled(false);
    setRfqValidationReached(false);
    setPersistValidationView(false);
    setPersistCostingReviewView(false);
    setPricingFileDecisionAudit(createEmptyValidationAudit());
    setPendingRfqAutofillReveal(null);
    setSelfValidationPromptOpen(false);
    setSelfValidationPromptSignature("");
    setHoldSelfValidationPrompt(false);
    setRevisionRequestModalOpen(false);
    setRevisionComment("");
    setRevisionActionId("");
    setOptimisticRevisionMode(false);
  }, [rfqId]);

  useEffect(() => {
    if (isRevisionModeActive) {
      setRfqValidationReached(false);
      return;
    }
    if (activeSubPhase === "Validation") {
      setRfqValidationReached(true);
    }
  }, [activeSubPhase, isRevisionModeActive]);

  useEffect(() => {
    if (!pendingRfqAutofillReveal) {
      return;
    }

    if (activeRfqTab !== "new") {
      setActiveRfqTab("new");
      return;
    }

    if (selectedStage !== "RFQ") {
      setSelectedStage("RFQ");
      return;
    }

    if (selectedSubPhase !== "RFQ form") {
      setSelectedSubPhase("RFQ form");
      return;
    }

    if (activeStep !== pendingRfqAutofillReveal.stepId) {
      setActiveStep(pendingRfqAutofillReveal.stepId);
      return;
    }

    let canceled = false;
    let retryTimer = 0;
    let highlightTimer = 0;

    const revealTarget = (attempt = 0) => {
      if (canceled) {
        return;
      }

      const fieldElement =
        pendingRfqAutofillReveal.mode === "field" &&
          pendingRfqAutofillReveal.fieldName
          ? document.getElementsByName(pendingRfqAutofillReveal.fieldName)?.[0]
          : null;
      const sectionElement = document.getElementById(pendingRfqAutofillReveal.stepId);
      const targetElement =
        pendingRfqAutofillReveal.mode === "field"
          ? fieldElement?.closest("label") || fieldElement || sectionElement
          : sectionElement;

      if (!targetElement) {
        if (attempt >= 6) {
          setPendingRfqAutofillReveal(null);
          return;
        }
        retryTimer = window.setTimeout(() => revealTarget(attempt + 1), 90);
        return;
      }

      targetElement.scrollIntoView({
        behavior: "smooth",
        block: pendingRfqAutofillReveal.mode === "field" ? "center" : "start"
      });

      if (pendingRfqAutofillReveal.highlight !== false) {
        targetElement.classList.add(...AUTOFILL_REVEAL_HIGHLIGHT_CLASSES.split(" "));
        highlightTimer = window.setTimeout(() => {
          targetElement.classList.remove(...AUTOFILL_REVEAL_HIGHLIGHT_CLASSES.split(" "));
        }, 1800);
      }
      setPendingRfqAutofillReveal(null);
    };

    retryTimer = window.setTimeout(() => revealTarget(0), 40);

    return () => {
      canceled = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [
    activeRfqTab,
    activeStep,
    pendingRfqAutofillReveal,
    selectedStage,
    selectedSubPhase
  ]);

  useEffect(() => {
    if (!isCostingStage || canOpenCostingPricing) {
      return;
    }
    if (selectedSubPhase === "Pricing") {
      setSelectedSubPhase("Feasability");
    }
  }, [canOpenCostingPricing, isCostingStage, selectedSubPhase]);

  useEffect(() => {
    if (selectedStage === "Offer" && selectedSubPhase === "Offer validation") {
      setSelectedSubPhase("Offer preparation");
    }
  }, [selectedStage, selectedSubPhase]);

  useEffect(() => {
    const previousCompletion = previousStepCompletionRef.current;
    const nextStepCompletion = getRfqStepCompletionMap(form);
    const hadPreviousValue = Object.prototype.hasOwnProperty.call(
      previousCompletion,
      activeStep
    );
    const activeStepJustCompleted =
      hadPreviousValue &&
      !previousCompletion[activeStep] &&
      Boolean(stepCompletion[activeStep]);

    if (
      activeRfqTab === "new" &&
      isRfqFormView &&
      !isRfqFormReadOnly &&
      activeStepJustCompleted
    ) {
      const nextStepId = getNextIncompleteStepId(activeStep, nextStepCompletion);
      if (nextStepId) {
        setPendingRfqAutofillReveal(buildStepRevealTarget(nextStepId));
        setActiveStep(nextStepId);
      }
    }

    previousStepCompletionRef.current = stepCompletion;
  }, [
    activeRfqTab,
    isRfqFormView,
    isRfqFormReadOnly,
    form,
    stepCompletion,
    activeStep,
    stepIndex,
    highestUnlockedStepIndex,
    allStepsComplete,
    selectedStage,
    rfqDisplaySubPhase,
    lastStepIndex
  ]);

  const canGoNext = Boolean(!isLastStep && stepIndex < highestUnlockedStepIndex);
  const prevStepId = stepIndex > 0 ? stepIds[stepIndex - 1] : "";
  const canGoPrev = Boolean(prevStepId);

  const applyRfq = (
    rfq,
    {
      syncChat = true,
      auditLogs = [],
      preserveActiveTab = false,
      revealUpdatedRfqFields = false
    } = {}
  ) => {
    if (!rfq) return;
    const subStatusValue =
      typeof rfq?.sub_status === "string" ? rfq.sub_status : rfq?.sub_status?.value;
    const isPotentialRecord = subStatusValue === "POTENTIAL";
    const isRevisionRecord = subStatusValue === "REVISION_REQUESTED";
    const mappedFields = omitUndefinedValues({
      ...mapRfqDataToForm(rfq),
      ...mapPotentialToForm(rfq?.potential)
    });
    const nextUiStatus = mapBackendStatusToUi(rfq);
    const nextPipelineStage = mapBackendStatusToPipelineStage(rfq);
    const nextValidationAudit = extractValidationAudit(rfq, auditLogs);
    const nextCostingReviewAudit = extractCostingReviewAudit(rfq, auditLogs);
    const nextCostingFileState = normalizeCostingFileState(rfq);
    const nextPricingDecisionAudit = extractPricingFileDecisionAudit(nextCostingFileState);
    const keepRfqValidationView =
      nextPipelineStage === "RFQ" &&
      nextUiStatus === "Cancelled" &&
      Boolean(nextValidationAudit.rejectedAt);
    const nextPricingBomUpload = normalizePricingBomUpload(rfq);
    const nextPricingFinalPriceUpload = normalizePricingFinalPriceUpload(rfq);
    let workflowState = String(nextCostingFileState?.workflowState || "").trim().toUpperCase();
    if (!workflowState) {
      if (nextPricingFinalPriceUpload?.file) {
        workflowState = PRICING_WORKFLOW_STATE_PRICING_UPLOADED;
      } else if (nextPricingBomUpload?.file) {
        workflowState = PRICING_WORKFLOW_STATE_BOM_UPLOADED;
      } else if (
        nextPipelineStage === "In costing" &&
        String(subStatusValue || "").trim().toUpperCase() === "PRICING"
      ) {
        workflowState = PRICING_WORKFLOW_STATE_WAITING_BOM;
      }
    }
    const showPersistedPricingValidation = Boolean(
      nextPricingFinalPriceUpload?.file &&
      [
        PRICING_WORKFLOW_STATE_PRICING_UPLOADED,
        PRICING_WORKFLOW_STATE_APPROVED,
        PRICING_WORKFLOW_STATE_REJECTED
      ].includes(workflowState)
    );
    setValidationAudit(nextValidationAudit);
    setCostingReviewAudit(nextCostingReviewAudit);
    setPricingFileDecisionAudit(nextPricingDecisionAudit);
    setCostingFiles(normalizeCostingFiles(rfq));
    setCostingFileState(nextCostingFileState);
    setPricingBomUpload(nextPricingBomUpload);
    setPricingFinalPriceUpload(nextPricingFinalPriceUpload);
    setCostingFileActionModalOpen(false);
    setCostingFileActionMode("UPLOADED");
    setCostingFileActionNote("");
    setCostingFeasibilityStatus(nextCostingFileState?.feasibilityStatus || "");
    setCostingFileActionDraft(null);
    setCostingFileActionPending(false);
    setPricingBomModalOpen(false);
    setPricingBomNote("");
    setPricingBomDraft(null);
    setPricingBomPending(false);
    setPricingFinalPriceModalOpen(false);
    setPricingFinalPriceNote("");
    setPricingFinalPriceDraft(null);
    setPricingFinalPricePending(false);
    setPricingFinalPriceSaved(showPersistedPricingValidation);
    setPricingFileValidationOpen(showPersistedPricingValidation);
    setPricingFileValidationActionId("");
    setPricingFileRejectModalOpen(false);
    setPricingFileRejectReason("");
    setCostingFeasabilitySaved(false);
    setRfqSubStatus(subStatusValue || "");
    const nextFormState = {
      ...initialForm,
      ...mappedFields,
      id: rfq.rfq_id,
      status: nextUiStatus
    };
    const isPendingValidationRecord =
      subStatusValue === "PENDING_VALIDATION" ||
      subStatusValue === "PENDING_FOR_VALIDATION";
    const nextRfqCreatorEmail = String(rfq?.created_by_email || "");
    const normalizedNextRfqCreatorEmail = normalizeEmailValue(nextRfqCreatorEmail);
    const nextAssignedValidatorEmail = normalizeEmailValue(
      nextFormState.validatorEmail || rfq?.zone_manager_email
    );
    const matchesSelfValidationPromptCase = Boolean(
      normalizedCurrentUserEmail &&
      nextPipelineStage === "RFQ" &&
      isPendingValidationRecord &&
      normalizedNextRfqCreatorEmail &&
      normalizedNextRfqCreatorEmail === normalizedCurrentUserEmail &&
      nextAssignedValidatorEmail &&
      nextAssignedValidatorEmail === normalizedCurrentUserEmail
    );
    const nextSelfValidationPromptSignature = matchesSelfValidationPromptCase
      ? buildSelfValidationPromptSignature(rfq, auditLogs)
      : "";
    const hasAcknowledgedSelfValidationPrompt =
      matchesSelfValidationPromptCase &&
      Boolean(nextSelfValidationPromptSignature) &&
      readSelfValidationPromptSignature(rfq.rfq_id) === nextSelfValidationPromptSignature;
    const shouldOpenSelfValidationPrompt =
      matchesSelfValidationPromptCase && !hasAcknowledgedSelfValidationPrompt;
    setRfqCreatorEmail(nextRfqCreatorEmail);
    setRevisionNotes(String(rfq?.revision_notes || ""));
    setDiscussionMessages([]);
    setDiscussionError("");
    setSelfValidationPromptOpen(shouldOpenSelfValidationPrompt);
    setSelfValidationPromptSignature(
      shouldOpenSelfValidationPrompt ? nextSelfValidationPromptSignature : ""
    );
    setHoldSelfValidationPrompt(shouldOpenSelfValidationPrompt);
    setPendingRfqAutofillReveal(
      revealUpdatedRfqFields ? buildRfqAutofillRevealTarget(form, nextFormState) : null
    );
    setForm(nextFormState);
    setActiveStage(nextPipelineStage);
    if (nextUiStatus === "Cancelled" || nextUiStatus === "Lost") {
      const canceledStageKey = normalizePipelineStageKey(nextPipelineStage) || nextPipelineStage || "RFQ";
      setSelectedStage(canceledStageKey);
      setSelectedSubPhase(keepRfqValidationView ? "Validation" : "");
    }
    setActiveRfqTab((prev) => {
      if (preserveActiveTab && prev === "files") {
        return prev;
      }
      return isPotentialRecord ? "potential" : "new";
    });
    if (isRevisionRecord) {
      setSelectedStage("RFQ");
      setSelectedSubPhase("RFQ form");
      setActiveStep((prev) => (stepIds.includes(prev) ? prev : "step-client"));
      setRfqValidationReached(false);
      setRfqFormEditEnabled(true);
      setPersistValidationView(false);
    } else if (nextPipelineStage === "RFQ" && nextUiStatus === "Validation") {
      setSelectedStage("RFQ");
      setSelectedSubPhase(shouldOpenSelfValidationPrompt ? "RFQ form" : "Validation");
      setActiveStep("step-notes");
      setRfqValidationReached(!shouldOpenSelfValidationPrompt);
      setRfqFormEditEnabled(false);
    }
    const normalizedFiles = normalizeRfqFiles(rfq);
    setServerFiles(normalizedFiles);
    setLocalFiles((prev) =>
      prev.filter(
        (local) =>
          !normalizedFiles.some(
            (server) =>
              server.name &&
              local.name &&
              server.name.toLowerCase() === local.name.toLowerCase()
          )
      )
    );
    if (syncChat) {
      setPotentialChatMessages((prev) =>
        mergeChatWithAttachments(
          mapChatHistory(rfq?.potential?.chat_history),
          prev
        )
      );
      setOfferChatMessages((prev) =>
        mergeChatWithAttachments(
          mapChatHistory(rfq?.offer_preparation?.chat_history),
          prev
        )
      );
      setRfqChatMessages((prev) =>
        mergeChatWithAttachments(mapChatHistory(rfq?.chat_history), prev)
      );
    }
  };

  const syncRfq = async (targetId, options = {}) => {
    const idToLoad = targetId || rfqId;
    if (!idToLoad) return false;
    setRfqError("");
    try {
      const { rfq, auditLogs } = await loadRfqSnapshot(idToLoad);
      applyRfq(rfq, { auditLogs, preserveActiveTab: true, ...options });
      return true;
    } catch (error) {
      setRfqError("Unable to refresh this RFQ. Please try again.");
      return false;
    }
  };

  const ensureRfqExists = async () => {
    if (rfqId) {
      return rfqId;
    }

    if (rfqIdParam) {
      return rfqIdParam;
    }

    if (rfqCreatePromiseRef.current) {
      return rfqCreatePromiseRef.current;
    }

    const chatMode = activeRfqTab === "potential" ? "potential" : "rfq";

    rfqCreatePromiseRef.current = createRfq({ chat_mode: chatMode })
      .then((created) => {
        setRfqId(created.rfq_id);
        applyRfq(created, { syncChat: false });
        navigate(`/rfqs/new?id=${encodeURIComponent(created.rfq_id)}`, {
          replace: true
        });
        return created.rfq_id;
      })
      .finally(() => {
        rfqCreatePromiseRef.current = null;
      });

    return rfqCreatePromiseRef.current;
  };

  useEffect(() => {
    let alive = true;

    const init = async () => {
      setLoadingRfq(true);
      setRfqError("");
      try {
        if (!rfqIdParam) {
          if (!alive) return;
          setRfqId("");
          setForm({ ...initialForm });
          setPotentialChatMessages([]);
          setRfqChatMessages([]);
          setRfqSubStatus("");
          setRevisionNotes("");
          setRevisionRequestModalOpen(false);
          setRevisionComment("");
          setRevisionActionId("");
          setOptimisticRevisionMode(false);
          setActiveStage("RFQ");
          setSelectedStage("RFQ");
          setSelectedSubPhase("RFQ form");
          setActiveRfqTab("new");
          setActiveStep("step-client");
          setServerFiles([]);
          setLocalFiles([]);
          setCostingFiles([]);
          setCostingFileState(null);
          setPricingBomUpload(null);
          setPricingFinalPriceUpload(null);
          setCostingFileActionModalOpen(false);
          setCostingFileActionMode("UPLOADED");
          setCostingFileActionNote("");
          setCostingFeasibilityStatus("");
          setCostingFileActionDraft(null);
          setCostingFileActionPending(false);
          setPricingBomModalOpen(false);
          setPricingBomNote("");
          setPricingBomDraft(null);
          setPricingBomPending(false);
          setPricingFinalPriceModalOpen(false);
          setPricingFinalPriceNote("");
          setPricingFinalPriceDraft(null);
          setPricingFinalPricePending(false);
          setPricingFinalPriceSaved(false);
          setPricingFileValidationOpen(false);
          setPricingFileValidationActionId("");
          setPricingFileDecisionAudit(createEmptyValidationAudit());
          setPricingFileRejectModalOpen(false);
          setPricingFileRejectReason("");
          setCostingFeasabilitySaved(false);
          setDiscussionMessages([]);
          setDiscussionDraft("");
          setDiscussionSending(false);
          setDiscussionLoading(false);
          setDiscussionError("");
          setDiscussionModalOpen(false);
          setCostingDiscussionMessages([]);
          setCostingDiscussionDraft("");
          setCostingDiscussionRecipient("");
          setCostingDiscussionSending(false);
          setCostingDiscussionLoading(false);
          setCostingDiscussionError("");
          setIsCostingDiscussionOpen(false);
          setRfqCreatorEmail("");
          setValidationSuccess("");
          setValidationAudit(createEmptyValidationAudit());
          setCostingReviewAudit(createEmptyValidationAudit());
          setSelfValidationPromptOpen(false);
          setSelfValidationPromptSignature("");
          setHoldSelfValidationPrompt(false);
          setRejectModalOpen(false);
          setRejectReason("");
          setRevisionRequestModalOpen(false);
          setRevisionComment("");
          setRfqFormEditEnabled(false);
          setRfqValidationReached(false);
          setPersistValidationView(false);
          setPersistCostingReviewView(false);
          setCostingSavePending(false);
          return;
        }

        const { rfq, auditLogs } = await loadRfqSnapshot(rfqIdParam);

        if (!alive) return;
        setRfqId(rfq.rfq_id);
        applyRfq(rfq, { auditLogs });
      } catch {
        if (!alive) return;
        setRfqSubStatus("");
        setRfqCreatorEmail("");
        setRevisionNotes("");
        setRevisionRequestModalOpen(false);
        setRevisionComment("");
        setRevisionActionId("");
        setOptimisticRevisionMode(false);
        setCostingFiles([]);
        setCostingFileState(null);
        setPricingBomUpload(null);
        setPricingFinalPriceUpload(null);
        setCostingFileActionModalOpen(false);
        setCostingFileActionMode("UPLOADED");
        setCostingFileActionNote("");
        setCostingFeasibilityStatus("");
        setCostingFileActionDraft(null);
        setCostingFileActionPending(false);
        setPricingBomModalOpen(false);
        setPricingBomNote("");
        setPricingBomDraft(null);
        setPricingBomPending(false);
        setPricingFinalPriceModalOpen(false);
        setPricingFinalPriceNote("");
        setPricingFinalPriceDraft(null);
        setPricingFinalPricePending(false);
        setPricingFinalPriceSaved(false);
        setPricingFileValidationOpen(false);
        setPricingFileValidationActionId("");
        setPricingFileDecisionAudit(createEmptyValidationAudit());
        setPricingFileRejectModalOpen(false);
        setPricingFileRejectReason("");
        setCostingFeasabilitySaved(false);
        setDiscussionMessages([]);
        setDiscussionError("");
        setCostingDiscussionMessages([]);
        setCostingDiscussionRecipient("");
        setCostingDiscussionError("");
        setIsCostingDiscussionOpen(false);
        setSelfValidationPromptOpen(false);
        setSelfValidationPromptSignature("");
        setHoldSelfValidationPrompt(false);
        setRfqError("Unable to load the RFQ. Please try again.");
      } finally {
        if (alive) {
          setLoadingRfq(false);
        }
      }
    };

    init();
    return () => {
      alive = false;
    };
  }, [rfqIdParam, navigate]);

  useEffect(() => {
    localFilesRef.current = localFiles;
  }, [localFiles]);

  useEffect(() => {
    let alive = true;
    const currentRfqId = rfqId || rfqIdParam;

    if (!currentRfqId || !activeDiscussionPhase) {
      setDiscussionMessages([]);
      setDiscussionLoading(false);
      setDiscussionError("");
      return () => {
        alive = false;
      };
    }

    const loadDiscussion = async () => {
      setDiscussionLoading(true);
      setDiscussionError("");
      try {
        const messages = await getRfqDiscussion(currentRfqId, activeDiscussionPhase);
        if (!alive) return;
        setDiscussionMessages(mapDiscussionMessages(messages));
      } catch (error) {
        if (!alive) return;
        setDiscussionMessages([]);
        setDiscussionError(error?.message || "Unable to load discussion.");
      } finally {
        if (alive) {
          setDiscussionLoading(false);
        }
      }
    };

    loadDiscussion();
    return () => {
      alive = false;
    };
  }, [activeDiscussionPhase, discussionModalOpen, rfqId, rfqIdParam]);

  useEffect(() => {
    let alive = true;
    const currentRfqId = rfqId || rfqIdParam;

    if (!currentRfqId || !isCostingStage) {
      setCostingDiscussionMessages([]);
      setCostingDiscussionLoading(false);
      setCostingDiscussionError("");
      return () => {
        alive = false;
      };
    }

    const loadCostingDiscussion = async () => {
      setCostingDiscussionLoading(true);
      setCostingDiscussionError("");
      try {
        const messages = await getCostingMessages(currentRfqId);
        if (!alive) return;
        setCostingDiscussionMessages(mapDiscussionMessages(messages));
      } catch (error) {
        if (!alive) return;
        setCostingDiscussionMessages([]);
        setCostingDiscussionError(
          error?.message || "Unable to load the costing discussion."
        );
      } finally {
        if (alive) {
          setCostingDiscussionLoading(false);
        }
      }
    };

    loadCostingDiscussion();
    return () => {
      alive = false;
    };
  }, [isCostingStage, rfqId, rfqIdParam]);

  useEffect(() => {
    return () => {
      localFilesRef.current.forEach((file) => {
        if (file?.url) {
          URL.revokeObjectURL(file.url);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!filePreview) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setFilePreview(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [filePreview]);

  useEffect(() => {
    return () => {
      if (filePreview?.previewUrl && filePreview.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(filePreview.previewUrl);
      }
    };
  }, [filePreview]);

  useEffect(() => {
    return () => {
      if (templatePreviewUrl) {
        window.URL.revokeObjectURL(templatePreviewUrl);
      }
    };
  }, [templatePreviewUrl]);

  useEffect(() => {
    setTemplatePreviewFilename("");
    setTemplatePreviewModalOpen(false);
    setCostingReviewActionId("");
    setCostingRejectModalOpen(false);
    setCostingRejectReason("");
    setCostingSavePending(false);
    setTemplatePreviewUrl((current) => {
      if (current) {
        window.URL.revokeObjectURL(current);
      }
      return "";
    });
    if (offerTemplateViewerRef.current) {
      offerTemplateViewerRef.current.innerHTML = "";
    }
    setOfferTemplateReady(false);
    setOfferTemplateFilename("");
    setOfferTemplatePreviewPending(false);
    setOfferTemplateDownloadPending(false);
  }, [rfqId]);

  useEffect(() => {
    if (!rfqId || !isOfferPreparationView) return;
    loadOfferTemplatePreview();
  }, [
    form.contactEmail,
    form.contactName,
    form.contactPhone,
    form.customer,
    form.customerPn,
    form.expectedDeliveryConditions,
    form.expectedPaymentTerms,
    form.productName,
    form.projectName,
    form.qtyPerYear,
    form.revisionLevel,
    form.sop,
    form.targetPrice,
    form.targetPriceCurrency,
    form.targetPriceLocal,
    form.typeOfPackaging,
    isOfferPreparationView,
    rfqId
  ]);

  const handleChange = (event) => {
    if (activeRfqTab === "potential" && potentialFieldReadOnly) {
      return;
    }
    if (activeRfqTab === "new" && rfqFormFieldReadOnly) {
      return;
    }
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleFilesChange = async (event) => {
    if (!allowFileUpload) {
      if (rfqFileInputRef.current) {
        rfqFileInputRef.current.value = "";
      }
      return;
    }
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    let currentRfqId = rfqId;
    try {
      currentRfqId = await ensureRfqExists();
    } catch {
      if (rfqFileInputRef.current) {
        rfqFileInputRef.current.value = "";
      }
      setRfqError("Unable to create the RFQ before uploading files.");
      return;
    }
    const newLocalFiles = files.map((file) => ({
      id: `local-${file.name}-${file.size}-${file.lastModified}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      name: file.name,
      url: URL.createObjectURL(file),
      file,
      source: "local",
      size: file.size,
      updatedAt: file.lastModified ? new Date(file.lastModified).toISOString() : "",
      owner: currentUserLabel
    }));
    setLocalFiles((prev) => [...prev, ...newLocalFiles]);
    if (rfqFileInputRef.current) {
      rfqFileInputRef.current.value = "";
    }

    setSaving(true);
    try {
      for (const file of files) {
        await uploadRfqFile(currentRfqId, file);
      }
      await syncRfq(currentRfqId);
    } catch {
      setRfqError("Unable to upload file. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewFile = async (file) => {
    if (!file?.url) return;
    if (file.source === "local") {
      setFilePreview(file);
      return;
    }
    const resolvedUrl = resolveFileUrl(file.url);
    if (!resolvedUrl) return;
    if (/^https?:\/\//i.test(resolvedUrl)) {
      setFilePreview({ ...file, previewUrl: resolvedUrl });
      return;
    }
    setFilePreviewLoadingId(file.id);
    try {
      const response = await authorizedFetch(resolvedUrl, {
        prependApiBase: false
      });
      if (!response.ok) {
        throw new Error("Preview failed");
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      setFilePreview({ ...file, previewUrl: blobUrl });
    } catch {
      setRfqError("Unable to preview this file. Please try again.");
    } finally {
      setFilePreviewLoadingId("");
    }
  };

  const handleRemoveLocalFile = (fileId) => {
    setLocalFiles((prev) => {
      const target = prev.find((item) => item.id === fileId);
      if (target?.url) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((item) => item.id !== fileId);
    });
  };

  const handleDeleteFile = async (file) => {
    if (!file) return;
    if (!canUseRfqActions) return;
    if (file.source === "local") {
      handleRemoveLocalFile(file.id);
      return;
    }
    if (!rfqId) return;
    setFileActionId(file.id);
    try {
      await deleteRfqFile(rfqId, file.id, file.name);
      await syncRfq(rfqId);
    } catch {
      setRfqError("Unable to delete this file. Please try again.");
    } finally {
      setFileActionId("");
    }
  };

  const handleConfirmDelete = async () => {
    if (!fileDeleteTarget) return;
    const target = fileDeleteTarget;
    setFileDeleteTarget(null);
    await handleDeleteFile(target);
  };

  const renderFilePreview = (file) => {
    const previewUrl = file?.previewUrl || file?.url || "";
    if (!previewUrl) {
      return (
        <div className="chat-modal-fallback">
          <p>Preview not available for this file.</p>
        </div>
      );
    }
    const kind = getFileKind(file);
    if (kind === "image") {
      return <img src={previewUrl} alt={file.name} className="chat-modal-image" />;
    }
    if (kind === "pdf" || kind === "text") {
      return (
        <iframe
          title={file.name}
          src={previewUrl}
          className="chat-modal-frame"
        />
      );
    }
    return (
      <div className="chat-modal-fallback">
        <p>Preview not available for this file type.</p>
        <div className="chat-modal-actions">
          <a
            className="outline-button px-3 py-2 text-xs"
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open in new tab
          </a>
          <a className="outline-button px-3 py-2 text-xs" href={previewUrl} download={file.name}>
            Download
          </a>
        </div>
      </div>
    );
  };

  const handleStageChange = (stageKey) => {
    setPersistValidationView(false);
    setPersistCostingReviewView(false);
    setSelectedStage(stageKey);
    const stage = PIPELINE_STAGES.find((entry) => entry.key === stageKey);
    setSelectedSubPhase(
      stageKey === groupedActiveStage
        ? getActiveDisplaySubPhase(stageKey)
        : stage?.subPhases?.[0] || ""
    );
  };

  const handleConfirmSelfValidationPrompt = () => {
    const targetRfqId = rfqId || form.id;
    if (targetRfqId && selfValidationPromptSignature) {
      writeSelfValidationPromptSignature(targetRfqId, selfValidationPromptSignature);
    }
    setSelfValidationPromptOpen(false);
    setSelfValidationPromptSignature("");
    setHoldSelfValidationPrompt(false);
    setPersistValidationView(false);
    setActiveRfqTab("new");
    setSelectedStage("RFQ");
    setSelectedSubPhase("Validation");
    setActiveStep("step-notes");
    setRfqValidationReached(true);
    setRfqFormEditEnabled(false);
  };

  const handleSubPhaseChange = (stageKey, subPhase) => {
    setPersistValidationView(false);
    setPersistCostingReviewView(false);
    if (
      stageKey === "RFQ" &&
      subPhase === "Validation" &&
      !canOpenRfqValidation
    ) {
      return;
    }
    if (
      stageKey === "In costing" &&
      subPhase === "Pricing" &&
      !canOpenCostingPricing
    ) {
      return;
    }
    if (stageKey === "Offer" && subPhase === "Offer validation") {
      return;
    }
    if (stageKey === "RFQ" && subPhase === "Validation") {
      setRfqValidationReached(true);
      setRfqFormEditEnabled(false);
    }
    setSelectedStage(stageKey);
    setSelectedSubPhase(subPhase);
    if (stageKey === "RFQ") {
      if (subPhase === "Validation") {
        setActiveStep("step-notes");
      } else if (subPhase === "RFQ form" && activeStep === "step-notes") {
        setActiveStep("step-client");
      }
    }
  };

  const handleResizeStart = (event) => {
    if (chatCollapsed) return;
    resizeState.current = { startX: event.clientX, startWidth: chatWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handleResizeMove);
    window.addEventListener("pointerup", handleResizeEnd);
  };

  const handleResizeMove = (event) => {
    const delta = resizeState.current.startX - event.clientX;
    const nextWidth = Math.min(
      maxChatWidth,
      Math.max(minChatWidth, resizeState.current.startWidth + delta)
    );
    setChatWidth(nextWidth);
  };

  const handleResizeEnd = () => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", handleResizeMove);
    window.removeEventListener("pointerup", handleResizeEnd);
  };

  const handleRfqChatEdit = async (visibleMessageIndex, message) => {
    if (!canUseRfqActions) return false;
    const trimmedMessage = String(message || "").trim();
    if (!trimmedMessage) return false;

    let currentRfqId = rfqId;
    try {
      currentRfqId = await ensureRfqExists();
    } catch {
      setRfqError("Unable to update this chat message right now.");
      return false;
    }

    const previousMessages = rfqChatMessages;
    const nextMessages = rfqChatMessages.slice(0, visibleMessageIndex);
    setRfqError("");
    setRfqChatMessages([
      ...nextMessages,
      { role: "user", content: trimmedMessage }
    ]);

    let finalAssistantResponse = "";
    try {
      const reply = await editRfqChatMessage(currentRfqId, {
        visibleMessageIndex,
        message: trimmedMessage
      });
      finalAssistantResponse = String(reply?.response || "");
    } catch (error) {
      setRfqChatMessages(previousMessages);
      setRfqError(error?.message || "Unable to update this chat message.");
      return false;
    }

    const synced = await syncRfq(currentRfqId, {
      revealUpdatedRfqFields: true
    });
    if (!synced && finalAssistantResponse) {
      setRfqChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: finalAssistantResponse }
      ]);
    }
    return true;
  };

  const handleOfferChatEdit = async (visibleMessageIndex, message) => {
    if (!canUseOfferActions) return false;
    const trimmedMessage = String(message || "").trim();
    if (!trimmedMessage) return false;

    let currentRfqId = rfqId;
    try {
      currentRfqId = await ensureRfqExists();
    } catch {
      setRfqError("Unable to update this offer chat message right now.");
      return false;
    }

    const previousMessages = offerChatMessages;
    const nextMessages = offerChatMessages.slice(0, visibleMessageIndex);
    setRfqError("");
    setOfferChatMessages([
      ...nextMessages,
      { role: "user", content: trimmedMessage }
    ]);

    let finalAssistantResponse = "";
    try {
      const reply = await editOfferChatMessage(currentRfqId, {
        visibleMessageIndex,
        message: trimmedMessage
      });
      finalAssistantResponse = String(reply?.response || "");
      if (reply?.rfq) {
        applyRfq(reply.rfq);
      }
    } catch (error) {
      setOfferChatMessages(previousMessages);
      setRfqError(error?.message || "Unable to update this offer chat message.");
      return false;
    }

    const synced = await syncRfq(currentRfqId);
    await loadOfferTemplatePreview();
    if (!synced && finalAssistantResponse) {
      setOfferChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: finalAssistantResponse }
      ]);
    }
    return true;
  };

  const handleChatSend = async (message, attachments = []) => {
    if (isOfferStage ? !canUseOfferActions : !canUseRfqActions) return;
    const activeChatMode =
      activeRfqTab === "potential"
        ? "potential"
        : isOfferStage
          ? "offer"
          : "rfq";
    const setActiveChatMessages =
      activeChatMode === "potential"
        ? setPotentialChatMessages
        : activeChatMode === "offer"
          ? setOfferChatMessages
          : setRfqChatMessages;
    const trimmedMessage = message ? message.trim() : "";
    const attachmentNames = (attachments || [])
      .map((attachment) => attachment.name || attachment.file?.name)
      .filter(Boolean);
    const fallbackMessage = attachmentNames.length
      ? `Attached file${attachmentNames.length > 1 ? "s" : ""}: ${attachmentNames.join(", ")}`
      : "";
    const displayMessage = trimmedMessage || fallbackMessage;
    const payloadMessage = trimmedMessage || fallbackMessage;

    setActiveChatMessages((prev) => [
      ...prev,
      { role: "user", content: displayMessage, attachments }
    ]);

    let currentRfqId = rfqId;
    try {
      currentRfqId = await ensureRfqExists();
    } catch {
      setActiveChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I couldn't create the RFQ record. Please retry in a moment."
        }
      ]);
      return;
    }

    const fileAttachments = (attachments || []).filter((attachment) => attachment?.file);
    if (fileAttachments.length) {
      const newLocalFiles = fileAttachments.map((attachment) => ({
        id:
          attachment.id ||
          `local-${attachment.file.name}-${attachment.file.size}-${attachment.file.lastModified}`,
        name: attachment.name || attachment.file.name,
        url: attachment.url || URL.createObjectURL(attachment.file),
        file: attachment.file,
        source: "local",
        size: attachment.file.size,
        updatedAt: attachment.file.lastModified
          ? new Date(attachment.file.lastModified).toISOString()
          : "",
        owner: currentUserLabel
      }));
      setLocalFiles((prev) => [...prev, ...newLocalFiles]);
      setSaving(true);
      try {
        for (const attachment of fileAttachments) {
          await uploadRfqFile(currentRfqId, attachment.file);
        }
      } catch {
        setRfqError("Unable to upload file. Please try again.");
        setActiveChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "File upload failed. Please try again."
          }
        ]);
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }

    if (!payloadMessage) {
      await syncRfq(currentRfqId);
      return;
    }

    let shouldAutoRedirect = false;
    let finalAssistantResponse = "";
    let replyRfq = null;
    try {
      const reply =
        activeChatMode === "potential"
          ? await sendPotentialChat(currentRfqId, payloadMessage)
          : activeChatMode === "offer"
            ? await sendOfferChat(currentRfqId, payloadMessage, attachmentNames)
            : await sendChat(currentRfqId, payloadMessage, activeChatMode);
      shouldAutoRedirect = Boolean(reply?.auto_redirect);
      finalAssistantResponse = String(reply?.response || "");
      replyRfq = reply?.rfq || null;
      if (replyRfq) {
        applyRfq(replyRfq, {
          revealUpdatedRfqFields: activeChatMode !== "potential"
        });
      }
    } catch {
      setActiveChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I couldn't reach the server. Please retry in a moment."
        }
      ]);
    } finally {
      const synced = await syncRfq(currentRfqId, {
        revealUpdatedRfqFields: activeChatMode !== "potential" && !replyRfq
      });
      if (activeChatMode === "offer" && currentRfqId) {
        await loadOfferTemplatePreview();
      }
      if (!synced && finalAssistantResponse && !replyRfq) {
        setActiveChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: finalAssistantResponse }
        ]);
      }
      if (shouldAutoRedirect) {
        navigate(`/rfqs/new?id=${encodeURIComponent(currentRfqId)}`);
      }
    }
  };

  const handleProceedToFormalRfq = async () => {
    if (!canUseRfqActions) return;
    let currentRfqId = rfqId;
    setRfqError("");

    try {
      currentRfqId = await ensureRfqExists();
    } catch {
      setRfqError("Unable to create the draft before proceeding to the formal RFQ.");
      return;
    }

    setProceedingToFormalRfq(true);
    try {
      const updatedRfq = await proceedToFormalRfq(currentRfqId);
      applyRfq(updatedRfq);
      setActiveRfqTab("new");
      setSelectedStage("RFQ");
      setSelectedSubPhase("RFQ form");
      setValidationSuccess("Potential saved and promoted to the formal RFQ.");
    } catch (error) {
      setRfqError(error?.message || "Unable to proceed to the formal RFQ.");
    } finally {
      setProceedingToFormalRfq(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!rfqId || !canUseRfqActions) return;
    setSaving(true);
    try {
      await syncRfq(rfqId);
    } finally {
      setSaving(false);
    }
  };

  const handleCloseRevisionRequestModal = () => {
    if (revisionActionId === "request") return;
    setRevisionRequestModalOpen(false);
    setRevisionComment("");
  };

  const handleSubmitRevisionRequest = async () => {
    if (!rfqId || revisionActionId) return;
    const comment = String(revisionComment || "").trim();
    if (!comment) {
      setRfqError("Please provide revision instructions.");
      return;
    }

    setRevisionActionId("request");
    setRfqError("");
    try {
      const updatedRfq = await requestRevision(rfqId, { comment });
      const auditLogs = await getRfqAuditLogs(rfqId).catch(() => []);
      applyRfq(updatedRfq, { auditLogs, preserveActiveTab: true });
      setRevisionRequestModalOpen(false);
      setRevisionComment("");
      showToast("Revision requested successfully.", {
        type: "success",
        title: "Revision requested"
      });
    } catch (error) {
      setRfqError(error?.message || "Unable to request a revision.");
    } finally {
      setRevisionActionId("");
    }
  };

  const handleSubmitRevisionUpdates = async () => {
    if (!rfqId || revisionActionId || !canUseRfqActions) return;
    setRevisionActionId("submit");
    setRfqError("");
    try {
      await updateRfqData(rfqId, buildRfqDataPayloadFromForm(form));
      const updatedRfq = await submitRevision(rfqId);
      const auditLogs = await getRfqAuditLogs(rfqId).catch(() => []);
      applyRfq(updatedRfq, { auditLogs });
      showToast("Updates submitted for validation.", {
        type: "success",
        title: "Updates submitted"
      });
    } catch (error) {
      setRfqError(error?.message || "Unable to submit updates.");
    } finally {
      setRevisionActionId("");
      setOptimisticRevisionMode(false);
    }
  };

  const handleValidationUpdate = async () => {
    if (!rfqId) return;
    setRfqError("");
    if (currentUserRole !== "OWNER" && !isAssignedValidatorUser) {
      showToast("Only the assigned validator or the owner can request revisions.", {
        type: "error",
        title: "Access denied"
      });
      return;
    }

    if (!isAssignedValidatorUser) {
      setRevisionComment("");
      setRevisionRequestModalOpen(true);
      return;
    }

    setOptimisticRevisionMode(true);
    setRfqFormEditEnabled(true);
    setPersistValidationView(false);
    setActiveRfqTab("new");
    setSelectedStage("RFQ");
    setSelectedSubPhase("RFQ form");
    setActiveStep((prev) => (stepIds.includes(prev) ? prev : "step-client"));
    setRevisionNotes("");
    setRevisionActionId("self");

    try {
      const updatedRfq = await requestRevision(rfqId, {
        comment: SELF_REVISION_REQUEST_COMMENT
      });
      const auditLogs = await getRfqAuditLogs(rfqId).catch(() => []);
      applyRfq(updatedRfq, { auditLogs, preserveActiveTab: true });
      showToast("Revision mode enabled. Update the RFQ and submit your changes when ready.", {
        type: "success",
        title: "Revision mode"
      });
    } catch (error) {
      setOptimisticRevisionMode(false);
      await syncRfq(rfqId);
      setRfqError(error?.message || "Unable to enable revision mode.");
    } finally {
      setRevisionActionId("");
      setOptimisticRevisionMode(false);
    }
  };

  const handleApproveValidation = async () => {
    if (!rfqId) return;
    setValidationActionId("approve");
    setValidationSuccess("");
    setRfqError("");
    try {
      await validateRfq(rfqId, { approved: true });
      await syncRfq(rfqId);
      setPersistValidationView(false);
      setSelectedStage("In costing");
      setSelectedSubPhase("Feasability");
      setValidationSuccess("RFQ approved successfully.");
    } catch (error) {
      setRfqError(error?.message || "Unable to approve this RFQ.");
    } finally {
      setValidationActionId("");
    }
  };

  const loadCostingTemplatePreview = async () => {
    if (!rfqId || templatePreviewPending) return null;
    if (templatePreviewUrl) {
      return {
        url: templatePreviewUrl,
        filename: templatePreviewFilename || templateDefaultFilename
      };
    }

    setTemplatePreviewPending(true);
    setRfqError("");
    try {
      const { blob, filename } = await downloadCostingTemplate(rfqId);
      const nextUrl = window.URL.createObjectURL(blob);
      const nextFilename = filename || templateDefaultFilename;
      setTemplatePreviewFilename(nextFilename);
      setTemplatePreviewUrl((current) => {
        if (current) {
          window.URL.revokeObjectURL(current);
        }
        return nextUrl;
      });
      return { url: nextUrl, filename: nextFilename };
    } catch (error) {
      setRfqError(error?.message || "Unable to load the RFQ data PDF preview.");
      return null;
    } finally {
      setTemplatePreviewPending(false);
    }
  };

  const handleOpenCostingPdfPreview = async () => {
    if (!canDownloadCostingTemplate || templatePreviewPending) return;
    const template = templatePreviewUrl
      ? {
        url: templatePreviewUrl,
        filename: templatePreviewFilename || templateDefaultFilename
      }
      : await loadCostingTemplatePreview();
    if (!template?.url) {
      return;
    }
    setTemplatePreviewModalOpen(true);
  };

  const handleDownloadCostingPdfTemplate = async () => {
    if (!rfqId || templateDownloadPending) return;
    setTemplateDownloadPending(true);
    try {
      const template = templatePreviewUrl
        ? {
          url: templatePreviewUrl,
          filename: templatePreviewFilename || templateDefaultFilename
        }
        : await loadCostingTemplatePreview();
      if (!template?.url) {
        return;
      }
      const link = document.createElement("a");
      link.href = template.url;
      link.download = template.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      setTemplateDownloadPending(false);
    }
  };

  const loadOfferTemplatePreview = async () => {
    if (!rfqId || offerTemplatePreviewPending) return null;
    setOfferTemplatePreviewPending(true);
    setRfqError("");
    try {
      const { blob, filename } = await downloadOfferTemplate(rfqId);
      const nextFilename = String(filename || "offer_preparation_template.docx");
      if (offerTemplateViewerRef.current) {
        offerTemplateViewerRef.current.innerHTML = "";
        const buffer = await blob.arrayBuffer();
        await renderAsync(buffer, offerTemplateViewerRef.current, undefined, {
          className: "offer-docx",
          inWrapper: true,
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderAltChunks: true,
          useBase64URL: true
        });
      }
      setOfferTemplateReady(true);
      setOfferTemplateFilename(nextFilename);
      return { filename: nextFilename };
    } catch (error) {
      if (offerTemplateViewerRef.current) {
        offerTemplateViewerRef.current.innerHTML = "";
      }
      setOfferTemplateReady(false);
      setRfqError(error?.message || "Unable to load the offer preparation preview.");
      return null;
    } finally {
      setOfferTemplatePreviewPending(false);
    }
  };

  const handleDownloadOfferPreparationTemplate = async () => {
    if (!rfqId || offerTemplateDownloadPending) return;
    setOfferTemplateDownloadPending(true);
    setRfqError("");
    try {
      const { blob, filename } = await downloadOfferTemplate(rfqId);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename || offerTemplateFilename || "offer_preparation_template.docx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setRfqError(error?.message || "Unable to download the offer preparation document.");
    } finally {
      setOfferTemplateDownloadPending(false);
    }
  };

  const handleApproveCostingReview = async () => {
    if (!rfqId || costingReviewActionId || !canReviewCostingFeasability) return;
    setCostingReviewActionId("approve");
    setValidationSuccess("");
    setRfqError("");
    try {
      await submitCostingReview(rfqId, { scope: true });
      await syncRfq(rfqId);
      setPersistCostingReviewView(true);
      setSelectedStage("In costing");
      setSelectedSubPhase("Feasability");
      setValidationSuccess(
        "Feasibility approved. Upload the file or mark it as not applicable, then click Save to move to pricing."
      );
    } catch (error) {
      setRfqError(error?.message || "Unable to approve this feasibility review.");
    } finally {
      setCostingReviewActionId("");
    }
  };

  const handleRejectCostingReview = () => {
    if (costingReviewActionId || !canReviewCostingFeasability) return;
    setValidationSuccess("");
    setRfqError("");
    setCostingRejectModalOpen(true);
  };

  const handleCloseCostingRejectModal = () => {
    if (costingReviewActionId === "reject") return;
    setCostingRejectModalOpen(false);
    setCostingRejectReason("");
    setRfqError("");
  };

  const handleConfirmCostingRejectReview = async () => {
    if (!rfqId || !canReviewCostingFeasability) return;
    if (!String(costingRejectReason || "").trim()) {
      setRfqError("Please provide a rejection reason.");
      return;
    }
    setCostingReviewActionId("reject");
    setValidationSuccess("");
    setRfqError("");
    try {
      await submitCostingReview(rfqId, {
        scope: false,
        rejection_reason: String(costingRejectReason).trim()
      });
      await syncRfq(rfqId);
      setPersistCostingReviewView(true);
      setSelectedStage("In costing");
      setSelectedSubPhase("Feasability");
      setCostingRejectModalOpen(false);
      setCostingRejectReason("");
      setValidationSuccess("Feasibility rejected successfully.");
    } catch (error) {
      setRfqError(error?.message || "Unable to reject this feasibility review.");
    } finally {
      setCostingReviewActionId("");
    }
  };

  const openCostingFileActionModal = (mode) => {
    if (!canManageCostingFeasibilityHandoff || costingSavePending || costingFileActionPending) {
      return;
    }
    setRfqError("");
    setCostingFileActionMode(mode);
    setCostingFileActionNote("");
    setCostingFileActionDraft(null);
    setCostingFileActionModalOpen(true);
  };

  const handleCloseCostingFileActionModal = () => {
    if (costingFileActionPending) return;
    setCostingFileActionModalOpen(false);
    setCostingFileActionMode("UPLOADED");
    setCostingFileActionNote("");
    setCostingFileActionDraft(null);
  };

  const handleCostingFileDraftChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    setCostingFileActionDraft(nextFile);
  };

  const handleSubmitCostingFileAction = async (event) => {
    event.preventDefault();
    if (!rfqId || costingFileActionPending || !canManageCostingFeasibilityHandoff) return;

    const trimmedNote = String(costingFileActionNote || "").trim();
    if (!trimmedNote) {
      setRfqError("Please provide a note for this costing action.");
      return;
    }
    if (!costingFeasibilityStatus) {
      setRfqError("Please select the feasibility status before submitting.");
      return;
    }
    if (costingFileActionMode === "UPLOADED" && !costingFileActionDraft) {
      setRfqError("Please choose the completed feasibility file before submitting.");
      return;
    }

    setCostingFileActionPending(true);
    setRfqError("");

    try {
      await submitCostingFileAction(rfqId, {
        action: costingFileActionMode,
        note: trimmedNote,
        feasibilityStatus: costingFeasibilityStatus,
        file: costingFileActionMode === "UPLOADED" ? costingFileActionDraft : null
      });
      await syncRfq(rfqId);
      setCostingFileActionModalOpen(false);
      setCostingFileActionMode("UPLOADED");
      setCostingFileActionNote("");
      setCostingFileActionDraft(null);
      showToast(
        costingFileActionMode === "NA"
          ? "Marked as not applicable with your note."
          : "Feasibility file submitted successfully.",
        {
          type: "success",
          title: "Costing updated"
        }
      );
    } catch (error) {
      setRfqError(error?.message || "Unable to save this costing file action.");
    } finally {
      setCostingFileActionPending(false);
    }
  };

  const openPricingBomModal = () => {
    if (!canManagePricingBom || pricingBomPending) {
      return;
    }
    setRfqError("");
    setPricingBomNote(pricingBomUpload?.note || "");
    setPricingBomDraft(null);
    setPricingBomModalOpen(true);
  };

  const handleClosePricingBomModal = () => {
    if (pricingBomPending) return;
    setPricingBomModalOpen(false);
    setPricingBomNote("");
    setPricingBomDraft(null);
  };

  const handlePricingBomDraftChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    setPricingBomDraft(nextFile);
  };

  const handleSubmitPricingBomUpload = async (event) => {
    event.preventDefault();
    if (!rfqId || pricingBomPending || !canManagePricingBom) return;

    const trimmedNote = String(pricingBomNote || "").trim();
    if (!trimmedNote) {
      setRfqError("Please provide a note for the costing BOM upload.");
      return;
    }
    if (!pricingBomDraft) {
      setRfqError("Please choose the costing file with BOM data before submitting.");
      return;
    }

    setPricingBomPending(true);
    setRfqError("");

    try {
      const updatedRfq = await uploadPricingBomFile(rfqId, {
        note: trimmedNote,
        file: pricingBomDraft
      });
      applyRfq(updatedRfq, { preserveActiveTab: true });
      setSelectedStage("In costing");
      setSelectedSubPhase("Pricing");
      setPricingBomModalOpen(false);
      setPricingBomNote("");
      setPricingBomDraft(null);
      showToast("Costing file with BOM data uploaded successfully.", {
        type: "success",
        title: "Pricing updated"
      });
    } catch (error) {
      setRfqError(error?.message || "Unable to upload the costing file with BOM data.");
    } finally {
      setPricingBomPending(false);
    }
  };

  const openPricingFinalPriceModal = () => {
    if (!canManagePricingFinalPrice || pricingFinalPricePending) {
      return;
    }
    setRfqError("");
    setPricingFinalPriceNote(pricingFinalPriceUpload?.note || "");
    setPricingFinalPriceDraft(null);
    setPricingFinalPriceModalOpen(true);
  };

  const handleClosePricingFinalPriceModal = () => {
    if (pricingFinalPricePending) return;
    setPricingFinalPriceModalOpen(false);
    setPricingFinalPriceNote("");
    setPricingFinalPriceDraft(null);
  };

  const handlePricingFinalPriceDraftChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    setPricingFinalPriceDraft(nextFile);
  };

  const handleSubmitPricingFinalPriceUpload = async (event) => {
    event.preventDefault();
    if (!rfqId || pricingFinalPricePending || !canManagePricingFinalPrice) return;

    const trimmedNote = String(pricingFinalPriceNote || "").trim();
    if (!trimmedNote) {
      setRfqError("Please provide a note for the costing final price upload.");
      return;
    }
    if (!pricingFinalPriceDraft) {
      setRfqError("Please choose the costing file with final price before submitting.");
      return;
    }

    setPricingFinalPricePending(true);
    setRfqError("");

    try {
      const updatedRfq = await uploadPricingFinalPriceFile(rfqId, {
        note: trimmedNote,
        file: pricingFinalPriceDraft
      });
      applyRfq(updatedRfq, { preserveActiveTab: true });
      setSelectedStage("In costing");
      setSelectedSubPhase("Pricing");
      setPricingFinalPriceModalOpen(false);
      setPricingFinalPriceNote("");
      setPricingFinalPriceDraft(null);
      showToast("Costing file with final price uploaded successfully.", {
        type: "success",
        title: "Pricing updated"
      });
    } catch (error) {
      setRfqError(error?.message || "Unable to upload the costing file with final price.");
    } finally {
      setPricingFinalPricePending(false);
    }
  };

  const handleSavePricingFinalPrice = () => {
    if (!canSavePricingFinalPrice) {
      if (!hasPricingFinalPriceUpload) {
        setRfqError("Upload the costing file with final price before saving.");
      }
      return;
    }
    setRfqError("");
    setValidationSuccess("");
    setPricingFinalPriceSaved(true);
    setPricingFileValidationOpen(true);
    showToast("Costing file saved. You can now validate it.", {
      type: "success",
      title: "Validation opened"
    });
  };

  const handleApprovePricingFileValidation = async () => {
    if (!rfqId || pricingFileValidationActionId || !canValidatePricingFile) return;

    setPricingFileValidationActionId("approve");
    setValidationSuccess("");
    setRfqError("");

    try {
      await submitCostingValidation(rfqId, { is_approved: true });
      await syncRfq(rfqId);
      setSelectedStage("Offer");
      setSelectedSubPhase("Offer preparation");
      setValidationSuccess("Pricing file approved. RFQ moved to offer preparation.");
    } catch (error) {
      setRfqError(error?.message || "Unable to approve this pricing file.");
    } finally {
      setPricingFileValidationActionId("");
    }
  };

  const handleRejectPricingFileValidation = () => {
    if (pricingFileValidationActionId || !canValidatePricingFile) return;
    setValidationSuccess("");
    setRfqError("");
    setPricingFileRejectModalOpen(true);
  };

  const handleClosePricingFileRejectModal = () => {
    if (pricingFileValidationActionId === "reject") return;
    setPricingFileRejectModalOpen(false);
    setPricingFileRejectReason("");
    setRfqError("");
  };

  const handleConfirmPricingFileReject = async () => {
    if (!canValidatePricingFile) return;
    const rejectionReason = String(pricingFileRejectReason || "").trim();
    if (!rejectionReason) {
      setRfqError("Please provide a rejection reason.");
      return;
    }
    setPricingFileValidationActionId("reject");
    setValidationSuccess("");
    setRfqError("");

    try {
      await submitCostingValidation(rfqId, {
        is_approved: false,
        rejection_reason: rejectionReason
      });
      await syncRfq(rfqId);
      setSelectedStage("In costing");
      setSelectedSubPhase("Pricing");
      setPricingFileRejectModalOpen(false);
      setPricingFileRejectReason("");
      showToast("Pricing file rejected successfully.", {
        type: "success",
        title: "Pricing updated"
      });
    } catch (error) {
      setRfqError(error?.message || "Unable to reject this pricing file.");
    } finally {
      setPricingFileValidationActionId("");
    }
  };

  const handleSaveCostingFeasability = async () => {
    if (!rfqId || costingSavePending || !canSaveCostingFeasability) return;
    if (!hasRecordedCostingReviewDecision || isCostingReviewRejected) {
      setRfqError("Only an approved feasibility review can be saved to pricing.");
      return;
    }
    if (!["UPLOADED", "NA"].includes(effectiveCostingFileState?.fileStatus || "")) {
      setRfqError(
        "Complete the feasibility file action by uploading the file or marking it as not applicable."
      );
      return;
    }

    setCostingSavePending(true);
    setCostingFeasabilitySaved(true);
    setValidationSuccess("");
    setRfqError("");

    try {
      await advanceRfqStatus(rfqId, {
        target_phase: "COSTING",
        target_sub_status: "PRICING"
      });

      setPersistCostingReviewView(false);
      await syncRfq(rfqId);
      setSelectedStage("In costing");
      setSelectedSubPhase("Pricing");
      setValidationSuccess("Costing moved to pricing successfully.");
    } catch (error) {
      setCostingFeasabilitySaved(false);
      setRfqError(error?.message || "Unable to move this RFQ to pricing.");
    } finally {
      setCostingSavePending(false);
    }
  };

  const handleCostingDiscussionSend = async (event) => {
    event.preventDefault();
    const content = String(costingDiscussionDraft || "").trim();
    const recipientEmail = String(costingDiscussionRecipient || "").trim();

    if (
      !content ||
      !recipientEmail ||
      costingDiscussionSending ||
      !canParticipateInCostingDiscussion
    ) {
      return;
    }

    let currentRfqId = rfqId;
    setCostingDiscussionSending(true);
    setCostingDiscussionError("");

    try {
      currentRfqId = await ensureRfqExists();
      const createdMessage = await postCostingMessage(currentRfqId, {
        message: content,
        recipient_email: recipientEmail
      });
      setCostingDiscussionMessages((prev) =>
        mapDiscussionMessages([...prev, createdMessage])
      );
      setCostingDiscussionDraft("");
      setCostingDiscussionRecipient("");
      showToast(`User ${recipientEmail} has been successfully notified.`, {
        type: "success",
        title: "Notification sent"
      });
    } catch (error) {
      setCostingDiscussionError(
        error?.message || "Unable to send this costing discussion message."
      );
    } finally {
      setCostingDiscussionSending(false);
    }
  };

  const handleRejectValidation = async () => {
    setValidationSuccess("");
    setRfqError("");
    setRejectModalOpen(true);
  };


  const handleCloseRejectModal = () => {
    if (validationActionId === "reject") return;
    setRejectModalOpen(false);
    setRejectReason("");
    setRfqError("");
  };

  const handleConfirmRejectValidation = async () => {
    if (!rfqId) return;
    if (!String(rejectReason || "").trim()) {
      setRfqError("Please provide a rejection reason.");
      return;
    }
    setValidationActionId("reject");
    setValidationSuccess("");
    setRfqError("");
    try {
      await validateRfq(rfqId, {
        approved: false,
        rejection_reason: String(rejectReason).trim()
      });
      await syncRfq(rfqId);
      setPersistValidationView(true);
      setSelectedStage("RFQ");
      setSelectedSubPhase("Validation");
      setRejectModalOpen(false);
      setRejectReason("");
      setValidationSuccess("RFQ rejected successfully.");
    } catch (error) {
      setRfqError(error?.message || "Unable to reject this RFQ.");
    } finally {
      setValidationActionId("");
    }
  };

  const handleDiscussionSend = async (event) => {
    event.preventDefault();
    const content = String(discussionDraft || "").trim();
    if (!content || discussionSending || !canParticipateInDiscussion) {
      return;
    }

    let currentRfqId = rfqId;
    const phase = activeDiscussionPhase;
    setDiscussionSending(true);
    setDiscussionError("");

    try {
      currentRfqId = await ensureRfqExists();
      const createdMessage = await postRfqDiscussion(currentRfqId, {
        phase,
        message: content
      });
      setDiscussionMessages((prev) =>
        mapDiscussionMessages([...prev, createdMessage])
      );
      setDiscussionDraft("");
    } catch (error) {
      setDiscussionError(error?.message || "Unable to send this message.");
    } finally {
      setDiscussionSending(false);
    }
  };

  return (
    <div className="min-h-screen overflow-y-auto bg-slate-100/70 flex flex-col lg:h-screen lg:overflow-hidden">
      <TopBar />

      <div className="flex flex-1 min-h-0 flex-col pt-4 pb-0 sm:pt-6 lg:pt-1 overflow-visible lg:overflow-hidden">
        <div className="w-full flex flex-1 min-h-0 flex-col overflow-visible lg:overflow-hidden">
          <div className="app-shell w-full flex flex-1 min-h-0 flex-col rounded-none border border-slate-200/70 shadow-card overflow-visible lg:overflow-hidden">
            <div className="flex flex-1 min-h-0 flex-col gap-6 lg:gap-2 overflow-visible lg:overflow-hidden">
              <div className="px-4 pt-4 sm:px-6 sm:pt-6 lg:pt-1">
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    className="back-button"
                    onClick={() => navigate("/dashboard")}
                  >
                    <span className="text-base">←</span>
                    Back
                  </button>
                  <div className="flex-1 min-w-[240px] pt-2">
                    <div className="pipeline-shell newrfq-pipeline">
                      <div className="pipeline-bar">
                        {visibleStages.map((stage, index) => {
                          const isActive = groupedActiveStage === stage.key;
                          const isSelected = selectedStage === stage.key;
                          const isCompleted = index < stageIndex;
                          const isNextPreview =
                            showNextPreview && index === stageIndex + 1;
                          const isExpanded = isSelected;
                          const effectiveSubPhase = getActiveDisplaySubPhase(stage.key);
                          const subPhaseIndex = stage.subPhases?.length
                            ? stage.subPhases.indexOf(effectiveSubPhase)
                            : -1;
                          const selectedSubPhaseForStage = isSelected
                            ? selectedSubPhase || effectiveSubPhase || stage.subPhases?.[0] || ""
                            : effectiveSubPhase;
                          const stepState = isTerminalStage && (isActive || isCompleted)
                            ? "pipeline-step-terminal"
                            : isActive
                              ? "pipeline-step-active"
                              : isCompleted
                                ? "pipeline-step-complete"
                                : "pipeline-step-idle";

                          return (
                            <div
                              key={stage.key}
                              className={`pipeline-step flex flex-col ${isExpanded ? "justify-start" : "justify-center"
                                } ${stepState} ${isNextPreview ? "cursor-not-allowed opacity-70" : ""
                                } ${isExpanded ? "pipeline-step-expanded" : ""}`}
                              aria-current={isSelected ? "step" : undefined}
                              aria-disabled={isNextPreview || undefined}
                              title={
                                stage.subPhases?.length
                                  ? `${stage.label} - ${stage.subPhases.join(" > ")}`
                                  : stage.label
                              }
                            >
                              <button
                                type="button"
                                onClick={
                                  isNextPreview ? undefined : () => handleStageChange(stage.key)
                                }
                                disabled={isNextPreview}
                                className={`flex w-full flex-col items-center border-0 bg-transparent disabled:cursor-not-allowed ${isExpanded ? "" : "flex-1 justify-center"
                                  }`}
                                aria-pressed={isSelected}
                              >
                                <span className="pipeline-step-title text-[11px] font-semibold tracking-[0.16em] sm:text-[13px]">
                                  {stage.label}
                                </span>
                              </button>
                              {isExpanded && stage.subPhases?.length ? (
                                <div
                                  className="pipeline-subphases mt-1.5 w-full px-1.5"
                                  aria-hidden={!isExpanded}
                                >
                                  <div className="relative min-h-[34px]">
                                    <div className="flex items-center gap-1.5 px-0.5">
                                      {stage.subPhases.map((subPhase, subIndex) => {
                                        const isSubComplete =
                                          isExpanded &&
                                          subPhaseIndex >= 0 &&
                                          subIndex < subPhaseIndex;
                                        const isNeutralCompletedRfqForm =
                                          isCancelledAfterRfqValidation &&
                                          stage.key === "RFQ" &&
                                          subPhase === "RFQ form";
                                        return (
                                          <span
                                            key={`segment-${subPhase}`}
                                            className={[
                                              "h-1 flex-1 rounded-full",
                                              isSubComplete
                                                ? isNeutralCompletedRfqForm
                                                  ? "bg-white/25"
                                                  : isTerminalStage
                                                    ? "bg-red-400"
                                                    : "bg-emerald-400"
                                                : "bg-white/25"
                                            ].join(" ")}
                                          />
                                        );
                                      })}
                                    </div>
                                    <div className="mt-1.5 flex items-start justify-between gap-1.5">
                                      {stage.subPhases.map((subPhase) => {
                                        const isSubActive = effectiveSubPhase === subPhase;
                                        const isSubSelected =
                                          isSelected && selectedSubPhaseForStage === subPhase;
                                        const isValidationSubPhase =
                                          stage.key === "RFQ" && subPhase === "Validation";
                                        const isPricingSubPhase =
                                          stage.key === "In costing" && subPhase === "Pricing";
                                        const isOfferValidationSubPhase =
                                          stage.key === "Offer" && subPhase === "Offer validation";
                                        const isSubDisabled =
                                          (isValidationSubPhase && !canOpenRfqValidation) ||
                                          (isPricingSubPhase && !canOpenCostingPricing) ||
                                          isOfferValidationSubPhase;
                                        const currentSubPhaseIndex =
                                          stage.subPhases.indexOf(subPhase);
                                        const isSubComplete =
                                          isActive &&
                                          subPhaseIndex >= 0 &&
                                          currentSubPhaseIndex < subPhaseIndex;
                                        const isNeutralCompletedRfqForm =
                                          isCancelledAfterRfqValidation &&
                                          stage.key === "RFQ" &&
                                          subPhase === "RFQ form";
                                        const hideTerminalSelectedBackground =
                                          isCancelledAfterRfqValidation &&
                                          stage.key === "RFQ" &&
                                          subPhase === "RFQ form";
                                        const dotClass = isSubActive
                                          ? "h-2 w-2 rounded-full bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.35)]"
                                          : isSubComplete
                                            ? isNeutralCompletedRfqForm
                                              ? "h-1.5 w-1.5 rounded-full bg-white/70"
                                              : (isTerminalStage ? "h-2 w-2 rounded-full bg-red-300" : "h-2 w-2 rounded-full bg-emerald-300")
                                            : "h-1.5 w-1.5 rounded-full bg-white/70";
                                        const labelClass = isSubActive
                                          ? "mt-0.5 max-w-[120px] text-center font-semibold leading-tight text-white"
                                          : isSubComplete
                                            ? isNeutralCompletedRfqForm
                                              ? "mt-0.5 max-w-[120px] text-center leading-tight text-white/85"
                                              : (isTerminalStage ? "mt-0.5 max-w-[120px] text-center leading-tight text-red-100" : "mt-0.5 max-w-[120px] text-center leading-tight text-emerald-50")
                                            : "mt-0.5 max-w-[120px] text-center leading-tight text-white/85";
                                        const subPhaseSelectedClass =
                                          isSubSelected && !hideTerminalSelectedBackground
                                            ? "bg-white/10"
                                            : "";
                                        const subPhaseHoverClass = isSubDisabled ? "" : "hover:bg-white/10";

                                        return (
                                          <button
                                            key={subPhase}
                                            type="button"
                                            onClick={() => handleSubPhaseChange(stage.key, subPhase)}
                                            disabled={isSubDisabled}
                                            className={`relative z-10 flex flex-1 flex-col items-center rounded-lg border-0 bg-transparent px-0.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-white/85 transition focus:outline-none focus:ring-2 focus:ring-white/30 disabled:cursor-not-allowed disabled:opacity-45 sm:text-[11px] ${subPhaseSelectedClass} ${subPhaseHoverClass}`}
                                            aria-pressed={isSubSelected}
                                            aria-disabled={isSubDisabled || undefined}
                                            title={
                                              isSubDisabled
                                                ? isValidationSubPhase
                                                  ? holdSelfValidationPrompt
                                                    ? "Confirm the validator prompt to open this tab"
                                                    : "Submit the RFQ for validation to unlock this tab"
                                                  : isOfferValidationSubPhase
                                                    ? "This tab is locked for now"
                                                  : "Complete feasibility handoff to unlock this tab"
                                                : `${stage.label} - ${subPhase}`
                                            }
                                          >
                                            <span className={dotClass} />
                                            <span className={labelClass}>{subPhase}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {isRfqStage && isRfqFormView ? (
                    <button
                      type="button"
                      onClick={() => setDiscussionModalOpen(true)}
                      className={`relative inline-flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm transition sm:h-14 sm:w-14 ${discussionModalOpen
                        ? "border-tide/30 bg-tide text-white"
                        : "border-slate-200/80 bg-white/90 text-slate-600 hover:-translate-y-0.5 hover:border-tide/35 hover:text-tide"
                        }`}
                      aria-label="Open discussion"
                      title="Open discussion"
                    >
                      <MessageSquare className="h-5 w-5" />
                      {discussionMessages.length ? (
                        <span className={`absolute -right-1.5 -top-1.5 inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${discussionModalOpen
                          ? "bg-white text-tide"
                          : "bg-coral text-white"
                          }`}>
                          {discussionMessages.length > 99 ? "99+" : discussionMessages.length}
                        </span>
                      ) : null}
                    </button>
                  ) : isCostingStage ? (
                    <button
                      type="button"
                      onClick={() => setIsCostingDiscussionOpen(true)}
                      className={`relative inline-flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm transition sm:h-14 sm:w-14 ${isCostingDiscussionOpen
                        ? "border-tide/30 bg-tide text-white"
                        : "border-slate-200/80 bg-white/90 text-slate-600 hover:-translate-y-0.5 hover:border-tide/35 hover:text-tide"
                        }`}
                      aria-label="Open costing discussion"
                      title="Open costing discussion"
                    >
                      <MessageSquare className="h-5 w-5" />
                      {costingDiscussionMessages.length ? (
                        <span className={`absolute -right-1.5 -top-1.5 inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${isCostingDiscussionOpen
                          ? "bg-white text-tide"
                          : "bg-coral text-white"
                          }`}>
                          {costingDiscussionMessages.length > 99 ? "99+" : costingDiscussionMessages.length}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                </div>
              </div>

              {isRfqStage && isRfqFormView ? (
                <div className="px-4 sm:px-6">
                  <div className="flex items-center gap-6 border-b border-slate-200/70 text-sm font-semibold text-slate-500">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isPotentialTabLocked) {
                          setActiveRfqTab("potential");
                        }
                      }}
                      disabled={isPotentialTabLocked}
                      className={`pb-1 transition disabled:cursor-not-allowed disabled:opacity-45 ${activeRfqTab === "potential"
                        ? "border-b-2 border-tide text-ink"
                        : "hover:text-ink"
                        }`}
                      title={
                        !isPotentialDraft
                          ? "Potential remains available for reference. The Potential assistant is locked once the formal RFQ begins."
                          : "Potential"
                      }
                    >
                      Potential
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isNewRfqTabLocked) {
                          setActiveRfqTab("new");
                        }
                      }}
                      disabled={isNewRfqTabLocked}
                      className={`pb-1 transition disabled:cursor-not-allowed disabled:opacity-45 ${activeRfqTab === "new"
                        ? "border-b-2 border-tide text-ink"
                        : "hover:text-ink"
                        }`}
                      title={
                        isNewRfqTabLocked
                          ? "Use Proceed to Formal RFQ to unlock this tab after starting the Potential phase."
                          : "New RFQ"
                      }
                    >
                      New RFQ
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRfqTab("files")}
                      className={`pb-1 transition ${activeRfqTab === "files"
                        ? "border-b-2 border-tide text-ink"
                        : "hover:text-ink"
                        }`}
                    >
                      Files
                    </button>
                  </div>
                </div>
              ) : null}

              {false && isRfqStage && activeRfqTab === "new" ? (
                <section className="px-4 pb-4 sm:px-6">
                  <div className="card overflow-hidden p-0">
                    <div className="flex flex-col gap-4 border-b border-slate-200/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-tide/10 text-tide">
                          <Files className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-xs uppercase tracking-[0.32em] text-slate-400">
                            Documents
                          </p>
                          <h2 className="mt-1 font-display text-xl text-ink">
                            Files ({sortedFiles.length})
                          </h2>
                          <p className="mt-1 text-sm text-slate-500">
                            Upload, review, and manage RFQ attachments in one place.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => rfqFileInputRef.current?.click()}
                          disabled={!allowFileUpload}
                        >
                          <Upload className="h-4 w-4" />
                          Add files
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-tide/20 bg-tide/5 px-4 py-2.5 text-sm font-semibold text-tide transition hover:-translate-y-0.5 hover:border-tide/35 hover:bg-tide/10 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => setFilesPanelOpen(true)}
                          disabled={!sortedFiles.length}
                        >
                          View all
                          <ChevronRight className="h-4 w-4" />
                        </button>
                        <input
                          ref={rfqFileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleFilesChange}
                          disabled={!allowFileUpload}
                        />
                      </div>
                    </div>

                    <div className="px-5 py-4">
                      {compactFiles.length ? (
                        <div className="divide-y divide-slate-200/70">
                          {compactFiles.map((file) => {
                            const canPreview = Boolean(file.url);
                            const isDeleting = fileActionId === file.id;
                            const isPreviewing = filePreviewLoadingId === file.id;
                            return (
                              <div
                                key={file.id}
                                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0 flex items-center gap-3">
                                  <span
                                    className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[11px] font-bold uppercase ${getFileAccentClasses(file.name)}`}
                                  >
                                    {getFileExtension(file.name).slice(0, 4)}
                                  </span>
                                  <div className="min-w-0">
                                    <button
                                      type="button"
                                      className={`max-w-full truncate text-left text-sm font-semibold text-tide ${canPreview ? "hover:text-ink" : "cursor-not-allowed opacity-60"}`}
                                      onClick={() => handlePreviewFile(file)}
                                      disabled={!canPreview || isPreviewing}
                                    >
                                      {file.name}
                                    </button>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {[formatFileDate(file.updatedAt), formatFileSize(file.size), getFileExtension(file.name).toLowerCase()]
                                        .filter(Boolean)
                                        .join(" ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ ")}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-tide/40 hover:text-tide disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => handlePreviewFile(file)}
                                    disabled={!canPreview || isPreviewing}
                                  >
                                    {isPreviewing ? "Loading..." : "Preview"}
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => setFileDeleteTarget(file)}
                                    disabled={isDeleting || !canUseRfqActions || isRfqFormReadOnly}
                                  >
                                    {isDeleting ? "Removing..." : "Delete"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50/70 px-5 py-8 text-center">
                          <p className="text-sm font-semibold text-ink">
                            No files attached yet
                          </p>
                          <p className="mt-2 text-sm text-slate-500">
                            Files added to this RFQ will appear here in a compact list.
                          </p>
                        </div>
                      )}
                    </div>

                    {sortedFiles.length ? (
                      <div className="border-t border-slate-200/70 px-5 py-3">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 text-sm font-semibold text-tide transition hover:text-ink"
                          onClick={() => setFilesPanelOpen(true)}
                        >
                          View all files
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <div
                className="grid w-full items-stretch gap-3 px-4 pb-0 sm:gap-4 sm:px-6 md:grid-cols-[0.42fr_1fr] lg:grid-cols-[var(--nav-col)_minmax(0,1fr)_var(--chat-col)] lg:flex-1 lg:min-h-0 lg:px-0 overflow-visible lg:overflow-hidden"
                style={{
                  "--nav-col": navCollapsed ? "72px" : "0.45fr",
                  "--chat-col": chatCollapsed ? "72px" : `${chatWidth}px`
                }}
              >
                {!isRfqStage ? (
                  isCostingStage ? (
                    <section className="card col-span-full flex min-h-[280px] flex-col gap-6 overflow-x-hidden overflow-y-auto p-6 sm:p-8 lg:h-full lg:min-h-0">
                      {!isCostingPricingView ? (
                        <>
                          <div className="rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-soft">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="max-w-3xl">
                                <h3 className="mt-2 font-display text-xl text-ink sm:text-2xl">
                                  RFQ Data
                                </h3>
                                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                                  Use Preview to open the PDF in a modal, or Download to save it.
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-3">
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={handleOpenCostingPdfPreview}
                                  disabled={!canDownloadCostingTemplate || templatePreviewPending}
                                >
                                  <Eye className="h-4 w-4" />
                                  {templatePreviewPending ? "Preparing preview..." : "Preview PDF"}
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={handleDownloadCostingPdfTemplate}
                                  disabled={!canDownloadCostingTemplate || templateDownloadPending}
                                >
                                  <Files className="h-4 w-4" />
                                  {templateDownloadPending
                                    ? "Preparing PDF file..."
                                    : "Download PDF"}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-soft">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <h2 className="mt-2 font-display text-xl text-ink sm:text-2xl">
                                  RFQ files
                                </h2>
                              </div>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                                {sortedFiles.length} file{sortedFiles.length > 1 ? "s" : ""}
                              </span>
                            </div>

                            {sortedFiles.length ? (
                              <div className="mt-5 divide-y divide-slate-200/70 rounded-2xl border border-slate-200/70 bg-white/70 px-4">
                                {sortedFiles.map((file) => {
                                  const canPreview = Boolean(file.url);
                                  const isPreviewing = filePreviewLoadingId === file.id;
                                  return (
                                    <div
                                      key={`costing-drawing-${file.id}`}
                                      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                      <div className="min-w-0 flex items-center gap-3">
                                        <span
                                          className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[11px] font-bold uppercase ${getFileAccentClasses(file.name)}`}
                                        >
                                          {getFileExtension(file.name).slice(0, 4)}
                                        </span>
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-semibold text-ink">
                                            {file.name}
                                          </p>
                                          <p className="mt-1 text-xs text-slate-500">
                                            {[formatFileDate(file.updatedAt), formatFileSize(file.size), getFileExtension(file.name).toLowerCase()]
                                              .filter(Boolean)
                                              .join(" • ")}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-tide/40 hover:text-tide disabled:cursor-not-allowed disabled:opacity-60"
                                          onClick={() => handlePreviewFile(file)}
                                          disabled={!canPreview || isPreviewing}
                                        >
                                          {isPreviewing ? "Loading..." : "Preview"}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="mt-5 px-1 py-2">
                                <p className="text-sm font-semibold text-ink">
                                  No drawing files uploaded yet
                                </p>
                                <p className="mt-2 text-sm text-slate-500">
                                  Upload RFQ files in{" "}
                                  <span className="font-medium text-ink">New RFQ &gt; Step 1</span> and they
                                  will appear here.
                                </p>
                              </div>
                            )}
                          </div>
                        </>
                      ) : null}

                      {isCostingFeasabilityView ? (
                        <>
                          <div className="rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-soft">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                              <div className="max-w-2xl">
                                <h2 className="mt-2 font-display text-xl text-ink sm:text-2xl">
                                  Reception review
                                </h2>
                              </div>
                            </div>

                            {hasRecordedCostingReviewDecision ? (
                              <section
                                className={`mt-5 overflow-hidden rounded-[28px] border p-5 shadow-soft ${isCostingReviewRejected
                                  ? "border-red-200/80 bg-gradient-to-br from-red-50 via-white to-white"
                                  : "border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-white"
                                  }`}
                              >
                                <div
                                  className={`flex flex-wrap items-start justify-between gap-4 border-b pb-4 ${isCostingReviewRejected ? "border-red-100/80" : "border-emerald-100/80"
                                    }`}
                                >
                                  <div className="space-y-2">
                                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                      Reception audit
                                    </p>
                                    <div>
                                      <h4 className="text-lg font-semibold text-ink">
                                        Decision recorded
                                      </h4>
                                    </div>
                                  </div>
                                  <span
                                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${isCostingReviewRejected
                                      ? "border-red-200 bg-red-50 text-red-700"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      }`}
                                  >
                                    {isCostingReviewRejected ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                                    {isCostingReviewRejected ? "Rejected" : "Approved"}
                                  </span>
                                </div>

                                <div className="mt-5 grid gap-4 md:grid-cols-2">
                                  {isCostingReviewRejected ? (
                                    <>
                                      <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                          Rejected at
                                        </p>
                                        <p className="mt-2 text-base font-semibold text-ink">
                                          {formatValidationAuditDate(costingReviewAudit.rejectedAt)}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                          Rejected by
                                        </p>
                                        <p className="mt-2 text-base font-semibold text-ink">
                                          {formatValidationAuditValue(costingReviewAudit.rejectedBy)}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm md:col-span-2">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                          Rejection reason
                                        </p>
                                        <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-ink">
                                          {formatValidationAuditValue(costingReviewAudit.rejectionReason)}
                                        </p>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="rounded-2xl border border-emerald-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                          Approved at
                                        </p>
                                        <p className="mt-2 text-base font-semibold text-ink">
                                          {formatValidationAuditDate(costingReviewAudit.approvedAt)}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl border border-emerald-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                          Approved by
                                        </p>
                                        <p className="mt-2 text-base font-semibold text-ink">
                                          {formatValidationAuditValue(costingReviewAudit.approvedBy)}
                                        </p>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </section>
                            ) : (
                              <div className="mt-5 flex flex-wrap items-center gap-3">
                                <button
                                  type="button"
                                  className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-600 shadow-sm transition hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={handleRejectCostingReview}
                                  disabled={costingReviewButtonsDisabled}
                                  title={
                                    canReviewCostingFeasability
                                      ? "Reject feasibility"
                                      : "Only the owner or costing team can review feasibility."
                                  }
                                >
                                  <X className="h-4 w-4" />
                                  {costingReviewActionId === "reject" ? "Rejecting..." : "Reject"}
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-emerald-600 bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(5,150,105,0.9)] transition hover:-translate-y-0.5 hover:border-emerald-700 hover:bg-emerald-700 hover:shadow-[0_18px_34px_-18px_rgba(4,120,87,0.95)] disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={handleApproveCostingReview}
                                  disabled={costingReviewButtonsDisabled}
                                  title={
                                    canReviewCostingFeasability
                                      ? "Approve feasibility"
                                      : "Only the owner or costing team can review feasibility."
                                  }
                                >
                                  <Check className="h-4 w-4" />
                                  {costingReviewActionId === "approve" ? "Approving..." : "Approve"}
                                </button>
                              </div>
                            )}
                          </div>

                          {hasRecordedCostingReviewDecision && !isCostingReviewRejected ? (
                            <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/70 p-5 shadow-soft">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="max-w-2xl">
                                  <h2 className="mt-2 font-display text-xl text-ink sm:text-2xl">
                                    Feasibility file
                                  </h2>
                                  <p className="mt-2 text-sm leading-7 text-slate-600">
                                    Upload the feasibility document, then click Save to move this RFQ to pricing.
                                  </p>
                                </div>
                              </div>

                              <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
                                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                                  Required Templates
                                </h3>
                                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
                                  Please download and complete these templates before uploading your final feasibility analysis.
                                </p>
                                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                  <a
                                    href={costingTemplate}
                                    download="Avocarbon_Costing_Template.xlsm"
                                    className="inline-flex items-center justify-center rounded-2xl border border-tide/20 bg-tide/10 px-4 py-3 text-sm font-semibold text-tide transition hover:-translate-y-0.5 hover:border-tide/35 hover:bg-tide/15"
                                  >
                                    Download Costing
                                  </a>
                                  <a
                                    href={feasibilityTemplate}
                                    download="Avocarbon_Feasibility_Template.xlsm"
                                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
                                  >
                                    Download Feasibility
                                  </a>
                                </div>
                              </div>

                              <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="max-w-2xl">
                                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                                    Complete feasibility handoff
                                  </h3>
                                  <p className="mt-2 text-sm leading-7 text-slate-600">
                                    Upload the finished feasibility file or mark the requirement as not applicable with a note.
                                  </p>
                                </div>
                              </div>

                              <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                  <div className="max-w-2xl">
                                    <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                                      Feasibility status
                                    </h4>
                                    <p className="mt-2 text-sm leading-7 text-slate-600">
                                      Choose the feasibility result before uploading the file or marking this handoff as not applicable.
                                    </p>
                                  </div>
                                  <label className="w-full max-w-md text-left">
                                    <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                                      Feasibility Status
                                    </span>
                                    <select
                                      className="input-field"
                                      value={costingFeasibilityStatus}
                                      onChange={(event) => setCostingFeasibilityStatus(event.target.value)}
                                      disabled={
                                        !canManageCostingFeasibilityHandoff ||
                                        hasCompletedCostingFileAction ||
                                        costingFileActionPending
                                      }
                                    >
                                      <option value="">Not selected yet</option>
                                      {FEASIBILITY_STATUS_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                {hasSelectedCostingFeasibilityStatus ? (
                                  <div className="mt-4 flex flex-wrap items-center gap-3">
                                    <span
                                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getFeasibilityStatusBadgeClasses(
                                        costingFeasibilityStatus
                                      )}`}
                                    >
                                      {formatFeasibilityStatusLabel(costingFeasibilityStatus)}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      {hasCompletedCostingFileAction
                                        ? "Recorded with the current feasibility action."
                                        : "This selection will be saved with the next feasibility action."}
                                    </span>
                                  </div>
                                ) : (
                                  <p className="mt-4 text-xs text-slate-500">
                                    Not selected yet.
                                  </p>
                                )}
                              </div>

                              {!hasCompletedCostingFileAction ? (
                                <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="max-w-2xl">
                                    <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                                      Feasibility actions
                                    </h4>
                                    <p className="mt-2 text-sm leading-7 text-slate-600">
                                      Once a status is selected, choose whether to upload the finished feasibility file or record that no file is required.
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3">
                                    <button
                                      type="button"
                                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      onClick={() => openCostingFileActionModal("UPLOADED")}
                                      disabled={
                                        !canManageCostingFeasibilityHandoff ||
                                        costingSavePending ||
                                        !hasSelectedCostingFeasibilityStatus
                                      }
                                      title={
                                        !canManageCostingFeasibilityHandoff
                                          ? "Only the assigned costing or R&D contact, or the owner, can complete the feasibility handoff."
                                          : hasSelectedCostingFeasibilityStatus
                                            ? "Add the feasibility handoff file"
                                            : "Select the feasibility status first."
                                      }
                                    >
                                      <Upload className="h-4 w-4" />
                                      Add feasibility file
                                    </button>
                                    <button
                                      type="button"
                                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                      onClick={() => openCostingFileActionModal("NA")}
                                      disabled={
                                        !canManageCostingFeasibilityHandoff ||
                                        costingSavePending ||
                                        !hasSelectedCostingFeasibilityStatus
                                      }
                                      title={
                                        !canManageCostingFeasibilityHandoff
                                          ? "Only the assigned costing or R&D contact, or the owner, can complete the feasibility handoff."
                                          : hasSelectedCostingFeasibilityStatus
                                            ? "Mark the feasibility file as not applicable"
                                            : "Select the feasibility status first."
                                      }
                                    >
                                      <Pencil className="h-4 w-4" />
                                      Not Applicable
                                    </button>
                                  </div>
                                </div>
                              ) : null}

                              {hasCompletedCostingFileAction ? (
                                <div className="mt-5 rounded-[24px] border border-emerald-200/80 bg-white/95 p-5 shadow-soft">
                                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="max-w-2xl">
                                      <div className="flex flex-wrap items-center gap-3">
                                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                                          Completed
                                        </span>
                                        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${effectiveCostingFileState?.fileStatus === "NA"
                                          ? "border-amber-200 bg-amber-50 text-amber-700"
                                          : "border-sky-200 bg-sky-50 text-sky-700"
                                          }`}>
                                          {effectiveCostingFileState?.fileStatus === "NA"
                                            ? "Not Applicable"
                                            : "Uploaded"}
                                        </span>
                                        {effectiveCostingFileState?.feasibilityStatus ? (
                                          <span
                                            className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getFeasibilityStatusBadgeClasses(
                                              effectiveCostingFileState.feasibilityStatus
                                            )}`}
                                          >
                                            {formatFeasibilityStatusLabel(
                                              effectiveCostingFileState.feasibilityStatus
                                            )}
                                          </span>
                                        ) : null}
                                      </div>
                                      <h3 className="mt-3 text-lg font-semibold text-ink">
                                        {effectiveCostingFileState?.fileStatus === "NA"
                                          ? "Feasibility file bypass recorded"
                                          : "Feasibility file received"}
                                      </h3>
                                      <p className="mt-2 text-sm leading-7 text-slate-600">
                                        {effectiveCostingFileState?.note || "No note recorded."}
                                      </p>
                                    </div>

                                    {effectiveCostingFileState?.file ? (
                                      <div className="flex flex-wrap items-center gap-3">
                                        {effectiveCostingFileState.file.url ? (
                                          <button
                                            type="button"
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                                            onClick={() => handlePreviewFile(effectiveCostingFileState.file)}
                                          >
                                            <Eye className="h-4 w-4" />
                                            Preview
                                          </button>
                                        ) : null}
                                        {effectiveCostingFileState.file.url ? (
                                          <a
                                            href={effectiveCostingFileState.file.url}
                                            download={effectiveCostingFileState.file.name}
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-tide/20 bg-tide/10 px-4 py-2.5 text-sm font-semibold text-tide transition hover:-translate-y-0.5 hover:border-tide/35 hover:bg-tide/15"
                                          >
                                            Download
                                          </a>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="mt-5 grid gap-4 md:grid-cols-4">
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                        Action by
                                      </p>
                                      <p className="mt-2 text-sm font-semibold text-ink">
                                        {effectiveCostingFileState?.actionBy || "Unavailable"}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                        Recorded at
                                      </p>
                                      <p className="mt-2 text-sm font-semibold text-ink">
                                        {formatFileDate(effectiveCostingFileState?.actionAt, { withTime: true })}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                        File
                                      </p>
                                      <p className="mt-2 text-sm font-semibold text-ink">
                                        {effectiveCostingFileState?.file?.name ||
                                          (effectiveCostingFileState?.fileStatus === "NA"
                                            ? "No file required"
                                            : "Unavailable")}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                        Feasibility status
                                      </p>
                                      <p className="mt-2 text-sm font-semibold text-ink">
                                        {effectiveCostingFileState?.feasibilityStatus
                                          ? formatFeasibilityStatusLabel(
                                            effectiveCostingFileState.feasibilityStatus
                                          )
                                          : "Unavailable"}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-5 rounded-2xl border border-dashed border-slate-200/80 bg-white/80 px-5 py-8 text-center">
                                  <p className="text-sm font-semibold text-ink">
                                    No feasibility action recorded yet
                                  </p>
                                  <p className="mt-2 text-sm text-slate-500">
                                    Choose Upload or Not Applicable, add your note, then save to move forward.
                                  </p>
                                </div>
                              )}

                              {!hasSavedCostingFeasability ? (
                                <div className="mt-5 flex justify-end">
                                  <button
                                    type="button"
                                    className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-tide bg-tide px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#055d92] disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={handleSaveCostingFeasability}
                                    disabled={!canSaveCostingFeasability}
                                    title={
                                      canSaveCostingFeasability
                                        ? "Save feasibility and move to pricing"
                                        : "Approve reception and complete the file action before saving."
                                    }
                                  >
                                    <Check className="h-4 w-4" />
                                    {costingSavePending ? "Saving..." : "Save"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      ) : null}

                      {isCostingPricingView ? (
                        <div className="space-y-6">
                          <div className="rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-soft">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="max-w-2xl">
                                <h2 className="mt-2 font-display text-xl text-ink sm:text-2xl">
                                  Costing file with BOM data
                                </h2>
                                <p className="mt-2 text-sm leading-7 text-slate-600">
                                  Upload the costing package used for pricing with its BOM note from this tab.
                                </p>
                              </div>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={openPricingBomModal}
                                disabled={!canManagePricingBom || pricingBomPending}
                                title={
                                  canManagePricingBom
                                    ? "Upload BOM data"
                                    : "BOM upload is only available while the workflow is waiting for BOM data."
                                }
                              >
                                <Upload className="h-4 w-4" />
                                {hasPricingBomUpload ? "Replace BOM Data" : "Upload BOM Data"}
                              </button>
                            </div>

                            {hasPricingBomUpload ? (
                              <div className="mt-5 rounded-[24px] border border-sky-200/80 bg-white/95 p-5 shadow-soft">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="max-w-2xl">
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                                        Uploaded
                                      </span>
                                    </div>
                                    <h3 className="mt-3 text-lg font-semibold text-ink">
                                      BOM costing package received
                                    </h3>
                                    <p className="mt-2 text-sm leading-7 text-slate-600">
                                      {pricingBomUpload.note || "No note recorded."}
                                    </p>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-3">
                                    {pricingBomUpload.file.url ? (
                                      <button
                                        type="button"
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                                        onClick={() => handlePreviewFile(pricingBomUpload.file)}
                                      >
                                        <Eye className="h-4 w-4" />
                                        Preview
                                      </button>
                                    ) : null}
                                    {pricingBomUpload.file.url ? (
                                      <a
                                        href={pricingBomUpload.file.url}
                                        download={pricingBomUpload.file.name}
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-tide/20 bg-tide/10 px-4 py-2.5 text-sm font-semibold text-tide transition hover:-translate-y-0.5 hover:border-tide/35 hover:bg-tide/15"
                                      >
                                        Download
                                      </a>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="mt-5 grid gap-4 md:grid-cols-3">
                                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                      Uploaded by
                                    </p>
                                    <p className="mt-2 text-sm font-semibold text-ink">
                                      {pricingBomUpload.uploadedBy || "Unavailable"}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                      Uploaded at
                                    </p>
                                    <p className="mt-2 text-sm font-semibold text-ink">
                                      {formatFileDate(pricingBomUpload.uploadedAt, { withTime: true })}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                      File
                                    </p>
                                    <p className="mt-2 text-sm font-semibold text-ink">
                                      {pricingBomUpload.file?.name || "Unavailable"}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-5 rounded-2xl border border-dashed border-slate-200/80 bg-white/80 px-5 py-8 text-center">
                                <p className="text-sm font-semibold text-ink">
                                  No costing BOM file uploaded yet
                                </p>
                                <p className="mt-2 text-sm text-slate-500">
                                  Use the upload button to add the costing file with BOM data and its note.
                                </p>
                              </div>
                            )}
                          </div>

                          {hasPricingBomUpload ? (
                            <div className="rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-soft">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="max-w-2xl">
                                  <h2 className="mt-2 font-display text-xl text-ink sm:text-2xl">
                                    Costing file with final price
                                  </h2>
                                  <p className="mt-2 text-sm leading-7 text-slate-600">
                                    Upload the final priced costing package after the BOM package has been completed.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={openPricingFinalPriceModal}
                                  disabled={!canManagePricingFinalPrice || pricingFinalPricePending}
                                  title={
                                    canManagePricingFinalPrice
                                      ? "Upload final pricing"
                                      : "Final pricing upload is only available after BOM upload or rejection."
                                  }
                                >
                                  <Upload className="h-4 w-4" />
                                  {hasPricingFinalPriceUpload ? "Replace Final Pricing" : "Upload Final Pricing"}
                                </button>
                              </div>

                              {hasPricingFinalPriceUpload ? (
                                <>
                                  <div className="mt-5 rounded-[24px] border border-emerald-200/80 bg-white/95 p-5 shadow-soft">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                      <div className="max-w-2xl">
                                        <div className="flex flex-wrap items-center gap-3">
                                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                                            Uploaded
                                          </span>
                                        </div>
                                        <h3 className="mt-3 text-lg font-semibold text-ink">
                                          Final price costing package received
                                        </h3>
                                        <p className="mt-2 text-sm leading-7 text-slate-600">
                                          {pricingFinalPriceUpload.note || "No note recorded."}
                                        </p>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-3">
                                        {pricingFinalPriceUpload.file.url ? (
                                          <button
                                            type="button"
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                                            onClick={() => handlePreviewFile(pricingFinalPriceUpload.file)}
                                          >
                                            <Eye className="h-4 w-4" />
                                            Preview
                                          </button>
                                        ) : null}
                                        {pricingFinalPriceUpload.file.url ? (
                                          <a
                                            href={pricingFinalPriceUpload.file.url}
                                            download={pricingFinalPriceUpload.file.name}
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-tide/20 bg-tide/10 px-4 py-2.5 text-sm font-semibold text-tide transition hover:-translate-y-0.5 hover:border-tide/35 hover:bg-tide/15"
                                          >
                                            Download
                                          </a>
                                        ) : null}
                                      </div>
                                    </div>

                                    <div className="mt-5 grid gap-4 md:grid-cols-3">
                                      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                          Uploaded by
                                        </p>
                                        <p className="mt-2 text-sm font-semibold text-ink">
                                          {pricingFinalPriceUpload.uploadedBy || "Unavailable"}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                          Uploaded at
                                        </p>
                                        <p className="mt-2 text-sm font-semibold text-ink">
                                          {formatFileDate(pricingFinalPriceUpload.uploadedAt, { withTime: true })}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                          File
                                        </p>
                                        <p className="mt-2 text-sm font-semibold text-ink">
                                          {pricingFinalPriceUpload.file?.name || "Unavailable"}
                                        </p>
                                      </div>
                                    </div>
                                  </div>

                                  {!pricingFinalPriceSaved ? (
                                    <div className="mt-5 flex justify-end">
                                      <button
                                        type="button"
                                        className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-tide bg-tide px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#055d92] disabled:cursor-not-allowed disabled:opacity-60"
                                        onClick={handleSavePricingFinalPrice}
                                        disabled={!canSavePricingFinalPrice}
                                        title={
                                          canSavePricingFinalPrice
                                            ? "Save the final price file and continue to validation"
                                            : "Upload the final price file before saving."
                                        }
                                      >
                                        <Check className="h-4 w-4" />
                                        Save
                                      </button>
                                    </div>
                                  ) : null}

                                  {showPricingFileValidationSection ? (
                                    <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5 shadow-soft">
                                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="max-w-2xl">
                                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                            Costing File Validation
                                          </p>
                                          <h3 className="mt-2 text-lg font-semibold text-ink">
                                            Validate the final pricing package
                                          </h3>
                                          <p className="mt-2 text-sm leading-7 text-slate-600">
                                            {hasRecordedPricingFileDecision
                                              ? "The pricing validation decision has been recorded for this final price package."
                                              : "Approve to move this RFQ to the Offer stage. Reject is shown here now and its detailed logic can be added later."}
                                          </p>
                                        </div>
                                      </div>

                                      {hasRecordedPricingFileDecision ? (
                                        <section
                                          className={`mt-5 overflow-hidden rounded-[28px] border p-5 shadow-soft ${isPricingFileRejected
                                            ? "border-red-200/80 bg-gradient-to-br from-red-50 via-white to-white"
                                            : "border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-white"
                                            }`}
                                        >
                                          <div
                                            className={`flex flex-wrap items-start justify-between gap-4 border-b pb-4 ${isPricingFileRejected ? "border-red-100/80" : "border-emerald-100/80"
                                              }`}
                                          >
                                            <div className="space-y-2">
                                              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                                Pricing audit
                                              </p>
                                              <div>
                                                <h4 className="text-lg font-semibold text-ink">
                                                  Decision recorded
                                                </h4>
                                              </div>
                                            </div>
                                            <span
                                              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${isPricingFileRejected
                                                ? "border-red-200 bg-red-50 text-red-700"
                                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                }`}
                                            >
                                              {isPricingFileRejected ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                                              {isPricingFileRejected ? "Rejected" : "Approved"}
                                            </span>
                                          </div>

                                          <div className="mt-5 grid gap-4 md:grid-cols-2">
                                            {isPricingFileRejected ? (
                                              <>
                                                <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                    Rejected at
                                                  </p>
                                                  <p className="mt-2 text-base font-semibold text-ink">
                                                    {formatValidationAuditDate(pricingFileDecisionAudit.rejectedAt)}
                                                  </p>
                                                </div>
                                                <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                    Rejected by
                                                  </p>
                                                  <p className="mt-2 text-base font-semibold text-ink">
                                                    {formatValidationAuditValue(pricingFileDecisionAudit.rejectedBy)}
                                                  </p>
                                                </div>
                                                <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm md:col-span-2">
                                                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                    Rejection reason
                                                  </p>
                                                  <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-ink">
                                                    {formatValidationAuditValue(pricingFileDecisionAudit.rejectionReason)}
                                                  </p>
                                                </div>
                                              </>
                                            ) : (
                                              <>
                                                <div className="rounded-2xl border border-emerald-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                    Approved at
                                                  </p>
                                                  <p className="mt-2 text-base font-semibold text-ink">
                                                    {formatValidationAuditDate(pricingFileDecisionAudit.approvedAt)}
                                                  </p>
                                                </div>
                                                <div className="rounded-2xl border border-emerald-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                    Approved by
                                                  </p>
                                                  <p className="mt-2 text-base font-semibold text-ink">
                                                    {formatValidationAuditValue(pricingFileDecisionAudit.approvedBy)}
                                                  </p>
                                                </div>
                                              </>
                                            )}
                                          </div>
                                        </section>
                                      ) : (
                                        <div className="mt-5 flex flex-wrap items-center gap-3">
                                          <button
                                            type="button"
                                            className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-600 shadow-sm transition hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                            onClick={handleRejectPricingFileValidation}
                                            disabled={pricingFileValidationButtonsDisabled}
                                          >
                                            <X className="h-4 w-4" />
                                            {pricingFileValidationActionId === "reject" ? "Rejecting..." : "Reject"}
                                          </button>
                                          <button
                                            type="button"
                                            className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-emerald-600 bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(5,150,105,0.9)] transition hover:-translate-y-0.5 hover:border-emerald-700 hover:bg-emerald-700 hover:shadow-[0_18px_34px_-18px_rgba(4,120,87,0.95)] disabled:cursor-not-allowed disabled:opacity-60"
                                            onClick={handleApprovePricingFileValidation}
                                            disabled={pricingFileValidationButtonsDisabled}
                                          >
                                            <Check className="h-4 w-4" />
                                            {pricingFileValidationActionId === "approve" ? "Approving..." : "Approve"}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <div className="mt-5 rounded-2xl border border-dashed border-slate-200/80 bg-white/80 px-5 py-8 text-center">
                                  <p className="text-sm font-semibold text-ink">
                                    No final price file uploaded yet
                                  </p>
                                  <p className="mt-2 text-sm text-slate-500">
                                    Upload the final priced costing package once the BOM package is completed.
                                  </p>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                    </section>
                  ) : isOfferStage ? (
                    <section className="card relative min-h-0 overflow-y-visible overflow-x-hidden space-y-6 p-5 sm:p-7 md:p-8 md:col-span-2 lg:col-span-2 lg:h-full lg:min-h-0 lg:overflow-y-auto">
                      <div className="rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-soft">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="max-w-3xl">
                            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Offer</p>
                            <h2 className="mt-2 font-display text-2xl text-ink sm:text-3xl">
                              Offer preparation
                            </h2>
                            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                              This is the exact filled DOCX rendered from your Word file offer_preparation_template.docx.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={loadOfferTemplatePreview}
                              disabled={!rfqId || offerTemplatePreviewPending}
                            >
                              <Eye className="h-4 w-4" />
                              {offerTemplatePreviewPending ? "Refreshing..." : "Refresh preview"}
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={handleDownloadOfferPreparationTemplate}
                              disabled={!rfqId || offerTemplateDownloadPending}
                            >
                              <Files className="h-4 w-4" />
                              {offerTemplateDownloadPending ? "Preparing DOCX..." : "Download DOCX"}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex min-h-[520px] flex-1 flex-col rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-soft">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-2 pb-4">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                              Template viewer
                            </p>
                            <p className="mt-2 text-sm text-slate-500">
                              {offerTemplateFilename || "offer_preparation_template.docx"}
                            </p>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                            {isOfferValidationLocked ? "Read-only" : "Preparation mode"}
                          </span>
                        </div>

                        <div className="relative mt-4 flex-1 overflow-hidden rounded-[24px] border border-slate-200/80 bg-slate-50/70">
                          <div
                            ref={offerTemplateViewerRef}
                            className="h-full min-h-[720px] overflow-auto bg-slate-100 p-4"
                          />
                          {!offerTemplateReady ? (
                            <div className="absolute inset-0 flex min-h-[420px] items-center justify-center bg-slate-50/80 px-6 text-center text-sm font-medium text-slate-500">
                              {offerTemplatePreviewPending
                                ? "Preparing the offer template preview..."
                                : "Open the Offer stage on a saved RFQ to generate the preview."}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </section>
                  ) : (
                    <div className="col-span-full flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200/80 bg-white/70 text-sm font-medium text-slate-500">
                      Empty stage
                    </div>
                  )
                ) : null}

                {isRfqFormView && activeRfqTab === "potential" ? (
                  <form
                    onSubmit={handleSubmit}
                    className="card relative min-h-0 overflow-y-visible overflow-x-hidden space-y-6 p-5 sm:p-7 md:p-8 md:col-span-2 lg:col-span-2 lg:h-full lg:min-h-0 lg:overflow-y-auto"
                  >
                    <div className="pointer-events-none absolute -right-20 -top-28 h-56 w-56 rounded-full bg-tide/10 blur-3xl" />
                    <div className="pointer-events-none absolute -left-24 -bottom-28 h-60 w-60 rounded-full bg-sun/10 blur-3xl" />

                    <div className="relative flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Potential</p>
                        <h2 className="font-display text-2xl text-ink sm:text-3xl">Potential RFQ intake</h2>
                        <p className="mt-2 text-sm font-semibold text-tide">
                          Opportunity: {form.potentialSystematicId || "Draft"}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          This tab mirrors the Potential chatbot. You can start here for a pre-sales assessment, or switch straight to New RFQ before any draft is created.
                        </p>
                      </div>
                    </div>

                    <div className="relative grid gap-6">
                      <section className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-soft transition hover:shadow-md">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-tide/10 text-sm font-semibold text-tide">
                            01
                          </span>
                          <div>
                            <h3 className="font-display text-xl text-ink">Opportunity overview</h3>
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                              Core context for the potential RFQ
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <FormField label="Customer" name="potentialCustomer" value={form.potentialCustomer} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Customer location" name="potentialCustomerLocation" value={form.potentialCustomerLocation} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Application" name="potentialApplication" value={form.potentialApplication} onChange={handleChange} readOnly={potentialFieldReadOnly} autoExpand />
                          <FormField label="Industry served" name="potentialIndustry" value={form.potentialIndustry} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Planned product type" name="potentialProductType" value={form.potentialProductType} onChange={handleChange} readOnly={potentialFieldReadOnly} autoExpand />
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-soft transition hover:shadow-md">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sun/10 text-sm font-semibold text-sun">
                            02
                          </span>
                          <div>
                            <h3 className="font-display text-xl text-ink">Strategic rationale</h3>
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                              Why we should engage and why we can win
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div className="md:col-span-2">
                            <FormField label="Engagement reasons" name="potentialEngagementReason" value={form.potentialEngagementReason} onChange={handleChange} readOnly={potentialFieldReadOnly} autoExpand />
                          </div>
                          <FormField label="Idea source" name="potentialIdeaOwner" value={form.potentialIdeaOwner} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Current supplier" name="potentialCurrentSupplier" value={form.potentialCurrentSupplier} onChange={handleChange} readOnly={potentialFieldReadOnly} autoExpand />
                          <FormField label="Main win reason" name="potentialWinReason" value={form.potentialWinReason} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <div className="md:col-span-2">
                            <FormField label="Win rationale details" name="potentialWinDetails" value={form.potentialWinDetails} onChange={handleChange} readOnly={potentialFieldReadOnly} autoExpand />
                          </div>
                          <FormField label="Technical capabilities" name="potentialTechnicalCapability" value={form.potentialTechnicalCapability} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Strategic fit" name="potentialStrategyFit" value={form.potentialStrategyFit} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <div className="md:col-span-2">
                            <FormField label="Strategic fit details" name="potentialStrategyFitDetails" value={form.potentialStrategyFitDetails} onChange={handleChange} readOnly={potentialFieldReadOnly} autoExpand />
                          </div>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-soft transition hover:shadow-md">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-mint/10 text-sm font-semibold text-mint">
                            03
                          </span>
                          <div>
                            <h3 className="font-display text-xl text-ink">Business outlook</h3>
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                              Perspectives, effort, and side effects
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          <FormField label="Sales (kEUR)" name="potentialBusinessSalesKeur" type="number" value={form.potentialBusinessSalesKeur} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Margin (%)" name="potentialBusinessMarginPercent" type="number" value={form.potentialBusinessMarginPercent} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Margin (kEUR)" name="potentialBusinessMarginKeur" value={potentialMarginKeur} readOnly />
                          <FormField label="Start of production" name="potentialStartOfProduction" value={form.potentialStartOfProduction} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Development effort" name="potentialDevelopmentEffort" value={form.potentialDevelopmentEffort} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <div className="xl:col-span-3">
                            <FormField label="Side effects of engagement" name="potentialSideEffects" value={form.potentialSideEffects} onChange={handleChange} readOnly={potentialFieldReadOnly} autoExpand />
                          </div>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-soft transition hover:shadow-md">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-coral/10 text-sm font-semibold text-coral">
                            04
                          </span>
                          <div>
                            <h3 className="font-display text-xl text-ink">Risks if we do</h3>
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                              Be specific for each risk
                            </p>
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                            <FormField
                              label="Assessment"
                              name="potentialRiskDoAssessment"
                              value={form.potentialRiskDoAssessment}
                              onChange={handleChange}
                              readOnly={potentialFieldReadOnly}
                              autoExpand
                            />
                          </div>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-soft transition hover:shadow-md">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-ink/5 text-sm font-semibold text-ink">
                            05
                          </span>
                          <div>
                            <h3 className="font-display text-xl text-ink">Risks if we do not</h3>
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                              Missed opportunities and market impact
                            </p>
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                            <FormField
                              label="Assessment"
                              name="potentialRiskNotDoAssessment"
                              value={form.potentialRiskNotDoAssessment}
                              onChange={handleChange}
                              readOnly={potentialFieldReadOnly}
                              autoExpand
                            />
                          </div>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-soft transition hover:shadow-md">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-600">
                            06
                          </span>
                          <div>
                            <h3 className="font-display text-xl text-ink">Contact information</h3>
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                              Primary point of contact
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <FormField label="Contact name" name="potentialContactName" value={form.potentialContactName} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Contact function" name="potentialContactFunction" value={form.potentialContactFunction} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Contact phone" name="potentialContactPhone" value={form.potentialContactPhone} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Contact email" name="potentialContactEmail" type="email" value={form.potentialContactEmail} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-soft">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="font-display text-xl text-ink">Proceed to formal RFQ</h3>
                            <p className="mt-2 text-sm text-slate-500">
                              When the shared Potential fields are complete, promote this opportunity to New RFQ while keeping the Potential tab available as reference.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleProceedToFormalRfq}
                            disabled={!canProceedToFormalRfq}
                            className="gradient-button rounded-xl px-4 py-3 text-sm font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
                            title={
                              canProceedToFormalRfq
                                ? "Proceed to Formal RFQ"
                                : "Complete the shared Potential fields in the chatbot before proceeding."
                            }
                          >
                            {proceedingToFormalRfq ? "Proceeding..." : "Proceed to Formal RFQ"}
                          </button>
                        </div>
                      </section>
                    </div>
                  </form>
                ) : null}

                {showRfqStepNavigation ? (
                  <aside
                    className={`card flex flex-col ${navCollapsed ? "p-3 sm:p-4" : "px-4 pt-4 pb-0 sm:px-6 sm:pt-6 sm:pb-0"
                      } lg:sticky lg:top-0 lg:h-full lg:min-h-0`}
                  >
                    <div className={`flex items-center ${navCollapsed ? "justify-center" : "justify-between"}`}>
                      {!navCollapsed ? (
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">RFQ navigation</p>
                          <h2 className="mt-2 font-display text-xl text-ink">Form steps</h2>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => setNavCollapsed((prev) => !prev)}
                        className="collapse-toggle"
                        aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
                      >
                        {navCollapsed ? (
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 5l7 7-7 7" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M15 19l-7-7 7-7" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {navCollapsed ? (
                      <div className="mt-4 flex flex-col items-center gap-3 lg:mt-3 lg:gap-2">
                        {STEPS.map((step, index) => {
                          const isActive = activeStep === step.id;
                          const state = stepStates[step.id] || {};
                          const isLocked = Boolean(state.isLocked);
                          return (
                            <button
                              key={step.id}
                              type="button"
                              onClick={() => handleStepViewChange(step.id)}
                              disabled={isLocked}
                              className={`flex h-9 w-9 items-center justify-center rounded-2xl border text-sm font-semibold transition sm:h-10 sm:w-10 ${isActive
                                ? "border-tide/40 bg-tide/10 text-tide"
                                : isLocked
                                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                                  : "border-slate-200 bg-white text-slate-500 hover:border-tide/40 hover:text-tide"
                                }`}
                              aria-label={`Step ${index + 1}`}
                              aria-disabled={isLocked || undefined}
                            >
                              {index + 1}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-6 flex flex-col gap-3 lg:mt-4 lg:gap-2">
                        {STEPS.map((step, index) => {
                          const style = STEP_STYLES[step.accent];
                          const isActive = activeStep === step.id;
                          const state = stepStates[step.id] || {};
                          const isLocked = Boolean(state.isLocked);
                          const statusType = state.statusType || "draft";
                          const statusLabel =
                            statusType === "fulfilled"
                              ? "Fulfilled"
                              : statusType === "locked"
                                ? "Locked"
                                : "Draft";
                          const statusClasses =
                            statusType === "fulfilled"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                              : statusType === "locked"
                                ? "border-sun/30 bg-sun/10 text-sun"
                                : "border-slate-200 bg-white text-slate-600";
                          const statusIcon = statusType === "draft" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3 w-3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                            </svg>
                          ) : statusType === "fulfilled" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3 w-3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3 w-3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <rect x="4" y="11" width="16" height="9" rx="2" />
                              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                            </svg>
                          );

                          return (
                            <button
                              key={step.id}
                              type="button"
                              onClick={() => handleStepViewChange(step.id)}
                              disabled={isLocked}
                              aria-pressed={isActive}
                              aria-disabled={isLocked || undefined}
                              className={`group flex w-full gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition lg:px-3 lg:py-2 lg:text-[13px] ${isActive
                                ? `${style.ring} ${style.bg} shadow-soft`
                                : isLocked
                                  ? "cursor-not-allowed border-slate-200/70 bg-slate-50 text-slate-300"
                                  : "border-slate-200/70 bg-white/80 hover:border-tide/40 hover:shadow-soft"
                                }`}
                            >
                              <span className={`mt-1 h-full w-1 rounded-full lg:mt-0.5 ${style.bar}`} />
                              <span className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full border bg-white text-xs font-semibold text-slate-500 transition lg:mt-0 ${isActive
                                ? "border-tide/40 text-tide"
                                : isLocked
                                  ? "border-slate-200 text-slate-300"
                                  : "border-slate-200 group-hover:border-tide/40 group-hover:text-tide"
                                }`}>
                                {index + 1}
                              </span>
                              <span className="flex flex-1 items-center justify-between gap-3">
                                <span className="flex flex-col">
                                  <span className="text-xs uppercase tracking-[0.25em] text-slate-400">
                                    Step {index + 1}
                                  </span>
                                  <span className="font-semibold text-ink leading-snug break-words">
                                    {step.label}
                                  </span>
                                </span>

                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClasses}`}
                                >
                                  {statusIcon}
                                  {statusLabel}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </aside>
                ) : null}

                {isRfqFormView && activeRfqTab === "files" ? (
                  <section className="card relative col-span-full flex min-h-0 flex-col overflow-hidden lg:h-full lg:min-h-0">
                    <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-tide/10 blur-3xl" />
                    <div className="pointer-events-none absolute -left-24 -bottom-24 h-56 w-56 rounded-full bg-sun/10 blur-3xl" />

                    <div className="relative flex flex-col gap-4 border-b border-slate-200/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-tide/10 text-tide">
                          <Files className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-xs uppercase tracking-[0.32em] text-slate-400">
                            Documents
                          </p>
                          <h2 className="mt-1 font-display text-2xl text-ink">
                            Files ({sortedFiles.length})
                          </h2>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => rfqFileInputRef.current?.click()}
                          disabled={!allowFileUpload}
                        >
                          <Upload className="h-4 w-4" />
                          Add files
                        </button>
                        <input
                          ref={rfqFileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleFilesChange}
                          disabled={!allowFileUpload}
                        />
                      </div>
                    </div>

                    <div className="relative flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
                      {sortedFiles.length ? (
                        <section className="rounded-2xl border border-slate-200/70 bg-white/95 shadow-soft">
                          <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-4">
                            <div>
                              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                                All files
                              </p>
                              <h3 className="mt-1 font-display text-xl text-ink">
                                Detailed list
                              </h3>
                            </div>
                            <span className="rounded-full border border-tide/20 bg-tide/5 px-3 py-1 text-xs font-semibold text-tide">
                              {sortedFiles.length} total
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200/70 text-left">
                              <thead className="bg-slate-50/80">
                                <tr className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  <th className="px-5 py-4">Title</th>
                                  <th className="px-5 py-4">Owner</th>
                                  <th className="px-5 py-4">Last modified</th>
                                  <th className="px-5 py-4">Size</th>
                                  <th className="px-5 py-4 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200/70 bg-white text-sm text-slate-600">
                                {sortedFiles.map((file) => {
                                  const canPreview = Boolean(file.url);
                                  const isDeleting = fileActionId === file.id;
                                  const isPreviewing = filePreviewLoadingId === file.id;
                                  return (
                                    <tr key={file.id} className="align-middle">
                                      <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                          <span
                                            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[11px] font-bold uppercase ${getFileAccentClasses(file.name)}`}
                                          >
                                            {getFileExtension(file.name).slice(0, 4)}
                                          </span>
                                          <div className="min-w-0">
                                            <button
                                              type="button"
                                              className={`max-w-full truncate text-left font-semibold text-tide ${canPreview ? "hover:text-ink" : "cursor-not-allowed opacity-60"}`}
                                              onClick={() => handlePreviewFile(file)}
                                              disabled={!canPreview || isPreviewing}
                                            >
                                              {file.name}
                                            </button>
                                            <p className="mt-1 text-xs text-slate-500">
                                              {getFileExtension(file.name).toLowerCase()}
                                            </p>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-5 py-4">
                                        {file.owner || "Unknown"}
                                      </td>
                                      <td className="px-5 py-4">
                                        {formatFileDate(file.updatedAt, { withTime: true })}
                                      </td>
                                      <td className="px-5 py-4">
                                        {formatFileSize(file.size)}
                                      </td>
                                      <td className="px-5 py-4">
                                        <div className="flex items-center justify-end gap-2">
                                          <button
                                            type="button"
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-tide/40 hover:text-tide disabled:cursor-not-allowed disabled:opacity-60"
                                            onClick={() => handlePreviewFile(file)}
                                            disabled={!canPreview || isPreviewing}
                                            aria-label="Preview file"
                                            title={isPreviewing ? "Loading..." : "Preview"}
                                          >
                                            <Eye className="h-4 w-4" />
                                          </button>
                                          <button
                                            type="button"
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                            onClick={() => setFileDeleteTarget(file)}
                                            disabled={isDeleting || !canUseRfqActions || isRfqFormReadOnly}
                                            aria-label="Delete file"
                                            title={isDeleting ? "Removing..." : "Delete"}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/80 px-6 py-12 text-center shadow-soft">
                          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-tide/10 text-tide">
                            <Files className="h-6 w-6" />
                          </div>
                          <p className="mt-4 text-base font-semibold text-ink">
                            No files attached yet
                          </p>
                          <p className="mt-2 text-sm text-slate-500">
                            Add files from this tab and they will appear here.
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                ) : null}

                {false && isRfqFormView && activeRfqTab === "discussion" ? (
                  <section className="card relative flex min-h-0 flex-col overflow-hidden md:col-span-2 lg:col-span-2 lg:h-full lg:min-h-0">
                    <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-tide/10 blur-3xl" />
                    <div className="pointer-events-none absolute -left-24 -bottom-24 h-56 w-56 rounded-full bg-sun/10 blur-3xl" />

                    <div className="relative flex flex-col gap-4 border-b border-slate-200/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-tide/10 text-tide">
                          <MessageSquare className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-xs uppercase tracking-[0.32em] text-slate-400">
                            Collaboration
                          </p>
                          <h2 className="mt-1 font-display text-2xl text-ink">
                            Discussion
                          </h2>
                          <p className="mt-1 text-sm text-slate-500">
                            The RFQ creator and the owner can exchange messages here.
                          </p>
                        </div>
                      </div>

                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                        {discussionMessages.length} message{discussionMessages.length > 1 ? "s" : ""}
                      </span>
                    </div>

                    <div className="relative flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
                      {discussionMessages.length ? (
                        <div className="flex flex-col gap-4">
                          {discussionMessages.map((message) => {
                            const isCurrentUser =
                              normalizeEmailValue(message.authorEmail) ===
                              normalizeEmailValue(currentUserEmail);
                            const isOwnerReply = message.authorRole === "OWNER";
                            const authorLabel =
                              message.authorName ||
                              message.authorEmail ||
                              (isOwnerReply ? "Owner" : "User");

                            return (
                              <div
                                key={message.id}
                                className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}
                              >
                                <article
                                  className={`max-w-[min(100%,42rem)] rounded-[26px] border px-4 py-3 shadow-sm ${isCurrentUser
                                    ? "border-tide/30 bg-tide text-white"
                                    : isOwnerReply
                                      ? "border-amber-200 bg-amber-50/95 text-ink"
                                      : "border-slate-200/80 bg-white/95 text-ink"
                                    }`}
                                >
                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className={`font-semibold ${isCurrentUser ? "text-white" : "text-slate-700"}`}>
                                      {authorLabel}
                                    </span>
                                    {isOwnerReply ? (
                                      <span className={`rounded-full border px-2 py-0.5 font-semibold ${isCurrentUser
                                        ? "border-white/20 bg-white/15 text-white"
                                        : "border-amber-200 bg-white/70 text-amber-700"
                                        }`}>
                                        Owner
                                      </span>
                                    ) : null}
                                    <span className={isCurrentUser ? "text-white/75" : "text-slate-400"}>
                                      {formatDiscussionDate(message.createdAt)}
                                    </span>
                                  </div>
                                  <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${isCurrentUser ? "text-white" : "text-slate-700"}`}>
                                    {message.content}
                                  </p>
                                </article>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/80 px-6 py-12 text-center shadow-soft">
                          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-tide/10 text-tide">
                            <MessageSquare className="h-6 w-6" />
                          </div>
                          <p className="mt-4 text-base font-semibold text-ink">
                            No discussion yet
                          </p>
                          <p className="mt-2 text-sm text-slate-500">
                            Start the conversation with a message and the owner can reply in the same thread.
                          </p>
                        </div>
                      )}
                    </div>

                    <form
                      onSubmit={handleDiscussionSend}
                      className="relative border-t border-slate-200/70 bg-white/85 p-5 sm:p-6"
                    >
                      <div className="space-y-3">
                        <textarea
                          className="textarea-field min-h-[120px]"
                          value={discussionDraft}
                          onChange={(event) => setDiscussionDraft(event.target.value)}
                          disabled={discussionSending || !canParticipateInDiscussion}
                        />
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm text-slate-500">
                            {canParticipateInDiscussion
                              ? "Messages are saved with author and date."
                              : "Only the RFQ creator and the owner can send messages in this discussion."}
                          </p>
                          <button
                            type="submit"
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-tide bg-tide px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#055d92] disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={
                              discussionSending ||
                              !canParticipateInDiscussion ||
                              !String(discussionDraft || "").trim()
                            }
                          >
                            <SendHorizontal className="h-4 w-4" />
                            {discussionSending ? "Sending..." : "Send message"}
                          </button>
                        </div>
                      </div>
                    </form>
                  </section>
                ) : null}

                {isRfqFormView && activeRfqTab === "new" ? (
                  <form
                    onSubmit={handleSubmit}
                    className="card flex flex-col min-h-0 overflow-visible lg:overflow-hidden lg:h-full lg:min-h-0"
                  >
                    <div className="flex flex-col gap-4 border-b border-slate-200/70 p-5 sm:p-3 md:p-4 pb-5 mb-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tide text-base font-semibold text-white shadow-soft sm:h-14 sm:w-14 sm:text-lg">
                            {stepIndex + 1}
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Step</p>
                            <h2 className="font-display text-xl text-ink sm:text-2xl">
                              Step {stepIndex + 1}: {activeStepData.label}
                            </h2>
                            <p className="mt-2 max-w-2xl text-sm text-slate-500">
                              {isRevisionModeActive
                                ? "Revision mode is active. Update the form directly or use the chat panel, then submit your updates."
                                : "The New RFQ form is locked for direct editing and mirrors the chatbot. Use the chat panel to update these fields."}
                            </p>
                          </div>
                        </div>

                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                          {isRevisionModeActive ? (
                            <button
                              type="button"
                              className="gradient-button rounded-xl px-4 py-3 text-sm font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={handleSubmitRevisionUpdates}
                              disabled={!rfqId || Boolean(revisionActionId)}
                            >
                              {revisionActionId === "submit" ? "Submitting..." : "Submit Updates"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="prev-button disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => handleStepViewChange(stepIds[stepIndex - 1])}
                            disabled={isFirstStep || !canGoPrev}
                          >
                            <span className="text-base">←</span>
                            Previous
                          </button>
                          <button
                            type="button"
                            className="next-button disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => handleStepViewChange(stepIds[stepIndex + 1])}
                            disabled={isLastStep || !canGoNext}
                          >
                            Next
                            <span className="text-base">→</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-visible px-5 pb-5 sm:px-7 sm:pb-7 md:px-8 md:pb-8 sm:pr-2 lg:overflow-y-auto">
                      {activeStep === "step-client" ? (
                        <div
                          id="step-client"
                          className="scroll-mt-28 space-y-4"
                        >
                          <div className="flex flex-col gap-5">
                            <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-soft transition hover:shadow-md">
                              <h3 className="mt-2 font-display text-xl font-semibold text-sun">Customer details</h3>
                              <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <FormField label="Customer" name="customer" value={form.customer} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                                <FormField label="Application" name="application" value={form.application} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                                <FormField label="Product name" name="productName" value={form.productName} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                                <FormField label="Product line" name="productLine" value={form.productLine} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                                <FormField label="Project name" name="projectName" value={form.projectName} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                                <FormField label="Costing data" name="costingData" value={form.costingData} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500 md:col-span-2 lg:col-span-1">
                                  <span>RFQ Files</span>
                                  <div className="flex flex-wrap items-center gap-3">
                                    <button
                                      type="button"
                                      className="outline-button px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                                      onClick={() => rfqFileInputRef.current?.click()}
                                      disabled={!allowFileUpload}
                                    >
                                      Choose files
                                    </button>
                                    <span className="text-xs font-medium text-slate-500">
                                      {mergedFiles.length
                                        ? `${mergedFiles.length} file${mergedFiles.length > 1 ? "s" : ""}`
                                        : "No files"}
                                    </span>
                                  </div>
                                  <input
                                    ref={rfqFileInputRef}
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={handleFilesChange}
                                    disabled={!allowFileUpload}
                                  />
                                  {mergedFiles.length ? (
                                    <div className="mt-3 flex flex-col gap-2 normal-case">
                                      {mergedFiles.map((file) => {
                                        const canPreview = Boolean(file.url);
                                        const isDeleting = fileActionId === file.id;
                                        const isPreviewing = filePreviewLoadingId === file.id;
                                        return (
                                          <div
                                            key={file.id}
                                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2 text-[11px] font-medium text-slate-600"
                                          >
                                            <button
                                              type="button"
                                              className={`inline-flex items-center gap-2 truncate text-left ${canPreview ? "hover:text-ink" : "cursor-not-allowed opacity-60"
                                                }`}
                                              onClick={() => handlePreviewFile(file)}
                                              disabled={!canPreview || isPreviewing}
                                            >
                                              <span className="h-2 w-2 rounded-full bg-slate-400" />
                                              <span className="max-w-[200px] truncate">{file.name}</span>
                                            </button>
                                            <div className="flex items-center gap-2">
                                              <button
                                                type="button"
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-tide/40 hover:text-tide disabled:cursor-not-allowed disabled:opacity-60"
                                                onClick={() => handlePreviewFile(file)}
                                                disabled={!canPreview || isPreviewing}
                                                aria-label="View file"
                                                title={isPreviewing ? "Loading..." : "View"}
                                              >
                                                <Eye className="h-4 w-4" />
                                              </button>
                                              <button
                                                type="button"
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                onClick={() => setFileDeleteTarget(file)}
                                                disabled={isDeleting || !canUseRfqActions || isRfqFormReadOnly}
                                                aria-label="Delete file"
                                                title={
                                                  isRfqFormReadOnly
                                                    ? "Read only in validation"
                                                    : isDeleting
                                                      ? "Removing..."
                                                      : "Delete"
                                                }
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </label>

                                <FormField label="Customer PN" name="customerPn" value={form.customerPn} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                                <FormField label="Revision level" name="revisionLevel" value={form.revisionLevel} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                              </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-soft transition hover:shadow-md">
                              <h3 className="mt-2 font-display text-xl font-semibold text-sun">Logistics details</h3>
                              <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <FormField label="Delivery zone" name="deliveryZone" value={form.deliveryZone} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                                <FormField label="Plant" name="plant" value={form.plant} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                                <FormField label="Country" name="country" value={form.country} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                                <FormField label="PO date" name="poDate" type="date" value={form.poDate} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                                <FormField label="Ppap date" name="ppapDate" type="date" value={form.ppapDate} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                                <FormField label="SOP year" name="sop" type="number" value={form.sop} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                                <FormField label="Quantity per year (K piece)" name="qtyPerYear" type="text" value={form.qtyPerYear} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                                <FormField label="RFQ reception date" name="rfqReceptionDate" type="date" value={form.rfqReceptionDate} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                                <FormField label="Expected quotation date" name="expectedQuotationDate" type="date" value={form.expectedQuotationDate} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                              </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-soft transition hover:shadow-md">
                              <h3 className="mt-2 font-display text-xl font-semibold text-sun">Contact details</h3>
                              <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <FormField label="Contact name" name="contactName" value={form.contactName} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                                <FormField label="Contact function" name="contactFunction" value={form.contactFunction} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                                <FormField label="Contact phone" name="contactPhone" value={form.contactPhone} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                                <FormField label="Contact email" name="contactEmail" type="email" value={form.contactEmail} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {activeStep === "step-request" ? (
                        <div
                          id="step-request"
                          className="scroll-mt-28 space-y-4 rounded-2xl border border-slate-200/70 bg-white/80 p-5"
                        >
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="col-span-full">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-1">
                                  <FormField
                                    label={form.targetPriceCurrency && form.targetPriceCurrency !== "EUR"
                                      ? `Target Price (${form.targetPriceCurrency})`
                                      : "Target Price (EUR)"}
                                    name={form.targetPriceCurrency && form.targetPriceCurrency !== "EUR"
                                      ? "targetPriceLocal"
                                      : "targetPrice"}
                                    type="number"
                                    value={form.targetPriceCurrency && form.targetPriceCurrency !== "EUR"
                                      ? (form.targetPriceLocal || "")
                                      : (form.targetPrice || "")}
                                    onChange={handleChange}
                                    readOnly={rfqFormFieldReadOnly}
                                  />
                                  {form.targetPriceCurrency && form.targetPriceCurrency !== "EUR" && form.targetPrice ? (
                                    <p className="mt-0.5 text-xs text-slate-400">
                                      ≈ {form.targetPrice} EUR
                                    </p>
                                  ) : null}
                                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                                    {isTargetPriceEstimated ? (
                                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-200">
                                        Estimated
                                      </span>
                                    ) : form.targetPrice || form.targetPriceLocal ? (
                                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                        Customer Price
                                      </span>
                                    ) : null}
                                    {form.targetPriceNote ? (
                                      <span className="text-[11px] italic text-slate-400" title={form.targetPriceNote}>
                                        {form.targetPriceNote.length > 40 ? form.targetPriceNote.slice(0, 40) + "…" : form.targetPriceNote}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <FormField label="Currency" name="targetPriceCurrency" value={form.targetPriceCurrency || ""} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                              </div>
                            </div>
                            <FormField label="Expected Delivery Conditions" name="expectedDeliveryConditions" value={form.expectedDeliveryConditions} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                            <FormField label="Expected Payment Terms" name="expectedPaymentTerms" value={form.expectedPaymentTerms} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                            <FormField label="Type of Packaging" name="typeOfPackaging" value={form.typeOfPackaging} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                            <FormField label="Business Trigger" name="businessTrigger" value={form.businessTrigger} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                            <FormField label="Customer Tooling Conditions" name="customerToolingConditions" value={form.customerToolingConditions} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                            <FormField label="Entry Barriers" name="entryBarriers" value={form.entryBarriers} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                          </div>
                        </div>
                      ) : null}

                      {activeStep === "step-schedule" ? (
                        <div
                          id="step-schedule"
                          className="scroll-mt-28 space-y-4 rounded-2xl border border-slate-200/70 bg-white/80 p-5"
                        >
                          <div className="grid gap-4 md:grid-cols-2">
                            <FormField label="Design responsible" name="designResponsible" value={form.designResponsible} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                            <FormField label="Validation responsible" name="validationResponsible" value={form.validationResponsible} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                            <FormField label="Design owner" name="designOwner" value={form.designOwner} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                            <FormField label="Development costs" name="developmentCosts" value={form.developmentCosts} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                            <FormField label="Technical capacity" name="technicalCapacity" value={form.technicalCapacity} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                            <FormField label="Scope" name="scope" value={form.scope} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                            <FormField label="Strategic note" name="strategicNote" value={form.strategicNote} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                            <FormField label="Final recommendation" name="finalRecommendation" value={form.finalRecommendation} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                          </div>
                        </div>
                      ) : null}

                      {activeStep === "step-notes" ? (
                        <div
                          id="step-notes"
                          className="scroll-mt-28 space-y-4 rounded-2xl border border-slate-200/70 bg-white/80 p-5"
                        >
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1">
                              <FormField
                                label={form.targetPriceCurrency && form.targetPriceCurrency !== "EUR"
                                  ? `TO (k${form.targetPriceCurrency})`
                                  : "TO (kEUR)"}
                                name={form.targetPriceCurrency && form.targetPriceCurrency !== "EUR"
                                  ? "toTotalLocal"
                                  : "toTotal"}
                                type="number"
                                value={form.targetPriceCurrency && form.targetPriceCurrency !== "EUR"
                                  ? (form.toTotalLocal || "")
                                  : (form.toTotal || "")}
                                onChange={handleChange}
                                readOnly={rfqFormFieldReadOnly}
                              />
                              {form.targetPriceCurrency && form.targetPriceCurrency !== "EUR" && form.toTotal ? (
                                <p className="mt-0.5 text-xs text-slate-400">
                                  ≈ {form.toTotal} kEUR
                                </p>
                              ) : null}
                            </div>
                            <FormField label="Validator Email" name="validatorEmail" type="email" value={form.validatorEmail} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </form>
                ) : null}

                {isRfqValidationView ? (
                  <form
                    onSubmit={handleSubmit}
                    className={`card flex min-h-0 flex-col gap-6 overflow-y-visible p-5 sm:p-7 md:p-8 lg:h-full lg:min-h-0 lg:overflow-y-auto ${showRfqStepNavigation ? "md:col-span-1 lg:col-span-2" : "col-span-full"}`}
                  >
                    <section className="shrink-0 rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-soft">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                            Checklist
                          </p>
                          <h3 className="mt-2 font-display text-xl text-ink">
                            RFQ form completion
                          </h3>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {STEPS.map((step, index) => {
                          const complete = Boolean(stepStates[step.id]?.isComplete);
                          return (
                            <button
                              key={step.id}
                              type="button"
                              onClick={() => handleStepViewChange(step.id)}
                              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-left transition hover:border-tide/40 hover:bg-white"
                            >
                              <div>
                                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                                  Step {index + 1}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-ink">
                                  {step.label}
                                </p>
                              </div>
                              <span
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${complete
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-sun/30 bg-sun/10 text-sun"
                                  }`}
                              >
                                {complete ? "Completed" : "Pending"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    {!hideValidationActionButtons ? (
                      <div className="shrink-0 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200/70 pt-2">
                        <button
                          type="button"
                          className="inline-flex min-w-[124px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={handleValidationUpdate}
                          disabled={validationButtonsDisabled}
                        >
                          <Pencil className="h-4 w-4" />
                          Update
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-w-[124px] items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-600 shadow-sm transition hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={handleRejectValidation}
                          disabled={validationButtonsDisabled}
                        >
                          <X className="h-4 w-4" />
                          {validationActionId === "reject" ? "Rejecting..." : "Reject"}
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-w-[124px] items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(5,150,105,0.9)] transition hover:-translate-y-0.5 hover:border-emerald-700 hover:bg-emerald-700 hover:shadow-[0_18px_34px_-18px_rgba(4,120,87,0.95)] disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={handleApproveValidation}
                          disabled={validationButtonsDisabled}
                        >
                          <Check className="h-4 w-4" />
                          {validationActionId === "approve" ? "Approving..." : "Approve"}
                        </button>
                      </div>
                    ) : null}

                    {hasRecordedValidationDecision ? (
                      <section
                        className={`shrink-0 overflow-hidden rounded-[28px] border p-5 shadow-soft ${isValidationRejected
                          ? "border-red-200/80 bg-gradient-to-br from-red-50 via-white to-white"
                          : "border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-white"
                          }`}
                      >
                        <div
                          className={`flex flex-wrap items-start justify-between gap-4 border-b pb-4 ${isValidationRejected ? "border-red-100/80" : "border-emerald-100/80"
                            }`}
                        >
                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                              Validation audit
                            </p>
                            <div>
                              <h4 className="text-lg font-semibold text-ink">
                                Decision recorded
                              </h4>
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${isValidationRejected
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                              }`}
                          >
                            {isValidationRejected ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                            {isValidationRejected ? "Rejected" : "Approved"}
                          </span>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          {isValidationRejected ? (
                            <>
                              <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                  Rejected at
                                </p>
                                <p className="mt-2 text-base font-semibold text-ink">
                                  {formatValidationAuditDate(validationAudit.rejectedAt)}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                  Rejected by
                                </p>
                                <p className="mt-2 text-base font-semibold text-ink">
                                  {formatValidationAuditValue(validationAudit.rejectedBy)}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm md:col-span-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                  Rejected reason
                                </p>
                                <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-ink">
                                  {formatValidationAuditValue(validationAudit.rejectionReason)}
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="rounded-2xl border border-emerald-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                  Approved at
                                </p>
                                <p className="mt-2 text-base font-semibold text-ink">
                                  {formatValidationAuditDate(validationAudit.approvedAt)}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-emerald-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                  Approved by
                                </p>
                                <p className="mt-2 text-base font-semibold text-ink">
                                  {formatValidationAuditValue(validationAudit.approvedBy)}
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                      </section>
                    ) : null}
                  </form>
                ) : null}

                {showChatPanel ? (
                  <div className="h-[60vh] min-h-[320px] overflow-hidden md:col-span-2 md:h-[55vh] lg:col-span-1 lg:h-full lg:min-h-0 lg:overflow-hidden lg:sticky lg:top-0">
                    {chatCollapsed ? (
                      <div className="card flex h-full flex-col items-center justify-center gap-3 p-3">
                        <button
                          type="button"
                          onClick={() => setChatCollapsed(false)}
                          className="collapse-toggle"
                          aria-label="Expand chatbot"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-tide/10 text-tide">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                          </svg>
                        </div>
                      </div>
                    ) : (
                      <div className="relative h-full">
                        <button
                          type="button"
                          onPointerDown={handleResizeStart}
                          className="chat-resize-handle"
                          aria-label="Resize chatbot"
                        >
                          <span className="h-12 w-1 rounded-full bg-slate-300/80" />
                        </button>
                        <ChatPanel
                          messages={chatFeed}
                          onSend={handleChatSend}
                          onEditMessage={
                            isOfferStage
                              ? handleOfferChatEdit
                              : activeRfqTab === "new"
                                ? handleRfqChatEdit
                                : undefined
                          }
                          readOnly={isChatLocked}
                          readOnlyMessage={chatReadOnlyMessage}
                          onCollapse={() => setChatCollapsed(true)}
                          eyebrow={
                            activeRfqTab === "potential"
                              ? "Potential"
                              : isOfferStage
                                ? "Offer"
                                : "Chatbot"
                          }
                          title={
                            activeRfqTab === "potential"
                              ? "Potential Assistant"
                              : isOfferStage
                                ? "Offer Assistant"
                              : "RFQ Assistant"
                          }
                        />
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {discussionModalOpen ? (
        <div
          className="chat-modal-backdrop"
          onClick={() => setDiscussionModalOpen(false)}
          role="presentation"
        >
          <div
            className="chat-modal chat-modal--discussion"
            role="dialog"
            aria-modal="true"
            aria-label="Discussion"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <div>
                <p className="chat-modal-title mt-1">Discussion</p>
                <p className="mt-1 text-sm text-slate-500">
                  Exchange messages about this RFQ in a clear and centralized space.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  {discussionMessages.length} message{discussionMessages.length > 1 ? "s" : ""}
                </span>

                <button
                  type="button"
                  className="chat-modal-close"
                  onClick={() => setDiscussionModalOpen(false)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="chat-modal-body p-0">
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
                  {discussionLoading ? (
                    <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/80 px-6 py-12 text-center shadow-soft">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-tide/10 text-tide">
                        <MessageSquare className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-base font-semibold text-ink">
                        Loading discussion
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        Fetching the messages for this phase.
                      </p>
                    </div>
                  ) : discussionMessages.length ? (
                    <div className="flex flex-col gap-4">
                      {discussionMessages.map((message) => {
                        const isCurrentUser =
                          normalizeEmailValue(message.authorEmail) ===
                          normalizeEmailValue(currentUserEmail);
                        const isOwnerReply = message.authorRole === "OWNER";
                        const authorLabel =
                          message.authorName ||
                          message.authorEmail ||
                          (isOwnerReply ? "Owner" : "User");

                        return (
                          <div
                            key={message.id}
                            className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}
                          >
                            <article
                              className={`max-w-[min(100%,42rem)] rounded-[26px] border px-4 py-3 shadow-sm ${isCurrentUser
                                ? "border-tide/30 bg-tide text-white"
                                : isOwnerReply
                                  ? "border-amber-200 bg-amber-50/95 text-ink"
                                  : "border-slate-200/80 bg-white/95 text-ink"
                                }`}
                            >
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className={`font-semibold ${isCurrentUser ? "text-white" : "text-slate-700"}`}>
                                  {authorLabel}
                                </span>
                                {isOwnerReply ? (
                                  <span className={`rounded-full border px-2 py-0.5 font-semibold ${isCurrentUser
                                    ? "border-white/20 bg-white/15 text-white"
                                    : "border-amber-200 bg-white/70 text-amber-700"
                                    }`}>
                                    Owner
                                  </span>
                                ) : null}
                                <span className={isCurrentUser ? "text-white/75" : "text-slate-400"}>
                                  {formatDiscussionDate(message.createdAt)}
                                </span>
                              </div>
                              <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${isCurrentUser ? "text-white" : "text-slate-700"}`}>
                                {message.content}
                              </p>
                            </article>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/80 px-6 py-12 text-center shadow-soft">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-tide/10 text-tide">
                        <MessageSquare className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-base font-semibold text-ink">
                        No discussion yet
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        Start the conversation for this phase with a new message.
                      </p>
                    </div>
                  )}
                </div>

                <form
                  onSubmit={handleDiscussionSend}
                  className="border-t border-slate-200/70 bg-white/90 p-5 sm:p-6"
                >
                  <div className="space-y-3">
                    {discussionError ? (
                      <p className="text-sm font-medium text-red-600">
                        {discussionError}
                      </p>
                    ) : null}
                    <textarea
                      className="textarea-field min-h-[80px]"
                      value={discussionDraft}
                      onChange={(event) => setDiscussionDraft(event.target.value)}
                      disabled={
                        discussionSending ||
                        discussionLoading ||
                        !canParticipateInDiscussion
                      }
                      placeholder="Write a message for this phase..."
                    />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="submit"
                        className="ml-auto inline-flex items-center justify-center gap-2 rounded-xl border border-tide bg-tide px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#055d92] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={
                          discussionSending ||
                          discussionLoading ||
                          !canParticipateInDiscussion ||
                          !String(discussionDraft || "").trim()
                        }
                      >
                        <SendHorizontal className="h-4 w-4" />
                        {discussionSending ? "Sending..." : "Send message"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isCostingDiscussionOpen ? (
        <div
          className="chat-modal-backdrop"
          onClick={() => setIsCostingDiscussionOpen(false)}
          role="presentation"
        >
          <div
            className="chat-modal chat-modal--discussion"
            role="dialog"
            aria-modal="true"
            aria-label="Costing discussion"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <div>
                <p className="chat-modal-title mt-1">Discussion</p>
                <p className="mt-1 text-sm text-slate-500">
                  Exchange targeted messages for the Costing phase in a clear and centralized space.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  {costingDiscussionMessages.length} message{costingDiscussionMessages.length > 1 ? "s" : ""}
                </span>

                <button
                  type="button"
                  className="chat-modal-close"
                  onClick={() => setIsCostingDiscussionOpen(false)}
                  aria-label="Close costing discussion"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="chat-modal-body p-0">
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
                  {costingDiscussionLoading ? (
                    <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/80 px-6 py-12 text-center shadow-soft">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-tide/10 text-tide">
                        <MessageSquare className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-base font-semibold text-ink">
                        Loading costing discussion
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        Fetching the latest costing messages.
                      </p>
                    </div>
                  ) : costingDiscussionMessages.length ? (
                    <div className="flex flex-col gap-4">
                      {costingDiscussionMessages.map((message) => {
                        const isCurrentUser =
                          normalizeEmailValue(message.authorEmail) ===
                          normalizeEmailValue(currentUserEmail);
                        const authorLabel =
                          message.authorName || message.authorEmail || "User";

                        return (
                          <div
                            key={message.id}
                            className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}
                          >
                            <article
                              className={`max-w-[min(100%,42rem)] rounded-[26px] border px-4 py-3 shadow-sm ${isCurrentUser
                                ? "border-tide/30 bg-tide text-white"
                                : "border-slate-200/80 bg-white/95 text-ink"
                                }`}
                            >
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className={`font-semibold ${isCurrentUser ? "text-white" : "text-slate-700"}`}>
                                  {authorLabel}
                                </span>
                                {message.recipientEmail ? (
                                  <span className={`rounded-full border px-2 py-0.5 font-semibold ${isCurrentUser
                                    ? "border-white/20 bg-white/15 text-white"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                                    }`}>
                                    To {message.recipientEmail}
                                  </span>
                                ) : null}
                                <span className={isCurrentUser ? "text-white/75" : "text-slate-400"}>
                                  {formatDiscussionDate(message.createdAt)}
                                </span>
                              </div>
                              <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${isCurrentUser ? "text-white" : "text-slate-700"}`}>
                                {message.content}
                              </p>
                            </article>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/80 px-6 py-12 text-center shadow-soft">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-tide/10 text-tide">
                        <MessageSquare className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-base font-semibold text-ink">
                        No discussion yet
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        Start the conversation for this phase with a new message.
                      </p>
                    </div>
                  )}
                </div>

                <form
                  onSubmit={handleCostingDiscussionSend}
                  className="border-t border-slate-200/70 bg-white/90 p-5 sm:p-6"
                >
                  <div className="space-y-3">
                    {costingDiscussionError ? (
                      <p className="text-sm font-medium text-red-600">
                        {costingDiscussionError}
                      </p>
                    ) : null}
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Recipient email
                        </label>
                        <input
                          className="input-field"
                          type="email"
                          list="costing-recipient-options"
                          value={costingDiscussionRecipient}
                          onChange={(event) => setCostingDiscussionRecipient(event.target.value)}
                          disabled={costingDiscussionSending || !canParticipateInCostingDiscussion}
                          placeholder="recipient@avocarbon.com"
                        />
                        <datalist id="costing-recipient-options">
                          {knownCostingRecipients.map((email) => (
                            <option key={email} value={email} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Message
                        </label>
                        <textarea
                          className="textarea-field min-h-[110px]"
                          value={costingDiscussionDraft}
                          onChange={(event) => setCostingDiscussionDraft(event.target.value)}
                          disabled={costingDiscussionSending || !canParticipateInCostingDiscussion}
                          placeholder="Write the costing note you want to send..."
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-slate-500">
                        {canParticipateInCostingDiscussion
                          ? "The recipient will receive a notification email and the message will stay in this thread."
                          : "Costing discussion is read-only for your role."}
                      </p>
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-tide bg-tide px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#055d92] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={
                          costingDiscussionSending ||
                          !canParticipateInCostingDiscussion ||
                          !String(costingDiscussionDraft || "").trim() ||
                          !String(costingDiscussionRecipient || "").trim()
                        }
                      >
                        <SendHorizontal className="h-4 w-4" />
                        {costingDiscussionSending ? "Sending..." : "Send message"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {false && filesPanelOpen ? (
        <div
          className="chat-modal-backdrop"
          onClick={() => setFilesPanelOpen(false)}
          role="presentation"
        >
          <div
            className="chat-modal chat-modal--preview"
            role="dialog"
            aria-modal="true"
            aria-label="RFQ files"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <div>
                <p className="chat-modal-title">RFQ files</p>
                <p className="mt-1 text-sm text-slate-500">
                  {sortedFiles.length} item{sortedFiles.length > 1 ? "s" : ""} available
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => rfqFileInputRef.current?.click()}
                  disabled={!allowFileUpload}
                >
                  <Upload className="h-4 w-4" />
                  Add files
                </button>
                <button
                  type="button"
                  className="chat-modal-close"
                  onClick={() => setFilesPanelOpen(false)}
                  aria-label="Close file list"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12" />
                    <path d="M18 6l-12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="chat-modal-body p-0">
              {sortedFiles.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200/70 text-left">
                    <thead className="bg-slate-50/80">
                      <tr className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        <th className="px-6 py-4">Title</th>
                        <th className="px-6 py-4">Owner</th>
                        <th className="px-6 py-4">Last modified</th>
                        <th className="px-6 py-4">Size</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 bg-white text-sm text-slate-600">
                      {sortedFiles.map((file) => {
                        const canPreview = Boolean(file.url);
                        const isDeleting = fileActionId === file.id;
                        const isPreviewing = filePreviewLoadingId === file.id;
                        return (
                          <tr key={file.id} className="align-middle">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <span
                                  className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[11px] font-bold uppercase ${getFileAccentClasses(file.name)}`}
                                >
                                  {getFileExtension(file.name).slice(0, 4)}
                                </span>
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    className={`max-w-full truncate text-left font-semibold text-tide ${canPreview ? "hover:text-ink" : "cursor-not-allowed opacity-60"}`}
                                    onClick={() => {
                                      setFilesPanelOpen(false);
                                      handlePreviewFile(file);
                                    }}
                                    disabled={!canPreview || isPreviewing}
                                  >
                                    {file.name}
                                  </button>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {getFileExtension(file.name).toLowerCase()}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {file.owner || "Unknown"}
                            </td>
                            <td className="px-6 py-4">
                              {formatFileDate(file.updatedAt, { withTime: true })}
                            </td>
                            <td className="px-6 py-4">
                              {formatFileSize(file.size)}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-tide/40 hover:text-tide disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => {
                                    setFilesPanelOpen(false);
                                    handlePreviewFile(file);
                                  }}
                                  disabled={!canPreview || isPreviewing}
                                  aria-label="Preview file"
                                  title={isPreviewing ? "Loading..." : "Preview"}
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => {
                                    setFilesPanelOpen(false);
                                    setFileDeleteTarget(file);
                                  }}
                                  disabled={isDeleting || !canUseRfqActions || isRfqFormReadOnly}
                                  aria-label="Delete file"
                                  title={isDeleting ? "Removing..." : "Delete"}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="chat-modal-fallback py-12">
                  <p className="text-base font-semibold text-ink">No files yet</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Add files to this RFQ and they will appear here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {filePreview ? (
        <div className="chat-modal-backdrop" onClick={() => setFilePreview(null)} role="presentation">
          <div
            className="chat-modal chat-modal--preview"
            role="dialog"
            aria-modal="true"
            aria-label={filePreview.name}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <p className="chat-modal-title">{filePreview.name}</p>
              <button
                type="button"
                className="chat-modal-close"
                onClick={() => setFilePreview(null)}
                aria-label="Close preview"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body">{renderFilePreview(filePreview)}</div>
          </div>
        </div>
      ) : null}

      {templatePreviewModalOpen ? (
        <div
          className="chat-modal-backdrop"
          onClick={() => setTemplatePreviewModalOpen(false)}
          role="presentation"
        >
          <div
            className="chat-modal chat-modal--preview"
            role="dialog"
            aria-modal="true"
            aria-label="Costing feasibility PDF preview"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <p className="chat-modal-title">{templatePreviewFilename || templateDefaultFilename}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="outline-button px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleDownloadCostingPdfTemplate}
                  disabled={templateDownloadPending}
                >
                  {templateDownloadPending ? "Preparing PDF file..." : "Download PDF"}
                </button>
                <button
                  type="button"
                  className="chat-modal-close"
                  onClick={() => setTemplatePreviewModalOpen(false)}
                  aria-label="Close PDF preview"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12" />
                    <path d="M18 6l-12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="chat-modal-body">
              {templatePreviewUrl ? (
                <iframe
                  title="Costing feasibility PDF preview"
                  src={templatePreviewUrl}
                  className="chat-modal-frame"
                />
              ) : (
                <div className="chat-modal-fallback">
                  <p>Preview not available for this PDF.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selfValidationPromptOpen ? (
        <div className="chat-modal-backdrop" role="presentation">
          <div
            className="chat-modal max-w-[580px] border border-slate-200/80 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]"
            role="dialog"
            aria-modal="true"
            aria-label="Validation required"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <p className="chat-modal-title">You are the validator for this RFQ</p>
            </div>
            <div className="chat-modal-body">
              <div className="w-full">
                <p className="text-sm leading-6 text-slate-600">
                  Please review this RFQ and validate it. Clicking below will open the
                  <span className="font-semibold text-tide"> Validation </span>
                  tab.
                </p>
                <div className="chat-modal-actions justify-end mt-5">
                  <button
                    type="button"
                    className="gradient-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold shadow-soft"
                    onClick={handleConfirmSelfValidationPrompt}
                  >
                    <Check className="h-4 w-4" />
                    Open Validation
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {fileDeleteTarget ? (
        <div
          className="chat-modal-backdrop"
          onClick={() => setFileDeleteTarget(null)}
          role="presentation"
        >
          <div
            className="chat-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete file"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <p className="chat-modal-title">Delete file?</p>
              <button
                type="button"
                className="chat-modal-close"
                onClick={() => setFileDeleteTarget(null)}
                aria-label="Close confirmation"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body">
              <div className="chat-modal-fallback">
                <p>
                  Are you sure you want to delete{" "}
                  <strong>{fileDeleteTarget.name}</strong>?
                </p>
                <div className="chat-modal-actions justify-end">
                  <button
                    type="button"
                    className="outline-button px-4 py-2 text-xs"
                    onClick={() => setFileDeleteTarget(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 shadow-sm transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleConfirmDelete}
                    disabled={fileActionId === fileDeleteTarget.id}
                  >
                    {fileActionId === fileDeleteTarget.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {costingFileActionModalOpen ? (
        <div
          className="chat-modal-backdrop"
          onClick={handleCloseCostingFileActionModal}
          role="presentation"
        >
          <div
            className="chat-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Costing file action"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <p className="chat-modal-title">
                {costingFileActionMode === "NA" ? "Mark As Not Applicable" : "Upload Feasibility File"}
              </p>
              <button
                type="button"
                className="chat-modal-close"
                onClick={handleCloseCostingFileActionModal}
                aria-label="Close costing action modal"
                disabled={costingFileActionPending}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body">
              <form className="chat-modal-fallback w-full" onSubmit={handleSubmitCostingFileAction}>
                <p className="text-slate-600">
                  {costingFileActionMode === "NA"
                    ? "Explain why the feasibility file is not applicable for this RFQ."
                    : "Upload the completed feasibility file and add a note explaining what was submitted."}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Selected status
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getFeasibilityStatusBadgeClasses(
                      costingFeasibilityStatus
                    )}`}
                  >
                    {hasSelectedCostingFeasibilityStatus
                      ? formatFeasibilityStatusLabel(costingFeasibilityStatus)
                      : "Not selected yet"}
                  </span>
                </div>
                {costingFileActionMode === "UPLOADED" ? (
                  <label className="mt-4 flex w-full flex-col gap-2 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                    <span>File</span>
                    <input
                      className="input-field"
                      type="file"
                      onChange={handleCostingFileDraftChange}
                      disabled={costingFileActionPending || !canManageCostingFeasibilityHandoff}
                    />
                    {costingFileActionDraft ? (
                      <span className="text-[11px] normal-case tracking-normal text-slate-500">
                        {costingFileActionDraft.name}
                      </span>
                    ) : null}
                  </label>
                ) : null}
                <label className="mt-4 flex w-full flex-col gap-2 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <span>Note</span>
                  <textarea
                    className="textarea-field min-h-[140px]"
                    value={costingFileActionNote}
                    onChange={(event) => setCostingFileActionNote(event.target.value)}
                    placeholder="Describe the file or explain why it is not applicable..."
                    disabled={costingFileActionPending || !canManageCostingFeasibilityHandoff}
                  />
                </label>
                <div className="chat-modal-actions justify-end">
                  <button
                    type="button"
                    className="outline-button px-4 py-2 text-xs"
                    onClick={handleCloseCostingFileActionModal}
                    disabled={costingFileActionPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="gradient-button rounded-xl px-4 py-2 text-xs font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      costingFileActionPending ||
                      !costingFeasibilityStatus ||
                      !canManageCostingFeasibilityHandoff
                    }
                  >
                    {costingFileActionPending
                      ? "Saving..."
                      : costingFileActionMode === "NA"
                        ? "Save note"
                        : "Upload and save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {pricingBomModalOpen ? (
        <div
          className="chat-modal-backdrop"
          onClick={handleClosePricingBomModal}
          role="presentation"
        >
          <div
            className="chat-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Upload pricing BOM file"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <p className="chat-modal-title">Upload Costing File With BOM Data</p>
              <button
                type="button"
                className="chat-modal-close"
                onClick={handleClosePricingBomModal}
                aria-label="Close pricing BOM modal"
                disabled={pricingBomPending}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body">
              <form className="chat-modal-fallback w-full" onSubmit={handleSubmitPricingBomUpload}>
                <p className="text-slate-600">
                  Upload the costing file with BOM data and add a note describing what is included.
                </p>
                <label className="mt-4 flex w-full flex-col gap-2 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <span>File</span>
                  <input
                    className="input-field"
                    type="file"
                    onChange={handlePricingBomDraftChange}
                    disabled={pricingBomPending || !canManagePricingBom}
                  />
                  {pricingBomDraft ? (
                    <span className="text-[11px] normal-case tracking-normal text-slate-500">
                      {pricingBomDraft.name}
                    </span>
                  ) : null}
                </label>
                <label className="mt-4 flex w-full flex-col gap-2 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <span>Note</span>
                  <textarea
                    className="textarea-field min-h-[140px]"
                    value={pricingBomNote}
                    onChange={(event) => setPricingBomNote(event.target.value)}
                    placeholder="Describe the costing BOM package..."
                    disabled={pricingBomPending || !canManagePricingBom}
                  />
                </label>
                <div className="chat-modal-actions justify-end">
                  <button
                    type="button"
                    className="outline-button px-4 py-2 text-xs"
                    onClick={handleClosePricingBomModal}
                    disabled={pricingBomPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="gradient-button rounded-xl px-4 py-2 text-xs font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={pricingBomPending || !canManagePricingBom}
                  >
                    {pricingBomPending ? "Uploading..." : "Upload and save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {pricingFinalPriceModalOpen ? (
        <div
          className="chat-modal-backdrop"
          onClick={handleClosePricingFinalPriceModal}
          role="presentation"
        >
          <div
            className="chat-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Upload pricing final price file"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <p className="chat-modal-title">Upload Costing File With Final Price</p>
              <button
                type="button"
                className="chat-modal-close"
                onClick={handleClosePricingFinalPriceModal}
                aria-label="Close pricing final price modal"
                disabled={pricingFinalPricePending}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body">
              <form className="chat-modal-fallback w-full" onSubmit={handleSubmitPricingFinalPriceUpload}>
                <p className="text-slate-600">
                  Upload the costing file with final price and add a note describing the validated pricing package.
                </p>
                <label className="mt-4 flex w-full flex-col gap-2 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <span>File</span>
                  <input
                    className="input-field"
                    type="file"
                    onChange={handlePricingFinalPriceDraftChange}
                    disabled={pricingFinalPricePending || !canManagePricingFinalPrice}
                  />
                  {pricingFinalPriceDraft ? (
                    <span className="text-[11px] normal-case tracking-normal text-slate-500">
                      {pricingFinalPriceDraft.name}
                    </span>
                  ) : null}
                </label>
                <label className="mt-4 flex w-full flex-col gap-2 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <span>Note</span>
                  <textarea
                    className="textarea-field min-h-[140px]"
                    value={pricingFinalPriceNote}
                    onChange={(event) => setPricingFinalPriceNote(event.target.value)}
                    placeholder="Describe the final pricing package..."
                    disabled={pricingFinalPricePending || !canManagePricingFinalPrice}
                  />
                </label>
                <div className="chat-modal-actions justify-end">
                  <button
                    type="button"
                    className="outline-button px-4 py-2 text-xs"
                    onClick={handleClosePricingFinalPriceModal}
                    disabled={pricingFinalPricePending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="gradient-button rounded-xl px-4 py-2 text-xs font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={pricingFinalPricePending || !canManagePricingFinalPrice}
                  >
                    {pricingFinalPricePending ? "Uploading..." : "Upload file"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {pricingFileRejectModalOpen ? (
        <div
          className="chat-modal-backdrop"
          onClick={handleClosePricingFileRejectModal}
          role="presentation"
        >
          <div
            className="chat-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Reject pricing file validation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header border-b-red-100 bg-red-50/70">
              <p className="chat-modal-title text-red-700">Reject pricing file validation</p>
              <button
                type="button"
                className="chat-modal-close h-10 w-10 rounded-xl border border-red-200/70 bg-white text-red-500 shadow-sm hover:border-red-300 hover:bg-red-50"
                onClick={handleClosePricingFileRejectModal}
                aria-label="Close pricing file reject modal"
                disabled={pricingFileValidationActionId === "reject"}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body bg-gradient-to-b from-red-50/30 to-white">
              <div className="chat-modal-fallback w-full">
                <p className="text-slate-600">
                  Please provide the rejection reason before continuing.
                </p>
                <label className="mt-2 flex w-full flex-col gap-2 text-left text-xs font-semibold uppercase tracking-widest text-red-600">
                  <span>Reason</span>
                  <textarea
                    className="textarea-field min-h-[120px] border-red-200/80 bg-white focus:border-red-300 focus:ring-red-200"
                    value={pricingFileRejectReason}
                    onChange={(event) => setPricingFileRejectReason(event.target.value)}
                    placeholder="Explain why this pricing file is rejected..."
                    disabled={pricingFileValidationActionId === "reject" || !canValidatePricingFile}
                  />
                </label>
                <div className="chat-modal-actions justify-end">
                  <button
                    type="button"
                    className="inline-flex min-w-[116px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleClosePricingFileRejectModal}
                    disabled={pricingFileValidationActionId === "reject"}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-w-[116px] items-center justify-center gap-2 rounded-2xl border border-red-300 bg-red-500 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:border-red-400 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleConfirmPricingFileReject}
                    disabled={pricingFileValidationActionId === "reject" || !canValidatePricingFile}
                  >
                    <X className="h-4 w-4" />
                    {pricingFileValidationActionId === "reject" ? "Rejecting..." : "Reject"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {revisionRequestModalOpen ? (
        <div
          className="chat-modal-backdrop"
          onClick={handleCloseRevisionRequestModal}
          role="presentation"
        >
          <div
            className="chat-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Request revision"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <p className="chat-modal-title">Request Revision</p>
              <button
                type="button"
                className="chat-modal-close"
                onClick={handleCloseRevisionRequestModal}
                aria-label="Close revision request modal"
                disabled={revisionActionId === "request"}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body">
              <div className="chat-modal-fallback w-full">
                <p className="text-slate-600">
                  Tell the sales representative exactly what needs to be updated.
                </p>
                <label className="mt-2 flex w-full flex-col gap-2 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <span>Instructions</span>
                  <textarea
                    className="textarea-field min-h-[140px]"
                    value={revisionComment}
                    onChange={(event) => setRevisionComment(event.target.value)}
                    placeholder="Describe the required changes..."
                    disabled={revisionActionId === "request"}
                  />
                </label>
                <div className="chat-modal-actions justify-end">
                  <button
                    type="button"
                    className="outline-button px-4 py-2 text-xs"
                    onClick={handleCloseRevisionRequestModal}
                    disabled={revisionActionId === "request"}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="gradient-button rounded-xl px-4 py-2 text-xs font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleSubmitRevisionRequest}
                    disabled={revisionActionId === "request"}
                  >
                    {revisionActionId === "request" ? "Sending..." : "Send revision request"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {rejectModalOpen ? (
        <div
          className="chat-modal-backdrop"
          onClick={handleCloseRejectModal}
          role="presentation"
        >
          <div
            className="chat-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Reject RFQ"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header border-b-red-100 bg-red-50/70">
              <p className="chat-modal-title text-red-700">Reject RFQ</p>
              <button
                type="button"
                className="chat-modal-close h-10 w-10 rounded-xl border border-red-200/70 bg-white text-red-500 shadow-sm hover:border-red-300 hover:bg-red-50"
                onClick={handleCloseRejectModal}
                aria-label="Close reject modal"
                disabled={validationActionId === "reject"}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body bg-gradient-to-b from-red-50/30 to-white">
              <div className="chat-modal-fallback w-full">
                <p className="text-slate-600">
                  Please provide the rejection reason before continuing.
                </p>
                <label className="mt-2 flex w-full flex-col gap-2 text-left text-xs font-semibold uppercase tracking-widest text-red-600">
                  <span>Reason</span>
                  <textarea
                    className="textarea-field min-h-[120px] border-red-200/80 bg-white focus:border-red-300 focus:ring-red-200"
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    placeholder="Explain why this RFQ is rejected..."
                    disabled={validationActionId === "reject"}
                  />
                </label>
                <div className="chat-modal-actions justify-end">
                  <button
                    type="button"
                    className="inline-flex min-w-[116px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleCloseRejectModal}
                    disabled={validationActionId === "reject"}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-w-[116px] items-center justify-center gap-2 rounded-2xl border border-red-300 bg-red-500 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:border-red-400 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleConfirmRejectValidation}
                    disabled={validationActionId === "reject"}
                  >
                    <X className="h-4 w-4" />
                    {validationActionId === "reject" ? "Rejecting..." : "Reject"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {costingRejectModalOpen ? (
        <div
          className="chat-modal-backdrop"
          onClick={handleCloseCostingRejectModal}
          role="presentation"
        >
          <div
            className="chat-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Reject feasibility"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header border-b-red-100 bg-red-50/70">
              <p className="chat-modal-title text-red-700">Reject feasibility</p>
              <button
                type="button"
                className="chat-modal-close h-10 w-10 rounded-xl border border-red-200/70 bg-white text-red-500 shadow-sm hover:border-red-300 hover:bg-red-50"
                onClick={handleCloseCostingRejectModal}
                aria-label="Close feasibility reject modal"
                disabled={costingReviewActionId === "reject"}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body bg-gradient-to-b from-red-50/30 to-white">
              <div className="chat-modal-fallback w-full">
                <p className="text-slate-600">
                  Please provide the rejection reason before continuing.
                </p>
                <label className="mt-2 flex w-full flex-col gap-2 text-left text-xs font-semibold uppercase tracking-widest text-red-600">
                  <span>Reason</span>
                  <textarea
                    className="textarea-field min-h-[120px] border-red-200/80 bg-white focus:border-red-300 focus:ring-red-200"
                    value={costingRejectReason}
                    onChange={(event) => setCostingRejectReason(event.target.value)}
                    placeholder="Explain why this feasibility is rejected..."
                    disabled={costingReviewActionId === "reject"}
                  />
                </label>
                <div className="chat-modal-actions justify-end">
                  <button
                    type="button"
                    className="inline-flex min-w-[116px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleCloseCostingRejectModal}
                    disabled={costingReviewActionId === "reject"}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-w-[116px] items-center justify-center gap-2 rounded-2xl border border-red-300 bg-red-500 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:border-red-400 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleConfirmCostingRejectReview}
                    disabled={costingReviewActionId === "reject"}
                  >
                    <X className="h-4 w-4" />
                    {costingReviewActionId === "reject" ? "Rejecting..." : "Reject"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
