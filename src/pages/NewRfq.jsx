import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { Bot, Check, Download, ExternalLink, Eye, Files, FolderOpen, MessageSquare, Pencil, Plus, SendHorizontal, Trash2, Upload, X } from "lucide-react"; // ClipboardList removed (action plan disabled)
import { getUserProfile } from "../utils/session.js";
import { useNavigate, useSearchParams } from "react-router-dom";
import costingTemplate from "../assets/costing_template.xlsm?url";
import feasibilityTemplate from "../assets/feasibility_template.xlsm?url";
import ChatPanel from "../components/ChatPanel.jsx";
import FormField from "../components/FormField.jsx";
import SearchableSelectField from "../components/SearchableSelectField.jsx";
import TopBar from "../components/TopBar.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import {
  advanceRfqStatus,
  assignValidator,
  authorizedFetch,
  createRfq,
  downloadCostingTemplate,
  downloadOfferTemplate,
  deleteRfqFile,
  editOfferChatMessage,
  editPotentialChatMessage,
  editRfqChatMessage,
  getCostingMessages,
  getRfqAuditLogs,
  getRfqAiValidationStatus,
  getRfqDiscussion,
  getRfq,
  postCostingMessage,
  postRfqDiscussion,
  proceedToFormalRfq,
  requestRevision,
  listProducts,
  listSalesCustomers,
  sendAutofillChat,
  sendChat,
  sendOfferChat,
  sendPotentialChat,
  deleteCostingFileEntry,
  submitCostingFileAction,
  submitCostingReview,
  submitCostingValidation,
  submitRevision,
  submitRfq,
  unlockChatForEdit,
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
  sanitizeAssistantChatContent,
  mapPotentialToForm,
  mapRfqDataToForm,
  calculateProductTargetTo,
  calculateTotalTargetTo,
  createEmptyProductItem,
  createEmptyVolumeItem,
  DELIVERY_ZONE_OPTIONS,
  getDeliveryZoneOptions,
  normalizeAutomotiveType,
  normalizeProductsForPayload,
  normalizeVolumesForPayload,
  sanitizeNumberForInput
} from "../utils/rfq.js";
import { formatStandardTimestamp } from "../utils/dateUtils.js";
import { useEurFxRates } from "../utils/useEurFxRates.js";
const COSTING_READ_ONLY_ROLES = ["COSTING_TEAM", "RND", "PLM"];
const RFQ_CREATOR_ROLES = ["OWNER", "COMMERCIAL", "ZONE_MANAGER"];
const AI_CONVERSATION_URL_PATTERN = /(?:^|\n)\s*Conversation URL:\s*(https?:\/\/\S+)/i;
function extractAiConversationMeta(aiValidation) {
  const rawDiscussion = String(
    aiValidation?.discussion || aiValidation?.message || ""
  ).trim();
  const explicitConversationUrl = String(aiValidation?.conversation_url || "").trim();
  const matchedConversationUrl =
    explicitConversationUrl ||
    rawDiscussion.match(AI_CONVERSATION_URL_PATTERN)?.[1] ||
    "";
  return {
    conversationUrl: matchedConversationUrl,
  };
}
const initialForm = {
  id: "",
  automotiveType: "",
  customer: "",
  client: "",
  contact: "",
  email: "",
  phone: "",
  application: "",
  productName: "",
  productLine: "",
  projectName: "",
  products: [createEmptyProductItem()],
  volumes: [createEmptyVolumeItem()],
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
  targetPriceIsEstimated: null,
  targetPriceNote: "",
  deliveryIncoterm: "",
  incotermLocation: "",
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
  status: "New RFQ",
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
    label: "Customer Data & Delivery Details",
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
const STEP_REQUIREMENT_REQUIRED = "required";
const STEP_REQUIREMENT_OPTIONAL = "optional";
const RFQ_STEP_REQUIREMENTS = {
  "step-client": {
    required: [
      "automotiveType",
      "customer",
      "application",
      "productName",
      "productLine",
      "projectName",
      "rfqFiles",
      "products",
      "deliveryZone",
      "plant",
      "country",
      "poDate",
      "sop",
      "rfqReceptionDate",
      "expectedQuotationDate",
      "contactName",
      "contactFunction",
      "contactPhone",
      "contactEmail"
    ],
    optional: ["costingData", "ppapDate"]
  },
  "step-request": {
    required: ["deliveryIncoterm", "expectedPaymentTerms"],
    optional: [
      "incotermLocation",
      "typeOfPackaging",
      "businessTrigger",
      "customerToolingConditions",
      "entryBarriers"
    ]
  },
  "step-schedule": {
    required: [
      "designResponsible",
      "validationResponsible",
      "designOwner",
      "developmentCosts",
      "technicalCapacity",
      "scope",
      "strategicNote",
      "finalRecommendation"
    ],
    optional: []
  },
  "step-notes": {
    required: ["toTotal", "validatorEmail"],
    optional: []
  }
};
const RFQ_PRODUCT_FIELD_REQUIREMENTS = {
  product: STEP_REQUIREMENT_REQUIRED,
  productLine: STEP_REQUIREMENT_REQUIRED,
  application: STEP_REQUIREMENT_REQUIRED,
  partNumber: STEP_REQUIREMENT_REQUIRED,
  drawing: STEP_REQUIREMENT_REQUIRED,
  sop: STEP_REQUIREMENT_REQUIRED,
  costingData: STEP_REQUIREMENT_OPTIONAL,
  revisionLevel: STEP_REQUIREMENT_OPTIONAL,
  quantity: STEP_REQUIREMENT_REQUIRED,
  targetPrice: STEP_REQUIREMENT_REQUIRED,
  currency: STEP_REQUIREMENT_REQUIRED,
  targetPriceIsEstimated: STEP_REQUIREMENT_REQUIRED
};
const RFQ_STEP_FORM_FIELDS = Object.fromEntries(
  Object.entries(RFQ_STEP_REQUIREMENTS).map(([stepId, fields]) => [
    stepId,
    [...fields.required, ...fields.optional].filter((fieldName) => fieldName !== "rfqFiles")
  ])
);
const RFQ_REQUIRED_FIELD_NAMES = new Set(
  Object.values(RFQ_STEP_REQUIREMENTS).flatMap((fields) => fields.required)
);
const RFQ_OPTIONAL_FIELD_NAMES = new Set(
  Object.values(RFQ_STEP_REQUIREMENTS).flatMap((fields) => fields.optional)
);
const RFQ_WORKFLOW_OPTIONAL_FIELD_NAMES = new Set([
  "costingData",
  "ppapDate",
  "typeOfPackaging",
  "businessTrigger",
  "customerToolingConditions",
  "entryBarriers"
]);
const RFQ_FRONTEND_TO_BACKEND_FIELD_KEYS = {
  automotiveType: ["automotive_type", "automotiveType"],
  costingData: ["costing_data", "costingData"],
  ppapDate: ["ppap_date", "ppapDate"],
  typeOfPackaging: ["type_of_packaging", "typeOfPackaging"],
  businessTrigger: ["business_trigger", "businessTrigger"],
  customerToolingConditions: [
    "customer_tooling_conditions",
    "customerToolingConditions"
  ],
  entryBarriers: ["entry_barriers", "entryBarriers"]
};
const RFQ_FORM_FIELD_NAMES = [...new Set(Object.values(RFQ_STEP_FORM_FIELDS).flat())];
const RFQ_FIELD_TO_STEP_MAP = Object.fromEntries(
  Object.entries(RFQ_STEP_FORM_FIELDS).flatMap(([stepId, fields]) =>
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
const extractSopYear = (sop) => {
  if (!sop && sop !== 0) return NaN;
  const match = String(sop).match(/\b(19\d{2}|20\d{2})\b/);
  return match ? parseInt(match[1], 10) : NaN;
};
const getRfqFieldRequirementProps = (fieldName) => ({
  required: RFQ_REQUIRED_FIELD_NAMES.has(fieldName),
  optional: RFQ_OPTIONAL_FIELD_NAMES.has(fieldName)
});
const getProductFieldRequirementProps = (fieldName) => ({
  required: getProductRequirement(fieldName) === STEP_REQUIREMENT_REQUIRED,
  optional: getProductRequirement(fieldName) === STEP_REQUIREMENT_OPTIONAL
});
const renderRequirementLabel = (label, { required = false, optional = false } = {}) => (
  <span className="flex flex-wrap items-center gap-1">
    <span>{label}</span>
    {required ? (
      <span className="text-red-500" aria-hidden="true">
        *
      </span>
    ) : null}
    {optional ? (
      <span className="normal-case tracking-normal text-slate-400">
        (Optional)
      </span>
    ) : null}
  </span>
);
function ResponsibilityField({ label, name, value, customer, onChange, readOnly, required, optional }) {
  const isPredefinedValue = (v) =>
    !v || v === "AVOCarbon" || (customer && v === customer);
  const [otherMode, setOtherMode] = useState(
    () => Boolean(value && !isPredefinedValue(value))
  );
  const [editingOther, setEditingOther] = useState(false);
  // Sync when value changes externally (e.g. loading a saved RFQ)
  const prevValueRef = useRef(value);
  if (prevValueRef.current !== value) {
    prevValueRef.current = value;
    const shouldBeOther = Boolean(value && !isPredefinedValue(value));
    if (shouldBeOther !== otherMode) {
      setOtherMode(shouldBeOther);
      if (!shouldBeOther) setEditingOther(false);
    }
  }
  const selectValue =
    otherMode ? "__other__" :
    !value ? "" :
    value === "AVOCarbon" ? "AVOCarbon" :
    (customer && value === customer) ? "__customer__" : "";
  const handleSelectChange = (e) => {
    const v = e.target.value;
    if (v === "__customer__") {
      setOtherMode(false); setEditingOther(false);
      onChange({ target: { name, value: customer } });
    } else if (v === "AVOCarbon") {
      setOtherMode(false); setEditingOther(false);
      onChange({ target: { name, value: "AVOCarbon" } });
    } else if (v === "") {
      setOtherMode(false); setEditingOther(false);
      onChange({ target: { name, value: "" } });
    } else {
      setOtherMode(true); setEditingOther(true);
      if (isPredefinedValue(value)) onChange({ target: { name, value: "" } });
    }
  };
  const lockedCls = "cursor-not-allowed bg-slate-100/80 text-slate-400";
  if (readOnly || editingOther) {
    return (
      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
        <span className="flex flex-wrap items-center gap-1">
          <span>{label}</span>
          {required ? <span className="text-red-500" aria-hidden="true">*</span> : null}
          {optional ? <span className="normal-case tracking-normal text-slate-400">(Optional)</span> : null}
        </span>
        {readOnly ? (
          <div className={"input-field " + lockedCls}>{value || "—"}</div>
        ) : (
          <input
            className="input-field"
            type="text"
            placeholder="Please specify..."
            value={value}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") { setOtherMode(false); setEditingOther(false); }
              onChange({ target: { name, value: v } });
            }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!value) setOtherMode(false); setEditingOther(false); } }}
            onBlur={() => { if (!value) setOtherMode(false); setEditingOther(false); }}
          />
        )}
      </label>
    );
  }
  return (
    <SearchableSelectField
      label={label}
      name={name}
      value={selectValue}
      onChange={handleSelectChange}
      options={[
        ...(customer ? [{ value: "__customer__", label: customer }] : []),
        { value: "AVOCarbon", label: "AVOCarbon" },
        { value: "__other__", label: otherMode && value ? value : "Other" }
      ]}
      required={required}
      optional={optional}
      onBeforeOpen={() => {
        if (otherMode) { setEditingOther(true); return false; }
        return true;
      }}
    />
  );
}
function AutoExpandTextarea({ value, onChange, readOnly, disabled, className = "", ...rest }) {
  const textareaRef = useRef(null);
  const normalizedValue = value ?? "";
  const isLocked = readOnly || disabled;

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    const hasValue = String(normalizedValue).trim().length > 0;
    element.style.height = "0px";
    element.style.height = hasValue ? `${element.scrollHeight}px` : "";
  }, [normalizedValue]);

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      className={`textarea-field resize-none overflow-hidden ${isLocked ? "cursor-not-allowed bg-slate-100/80 text-slate-400" : ""} ${className}`}
      value={normalizedValue}
      onChange={onChange}
      readOnly={readOnly}
      disabled={disabled}
      aria-readonly={readOnly}
      {...rest}
    />
  );
}
function SelectOrOtherField({ label, name, value, onChange, readOnly, required, optional, options = [] }) {
  const isPredefined = (v) => !v || options.some(o => (typeof o === "string" ? o : o.value) === v);
  const [otherMode, setOtherMode] = useState(() => Boolean(value && !isPredefined(value)));
  const [editingOther, setEditingOther] = useState(false);
  const prevValueRef = useRef(value);
  if (prevValueRef.current !== value) {
    prevValueRef.current = value;
    const shouldBeOther = Boolean(value && !isPredefined(value));
    if (shouldBeOther !== otherMode) {
      setOtherMode(shouldBeOther);
      if (!shouldBeOther) setEditingOther(false);
    }
  }
  const selectValue = otherMode ? "__other__" : (value || "");
  const handleSelectChange = (e) => {
    const v = e.target.value;
    if (v === "__other__") {
      setOtherMode(true); setEditingOther(true);
      if (isPredefined(value)) onChange({ target: { name, value: "" } });
    } else {
      setOtherMode(false); setEditingOther(false);
      onChange({ target: { name, value: v } });
    }
  };
  const lockedCls = "cursor-not-allowed bg-slate-100/80 text-slate-400";
  if (readOnly || editingOther) {
    return (
      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
        <span className="flex flex-wrap items-center gap-1">
          <span>{label}</span>
          {required ? <span className="text-red-500" aria-hidden="true">*</span> : null}
          {optional ? <span className="normal-case tracking-normal text-slate-400">(Optional)</span> : null}
        </span>
        {readOnly ? (
          <div className={"input-field " + lockedCls}>{value || "—"}</div>
        ) : (
          <input
            className="input-field"
            type="text"
            placeholder="Please specify..."
            value={value}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") { setOtherMode(false); setEditingOther(false); }
              onChange({ target: { name, value: v } });
            }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!value) setOtherMode(false); setEditingOther(false); } }}
            onBlur={() => { if (!value) setOtherMode(false); setEditingOther(false); }}
          />
        )}
      </label>
    );
  }
  return (
    <SearchableSelectField
      label={label}
      name={name}
      value={selectValue}
      onChange={handleSelectChange}
      options={[
        ...options,
        { value: "__other__", label: otherMode && value ? value : "Other" }
      ]}
      required={required}
      optional={optional}
      onBeforeOpen={() => {
        if (otherMode) { setEditingOther(true); return false; }
        return true;
      }}
    />
  );
}
const PIPELINE_STAGES = [
  {
    key: "RFQ",
    label: "RFQ",
    subPhases: ["RFQ form", "Validation"]
  },
  {
    key: "In costing",
    label: "In costing",
    subPhases: ["feasibility", "Pricing"]
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
  "RFI completed": "In costing",
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
  "Rejected by AI": "Validation",
  "RFI completed": "Pricing",
  "Mission accepted": "Mission status",
  "Mission not accepted": "Mission status"
};
const STATUS_CHOICES = [
  "RFQ",
  "In costing",
  "RFI completed",
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
const AUTOFILL_BUBBLE_GREETING =
  "Hi! Paste a block of text with the RFQ details below and I'll extract everything I can find and fill the form automatically.";
const OFFER_CHATBOT_GREETING_PREFIX = "Hello, I'm your offer preparation assistant.";
const OFFER_CHATBOT_INITIAL_GREETING =
  "Hello, I'm your offer preparation assistant. I can help you review the fields used in the offer Word template. Tell me what you want to update, or ask me to check what is still missing.";
const DOCUMENT_TYPE_LABELS = {
  RFQ: "RFQ",
  RFI: "RFI",
  POTENTIAL: "Potential"
};
const normalizeDocumentType = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "RFI") return "RFI";
  if (normalized === "POTENTIAL") return "POTENTIAL";
  return "RFQ";
};
const getDocumentChatInitialGreeting = (documentType) => {
  const label = normalizeDocumentType(documentType);
  if (label === "POTENTIAL") {
    return POTENTIAL_CHATBOT_INITIAL_GREETING;
  }
  return `Hello, I'm your sales assistant. I'll be helping you fill your ${label}. How would you like to proceed?\n1. Guide me step by step\n2. I will provide a whole paragraph`;
};
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
const POTENTIAL_FORM_FIELD_NAMES = [
  "potentialCustomer",
  "potentialCustomerLocation",
  "potentialApplication",
  "potentialIndustry",
  "potentialProductType",
  "potentialEngagementReason",
  "potentialIdeaOwner",
  "potentialCurrentSupplier",
  "potentialWinReason",
  "potentialWinDetails",
  "potentialTechnicalCapability",
  "potentialStrategyFit",
  "potentialStrategyFitDetails",
  "potentialBusinessSalesKeur",
  "potentialBusinessMarginPercent",
  "potentialStartOfProduction",
  "potentialDevelopmentEffort",
  "potentialSideEffects",
  "potentialRiskDoAssessment",
  "potentialRiskNotDoAssessment",
  "potentialContactName",
  "potentialContactFunction",
  "potentialContactPhone",
  "potentialContactEmail"
];
const POTENTIAL_FIELD_SECTION_MAP = {
  potentialCustomer: "potential-section-overview",
  potentialCustomerLocation: "potential-section-overview",
  potentialApplication: "potential-section-overview",
  potentialIndustry: "potential-section-overview",
  potentialProductType: "potential-section-overview",
  potentialEngagementReason: "potential-section-strategy",
  potentialIdeaOwner: "potential-section-strategy",
  potentialCurrentSupplier: "potential-section-strategy",
  potentialWinReason: "potential-section-strategy",
  potentialWinDetails: "potential-section-strategy",
  potentialTechnicalCapability: "potential-section-strategy",
  potentialStrategyFit: "potential-section-strategy",
  potentialStrategyFitDetails: "potential-section-strategy",
  potentialBusinessSalesKeur: "potential-section-business",
  potentialBusinessMarginPercent: "potential-section-business",
  potentialStartOfProduction: "potential-section-business",
  potentialDevelopmentEffort: "potential-section-business",
  potentialSideEffects: "potential-section-business",
  potentialRiskDoAssessment: "potential-section-risks-do",
  potentialRiskNotDoAssessment: "potential-section-risks-not-do",
  potentialContactName: "potential-section-contact",
  potentialContactFunction: "potential-section-contact",
  potentialContactPhone: "potential-section-contact",
  potentialContactEmail: "potential-section-contact"
};
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
const getProductRequirement = (fieldName) =>
  RFQ_PRODUCT_FIELD_REQUIREMENTS[fieldName] || STEP_REQUIREMENT_REQUIRED;
const isProductFieldFilled = (product = {}, fieldName, { includeOptional = false } = {}) => {
  const requirement = getProductRequirement(fieldName);
  if (!includeOptional && requirement === STEP_REQUIREMENT_OPTIONAL) {
    return true;
  }
  const value = product?.[fieldName];
  if (fieldName === "targetPriceIsEstimated") {
    return value !== null && value !== undefined;
  }
  if (fieldName === "quantity") {
    return value !== null && value !== undefined && value !== "" && Number(value) > 0;
  }
  if (value === 0) return true;
  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
};
const isProductCollection = (value) =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      ["partNumber", "revisionLevel", "quantity", "targetPrice", "currency", "targetPriceIsEstimated"].some(
        (fieldName) => Object.prototype.hasOwnProperty.call(item, fieldName)
      )
  );
const hasCompleteProductCollection = (products = [], { includeOptional = false } = {}) =>
  Array.isArray(products) &&
  products.length > 0 &&
  products.every((product) => {
    const baseFieldsOk = Object.keys(RFQ_PRODUCT_FIELD_REQUIREMENTS)
      .filter((fieldName) => fieldName !== "drawing")
      .every((fieldName) =>
        isProductFieldFilled(product, fieldName, { includeOptional })
      );
    if (!baseFieldsOk) return false;
    const pl = String(product?.productLine || "").trim().toLowerCase();
    if (pl === "ass" || pl === "assembly") {
      return String(product?.components || "").trim().length > 0;
    }
    return true;
  });
const hasMeaningfulValue = (value) => {
  if (value === 0) return true;
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    if (isProductCollection(value)) {
      return hasCompleteProductCollection(value);
    }
    return value.length > 0;
  }
  return String(value).trim().length > 0;
};
const isAvocarbonEmail = (value) =>
  typeof value === "string" && value.trim().toLowerCase().endsWith("@avocarbon.com");
const isValidEmailFormat = (value) =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const isRfqFieldComplete = (form = {}, fieldName, { mergedFiles = [] } = {}) => {
  if (fieldName === "rfqFiles") {
    return Array.isArray(mergedFiles) && mergedFiles.length > 0;
  }
  if (fieldName === "deliveryZone" || fieldName === "plant" || fieldName === "country") {
    const vols = Array.isArray(form.volumes) ? form.volumes : [];
    if (!vols.length) return hasMeaningfulValue(form?.[fieldName]);
    const key = fieldName === "deliveryZone" ? "deliveryZone" : fieldName;
    return vols.every((v) => hasMeaningfulValue(v?.[key]));
  }
  if (fieldName === "contactEmail") {
    const v = form?.contactEmail;
    return hasMeaningfulValue(v) && isValidEmailFormat(v) && !isAvocarbonEmail(v);
  }
  return hasMeaningfulValue(form?.[fieldName]);
};
const isRawRfqFieldSkipped = (rawRfqData = {}, fieldName) => {
  const backendKeys = RFQ_FRONTEND_TO_BACKEND_FIELD_KEYS[fieldName] || [];
  return backendKeys.some((key) => {
    const value = rawRfqData?.[key];
    return typeof value === "string" && value.trim() === "_";
  });
};
const getRfqWorkflowStepFields = (stepId) => {
  const stepRequirements = RFQ_STEP_REQUIREMENTS[stepId] || { required: [], optional: [] };
  return [
    ...(stepRequirements.required || []),
    ...(stepRequirements.optional || []).filter((fieldName) =>
      RFQ_WORKFLOW_OPTIONAL_FIELD_NAMES.has(fieldName)
    )
  ];
};
const getRfqRequiredStepFields = (stepId) =>
  RFQ_STEP_REQUIREMENTS[stepId]?.required || [];
const getChangedRfqFormFields = (previousForm = {}, nextForm = {}) => {
  const changedFields = RFQ_FORM_FIELD_NAMES.filter((fieldName) => {
    const previousValue = previousForm?.[fieldName];
    const nextValue = nextForm?.[fieldName];
    const previousComparable = fieldName === "products"
      ? JSON.stringify(previousValue || [])
      : String(previousValue ?? "").trim();
    const nextComparable = fieldName === "products"
      ? JSON.stringify(nextValue || [])
      : String(nextValue ?? "").trim();
    return previousComparable !== nextComparable;
  });
  // volumes is not in RFQ_STEP_REQUIREMENTS but must be tracked for scroll targeting
  if (JSON.stringify(previousForm?.volumes || []) !== JSON.stringify(nextForm?.volumes || [])) {
    changedFields.push("volumes");
  }
  if (!changedFields.length) {
    return [];
  }
  const filledFields = changedFields.filter((fieldName) =>
    hasMeaningfulValue(nextForm?.[fieldName])
  );
  return filledFields.length ? filledFields : changedFields;
};
const getRfqStepCompletionMap = (form = {}, mergedFiles = [], rawRfqData = {}) =>
  Object.fromEntries(
    STEPS.map((step) => [
      step.id,
      getRfqWorkflowStepFields(step.id).every((fieldName) =>
        isRfqFieldComplete(form, fieldName, { mergedFiles }) ||
        (
          RFQ_OPTIONAL_FIELD_NAMES.has(fieldName) &&
          isRawRfqFieldSkipped(rawRfqData, fieldName)
        )
      )
    ])
  );
const getRfqDisplayStepCompletionMap = (
  form = {},
  mergedFiles = [],
  rawRfqData = {},
  strictCompletion = {}
) =>
  Object.fromEntries(
    STEPS.map((step) => {
      const strictComplete = Boolean(strictCompletion[step.id]);
      if (strictComplete) {
        return [step.id, true];
      }
      const requiredComplete = getRfqRequiredStepFields(step.id).every((fieldName) =>
        isRfqFieldComplete(form, fieldName, { mergedFiles })
      );
      return [step.id, requiredComplete];
    })
  );
const getHighestUnlockedStepIndexFromCompletion = (completion = {}) => {
  for (let i = 0; i < STEPS.length; i += 1) {
    if (!completion[STEPS[i].id]) {
      return i;
    }
  }
  return STEPS.length - 1;
};
const getFirstIncompleteWorkflowField = (
  stepId,
  form = {},
  mergedFiles = [],
  rawRfqData = {}
) => {
  const workflowFields = getRfqWorkflowStepFields(stepId);
  for (const fieldName of workflowFields) {
    const isComplete =
      isRfqFieldComplete(form, fieldName, { mergedFiles }) ||
      (
        RFQ_OPTIONAL_FIELD_NAMES.has(fieldName) &&
        isRawRfqFieldSkipped(rawRfqData, fieldName)
      );
    if (!isComplete) {
      return fieldName;
    }
  }
  return "";
};
const getLeadingEdgeStepIdFromCompletion = (completion = {}) =>
  STEPS[getHighestUnlockedStepIndexFromCompletion(completion)]?.id || "step-client";
const getNextIncompleteStepIdAfterStep = (stepId, completion = {}) => {
  const startIndex = STEP_ORDER_INDEX[stepId] ?? -1;
  for (let index = startIndex + 1; index < STEPS.length; index += 1) {
    const candidateStepId = STEPS[index]?.id;
    if (candidateStepId && !completion[candidateStepId]) {
      return candidateStepId;
    }
  }
  return "";
};
const buildStepFocusRevealTarget = (
  stepId,
  form = {},
  mergedFiles = [],
  rawRfqData = {},
  { highlight = false, updatedFields = [] } = {}
) => {
  if (!stepId) {
    return null;
  }
  const fieldName = getFirstIncompleteWorkflowField(
    stepId,
    form,
    mergedFiles,
    rawRfqData
  );
  if (!fieldName || fieldName === "rfqFiles") {
    return {
      stepId,
      mode: "step",
      fieldName: "",
      updatedFields,
      highlight
    };
  }
  if (fieldName === "products" || fieldName === "application") {
    return {
      stepId,
      elementId: "rfq-products",
      mode: "step",
      fieldName: "",
      updatedFields,
      highlight
    };
  }
  if (LOGISTICS_SECTION_FIELDS.has(fieldName)) {
    return {
      stepId,
      elementId: "rfq-logistics",
      mode: "step",
      fieldName: "",
      updatedFields,
      highlight
    };
  }
  if (CONTACT_SECTION_FIELDS.has(fieldName)) {
    return {
      stepId,
      elementId: "rfq-contact",
      mode: "step",
      fieldName: "",
      updatedFields,
      highlight
    };
  }
  return {
    stepId,
    mode: "field",
    fieldName,
    updatedFields,
    highlight
  };
};
const buildRfqAutofillRevealTarget = (
  previousForm = {},
  nextForm = {},
  mergedFiles = [],
  rawRfqData = {}
) => {
  const changedFields = getChangedRfqFormFields(previousForm, nextForm);
  if (!changedFields.length) {
    return null;
  }
  const lastChangedField = changedFields[changedFields.length - 1];
  const rawTargetStepId =
    RFQ_FIELD_TO_STEP_MAP[lastChangedField] ||
    RFQ_FIELD_TO_STEP_MAP[changedFields[0]] ||
    "step-client";
  // --- Stepper guard: clamp target step to the highest allowed step -----
  const nextStepCompletion = getRfqStepCompletionMap(
    nextForm,
    mergedFiles,
    rawRfqData
  );
  const highestAllowed = getHighestUnlockedStepIndexFromCompletion(
    nextStepCompletion
  );
  const rawTargetIndex = STEP_ORDER_INDEX[rawTargetStepId] ?? 0;
  const nextIncompleteStepId = nextStepCompletion[rawTargetStepId]
    ? getNextIncompleteStepIdAfterStep(rawTargetStepId, nextStepCompletion)
    : "";
  if (nextIncompleteStepId) {
    const requestedNextIndex = STEP_ORDER_INDEX[nextIncompleteStepId] ?? rawTargetIndex;
    const clampedNextIndex = Math.min(requestedNextIndex, highestAllowed);
    const targetNextStepId = STEPS[clampedNextIndex]?.id || nextIncompleteStepId;
    return buildStepFocusRevealTarget(targetNextStepId, nextForm, mergedFiles, rawRfqData, {
      highlight: false,
      updatedFields: changedFields
    });
  }
  const clampedIndex = Math.min(rawTargetIndex, highestAllowed);
  const targetStepId = STEPS[clampedIndex]?.id || "step-client";
  // If clamped, switch to "step" mode so we don't try to scroll to a field
  // that lives on a later (unreachable) step.
  const wasClamped = clampedIndex < rawTargetIndex;
  // Products table updates: don't trigger any scroll — the table is already
  // visible when the user is on step-client, so scrolling would disrupt them.
  const nextIncompleteFieldOnTargetStep = !wasClamped
    ? getFirstIncompleteWorkflowField(
      targetStepId,
      nextForm,
      mergedFiles,
      rawRfqData
    )
    : "";
  if (nextIncompleteFieldOnTargetStep === "products" || nextIncompleteFieldOnTargetStep === "application") {
    return buildStepFocusRevealTarget(targetStepId, nextForm, mergedFiles, rawRfqData, {
      highlight: false,
      updatedFields: changedFields
    });
  }
  if (!wasClamped && (lastChangedField === "products" || lastChangedField === "application")) {
    return {
      stepId: targetStepId,
      elementId: "rfq-products",
      mode: "step",
      fieldName: "",
      updatedFields: changedFields,
      highlight: false
    };
  }
  return {
    stepId: targetStepId,
    mode: wasClamped ? "step" : "field",
    fieldName: wasClamped ? "" : lastChangedField,
    updatedFields: changedFields,
    highlight: false
  };
};
// Shared field sets used by both buildRfqChatFocusRevealTarget and buildStepFocusRevealTarget.
const LOGISTICS_SECTION_FIELDS = new Set(["poDate", "ppapDate", "rfqReceptionDate", "expectedQuotationDate"]);
const CONTACT_SECTION_FIELDS = new Set(["contactName", "contactFunction", "contactPhone", "contactEmail"]);
const isProductsCollectionPrompt = (content = "") => {
  const normalized = String(content || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  // product name selection question (start of products section)
  if (
    normalized.includes("which product") ||
    normalized.includes("product name should we use") ||
    normalized.includes("product would you like")
  ) {
    return true;
  }
  // "add another product" question after completing a full product row
  if (normalized.includes("would you like to add another product")) {
    return true;
  }
  // fallback text: "Please provide the [ordinal] product details"
  if (
    normalized.includes("please provide the first product details") ||
    normalized.includes("please provide the next product details") ||
    normalized.includes("product details (one line item)")
  ) {
    return true;
  }
  // asking for application (products table field — no standalone DOM input)
  if (
    normalized.includes("what is the application") ||
    normalized.includes("application for this part") ||
    normalized.includes("application for the part") ||
    normalized.includes("the application for this")
  ) {
    return true;
  }
  // asking for part number, drawing, or sop year (products table fields)
  if (
    normalized.includes("what is the part number") ||
    normalized.includes("please provide the part number") ||
    normalized.includes("part number for")
  ) {
    return true;
  }
  if (
    (normalized.includes("drawing") || normalized.includes("attach file")) &&
    (normalized.includes("upload") || normalized.includes("please"))
  ) {
    return true;
  }
  if (normalized.includes("sop year") && normalized.includes("?")) {
    return true;
  }
  // asking for costing data (optional products table field).
  // The LLM uses "Please provide the Costing Data values…" — no "?", so don't require it.
  if (normalized.includes("costing data")) {
    return true;
  }
  // original phrases (backwards compatibility)
  if (normalized.includes("would you like to add another part number to this request")) {
    return true;
  }
  if (
    normalized.includes("please provide the first part number details") ||
    normalized.includes("please provide the next part number details")
  ) {
    return true;
  }
  return (
    normalized.includes("part number details") &&
    normalized.includes("target price") &&
    normalized.includes("currency") &&
    normalized.includes("price source")
  );
};
const isVolumesCollectionPrompt = (content = "") => {
  const normalized = String(content || "").trim().toLowerCase();
  if (!normalized) return false;
  // Costing data questions are Products-table questions, never Volumes questions —
  // even if the listed parameters happen to include words like "target price".
  if (normalized.includes("costing data")) return false;
  // "For Product N (Part Number: ...), please provide the following in one message" — combined volumes question
  if (
    normalized.includes("for product") &&
    normalized.includes("part number") &&
    normalized.includes("please provide the following")
  ) return true;
  // quantity / volumes
  if (
    normalized.includes("qty/year") ||
    normalized.includes("qty / year") ||
    normalized.includes("quantity per year") ||
    normalized.includes("yearly breakdown") ||
    normalized.includes("annual volume") ||
    normalized.includes("units per year") ||
    normalized.includes("how many units") ||
    normalized.includes("volumes table") ||
    (normalized.includes("quantity") && normalized.includes("year"))
  ) return true;
  // target price / currency (volumes step) — only when the question is clearly about volumes
  // (guard against LLM mentioning target price in a products-phase confirmation)
  if (
    (normalized.includes("target price") || normalized.includes("price and currency")) &&
    !normalized.includes("would you like to add another product") &&
    !normalized.includes("part number for product")
  ) return true;
  // price source
  if (normalized.includes("price source")) return true;
  if (normalized.includes("estimated") && normalized.includes("official")) return true;
  // delivery zone / plant / country
  if (normalized.includes("delivery zone")) return true;
  if (normalized.includes("delivery plant") && normalized.includes("?")) return true;
  return false;
};
const isLogisticsCollectionPrompt = (content = "") => {
  const normalized = String(content || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("po date")) return true;
  if (normalized.includes("ppap date")) return true;
  if (normalized.includes("rfq reception date")) return true;
  if (normalized.includes("reception date")) return true;
  if (normalized.includes("expected quotation date")) return true;
  if (normalized.includes("quotation date")) return true;
  return false;
};
const isContactCollectionPrompt = (content = "") => {
  const normalized = String(content || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("contact name")) return true;
  if (normalized.includes("contact function")) return true;
  if (normalized.includes("contact phone")) return true;
  if (normalized.includes("contact email")) return true;
  return false;
};
const getLatestAssistantMessageContent = (messages = []) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && typeof message?.content === "string") {
      return message.content;
    }
  }
  return "";
};
const buildRfqChatFocusRevealTarget = (
  previousForm = {},
  nextForm = {},
  mergedFiles = [],
  rawRfqData = {},
  latestAssistantContent = ""
) => {
  // When a chat response updates `products`, keep the viewport anchored on the
  // table — bypassing both buildRfqAutofillRevealTarget (which returns null for
  // products) and the step-fallback (which would incorrectly scroll to the top
  // of step-client).
  const changedFields = getChangedRfqFormFields(previousForm, nextForm);
  // Volumes changes take priority over products changes — the LLM updates both
  // when saving qty/target price, but we want to show the Volumes table.
  // Exception: if the assistant is asking a products-collection question (including
  // costing data, application, part number, drawing, SOP year), a coincidental volumes
  // touch must not hijack the scroll. Note: costing_data is a top-level field so
  // changedFields won't include "products" — check the prompt alone is sufficient.
  if (
    changedFields.includes("volumes") &&
    !isProductsCollectionPrompt(latestAssistantContent)
  ) {
    return {
      stepId: "step-client",
      elementId: "rfq-volumes",
      mode: "step",
      fieldName: "",
      updatedFields: changedFields,
      highlight: false
    };
  }
  // Logistics/contact fields take priority over a coincident products update (e.g. when the LLM
  // saves dates while also touching the products array), so evaluate the products check only when
  // no logistics/contact fields changed.
  // costingData can be saved top-level (not inside products array) — treat it as a products-table change.
  const PRODUCT_TABLE_FIELDS = new Set(["costingData"]);
  if (
    (changedFields.includes("products") || changedFields.some((f) => PRODUCT_TABLE_FIELDS.has(f))) &&
    !isVolumesCollectionPrompt(latestAssistantContent) &&
    !changedFields.some((f) => LOGISTICS_SECTION_FIELDS.has(f)) &&
    !changedFields.some((f) => CONTACT_SECTION_FIELDS.has(f))
  ) {
    return {
      stepId: "step-client",
      elementId: "rfq-products",
      mode: "step",
      fieldName: "",
      updatedFields: changedFields,
      highlight: false
    };
  }
  if (changedFields.some((f) => LOGISTICS_SECTION_FIELDS.has(f))) {
    return {
      stepId: "step-client",
      elementId: "rfq-logistics",
      mode: "step",
      fieldName: "",
      updatedFields: changedFields,
      highlight: false
    };
  }
  if (changedFields.some((f) => CONTACT_SECTION_FIELDS.has(f))) {
    return {
      stepId: "step-client",
      elementId: "rfq-contact",
      mode: "step",
      fieldName: "",
      updatedFields: changedFields,
      highlight: false
    };
  }
  // Volumes-question prompts anchor to the Volumes table.
  // "For Product N (Part Number: ...)" → scroll to that product's specific row.
  // Guard: if the message is also a Products-table prompt (e.g. costing data question
  // whose parameter list happens to mention "target price"), Products wins.
  if (isVolumesCollectionPrompt(latestAssistantContent) && !isProductsCollectionPrompt(latestAssistantContent)) {
    const productMatch = latestAssistantContent.match(/for\s+\*{0,2}product\s+(\d+)\*{0,2}/i);
    const rowIndex = productMatch ? parseInt(productMatch[1], 10) - 1 : null;
    return {
      stepId: "step-client",
      elementId: rowIndex !== null && rowIndex >= 0 ? `rfq-volume-row-${rowIndex}` : "rfq-volumes",
      mode: "step",
      fieldName: "",
      updatedFields: changedFields,
      highlight: false
    };
  }
  // Products-question prompts always anchor to the Products table.
  if (isProductsCollectionPrompt(latestAssistantContent)) {
    return {
      stepId: "step-client",
      elementId: "rfq-products",
      mode: "step",
      fieldName: "",
      updatedFields: changedFields,
      highlight: false
    };
  }
  // Logistics-question prompts anchor to the Logistics details section.
  if (isLogisticsCollectionPrompt(latestAssistantContent)) {
    return {
      stepId: "step-client",
      elementId: "rfq-logistics",
      mode: "step",
      fieldName: "",
      updatedFields: changedFields,
      highlight: false
    };
  }
  // Contact-question prompts anchor to the Contact details section.
  if (isContactCollectionPrompt(latestAssistantContent)) {
    return {
      stepId: "step-client",
      elementId: "rfq-contact",
      mode: "step",
      fieldName: "",
      updatedFields: changedFields,
      highlight: false
    };
  }
  // Basic-info fields (customer, project name, automotive type, delivery zone at
  // top-level) are at the very top of step-client — don't let autofill redirect
  // to rfq-products just because application/productName aren't filled yet.
  const BASIC_INFO_FIELDS = new Set(["automotiveType", "customer", "projectName", "deliveryZone", "plant", "country"]);
  if (changedFields.length > 0 && changedFields.every((f) => BASIC_INFO_FIELDS.has(f))) {
    return null;
  }
  // Form-state anchor: when message-text matching above didn't catch the context
  // (unusual LLM phrasing, concurrent field saves, etc.), use the next incomplete
  // workflow field to decide which section needs attention.
  const nextIncompleteField = getFirstIncompleteWorkflowField(
    "step-client",
    nextForm,
    mergedFiles,
    rawRfqData
  );
  if (nextIncompleteField && LOGISTICS_SECTION_FIELDS.has(nextIncompleteField)) {
    return {
      stepId: "step-client",
      elementId: "rfq-logistics",
      mode: "step",
      fieldName: "",
      updatedFields: changedFields,
      highlight: false
    };
  }
  if (nextIncompleteField && CONTACT_SECTION_FIELDS.has(nextIncompleteField)) {
    return {
      stepId: "step-client",
      elementId: "rfq-contact",
      mode: "step",
      fieldName: "",
      updatedFields: changedFields,
      highlight: false
    };
  }
  const autofillRevealTarget = buildRfqAutofillRevealTarget(
    previousForm,
    nextForm,
    mergedFiles,
    rawRfqData
  );
  if (autofillRevealTarget) {
    return autofillRevealTarget;
  }
  const nextStepCompletion = getRfqStepCompletionMap(
    nextForm,
    mergedFiles,
    rawRfqData
  );
  const targetStepId = getLeadingEdgeStepIdFromCompletion(nextStepCompletion);
  const focusTarget = buildStepFocusRevealTarget(targetStepId, nextForm, mergedFiles, rawRfqData, {
    highlight: false
  });
  return focusTarget;
};
const getMissingPotentialSharedFields = (form = {}) =>
  SHARED_POTENTIAL_FIELDS
    .filter(({ key }) => !hasMeaningfulValue(form?.[key]))
    .map(({ label }) => label);
const getChangedPotentialFormFields = (previousForm = {}, nextForm = {}) => {
  const changedFields = POTENTIAL_FORM_FIELD_NAMES.filter((fieldName) => {
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
const buildPotentialAutofillRevealTarget = (previousForm = {}, nextForm = {}) => {
  const changedFields = getChangedPotentialFormFields(previousForm, nextForm);
  if (!changedFields.length) {
    return null;
  }
  const lastChangedField = changedFields[changedFields.length - 1];
  return {
    fieldName: lastChangedField,
    sectionId: POTENTIAL_FIELD_SECTION_MAP[lastChangedField] || "",
    updatedFields: changedFields,
    highlight: false
  };
};
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
  const parsed = parseServerTimestamp(value);
  return parsed ? parsed.getTime() : 0;
};
const parseServerTimestamp = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  // If no timezone info is present, the backend stored it in UTC — append Z so
  // JavaScript's Date constructor treats it as UTC rather than local time.
  const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(text);
  const normalized = hasTimezone ? text : `${text}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const formatFileDate = (value, { withTime = false } = {}) => {
  if (value === null || value === undefined || value === "") return "Date unavailable";
  const parsed = parseServerTimestamp(value);
  if (!parsed) return String(value);
  return parsed.toLocaleString("en-GB", withTime
    ? {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Tunis"
    }
    : {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Africa/Tunis"
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
const PRODUCT_ROW_READONLY_VALUE_CLASSES =
  "min-h-[44px] rounded-2xl bg-slate-50/80 px-4 py-3 text-sm font-medium text-ink";
const PRODUCT_PRICE_SOURCE_OPTIONS = [
  { value: false, label: "Official Customer Price" },
  { value: true, label: "Estimated" }
];
const omitUndefinedValues = (obj = {}) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  );
const sanitizeProductCurrencyCode = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
const parseNumericInputValue = (value) => {
  const normalized = sanitizeNumberForInput(value);
  return normalized === "" ? null : Number(normalized);
};
const formatInlineEurPreview = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number.toLocaleString("en-US", { maximumFractionDigits: 5 });
};
const getPriceSourceBadgeClasses = (isEstimated, isActive = true) => {
  if (!isActive) {
    return "border-slate-200 bg-slate-50 text-slate-500";
  }
  if (isEstimated) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};
const buildProductMirrorFields = (products = []) => {
  const safeProducts = Array.isArray(products) && products.length
    ? products
    : [createEmptyProductItem()];
  const firstProduct = safeProducts[0] || createEmptyProductItem();
  const totalTargetTo = calculateTotalTargetTo(safeProducts);
  return {
    application: firstProduct.application || "",
    productName: firstProduct.product || "",
    productLine: firstProduct.productLine || "",
    customerPn: firstProduct.partNumber || "",
    revisionLevel: firstProduct.revisionLevel || "",
    qtyPerYear: firstProduct.quantity || "",
    sop: firstProduct.sop || "",
    targetPrice: firstProduct.targetPrice || "",
    targetPriceLocal: firstProduct.targetPrice || "",
    targetPriceCurrency: sanitizeProductCurrencyCode(firstProduct.currency),
    targetPriceIsEstimated: firstProduct.targetPriceIsEstimated ?? null,
    toTotal: totalTargetTo > 0 ? totalTargetTo / 1000 : ""
  };
};
const buildRfqDataPayloadFromForm = (form = {}) => {
  const products = normalizeProductsForPayload(form.products);
  const firstProduct = products[0] || {};
  const firstProductCurrency = sanitizeProductCurrencyCode(
    firstProduct.currency || form.targetPriceCurrency
  );
  const firstProductTargetPrice = firstProduct.target_price ?? null;
  const totalTargetTo = products.reduce(
    (total, product) => total + (Number(product.target_to) || 0),
    0
  );
  return {
    automotive_type: normalizeAutomotiveType(form.automotiveType) || "",
    customer_name: form.customer || "",
    application: form.application || "",
    product_name: form.productName || "",
    product_line_acronym: form.productLine || "",
    project_name: form.projectName || "",
    costing_data: form.costingData || "",
    products,
    total_target_to: totalTargetTo,
    customer_pn: firstProduct.part_number || form.customerPn || "",
    revision_level: firstProduct.revision_level || form.revisionLevel || "",
    delivery_zone: form.deliveryZone || "",
    delivery_plant: form.plant || "",
    country: form.country || "",
    po_date: form.poDate || "",
    ppap_date: form.ppapDate || "",
    sop_year: form.sop || "",
    annual_volume: firstProduct.quantity ?? form.qtyPerYear ?? "",
    rfq_reception_date: form.rfqReceptionDate || "",
    quotation_expected_date: form.expectedQuotationDate || "",
    contact_name: form.contactName || "",
    contact_role: form.contactFunction || "",
    contact_phone: form.contactPhone || "",
    contact_email: form.contactEmail || "",
    target_price_eur: firstProductCurrency === "EUR"
      ? (firstProductTargetPrice ?? form.targetPrice ?? "")
      : "",
    target_price_local: firstProductTargetPrice ?? form.targetPriceLocal ?? "",
    target_price_currency: firstProductCurrency || "",
    target_price_is_estimated:
      firstProduct.target_price_is_estimated ?? form.targetPriceIsEstimated ?? null,
    target_price_note: form.targetPriceNote || "",
    delivery_incoterm: form.deliveryIncoterm || "",
    incoterm_location: form.incotermLocation || "",
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
    to_total: totalTargetTo > 0 ? totalTargetTo / 1000 : form.toTotal || "",
    to_total_local: form.toTotalLocal || "",
    zone_manager_email: form.validatorEmail || "",
    volumes: normalizeVolumesForPayload(form.volumes)
  };
};
const buildRevisionGreeting = (revisionNotes = "") => {
  const note = String(revisionNotes || "").trim();
  if (!note || note === SELF_REVISION_REQUEST_COMMENT) {
    return "Please tell me your updates.";
  }
  return `The validator requested the following updates: ${note}. What would you like to change?`;
};
const withInitialChatMessage = (messages = [], greeting, { append = false } = {}) => {
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
  if (hasInitialGreeting) return messages;
  return append ? [...messages, { ...initialMessage }] : [{ ...initialMessage }, ...messages];
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
  rejectionReason: "",
  rounds: [],
});
const createEmptyActionAudit = () => ({
  completedAt: "",
  completedBy: ""
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
  const reversedLogs = [...auditLogs].reverse();
  const latestApprovedLog = reversedLogs.find(
    (entry) => typeof entry?.action === "string" && entry.action.includes("Validator approved")
  );
  const latestRejectedLog = reversedLogs.find(
    (entry) => typeof entry?.action === "string" && entry.action.includes("Validator rejected")
  );
  const decisionLogs = auditLogs.filter(
    (entry) =>
      typeof entry?.action === "string" &&
      (entry.action.includes("Validator approved") || entry.action.includes("Validator rejected"))
  );
  const safeTimestamp = (value) => {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const sortedDecisionLogs = [...decisionLogs].sort(
    (a, b) => safeTimestamp(a.timestamp) - safeTimestamp(b.timestamp)
  );
  const rounds = sortedDecisionLogs.map((entry, idx) => {
    const isApproved = entry.action.includes("Validator approved");
    return {
      roundNumber: idx + 1,
      type: isApproved ? "approved" : "rejected",
      at: normalizeAuditValue(entry.timestamp),
      by: normalizeAuditValue(entry.performed_by),
      reason: isApproved ? null : (
        extractAuditReasonFromAction(entry.action) || normalizeAuditValue(rfq?.rejection_reason)
      ),
    };
  });
  return {
    approvedAt: normalizeAuditValue(rfq?.approved_at),
    approvedBy: normalizeAuditValue(latestApprovedLog?.performed_by),
    rejectedAt: normalizeAuditValue(rfq?.rejected_at),
    rejectedBy: normalizeAuditValue(latestRejectedLog?.performed_by),
    rejectionReason: normalizeAuditValue(rfq?.rejection_reason),
    rounds,
  };
};
const extractAuditReasonFromAction = (action) => {
  const text = normalizeAuditValue(action);
  if (!text.includes(":")) return "";
  return text.split(":").slice(1).join(":").trim();
};
const extractCostingReviewAudit = (rfq, auditLogs = []) => {
  // Ignore costing review decisions from before the most recent owner-update reset.
  // When a creator updates an RFQ, costing data is cleared; the reception audit must
  // restart from scratch rather than inheriting the previous cycle's decision.
  const lastResetLog = [...auditLogs]
    .reverse()
    .find((entry) =>
      normalizeAuditValue(entry?.action)
        .toLowerCase()
        .includes("reset to pending validation, costing data cleared")
    );
  const lastResetTime = lastResetLog
    ? (() => { const t = new Date(lastResetLog.timestamp).getTime(); return Number.isNaN(t) ? 0 : t; })()
    : 0;
  const isAfterReset = (entry) => {
    if (lastResetTime === 0) return true;
    const t = new Date(entry?.timestamp).getTime();
    return !Number.isNaN(t) && t > lastResetTime;
  };
  const approvedLog = auditLogs.find(
    (entry) =>
      typeof entry?.action === "string" &&
      entry.action.includes("Costing review approved") &&
      isAfterReset(entry)
  );
  const rejectedLog = auditLogs.find(
    (entry) =>
      typeof entry?.action === "string" &&
      entry.action.includes("Costing review rejected") &&
      isAfterReset(entry)
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
const extractFeasibilitySaveAudit = (rfq, auditLogs = []) => {
  const phaseValue = normalizeAuditValue(rfq?.phase).toUpperCase();
  const subStatusValue = normalizeAuditValue(rfq?.sub_status).toUpperCase();
  // Find the most recent owner-update reset log.
  // A "status advanced to costing/pricing" log from before this reset belongs to a
  // previous costing cycle and must not be shown after the data was cleared.
  const lastResetLog = [...auditLogs]
    .reverse()
    .find((entry) =>
      normalizeAuditValue(entry?.action)
        .toLowerCase()
        .includes("reset to pending validation, costing data cleared")
    );
  const lastResetTime = lastResetLog
    ? (() => { const t = new Date(lastResetLog.timestamp).getTime(); return Number.isNaN(t) ? 0 : t; })()
    : 0;
  const saveLog = [...auditLogs]
    .reverse()
    .find((entry) => {
      if (
        !normalizeAuditValue(entry?.action)
          .toLowerCase()
          .includes("status advanced to costing/pricing")
      ) {
        return false;
      }
      if (lastResetTime > 0) {
        const entryTime = new Date(entry.timestamp).getTime();
        if (Number.isNaN(entryTime) || entryTime <= lastResetTime) return false;
      }
      return true;
    });
  const groupedStage = GROUPED_PIPELINE_STAGE_MAP[mapBackendStatusToPipelineStage(rfq)] || "";
  const isCurrentPricingStep =
    phaseValue === "COSTING" && subStatusValue === "PRICING";
  const hasMovedBeyondCosting = ["Offer", "PO", "Prototype"].includes(groupedStage);
  if (!saveLog && !isCurrentPricingStep && !hasMovedBeyondCosting) {
    return createEmptyActionAudit();
  }
  return {
    completedAt:
      normalizeAuditValue(saveLog?.timestamp) || normalizeAuditValue(rfq?.updated_at),
    completedBy: normalizeAuditValue(saveLog?.performed_by)
  };
};
const extractPricingFileDecisionAudit = (
  rfq,
  auditLogs = [],
  costingFileState = normalizeCostingFileState(rfq)
) => {
  const workflowState = normalizeAuditValue(costingFileState?.workflowState).toUpperCase();
  const validationAt = normalizeAuditValue(costingFileState?.validationAt);
  const validationBy = normalizeAuditValue(costingFileState?.validationBy);
  const rejectionReason = normalizeAuditValue(costingFileState?.rejectionReason);
  const fallbackUpdatedAt = normalizeAuditValue(rfq?.updated_at);
  const approvalLog = [...auditLogs]
    .reverse()
    .find((entry) =>
      normalizeAuditValue(entry?.action).toLowerCase().includes("pricing file approved")
    );
  const rejectionLog = [...auditLogs]
    .reverse()
    .find((entry) =>
      normalizeAuditValue(entry?.action).toLowerCase().includes("pricing file rejected:")
    );
  if (workflowState === PRICING_WORKFLOW_STATE_APPROVED) {
    return {
      ...createEmptyValidationAudit(),
      approvedAt:
        validationAt ||
        normalizeAuditValue(approvalLog?.timestamp) ||
        fallbackUpdatedAt,
      approvedBy:
        validationBy ||
        normalizeAuditValue(approvalLog?.performed_by)
    };
  }
  if (workflowState === PRICING_WORKFLOW_STATE_REJECTED) {
    return {
      ...createEmptyValidationAudit(),
      rejectedAt:
        validationAt ||
        normalizeAuditValue(rejectionLog?.timestamp) ||
        fallbackUpdatedAt,
      rejectedBy:
        validationBy ||
        normalizeAuditValue(rejectionLog?.performed_by),
      rejectionReason:
        rejectionReason ||
        extractAuditReasonFromAction(rejectionLog?.action)
    };
  }
  return createEmptyValidationAudit();
};
const formatValidationAuditValue = (value) => {
  const text = normalizeAuditValue(value);
  return text || "Not available";
};
const formatValidationAuditDate = (value) => {
  return formatStandardTimestamp(value);
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
const mergeFilesWithoutDuplicates = (existingFiles, newFiles) => {
  const filesMap = new Map();
  [...existingFiles, ...newFiles].forEach((file) => {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    filesMap.set(key, file);
  });
  return Array.from(filesMap.values());
};
const incrementRfqIndex = (ref) => {
  const match = String(ref || "").match(/^(.*)-(\d+)$/);
  if (!match) return null;
  const prefix = match[1];
  const cur = match[2];
  return `${prefix}-${String(Number(cur) + 1).padStart(cur.length, "0")}`;
};
/* ─────────────────────────────────────────────────────────────────────────────
 * OFFER PHASE — TEMPORARILY DISABLED
 * The original Offer phase content (section below) is preserved here.
 * To re-enable it, restore the ternary in the render (search "OfferUnderConstruction")
 * and remove / unwrap this comment block.
 *
 * <section className="card relative min-h-0 overflow-y-auto overflow-x-hidden space-y-6 p-3 sm:p-4 md:p-5 md:col-span-2 lg:col-span-2 lg:h-full lg:min-h-0 lg:overflow-y-auto">
 *   <div className="rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-soft">
 *     <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
 *       <div className="max-w-3xl">
 *         <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Offer</p>
 *         <h2 className="mt-2 font-display text-2xl text-ink sm:text-3xl">Offer preparation</h2>
 *         <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
 *           This is the exact filled DOCX rendered from your Word file offer_preparation_template.docx.
 *         </p>
 *       </div>
 *       <div className="flex flex-wrap items-center gap-3">
 *         <button type="button"
 *           className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-2.5 sm:text-sm"
 *           onClick={loadOfferTemplatePreview} disabled={!rfqId || offerTemplatePreviewPending}>
 *           <Eye className="h-4 w-4" />
 *           {offerTemplatePreviewPending ? "Refreshing..." : "Refresh preview"}
 *         </button>
 *         <button type="button"
 *           className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
 *           onClick={handleDownloadOfferPreparationTemplate} disabled={!rfqId || offerTemplateDownloadPending}>
 *           <Files className="h-4 w-4" />
 *           {offerTemplateDownloadPending ? "Preparing DOCX..." : "Download DOCX"}
 *         </button>
 *       </div>
 *     </div>
 *   </div>
 *   <div className="flex min-h-[520px] flex-1 flex-col rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-soft">
 *     <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-2 pb-4">
 *       <div>
 *         <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">Template viewer</p>
 *         <p className="mt-2 text-sm text-slate-500">{offerTemplateFilename || "offer_preparation_template.docx"}</p>
 *       </div>
 *       <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
 *         {isOfferValidationLocked ? "Read-only" : "Preparation mode"}
 *       </span>
 *     </div>
 *     <div className="relative mt-4 flex-1 overflow-hidden rounded-[24px] border border-slate-200/80 bg-slate-50/70">
 *       <div ref={offerTemplateViewerRef} className="h-full min-h-[720px] overflow-auto bg-slate-100 p-4" />
 *       {!offerTemplateReady ? (
 *         <div className="absolute inset-0 flex min-h-[420px] items-center justify-center bg-slate-50/80 px-6 text-center text-sm font-medium text-slate-500">
 *           {offerTemplatePreviewPending
 *             ? "Preparing the offer template preview..."
 *             : "Open the Offer stage on a saved RFQ to generate the preview."}
 *         </div>
 *       ) : null}
 *     </div>
 *   </div>
 * </section>
 * ───────────────────────────────────────────────────────────────────────────── */
const OfferUnderConstruction = () => (
  <section className="card relative md:col-span-2 lg:col-span-2">
    <div className="offer-construction-wrapper">
      <div className="offer-construction-card">
        <div className="offer-construction-icon">⚙️</div>
        <h3>This phase is under construction</h3>
        <p>The Offer phase will be available soon.</p>
      </div>
    </div>
  </section>
);
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
  const openAgentConversationPopup = (conversationUrl) => {
    const url = String(conversationUrl || "").trim();
    if (!url) {
      showToast("No Workspace Agent conversation link is available yet.", {
        type: "info",
        title: "Conversation unavailable",
      });
      return;
    }
    const popupWindow = window.open(
      url,
      "workspace-agent-conversation",
      "popup=yes,width=1440,height=920,left=80,top=60,resizable=yes,scrollbars=yes"
    );
    if (!popupWindow) {
      showToast("Popup blocked. Please allow popups for this site, then try again.", {
        type: "error",
        title: "Popup blocked",
      });
      return;
    }
    popupWindow.focus?.();
  };
  const documentTypeParam = useMemo(
    () => normalizeDocumentType(searchParams.get("document_type")),
    [searchParams]
  );
  const [form, setForm] = useState(() => ({ ...initialForm }));
  const [documentType, setDocumentType] = useState(() => documentTypeParam);
  const [saving, setSaving] = useState(false);
  const [isSubmittingToValidator, setIsSubmittingToValidator] = useState(false);
  const [rfqId, setRfqId] = useState("");
  const [rfqCreatedInThisSession, setRfqCreatedInThisSession] = useState(false);
  const [rfqSnapshot, setRfqSnapshot] = useState(null);
  const [rfqAuditLogs, setRfqAuditLogs] = useState([]);
  const [rfqCreatorEmail, setRfqCreatorEmail] = useState("");
  const [potentialChatMessages, setPotentialChatMessages] = useState([]);
  const [potentialChatCompleted, setPotentialChatCompleted] = useState(false);
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
  const [productOptions, setProductOptions] = useState([]);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [productDrawings, setProductDrawings] = useState({});
  const [serverFiles, setServerFiles] = useState([]);
  const [localFiles, setLocalFiles] = useState([]);
  const [pendingUpdateFiles, setPendingUpdateFiles] = useState([]); // { file, localId, updateType } — queued uploads for Update mode
  const [pendingDeleteFiles, setPendingDeleteFiles] = useState([]); // server file objects queued for deletion in Update mode
  const [rfqEditSubmitType, setRfqEditSubmitType] = useState("simple"); // "simple" (Update) or "change_index" (Change Index) — what the update-mode Submit sends
  const [costingFiles, setCostingFiles] = useState([]);
  const [costingFileState, setCostingFileState] = useState(null);
  const [costingFileActionModalOpen, setCostingFileActionModalOpen] = useState(false);
  const [costingFileActionMode, setCostingFileActionMode] = useState("UPLOADED");
  const [costingFileActionNote, setCostingFileActionNote] = useState("");
  const [costingFeasibilityStatus, setCostingFeasibilityStatus] = useState("");
  const [costingFileActionDraft, setCostingFileActionDraft] = useState([]);
  const [existingFeasibilityFilesInPopup, setExistingFeasibilityFilesInPopup] = useState([]);
  const [removedExistingFeasibilityFileIds, setRemovedExistingFeasibilityFileIds] = useState([]);
  const [existingPricingFilesInPopup, setExistingPricingFilesInPopup] = useState([]);
  const [removedExistingPricingFileIds, setRemovedExistingPricingFileIds] = useState([]);
  const [costingFileActionPending, setCostingFileActionPending] = useState(false);
  const [pricingBomUpload, setPricingBomUpload] = useState(null);
  const [pricingBomModalOpen, setPricingBomModalOpen] = useState(false);
  const [pricingBomNote, setPricingBomNote] = useState("");
  const [pricingBomDraft, setPricingBomDraft] = useState(null);
  const [pricingBomPending, setPricingBomPending] = useState(false);
  const [pricingFinalPriceUpload, setPricingFinalPriceUpload] = useState(null);
  const [pricingFinalPriceModalOpen, setPricingFinalPriceModalOpen] = useState(false);
  const [pricingFinalPriceNote, setPricingFinalPriceNote] = useState("");
  const [pricingFinalPriceDraft, setPricingFinalPriceDraft] = useState([]);
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
  // ACTION PLAN - DISABLED
  // const [actionPlanOpen, setActionPlanOpen] = useState(false);
  // const [actionItems, setActionItems] = useState([]);
  // const [actionFormOpen, setActionFormOpen] = useState(false);
  // const [actionDraft, setActionDraft] = useState({ action: "", description: "", responsible: "", dueDate: "", status: "Open" });
  const [costingDiscussionMessages, setCostingDiscussionMessages] = useState([]);
  const [costingDiscussionDraft, setCostingDiscussionDraft] = useState("");
  const [costingDiscussionRecipient, setCostingDiscussionRecipient] = useState("");
  const [costingDiscussionSending, setCostingDiscussionSending] = useState(false);
  const [costingDiscussionLoading, setCostingDiscussionLoading] = useState(false);
  const [costingDiscussionError, setCostingDiscussionError] = useState("");
  const [isCostingDiscussionOpen, setIsCostingDiscussionOpen] = useState(false);
  const [autofillBubbleOpen, setAutofillBubbleOpen] = useState(false);
  const [autofillMessages, setAutofillMessages] = useState([]);
  const autofillButtonRef = useRef(null);
  const autofillPanelRef = useRef(null);
  useEffect(() => {
    if (!autofillBubbleOpen) return;
    const handleClickOutside = (event) => {
      if (
        autofillPanelRef.current?.contains(event.target) ||
        autofillButtonRef.current?.contains(event.target)
      ) {
        return;
      }
      setAutofillBubbleOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [autofillBubbleOpen]);
  const [filePreview, setFilePreview] = useState(null);
  const [fileDeleteTarget, setFileDeleteTarget] = useState(null);
  const [fileUploadModalOpen, setFileUploadModalOpen] = useState(false);
  const [pendingUploadFiles, setPendingUploadFiles] = useState([]);
  const [fileUpdateType, setFileUpdateType] = useState("simple");
  const [fileUploadPending, setFileUploadPending] = useState(false);
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
  const [revisionGreetingIndex, setRevisionGreetingIndex] = useState(null);
  const revisionModeActiveRef = useRef(false);
  const rfqValidationReachedRef = useRef(false);
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
  const [isRfqUpdateModeActive, setIsRfqUpdateModeActive] = useState(false);
  const [rfqPostValidationUnlocked, setRfqPostValidationUnlocked] = useState(false);
  const [rfqValidationReached, setRfqValidationReached] = useState(false);
  const [validationAudit, setValidationAudit] = useState(createEmptyValidationAudit);
  const [costingReviewAudit, setCostingReviewAudit] = useState(createEmptyValidationAudit);
  const [persistValidationView, setPersistValidationView] = useState(false);
  const [holdSelfValidationPrompt, setHoldSelfValidationPrompt] = useState(false);
  const [persistCostingReviewView, setPersistCostingReviewView] = useState(false);
  const [proceedingToFormalRfq, setProceedingToFormalRfq] = useState(false);
  const [costingSavePending, setCostingSavePending] = useState(false);
  const [costingfeasibilitySaved, setCostingfeasibilitySaved] = useState(false);
  const [pendingRfqAutofillReveal, setPendingRfqAutofillReveal] = useState(null);
  const [pendingPotentialAutofillReveal, setPendingPotentialAutofillReveal] = useState(null);
  const rfqFileInputRef = useRef(null);
  const rfqFormScrollRef = useRef(null);
  const offerTemplateViewerRef = useRef(null);
  const localFilesRef = useRef([]);
  const rfqAuditLogsRef = useRef([]);
  const rfqCreatePromiseRef = useRef(null);
  const resizeState = useRef({ startX: 0, startWidth: 420 });
  const rfqStepAutoFollowPausedRef = useRef(false);
  const rfqProductsViewportLockUntilRef = useRef(0);
  useEffect(() => {
    const aiValidation = rfqSnapshot?.rfq_data?.ai_validation;
    const aiStatus = String(aiValidation?.status || "").trim().toLowerCase();
    if (!rfqId || !aiValidation || !["queued", "processing"].includes(aiStatus)) {
      return undefined;
    }
    let cancelled = false;
    let intervalId = 0;
    const refreshAiValidationStatus = async () => {
      try {
        const nextStatus = await getRfqAiValidationStatus(rfqId);
        if (cancelled || !nextStatus) return;
        setRfqSnapshot((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            rfq_data: {
              ...(prev.rfq_data || {}),
              ai_validation: nextStatus,
            },
          };
        });
      } catch {
        // Best effort polling only.
      }
    };
    refreshAiValidationStatus();
    intervalId = window.setInterval(refreshAiValidationStatus, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    rfqId,
    rfqSnapshot?.rfq_data?.ai_validation?.status,
    rfqSnapshot?.rfq_data?.ai_validation?.checked_at,
  ]);
  const feasibilitySaveAudit = useMemo(
    () => (
      rfqSnapshot
        ? extractFeasibilitySaveAudit(rfqSnapshot, rfqAuditLogs)
        : createEmptyActionAudit()
    ),
    [rfqSnapshot, rfqAuditLogs]
  );
  const pricingFileDecisionAudit = useMemo(
    () => (
      rfqSnapshot
        ? extractPricingFileDecisionAudit(
          rfqSnapshot,
          rfqAuditLogs,
          normalizeCostingFileState(rfqSnapshot)
        )
        : createEmptyValidationAudit()
    ),
    [rfqSnapshot, rfqAuditLogs]
  );
  const minChatWidth = 320;
  const maxChatWidth = 620;
  const isRfiWorkflowDocument = normalizeDocumentType(documentType) === "RFI";
  const pipelineStages = useMemo(
    () => (
      isRfiWorkflowDocument
        ? PIPELINE_STAGES.filter((stage) => ["RFQ", "In costing"].includes(stage.key))
        : PIPELINE_STAGES
    ),
    [isRfiWorkflowDocument]
  );
  const pipelineStageKeys = useMemo(
    () => new Set(pipelineStages.map((stage) => stage.key)),
    [pipelineStages]
  );
  const firstPipelineStageKey = pipelineStages[0]?.key || "RFQ";
  const lastPipelineStageKey =
    pipelineStages[pipelineStages.length - 1]?.key || firstPipelineStageKey;
  const resolveVisiblePipelineStageKey = (stageKey) => {
    const normalizedStageKey = String(stageKey || "").trim();
    if (pipelineStageKeys.has(normalizedStageKey)) return normalizedStageKey;
    if (
      isRfiWorkflowDocument &&
      normalizedStageKey &&
      normalizedStageKey !== firstPipelineStageKey
    ) {
      return lastPipelineStageKey;
    }
    return firstPipelineStageKey;
  };
  const stepIds = STEPS.map((step) => step.id);
  const lastStepIndex = Math.max(stepIds.length - 1, 0);
  const stepIndex = stepIds.indexOf(activeStep);
  const isFirstStep = stepIndex <= 0;
  const isLastStep = stepIndex === stepIds.length - 1;
  const activeStepData = STEPS[stepIndex] || STEPS[0];
  const groupedActiveStage = resolveVisiblePipelineStageKey(
    normalizePipelineStageKey(activeStage) || selectedStage || firstPipelineStageKey
  );
  const stageIndex = Math.max(
    pipelineStages.findIndex((stage) => stage.key === groupedActiveStage),
    0
  );
  const isRfqStage = selectedStage === "RFQ";
  const isFailureTerminalStage =
    form.status === "Lost" ||
    form.status === "Cancelled";
  const rfqPhaseValue =
    typeof rfqSnapshot?.phase === "string" ? rfqSnapshot.phase : rfqSnapshot?.phase?.value;
  const rfqSubStatusValue =
    typeof rfqSnapshot?.sub_status === "string"
      ? rfqSnapshot.sub_status
      : rfqSnapshot?.sub_status?.value;
  const isCompletedRfiWorkflow = Boolean(
    isRfiWorkflowDocument &&
    (
      (
        String(rfqPhaseValue || "").trim().toUpperCase() === "CLOSED" &&
        String(rfqSubStatusValue || "").trim().toUpperCase() === "RFI_COMPLETED"
      ) ||
      String(costingFileState?.workflowState || "").trim().toUpperCase() ===
      PRICING_WORKFLOW_STATE_APPROVED
    )
  );
  const isTerminalStage = isFailureTerminalStage || isCompletedRfiWorkflow;
  const activeSubPhase = SUBPHASE_ALIASES[form.status] || form.status;
  const showNextPreview =
    !isTerminalStage && stageIndex < pipelineStages.length - 1;
  const visibleStages = pipelineStages.slice(
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
  const normalizedDocumentType = normalizeDocumentType(documentType);
  const potentialMarginKeur = useMemo(
    () =>
      calculatePotentialMarginKeur(
        form.potentialBusinessSalesKeur,
        form.potentialBusinessMarginPercent
      ),
    [form.potentialBusinessSalesKeur, form.potentialBusinessMarginPercent]
  );
  const hasPersistedDraft = Boolean(rfqId || rfqIdParam || form.id);
  const isFormalDocumentTab = activeRfqTab === "new" || activeRfqTab === "rfi";
  const isRfiDocument = normalizedDocumentType === "RFI";
  const isPotentialDocument = normalizedDocumentType === "POTENTIAL";
  const formalDocumentLabel = DOCUMENT_TYPE_LABELS[normalizedDocumentType] || "RFQ";
  const formatFormalDocumentText = (value) => {
    const text = String(value || "");
    if (normalizedDocumentType === "RFI") return text.replace(/\bRFQ\b/g, "RFI");
    if (normalizedDocumentType === "POTENTIAL") return text.replace(/\bRFQ\b/g, "Potential");
    return text;
  };
  const getStepDisplayLabel = (step) => formatFormalDocumentText(step?.label || "");
  const activeFormalDocumentType =
    activeRfqTab === "rfi" ? "RFI" : activeRfqTab === "potential" ? "POTENTIAL" : "RFQ";
  const activeFormalDocumentLabel = DOCUMENT_TYPE_LABELS[activeFormalDocumentType] || "RFQ";
  const isPotentialDraft = isPotentialDocument;
  const isRevisionRequested = rfqSubStatus === "REVISION_REQUESTED";
  const isRevisionModeActive = isRevisionRequested || optimisticRevisionMode;
  const assignedValidatorEmail = normalizeEmailValue(form.validatorEmail);
  const isAssignedValidatorUser =
    Boolean(assignedValidatorEmail) &&
    assignedValidatorEmail === normalizedCurrentUserEmail;
  const normalizedRfqCreatorEmail = normalizeEmailValue(rfqCreatorEmail);
  const isRfqCreatorUser =
    Boolean(normalizedRfqCreatorEmail) &&
    normalizedRfqCreatorEmail === normalizedCurrentUserEmail;
  const validatorIsCreator =
    Boolean(assignedValidatorEmail) &&
    Boolean(normalizedRfqCreatorEmail) &&
    assignedValidatorEmail === normalizedRfqCreatorEmail;
  const isRevisionLockedForNonCreator =
    isRevisionModeActive &&
    !validatorIsCreator &&
    !isRfqCreatorUser &&
    currentUserRole !== "OWNER";
  const rfqSnapshotCreatorEmail = normalizeEmailValue(
    rfqSnapshot?.created_by_email ||
    rfqSnapshot?.createdByEmail ||
    rfqSnapshot?.creator_email ||
    rfqSnapshot?.creatorEmail ||
    rfqSnapshot?.created_by?.email ||
    rfqSnapshot?.createdBy?.email ||
    rfqSnapshot?.creator?.email ||
    rfqSnapshot?.rfq_data?.created_by_email ||
    rfqSnapshot?.rfq_data?.creator_email ||
    rfqCreatorEmail
  );
  const isRfqCreator = Boolean(
    normalizedCurrentUserEmail &&
    rfqSnapshotCreatorEmail &&
    normalizedCurrentUserEmail === rfqSnapshotCreatorEmail
  );
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
  const isNewRfqTabLocked = hasPersistedDraft && normalizedDocumentType !== "RFQ";
  const isRfiTabLocked = hasPersistedDraft && normalizedDocumentType !== "RFI";
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
  const hasAnyValidationHistory = Boolean(
    hasRecordedValidationDecision || validationAudit.rounds.length > 0
  );
  const isValidationRejected = Boolean(
    validationAudit.rounds.length > 0
      ? validationAudit.rounds[validationAudit.rounds.length - 1]?.type === "rejected"
      : validationAudit.rejectedAt
  );
  const hasEverBeenValidationApproved = Boolean(
    validationAudit.approvedAt ||
    validationAudit.rounds.some((r) => r.type === "approved")
  );
  const canDownloadCostingTemplate = Boolean(
    rfqId && hasEverBeenValidationApproved && !isValidationRejected
  );
  const templateDefaultFilename = rfqId
    ? `${rfqId}_costing_feasibility_template.pdf`
    : "costing_feasibility_template.pdf";
  const hasRecordedCostingReviewDecision = Boolean(
    costingReviewAudit.approvedAt || costingReviewAudit.rejectedAt
  );
  const isCostingReviewRejected = Boolean(costingReviewAudit.rejectedAt);
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
  const hasTerminalPricingWorkflowDecision = [
    PRICING_WORKFLOW_STATE_APPROVED,
    PRICING_WORKFLOW_STATE_REJECTED
  ].includes(pricingWorkflowState);
  const hasRecordedPricingFileDecision = Boolean(
    hasTerminalPricingWorkflowDecision ||
    pricingFileDecisionAudit.approvedAt ||
    pricingFileDecisionAudit.rejectedAt
  );
  const isPricingFileRejected = Boolean(
    pricingWorkflowState === PRICING_WORKFLOW_STATE_REJECTED ||
    pricingFileDecisionAudit.rejectedAt
  );
  const _aiValData = rfqSnapshot?.rfq_data?.ai_validation;
  const _aiValStatus = String(_aiValData?.status || "").toLowerCase();
  const aiValidationBlocksAction = Boolean(
    _aiValData &&
    !_aiValStatus.includes("skip") &&
    (_aiValStatus === "queued" || !_aiValData.approved)
  );
  const validationButtonsDisabled = Boolean(
    validationActionId ||
    hasRecordedValidationDecision ||
    !(currentUserRole === "OWNER" || isAssignedValidatorUser) ||
    aiValidationBlocksAction
  );
  const hideValidationActionButtons = Boolean(
    hasRecordedValidationDecision ||
    validationActionId === "approve" ||
    validationActionId === "reject"
  );
  const chatFallback = useMemo(() => {
    if (loadingRfq) {
      return [{ role: "assistant", content: `Loading ${formalDocumentLabel}...` }];
    }
    return [
      {
        role: "assistant",
        content:
          "Please select your preferred language.\n1- English\n2- FranÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ais\n3- ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡\n4- EspaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±ol\n5- Deutsch\n6- ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬"
      }
    ];
  }, [formalDocumentLabel, loadingRfq]);
  const activeChatGreeting =
    activeRfqTab === "potential"
      ? POTENTIAL_CHATBOT_INITIAL_GREETING
      : isOfferStage
        ? OFFER_CHATBOT_INITIAL_GREETING
        : isRevisionModeActive && isFormalDocumentTab
          ? buildRevisionGreeting(revisionNotes)
          : getDocumentChatInitialGreeting(activeFormalDocumentType);
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
  const chatFeed = useMemo(() => {
    if (isRevisionModeActive && isFormalDocumentTab) {
      const greetingText = activeChatGreeting;
      const hasRealGreeting = activeChatMessagesWithMeta.some(
        (m) => m.role === "assistant" && m.content === greetingText
      );
      if (hasRealGreeting) {
        return activeChatMessagesWithMeta;
      }
      if (revisionGreetingIndex !== null) {
        const greetingMsg = { role: "assistant", content: greetingText };
        const before = activeChatMessagesWithMeta.slice(0, revisionGreetingIndex);
        const after  = activeChatMessagesWithMeta.slice(revisionGreetingIndex);
        return [...before, greetingMsg, ...after];
      }
    }
    return withInitialChatMessage(activeChatMessagesWithMeta, activeChatGreeting);
  }, [activeChatGreeting, activeChatMessagesWithMeta, isRevisionModeActive, isFormalDocumentTab, revisionGreetingIndex]);
  const autofillFeed = useMemo(
    () => withInitialChatMessage(autofillMessages, AUTOFILL_BUBBLE_GREETING),
    [autofillMessages]
  );
  const stepCompletion = useMemo(
    () => getRfqStepCompletionMap(form, mergedFiles, rfqSnapshot?.rfq_data || {}),
    [form, mergedFiles, rfqSnapshot]
  );
  const displayStepCompletion = useMemo(
    () =>
      getRfqDisplayStepCompletionMap(
        form,
        mergedFiles,
        rfqSnapshot?.rfq_data || {},
        stepCompletion
      ),
    [form, mergedFiles, rfqSnapshot, stepCompletion]
  );
  useEffect(() => {
    listProducts().then((data) => {
      const raw = Array.isArray(data?.products) ? data.products : [];
      const seen = new Set();
      setProductOptions(raw.filter((p) => {
        const k = p.product_name || p.product_line || "";
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      }));
    }).catch(() => {});
  }, []);
  useEffect(() => {
    listSalesCustomers().then((data) => {
      const raw = Array.isArray(data?.customers) ? data.customers : [];
      setCustomerOptions(raw);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    rfqStepAutoFollowPausedRef.current = false;
  }, [rfqId]);
  useEffect(() => {
    if (!rfqError) return;
    showToast(rfqError, { type: "error", title: `${formalDocumentLabel} update failed` });
    setRfqError("");
  }, [rfqError, showToast]);
  useEffect(() => {
    if (!validationSuccess) return;
    showToast(validationSuccess, { type: "success", title: `${formalDocumentLabel} updated` });
    setValidationSuccess("");
  }, [validationSuccess, showToast]);
  const hasWorkflowMovedBeyondRfq = Boolean(activeStage && activeStage !== "RFQ");
  const isCancelledAfterRfqValidation = Boolean(
    normalizePipelineStageKey(activeStage) === "RFQ" &&
    form.status === "Cancelled" &&
    validationAudit.rejectedAt
  );
  const isCancelledAfterCostingReview = Boolean(
    normalizePipelineStageKey(activeStage) === "In costing" &&
    form.status === "Cancelled" &&
    costingReviewAudit.rejectedAt
  );
  const hasValidationLock =
    !isRevisionModeActive &&
    (
      activeSubPhase === "Validation" ||
      isCancelledAfterRfqValidation ||
      rfqValidationReached ||
      hasWorkflowMovedBeyondRfq
    );
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
    if (stageKey === "In costing" && isCancelledAfterCostingReview) {
      return "feasibility";
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
  const isRfqValidationView =
    isRfqStage && !isRevisionModeActive && rfqDisplaySubPhase === "Validation";
  const highestUnlockedStepIndex = useMemo(
    () => getHighestUnlockedStepIndexFromCompletion(stepCompletion),
    [stepCompletion]
  );
  // In Update mode, compute step completion purely from required fields in the
  // current form — bypassing rfqSnapshot and the stepCompletion strict-chain.
  // This ensures real-time reactivity as the user fills in fields, with zero
  // API calls and zero navigation side-effects.
  //
  // Drawing note: product drawings uploaded via handleProductDrawingUpload go
  // into productDrawings (not localFiles), so they are absent from mergedFiles.
  // We extend mergedFiles with those local entries so the rfqFiles check reflects
  // the true effective drawing state: (server drawings still present) +
  // (locally added drawings not yet saved).
  const updateModeStepCompletion = useMemo(() => {
    if (!isRfqUpdateModeActive) return {};
    const localProductDrawingEntries = Object.values(productDrawings)
      .flat()
      .filter((e) => e.source === "local");
    const effectiveMergedFiles = localProductDrawingEntries.length > 0
      ? [...mergedFiles, ...localProductDrawingEntries]
      : mergedFiles;
    return Object.fromEntries(
      STEPS.map((step) => [
        step.id,
        getRfqRequiredStepFields(step.id).every((fieldName) =>
          isRfqFieldComplete(form, fieldName, { mergedFiles: effectiveMergedFiles })
        )
      ])
    );
  }, [isRfqUpdateModeActive, form, mergedFiles, productDrawings]);
  const stepStates = useMemo(() => {
    const completion = isRfqUpdateModeActive ? updateModeStepCompletion : displayStepCompletion;
    const entries = STEPS.map((step) => {
      const isLocked = false;
      const isComplete = Boolean(completion[step.id]);
      const statusType = isComplete ? "fulfilled" : "draft";
      return [step.id, { isLocked, isComplete, statusType }];
    });
    return Object.fromEntries(entries);
  }, [displayStepCompletion, isRfqUpdateModeActive, updateModeStepCompletion]);
  const allStepsComplete = useMemo(() => {
    const completion = isRfqUpdateModeActive ? updateModeStepCompletion : displayStepCompletion;
    return STEPS.every((step) => completion[step.id]);
  }, [displayStepCompletion, isRfqUpdateModeActive, updateModeStepCompletion]);
  const canOpenRfqValidation =
    hasValidationLock && !holdSelfValidationPrompt;
  const isCostingStage = selectedStage === "In costing";
  const isReadOnlyViewer = rfqSnapshot?.permissions?.is_viewer === true;
  const canUseCostingActions = Boolean(
    !isReadOnlyViewer &&
    isCostingStage &&
    ["OWNER", "COSTING_TEAM", "RND", "PLM"].includes(currentUserRole)
  );
  const costingDisplaySubPhase = isCostingStage
    ? selectedSubPhase || getActiveDisplaySubPhase("In costing") || "feasibility"
    : "";
  const isCostingfeasibilityView =
    isCostingStage && costingDisplaySubPhase === "feasibility";
  const isCostingPricingView =
    isCostingStage && costingDisplaySubPhase === "Pricing";
  const formatResponsibleLeaders = (...groups) => {
    const combined = [...new Set(groups.flat().filter(Boolean))];
    return combined.length ? combined.join(", ") : "Not assigned";
  };
  const ResponsibleTag = ({ label, emails }) => (
    <p className="mt-1 text-xs font-bold text-ink sm:text-sm">
      {label} : <span className="text-tide">{emails}</span>
    </p>
  );
    // SharePoint button — URL comes exclusively from the backend (rfq_data.sharepoint.folder_url)
  const sharePointUrl =
    rfqSnapshot?.rfq_data?.sharepoint?.folder_url ||
    rfqSnapshot?.rfq_data?.sharepoint_folder_url || // legacy fallback
    "";
  const shouldShowSharePointButton = isCostingfeasibilityView || isCostingPricingView;
  const handleOpenSharePoint = () => {
    if (!sharePointUrl) return;
    window.open(sharePointUrl, "_blank", "noopener,noreferrer");
  };
   
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
  const canReviewCostingfeasibility = Boolean(
    rfqId &&
    canUseCostingActions &&
    isCostingfeasibilityView &&
    (currentUserRole === "OWNER" || currentUserRole === "COSTING_TEAM" || currentUserRole === "PLM")
  );
  const canManageCostingFeasibilityHandoff = Boolean(
    rfqId &&
    canUseCostingActions &&
    isCostingfeasibilityView &&
    (
      currentUserRole === "OWNER" ||
      currentUserRole === "RND" ||
      currentUserRole === "PLM"
    )
  );
  const canAdvanceCostingfeasibility = Boolean(
    rfqId &&
    canUseCostingActions &&
    isCostingfeasibilityView &&
    (
      currentUserRole === "OWNER" ||
      currentUserRole === "COSTING_TEAM" ||
      currentUserRole === "PLM" ||
      currentUserRole === "RND"
    )
  );
  const hasSelectedCostingFeasibilityStatus = Boolean(
    String(costingFeasibilityStatus || "").trim()
  );
  const costingReviewButtonsDisabled = Boolean(
    !canReviewCostingfeasibility || costingReviewActionId
  );
  const canSaveCostingfeasibility = Boolean(
    canAdvanceCostingfeasibility &&
    hasRecordedCostingReviewDecision &&
    !isCostingReviewRejected &&
    ["UPLOADED", "NA"].includes(effectiveCostingFileState?.fileStatus || "") &&
    !costingSavePending
  );
  const hasSavedCostingfeasibility = Boolean(
    feasibilitySaveAudit.completedAt || costingfeasibilitySaved
  );
  const canOpenCostingPricing = Boolean(
    activeSubPhase === "Pricing" || hasSavedCostingfeasibility
  );
  const feasibilitySavedAtDisplayValue =
    parseServerTimestamp(
      feasibilitySaveAudit.completedAt || effectiveCostingFileState?.actionAt
    ) ||
    feasibilitySaveAudit.completedAt ||
    effectiveCostingFileState?.actionAt;
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
    (
      pricingWorkflowState === PRICING_WORKFLOW_STATE_WAITING_BOM ||
      pricingWorkflowState === PRICING_WORKFLOW_STATE_BOM_UPLOADED ||
      pricingWorkflowState === PRICING_WORKFLOW_STATE_PRICING_UPLOADED ||
      pricingWorkflowState === PRICING_WORKFLOW_STATE_REJECTED
    ) &&
    (currentUserRole === "OWNER" || currentUserRole === "COSTING_TEAM" || currentUserRole === "PLM")
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
    (hasValidationLock && !rfqFormEditEnabled && !isRfqUpdateModeActive) || isRevisionLockedForNonCreator;
  const lockNewRfqFields = false;
  const potentialFieldReadOnly = true;
  const isOfferChatReadOnly =
    !canUseOfferActions || isOfferValidationLocked;
  const isChatLocked =
    isOfferStage
      ? isOfferChatReadOnly
      : (
        isChatOnly ||
        !canUseRfqActions ||
        (hasValidationLock && !rfqPostValidationUnlocked) ||
        isRevisionLockedForNonCreator ||
        proceedingToFormalRfq ||
        isPotentialAssistantLocked ||
        (activeRfqTab === "potential" && potentialChatCompleted)
      );
  const chatReadOnlyMessage =
    isOfferStage
      ? !canUseOfferActions
        ? "This offer phase is read-only for your role"
        : "Offer preparation is read-only while the RFQ is in offer validation"
      : !canUseRfqActions
        ? "This phase is read-only for your role"
        : isRevisionLockedForNonCreator
          ? "Awaiting updates from the RFQ creator. The chat is locked until the creator submits their changes."
          : isPotentialAssistantLocked && activeRfqTab === "potential"
            ? "Potential assistant is locked because this RFQ has already been promoted to New RFQ."
            : potentialChatCompleted && activeRfqTab === "potential"
              ? "Potential assessment complete. Use Proceed as RFQ or Proceed as RFI to continue."
              : "Chat is locked once the RFQ enters validation";
  const rfqFormFieldReadOnly =
    !canUseRfqActions || lockNewRfqFields || isChatOnly || isRfqFormReadOnly;
  const allowFileUpload = Boolean(
    !saving &&
    isRfqStage &&
    canUseRfqActions &&
    !isChatOnly
  );
  const allowFileDeletion = Boolean(
    !saving &&
    isRfqStage &&
    canUseRfqActions &&
    !isChatOnly
  );
  const showRfqStepNavigation =
    isFormalDocumentTab && isRfqStage && isRfqFormView;
  const showChatPanel = false;
  const activeDiscussionPhase = useMemo(() => {
    if (activeRfqTab === "potential") return "NEW_RFQ";
    if (isFormalDocumentTab) return "NEW_RFQ";
    return rfqSubStatus || "NEW_RFQ";
  }, [activeRfqTab, isFormalDocumentTab, rfqSubStatus]);
  const canParticipateInDiscussion = Boolean(
    canUseRfqActions && (currentUserEmail || currentUserRole)
  );
  const canParticipateInCostingDiscussion = Boolean(
    canUseCostingActions && (currentUserEmail || currentUserRole)
  );
  const leadingEdgeStepId = stepIds[highestUnlockedStepIndex] || stepIds[0] || "step-client";
  const handleStepViewChange = (stepId) => {
    const targetIndex = stepIds.indexOf(stepId);
    if (targetIndex < 0) {
      return;
    }
    rfqStepAutoFollowPausedRef.current = targetIndex < highestUnlockedStepIndex;
    setActiveStep(stepId);
    if (stepId === "step-notes" && !form.validatorEmail && rfqId && canUseRfqActions) {
      const firstThreeComplete = ["step-client", "step-request", "step-schedule"].every(
        (id) => stepStates[id]?.isComplete
      );
      if (firstThreeComplete) {
        handleAssignValidator();
      }
    }
    if (isRfqValidationView) {
      setSelectedStage("RFQ");
      setSelectedSubPhase("RFQ form");
    }
  };
  useEffect(() => {
    if (!isRfqFormView) {
      rfqStepAutoFollowPausedRef.current = false;
    }
  }, [isRfqFormView]);
  rfqValidationReachedRef.current = rfqValidationReached;
  useEffect(() => {
    const nextSelectedStage = resolveVisiblePipelineStageKey(
      normalizePipelineStageKey(activeStage) || firstPipelineStageKey
    );
    if (nextSelectedStage) {
      if (persistValidationView || persistCostingReviewView) {
        return;
      }
      const nextStage = pipelineStages.find((entry) => entry.key === nextSelectedStage);
      const nextSubPhase =
        getActiveDisplaySubPhase(nextSelectedStage) || nextStage?.subPhases?.[0] || "";
      setSelectedStage(nextSelectedStage);
      // If the user has already been navigated to Validation (rfqValidationReached=true),
      // don't let background syncs (file uploads, auto-saves) force them back to "Validation"
      // when they may have navigated to the form editor.
      if (rfqValidationReachedRef.current && nextSubPhase === "Validation") {
        return;
      }
      setSelectedSubPhase(nextSubPhase);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeStage,
    firstPipelineStageKey,
    hasRecordedValidationDecision,
    holdSelfValidationPrompt,
    isRevisionModeActive,
    pipelineStages,
    persistValidationView,
    persistCostingReviewView,
  ]);
  useEffect(() => {
    if (!selectedStage || pipelineStageKeys.has(selectedStage)) {
      return;
    }
    const nextSelectedStage = resolveVisiblePipelineStageKey(
      normalizePipelineStageKey(activeStage) || firstPipelineStageKey
    );
    const nextStage = pipelineStages.find((entry) => entry.key === nextSelectedStage);
    setSelectedStage(nextSelectedStage);
    setSelectedSubPhase(
      nextSelectedStage === groupedActiveStage
        ? getActiveDisplaySubPhase(nextSelectedStage) || nextStage?.subPhases?.[0] || ""
        : nextStage?.subPhases?.[0] || ""
    );
  }, [
    activeStage,
    firstPipelineStageKey,
    groupedActiveStage,
    pipelineStageKeys,
    pipelineStages,
    selectedStage
  ]);
  useEffect(() => {
    const nextSelectedStage = resolveVisiblePipelineStageKey(
      normalizePipelineStageKey(activeStage) || firstPipelineStageKey
    );
    if (nextSelectedStage && selectedStage === nextSelectedStage) {
      if (persistValidationView && selectedStage === "RFQ") {
        return;
      }
      if (persistCostingReviewView && selectedStage === "In costing") {
        return;
      }
      const nextStage = pipelineStages.find((entry) => entry.key === nextSelectedStage);
      const nextSubPhase =
        getActiveDisplaySubPhase(nextSelectedStage) || nextStage?.subPhases?.[0] || "";
      // Don't force-navigate back to Validation when the user is editing the form:
      // file/drawing changes trigger this effect via mergedFiles → allStepsComplete.
      if (rfqValidationReached && nextSubPhase === "Validation") {
        return;
      }
      setSelectedSubPhase(nextSubPhase);
    }
  }, [
    activeSubPhase,
    allStepsComplete,
    activeStage,
    firstPipelineStageKey,
    holdSelfValidationPrompt,
    isRevisionModeActive,
    pipelineStages,
    selectedStage,
    persistValidationView,
    persistCostingReviewView,
    rfqValidationReached,
  ]);
  useEffect(() => {
    setRfqFormEditEnabled(false);
    setIsRfqUpdateModeActive(false);
    setRfqValidationReached(false);
    setPersistValidationView(false);
    setPersistCostingReviewView(false);
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
  // Track the message index at which revision mode starts so the greeting
  // is inserted at that fixed position and not re-appended after each new message.
  useEffect(() => {
    const isRevision = isRevisionModeActive && isFormalDocumentTab;
    if (isRevision && !revisionModeActiveRef.current) {
      setRevisionGreetingIndex(activeChatMessages.length);
    } else if (!isRevision && revisionModeActiveRef.current) {
      setRevisionGreetingIndex(null);
    }
    revisionModeActiveRef.current = isRevision;
  }, [isRevisionModeActive, isFormalDocumentTab]); // activeChatMessages intentionally omitted
  useEffect(() => {
    if (!pendingRfqAutofillReveal) {
      return;
    }
    if (
      !isFormalDocumentTab ||
      selectedStage !== "RFQ" ||
      selectedSubPhase !== "RFQ form"
    ) {
      setPendingRfqAutofillReveal(null);
      return;
    }
    if (activeStep !== pendingRfqAutofillReveal.stepId) {
      // --- Stepper guard: clamp the reveal target to the highest allowed
      const allowedIdx = highestUnlockedStepIndex;
      const requestedIdx = STEP_ORDER_INDEX[pendingRfqAutofillReveal.stepId] ?? 0;
      const clampedIdx = Math.min(requestedIdx, allowedIdx);
      const clampedStepId = STEPS[clampedIdx]?.id || "step-client";
      if (clampedStepId !== pendingRfqAutofillReveal.stepId) {
        // The reveal was targeting a step beyond what is allowed; update the
        // pending reveal to point at the clamped step instead.
        setPendingRfqAutofillReveal((prev) =>
          prev ? { ...prev, stepId: clampedStepId, mode: "step", fieldName: "" } : null
        );
        return;
      }
      setActiveStep(clampedStepId);
      return;
    }
    let canceled = false;
    let retryTimer = 0;
    let highlightTimer = 0;
    let stabilizeTimer = 0;
    const isElementScrollable = (element) => {
      if (!element) {
        return false;
      }
      const computedStyle = window.getComputedStyle(element);
      const overflowY = computedStyle?.overflowY || "";
      return /(auto|scroll|overlay)/i.test(overflowY) && element.scrollHeight > element.clientHeight + 1;
    };
    const isElementVisibleInContainer = (element, container, padding = 16) => {
      if (!element || !container) {
        return false;
      }
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      return (
        elementRect.top >= containerRect.top + padding &&
        elementRect.bottom <= containerRect.bottom - padding
      );
    };
    const isElementVisibleInViewport = (element, padding = 24) => {
      if (!element) {
        return false;
      }
      const elementRect = element.getBoundingClientRect();
      return (
        elementRect.top >= padding &&
        elementRect.bottom <= window.innerHeight - padding
      );
    };
    const revealSpecificElement = (element, { preserveIfVisible = false } = {}) => {
      if (!element) {
        return;
      }
      const scrollContainer = rfqFormScrollRef.current;
      if (isElementScrollable(scrollContainer)) {
        if (preserveIfVisible && isElementVisibleInContainer(element, scrollContainer)) {
          return;
        }
        const containerTop = scrollContainer.getBoundingClientRect().top;
        const elementTop = element.getBoundingClientRect().top;
        const offset = elementTop - containerTop + scrollContainer.scrollTop - 16;
        scrollContainer.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
        return;
      }
      if (preserveIfVisible && isElementVisibleInViewport(element)) {
        return;
      }
      element.scrollIntoView({
        behavior: "smooth",
        block: preserveIfVisible ? "nearest" : "start"
      });
    };
    const revealTarget = (attempt = 0) => {
      if (canceled) {
        return;
      }
      const fieldElement =
        pendingRfqAutofillReveal.mode === "field" &&
          pendingRfqAutofillReveal.fieldName
          ? document.getElementsByName(pendingRfqAutofillReveal.fieldName)?.[0]
          : null;
      const specificElement = pendingRfqAutofillReveal.elementId
        ? document.getElementById(pendingRfqAutofillReveal.elementId)
        : null;
      const sectionElement = document.getElementById(pendingRfqAutofillReveal.stepId);
      // When elementId is set but the element isn't in the DOM yet, retry.
      if (pendingRfqAutofillReveal.elementId && !specificElement) {
        if (attempt >= 6) {
          // For volume-row targets, fall back to the Volumes section header.
          if (pendingRfqAutofillReveal.elementId.startsWith("rfq-volume-row-")) {
            document.getElementById("rfq-volumes")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          setPendingRfqAutofillReveal(null);
          return;
        }
        retryTimer = window.setTimeout(() => revealTarget(attempt + 1), 90);
        return;
      }
      const targetElement =
        pendingRfqAutofillReveal.mode === "field"
          ? fieldElement?.closest("label") || fieldElement || sectionElement
          : specificElement || sectionElement;
      const shouldPreserveProductsViewport =
        pendingRfqAutofillReveal.elementId === "rfq-products" &&
        Array.isArray(pendingRfqAutofillReveal.updatedFields) &&
        pendingRfqAutofillReveal.updatedFields.includes("products");
      if (!targetElement) {
        if (attempt >= 6) {
          setPendingRfqAutofillReveal(null);
          return;
        }
        retryTimer = window.setTimeout(() => revealTarget(attempt + 1), 90);
        return;
      }
      if (specificElement) {
        if (shouldPreserveProductsViewport) {
          rfqProductsViewportLockUntilRef.current = Date.now() + 1200;
        }
        revealSpecificElement(specificElement, {
          preserveIfVisible: shouldPreserveProductsViewport
        });
        if (pendingRfqAutofillReveal.elementId === "rfq-products") {
          stabilizeTimer = window.setTimeout(() => {
            if (canceled) {
              return;
            }
            revealSpecificElement(document.getElementById("rfq-products"), {
              preserveIfVisible: true
            });
          }, 180);
        }
      } else {
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: pendingRfqAutofillReveal.mode === "field" ? "center" : "start"
        });
      }
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
      window.clearTimeout(stabilizeTimer);
    };
  }, [
    isFormalDocumentTab,
    activeStep,
    form,
    highestUnlockedStepIndex,
    mergedFiles,
    pendingRfqAutofillReveal,
    selectedStage,
    selectedSubPhase
  ]);
  useEffect(() => {
    if (!pendingPotentialAutofillReveal) {
      return;
    }
    if (activeRfqTab !== "potential") {
      setPendingPotentialAutofillReveal(null);
      return;
    }
    let canceled = false;
    let retryTimer = 0;
    let highlightTimer = 0;
    const revealTarget = (attempt = 0) => {
      if (canceled) {
        return;
      }
      const fieldElement = pendingPotentialAutofillReveal.fieldName
        ? document.getElementsByName(pendingPotentialAutofillReveal.fieldName)?.[0]
        : null;
      const sectionElement = pendingPotentialAutofillReveal.sectionId
        ? document.getElementById(pendingPotentialAutofillReveal.sectionId)
        : null;
      const targetElement = fieldElement?.closest("label") || fieldElement || sectionElement;
      if (!targetElement) {
        if (attempt >= 6) {
          setPendingPotentialAutofillReveal(null);
          return;
        }
        retryTimer = window.setTimeout(() => revealTarget(attempt + 1), 90);
        return;
      }
      targetElement.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
      if (pendingPotentialAutofillReveal.highlight !== false) {
        targetElement.classList.add(...AUTOFILL_REVEAL_HIGHLIGHT_CLASSES.split(" "));
        highlightTimer = window.setTimeout(() => {
          targetElement.classList.remove(...AUTOFILL_REVEAL_HIGHLIGHT_CLASSES.split(" "));
        }, 1800);
      }
      setPendingPotentialAutofillReveal(null);
    };
    retryTimer = window.setTimeout(() => revealTarget(0), 40);
    return () => {
      canceled = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [activeRfqTab, form, pendingPotentialAutofillReveal]);
  useEffect(() => {
    if (!isCostingStage || canOpenCostingPricing) {
      return;
    }
    if (selectedSubPhase === "Pricing") {
      setSelectedSubPhase("feasibility");
    }
  }, [canOpenCostingPricing, isCostingStage, selectedSubPhase]);
  useEffect(() => {
    if (selectedStage === "Offer" && selectedSubPhase === "Offer validation") {
      setSelectedSubPhase("Offer preparation");
    }
  }, [selectedStage, selectedSubPhase]);
  useEffect(() => {
    if (rfqProductsViewportLockUntilRef.current > Date.now()) {
      return;
    }
    if (
      !isFormalDocumentTab ||
      !isRfqFormView ||
      rfqStepAutoFollowPausedRef.current ||
      stepIndex < 0 ||
      stepIndex >= highestUnlockedStepIndex
    ) {
      return;
    }
    if (!leadingEdgeStepId || leadingEdgeStepId === activeStep) {
      return;
    }
    setPendingRfqAutofillReveal(
      buildStepFocusRevealTarget(
        leadingEdgeStepId,
        form,
        mergedFiles,
        rfqSnapshot?.rfq_data || {},
        {
        highlight: false
        }
      )
    );
    setActiveStep(leadingEdgeStepId);
  }, [
    activeStep,
    form,
    highestUnlockedStepIndex,
    isFormalDocumentTab,
    isRfqFormView,
    leadingEdgeStepId,
    mergedFiles,
    rfqSnapshot,
    stepCompletion,
    stepIndex
  ]);
  const canGoNext = Boolean(!isLastStep);
  const prevStepId = stepIndex > 0 ? stepIds[stepIndex - 1] : "";
  const canGoPrev = Boolean(prevStepId);
  const applyRfq = (
    rfq,
    {
      syncChat = true,
      auditLogs,
      preserveActiveTab = false,
      preserveNavigationState = false,
      revealUpdatedRfqFields = false
    } = {}
  ) => {
    if (!rfq) return;
    const hasProvidedAuditLogs = Array.isArray(auditLogs);
    const effectiveAuditLogs = hasProvidedAuditLogs ? auditLogs : rfqAuditLogsRef.current;
    setRfqSnapshot(rfq);
    if (hasProvidedAuditLogs) {
      rfqAuditLogsRef.current = effectiveAuditLogs;
      setRfqAuditLogs(effectiveAuditLogs);
    }
    const subStatusValue =
      typeof rfq?.sub_status === "string" ? rfq.sub_status : rfq?.sub_status?.value;
    const nextDocumentType = normalizeDocumentType(rfq?.document_type);
    const isPotentialRecord = nextDocumentType === "POTENTIAL";
    const isRfiRecord = nextDocumentType === "RFI";
    const isRevisionRecord = subStatusValue === "REVISION_REQUESTED";
    const mappedFields = omitUndefinedValues({
      ...mapRfqDataToForm(rfq),
      ...mapPotentialToForm(rfq?.potential)
    });
    const nextUiStatus = mapBackendStatusToUi(rfq);
    const nextPipelineStage = mapBackendStatusToPipelineStage(rfq);
    const nextValidationAudit = extractValidationAudit(rfq, effectiveAuditLogs);
    const nextCostingReviewAudit = extractCostingReviewAudit(rfq, effectiveAuditLogs);
    const nextCostingFileState = normalizeCostingFileState(rfq);
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
    setCostingFiles(normalizeCostingFiles(rfq));
    setCostingFileState(nextCostingFileState);
    setPricingBomUpload(nextPricingBomUpload);
    setPricingFinalPriceUpload(nextPricingFinalPriceUpload);
    setCostingFileActionModalOpen(false);
    setCostingFileActionMode("UPLOADED");
    setCostingFileActionNote("");
    setCostingFeasibilityStatus(nextCostingFileState?.feasibilityStatus || "");
    setCostingFileActionDraft([]);
    setCostingFileActionPending(false);
    setPricingBomModalOpen(false);
    setPricingBomNote("");
    setPricingBomDraft(null);
    setPricingBomPending(false);
    setPricingFinalPriceModalOpen(false);
    setPricingFinalPriceNote("");
    setPricingFinalPriceDraft([]);
    setPricingFinalPricePending(false);
    setPricingFinalPriceSaved(showPersistedPricingValidation);
    setPricingFileValidationOpen(showPersistedPricingValidation);
    setPricingFileValidationActionId("");
    setPricingFileRejectModalOpen(false);
    setPricingFileRejectReason("");
    setCostingfeasibilitySaved(false);
    setRfqSubStatus(subStatusValue || "");
    setDocumentType(nextDocumentType);
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
      ? buildSelfValidationPromptSignature(rfq, effectiveAuditLogs)
      : "";
    const hasAcknowledgedSelfValidationPrompt =
      matchesSelfValidationPromptCase &&
      Boolean(nextSelfValidationPromptSignature) &&
      readSelfValidationPromptSignature(rfq.rfq_id) === nextSelfValidationPromptSignature;
    const shouldOpenSelfValidationPrompt = false;
    setRfqCreatorEmail(nextRfqCreatorEmail);
    setRevisionNotes(String(rfq?.revision_notes || ""));
    setDiscussionMessages([]);
    setDiscussionError("");
    setSelfValidationPromptOpen(shouldOpenSelfValidationPrompt);
    setSelfValidationPromptSignature(
      shouldOpenSelfValidationPrompt ? nextSelfValidationPromptSignature : ""
    );
    setHoldSelfValidationPrompt(shouldOpenSelfValidationPrompt);
    const normalizedFiles = normalizeRfqFiles(rfq);
    const nextRfqChatHistory = mapChatHistory(rfq?.chat_history, nextDocumentType);
    const latestAssistantRfqMessage = getLatestAssistantMessageContent(nextRfqChatHistory);
    const filterRemainingLocalFiles = (candidateLocalFiles = []) =>
      candidateLocalFiles.filter(
        (local) =>
          !normalizedFiles.some(
            (server) =>
              server.name &&
              local.name &&
              server.name.toLowerCase() === local.name.toLowerCase()
          )
      );
    const nextLocalFiles = filterRemainingLocalFiles(localFilesRef.current);
    const nextMergedFiles = [...normalizedFiles, ...nextLocalFiles];
    // Use a functional updater so we can read prev.products to preserve local
    // File objects (drawings) that live only in client state and are never
    // returned by the server. Without this, every syncRfq / applyRfq call
    // would wipe product drawings that the user just selected.
    setForm((prev) => {
      if (!Array.isArray(nextFormState.products) || !nextFormState.products.length) {
        return nextFormState;
      }
      const mergedProducts = nextFormState.products.map((product, i) => ({
        ...product,
        drawing: prev.products?.[i]?.drawing ?? product.drawing
      }));
      return { ...nextFormState, products: mergedProducts };
    });
    setPendingPotentialAutofillReveal(
      revealUpdatedRfqFields && isPotentialRecord
        ? buildPotentialAutofillRevealTarget(form, nextFormState)
        : null
    );
    setPendingRfqAutofillReveal(
      revealUpdatedRfqFields && !isPotentialRecord
        ? (
          buildRfqChatFocusRevealTarget(
            form,
            nextFormState,
            nextMergedFiles,
            rfq?.rfq_data || {},
            latestAssistantRfqMessage
          )
        )
        : null
    );
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
      return isPotentialRecord ? "potential" : isRfiRecord ? "rfi" : "new";
    });
    if (isRevisionRecord) {
      setSelectedStage("RFQ");
      setSelectedSubPhase("RFQ form");
      setActiveStep((prev) => (stepIds.includes(prev) ? prev : "step-client"));
      setRfqValidationReached(false);
      setRfqFormEditEnabled(true);
      setPersistValidationView(false);
    } else if (!preserveNavigationState && nextPipelineStage === "RFQ" && nextUiStatus === "Validation") {
      setSelectedStage("RFQ");
      setSelectedSubPhase(shouldOpenSelfValidationPrompt ? "RFQ form" : "Validation");
      setActiveStep("step-notes");
      setRfqValidationReached(!shouldOpenSelfValidationPrompt);
      setRfqFormEditEnabled(false);
    }
    setRfqPostValidationUnlocked(rfq?.rfq_data?.post_validation_edit_unlocked === true);
    setServerFiles(normalizedFiles);
    setLocalFiles((prev) => filterRemainingLocalFiles(prev));
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
        mergeChatWithAttachments(nextRfqChatHistory, prev)
      );
      setAutofillMessages((prev) =>
        mergeChatWithAttachments(nextRfqChatHistory, prev)
      );
    }
  };
  const syncRfq = async (targetId, options = {}) => {
    const idToLoad = targetId || rfqId;
    if (!idToLoad) return false;
    setRfqError("");
    try {
      const { rfq, auditLogs } = await loadRfqSnapshot(idToLoad);
      applyRfq(rfq, { auditLogs, preserveActiveTab: true, preserveNavigationState: true, ...options });
      return true;
    } catch (error) {
      setRfqError(`Unable to refresh this ${formalDocumentLabel}. Please try again.`);
      return false;
    }
  };
  const hydrateRfqAfterMutation = async (targetId, options = {}) => {
    const idToLoad = targetId || rfqId;
    if (!idToLoad) return false;
    setRfqError("");
    try {
      const { rfq, auditLogs } = await loadRfqSnapshot(idToLoad);
      applyRfq(rfq, { auditLogs, preserveActiveTab: true, preserveNavigationState: true, ...options });
      return true;
    } catch (error) {
      setRfqError(`Unable to refresh this ${formalDocumentLabel}. Please try again.`);
      return false;
    }
  };
  // Poll after RFQ approval until rfq_data.sharepoint.folder_url is populated by the backend
  // background task. Updates only rfqSnapshot so the SharePoint button activates automatically.
  // Fire-and-forget — does not block UI. Max 15 attempts × 2 s = 30 s total.
  const waitForSharePointUrl = (targetId) => {
    const idToLoad = targetId || rfqId;
    if (!idToLoad) return;
 
    let attempt = 0;
    const maxAttempts = 15;
    const delayMs = 2000;
 
    const poll = async () => {
      if (attempt >= maxAttempts) return;
      attempt++;
      try {
        const { rfq } = await loadRfqSnapshot(idToLoad);
        const url = rfq?.rfq_data?.sharepoint?.folder_url || "";
        console.log("DEBUG SHAREPOINT AFTER VALIDATION", {
          attempt,
          rfqId: idToLoad,
          rfqData: rfq?.rfq_data,
          sharePointUrl: url,
        });
        if (url) {
          setRfqSnapshot(rfq);
          return;
        }
      } catch {
        // silent — polling failures must never disrupt the UI
      }
      setTimeout(poll, delayMs);
    };
 
    setTimeout(poll, delayMs);
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
    const createDocumentType =
      activeRfqTab === "potential" ? "POTENTIAL" : activeRfqTab === "rfi" ? "RFI" : "RFQ";
    rfqCreatePromiseRef.current = createRfq({
      chat_mode: chatMode,
      document_type: createDocumentType
    })
      .then((created) => {
        setRfqId(created.rfq_id);
        setRfqCreatedInThisSession(true);
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
          setRfqSnapshot(null);
          setRfqAuditLogs([]);
          rfqAuditLogsRef.current = [];
          setRfqId("");
          setRfqCreatedInThisSession(false);
          setDocumentType(documentTypeParam);
          setForm({ ...initialForm });
          setPendingPotentialAutofillReveal(null);
          setPendingRfqAutofillReveal(null);
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
          setActiveRfqTab(
            documentTypeParam === "POTENTIAL"
              ? "potential"
              : documentTypeParam === "RFI"
                ? "rfi"
                : "new"
          );
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
          setCostingFileActionDraft([]);
          setCostingFileActionPending(false);
          setPricingBomModalOpen(false);
          setPricingBomNote("");
          setPricingBomDraft(null);
          setPricingBomPending(false);
          setPricingFinalPriceModalOpen(false);
          setPricingFinalPriceNote("");
          setPricingFinalPriceDraft([]);
          setPricingFinalPricePending(false);
          setPricingFinalPriceSaved(false);
          setPricingFileValidationOpen(false);
          setPricingFileValidationActionId("");
          setPricingFileRejectModalOpen(false);
          setPricingFileRejectReason("");
          setCostingfeasibilitySaved(false);
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
        setRfqSnapshot(null);
        setRfqAuditLogs([]);
        rfqAuditLogsRef.current = [];
        const { rfq, auditLogs } = await loadRfqSnapshot(rfqIdParam);
        if (!alive) return;
        setRfqId(rfq.rfq_id);
        setRfqCreatedInThisSession(false);
        applyRfq(rfq, { auditLogs });
      } catch {
        if (!alive) return;
        setRfqSnapshot(null);
        setRfqAuditLogs([]);
        rfqAuditLogsRef.current = [];
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
        setCostingFileActionDraft([]);
        setCostingFileActionPending(false);
        setPricingBomModalOpen(false);
        setPricingBomNote("");
        setPricingBomDraft(null);
        setPricingBomPending(false);
        setPricingFinalPriceModalOpen(false);
        setPricingFinalPriceNote("");
        setPricingFinalPriceDraft([]);
        setPricingFinalPricePending(false);
        setPricingFinalPriceSaved(false);
        setPricingFileValidationOpen(false);
        setPricingFileValidationActionId("");
        setPricingFileRejectModalOpen(false);
        setPricingFileRejectReason("");
        setCostingfeasibilitySaved(false);
        setDiscussionMessages([]);
        setDiscussionError("");
        setCostingDiscussionMessages([]);
        setCostingDiscussionRecipient("");
        setCostingDiscussionError("");
        setIsCostingDiscussionOpen(false);
        setSelfValidationPromptOpen(false);
        setSelfValidationPromptSignature("");
        setHoldSelfValidationPrompt(false);
        setRfqError(`Unable to load the ${formalDocumentLabel}. Please try again.`);
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
  }, [documentTypeParam, rfqIdParam, navigate]);
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
    form.deliveryIncoterm,
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
    if (isFormalDocumentTab && rfqFormFieldReadOnly) {
      return;
    }
    if (event.target.name === "validatorEmail") {
      return;
    }
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };
  const handleProductChange = (index, fieldName, value) => {
    if (fieldName !== "drawing" && isFormalDocumentTab && rfqFormFieldReadOnly) {
      return;
    }
    setForm((prev) => {
      const currentProducts = Array.isArray(prev.products) && prev.products.length
        ? prev.products
        : [createEmptyProductItem()];
      const sanitizedValue = fieldName === "currency"
        ? sanitizeProductCurrencyCode(value)
        : value;
      const nextProducts = currentProducts.map((product, productIndex) => {
        const nextProduct = { ...product };
        if (fieldName === "currency") {
          nextProduct.currency = sanitizedValue;
        } else if (productIndex === index) {
          nextProduct[fieldName] = sanitizedValue;
        }
        nextProduct.targetTo = calculateProductTargetTo(nextProduct);
        return nextProduct;
      });
      return {
        ...prev,
        products: nextProducts,
        ...buildProductMirrorFields(nextProducts)
      };
    });
  };
  const handleAddProduct = () => {
    if (isFormalDocumentTab && rfqFormFieldReadOnly) {
      return;
    }
    setForm((prev) => {
      const currentProducts = Array.isArray(prev.products) && prev.products.length
        ? prev.products
        : [createEmptyProductItem()];
      const sharedCurrency = sanitizeProductCurrencyCode(
        currentProducts[0]?.currency || prev.targetPriceCurrency
      );
      const currentVolumes = Array.isArray(prev.volumes) ? prev.volumes : [];
      const nextVolumes = [...currentVolumes, createEmptyVolumeItem()];
      const firstVol = nextVolumes[0] || {};
      return {
        ...prev,
        products: [
          ...currentProducts,
          {
            ...createEmptyProductItem(),
            currency: sharedCurrency
          }
        ],
        volumes: nextVolumes,
        deliveryZone: nextVolumes.every((v) => v.deliveryZone) ? firstVol.deliveryZone : "",
        plant: nextVolumes.every((v) => v.plant) ? firstVol.plant : "",
        country: nextVolumes.every((v) => v.country) ? firstVol.country : "",
      };
    });
  };
  const handleRemoveProduct = (index) => {
    if (isFormalDocumentTab && rfqFormFieldReadOnly) {
      return;
    }
    setForm((prev) => {
      const currentProducts = Array.isArray(prev.products) && prev.products.length
        ? prev.products
        : [createEmptyProductItem()];
      const nextProducts = currentProducts.filter((_, productIndex) => productIndex !== index);
      const safeProducts = nextProducts.length ? nextProducts : [createEmptyProductItem()];
      const currentVolumes = Array.isArray(prev.volumes) ? prev.volumes : [];
      const nextVolumes = currentVolumes.filter((_, volumeIndex) => volumeIndex !== index);
      const firstVol = nextVolumes[0] || {};
      return {
        ...prev,
        products: safeProducts,
        volumes: nextVolumes,
        ...buildProductMirrorFields(safeProducts),
        deliveryZone: nextVolumes.every((v) => v.deliveryZone) ? firstVol.deliveryZone : "",
        plant: nextVolumes.every((v) => v.plant) ? firstVol.plant : "",
        country: nextVolumes.every((v) => v.country) ? firstVol.country : "",
      };
    });
  };
  const handleVolumeChange = (index, fieldName, value) => {
    if (isFormalDocumentTab && rfqFormFieldReadOnly) {
      return;
    }
    if (value !== '' && !Number.isNaN(Number(value)) && Number(value) < 0) {
      return;
    }
    setForm((prev) => {
      const currentVolumes = Array.isArray(prev.volumes) ? prev.volumes : [];
      const nextVolumes = currentVolumes.map((volume, volumeIndex) => {
        if (volumeIndex !== index) return volume;
        if (fieldName.startsWith("volumes.")) {
          const year = fieldName.slice("volumes.".length);
          return { ...volume, volumes: { ...volume.volumes, [year]: value } };
        }
        return { ...volume, [fieldName]: value };
      });
      const firstVol = nextVolumes[0] || {};
      // Mirror per-volume pricing and delivery fields back to the corresponding product
      const currentProducts = Array.isArray(prev.products) && prev.products.length
        ? prev.products : [createEmptyProductItem()];
      const nextProducts = currentProducts.map((product, productIndex) => {
        const vol = nextVolumes[productIndex] || {};
        const isEstimated = vol.priceSource === "Estimated"
          ? true
          : vol.priceSource === "Official Customer Price"
            ? false
            : null; // When priceSource is empty/deselected, always null — no fallback to old value
        const sop = extractSopYear(product.sop);
        const volumeMap = vol.volumes || {};
        // If the user has entered at least one year row, derive quantity from the sum —
        // using "" (not undefined) when the total is 0 so clearing a year also clears
        // the mirrored product.quantity (and thus totalTargetTo).
        const hasYearEntries = Object.keys(volumeMap).length > 0;
        const volumeTotal = Object.values(volumeMap).reduce((sum, v) => sum + Number(v || 0), 0);
        const derivedQty = hasYearEntries ? (volumeTotal > 0 ? volumeTotal : "") : undefined;
        const nextProduct = {
          ...product,
          // Propagate empty string so clearing vol.targetPrice also clears product.targetPrice
          targetPrice: vol.targetPrice !== undefined && vol.targetPrice !== null
            ? vol.targetPrice
            : product.targetPrice,
          targetPriceIsEstimated: isEstimated,
          ...(derivedQty !== undefined ? { quantity: derivedQty } : {}),
        };
        nextProduct.targetTo = calculateProductTargetTo(nextProduct);
        return nextProduct;
      });
      return {
        ...prev,
        volumes: nextVolumes,
        products: nextProducts,
        ...buildProductMirrorFields(nextProducts),
        deliveryZone: nextVolumes.every((v) => v.deliveryZone) ? firstVol.deliveryZone : "",
        plant: nextVolumes.every((v) => v.plant) ? firstVol.plant : "",
        country: nextVolumes.every((v) => v.country) ? firstVol.country : "",
      };
    });
  };
  const handleAddQtyYear = (volumeIndex) => {
    if (isFormalDocumentTab && rfqFormFieldReadOnly) return;
    setForm((prev) => {
      const currentVolumes = Array.isArray(prev.volumes) ? prev.volumes : [];
      const nextVolumes = currentVolumes.map((vol, idx) => {
        if (idx !== volumeIndex) return vol;
        const volumeMap = { ...(vol.volumes || {}) };
        const linkedProduct = (Array.isArray(prev.products) ? prev.products : [])[idx] || {};
        const rowSop = extractSopYear(linkedProduct.sop);
        const initialYears = (!Number.isNaN(rowSop) && rowSop > 1900)
          ? Array.from({ length: 5 }, (_, i) => rowSop + i)
          : [];
        const allCurrentYears = [
          ...new Set([
            ...initialYears,
            ...Object.keys(volumeMap).map(Number).filter((y) => !Number.isNaN(y)),
          ]),
        ].sort((a, b) => a - b);
        if (!allCurrentYears.length) return vol;
        const nextYear = allCurrentYears[allCurrentYears.length - 1] + 1;
        if (!Object.prototype.hasOwnProperty.call(volumeMap, String(nextYear))) {
          volumeMap[String(nextYear)] = "";
        }
        return { ...vol, volumes: volumeMap };
      });
      return { ...prev, volumes: nextVolumes };
    });
  };
  const handleFilesChange = (event) => {
    if (!allowFileUpload) {
      if (rfqFileInputRef.current) rfqFileInputRef.current.value = "";
      return;
    }
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    if (rfqFileInputRef.current) rfqFileInputRef.current.value = "";
    setPendingUploadFiles(files);
    setFileUpdateType("simple");
    setFileUploadModalOpen(true);
  };
  const handleConfirmFileUpload = async () => {
    if (!pendingUploadFiles.length) return;
    let currentRfqId = rfqId;
    try {
      currentRfqId = await ensureRfqExists();
    } catch {
      setRfqError(`Unable to create the ${activeFormalDocumentLabel} before uploading files.`);
      setFileUploadModalOpen(false);
      setPendingUploadFiles([]);
      return;
    }
    const newLocalFiles = pendingUploadFiles.map((file) => ({
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
    setFileUploadModalOpen(false);
    const chosenUpdateType = fileUpdateType;
    // In Update mode: just queue the uploads — no API call until Save Changes / Submit
    if (isRfqUpdateModeActive) {
      setPendingUpdateFiles((prev) => [
        ...prev,
        ...pendingUploadFiles.map((file, i) => ({
          file,
          localId: newLocalFiles[i].id,
          updateType: chosenUpdateType,
        })),
      ]);
      setPendingUploadFiles([]);
      return;
    }
    setFileUploadPending(true);
    setSaving(true);
    try {
      // Only the first file in the batch should trigger the index increment —
      // subsequent files are uploaded as "simple" so the RFQ index moves by +1 total,
      // not once per file.
      for (let i = 0; i < pendingUploadFiles.length; i += 1) {
        const perFileUpdateType = i === 0 ? chosenUpdateType : "simple";
        await uploadRfqFile(currentRfqId, pendingUploadFiles[i], perFileUpdateType);
      }
      await syncRfq(currentRfqId);
      if (chosenUpdateType === "change_index") {
        showToast("Files uploaded and RFQ index incremented successfully.", {
          type: "success",
          title: "RFQ index updated"
        });
      } else {
        showToast("Files uploaded successfully.", {
          type: "success",
          title: `${formalDocumentLabel} updated`
        });
      }
    } catch (err) {
      setRfqError(err?.message || "Unable to upload file. Please try again.");
    } finally {
      setSaving(false);
      setFileUploadPending(false);
      setPendingUploadFiles([]);
    }
  };
  const handleProductDrawingUpload = async (productIndex, files) => {
    if (!files.length) return;
    const localEntries = files.map((file) => ({
      id: `local-drawing-${productIndex}-${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      url: URL.createObjectURL(file),
      file,
      source: "local"
    }));
    setProductDrawings((prev) => ({
      ...prev,
      [productIndex]: [...(prev[productIndex] || []), ...localEntries]
    }));
    // In Update mode: queue drawings for upload on Save Changes / Submit — no backend call now
    if (isRfqUpdateModeActive) {
      setPendingUpdateFiles((prev) => [
        ...prev,
        ...localEntries.map((entry) => ({
          file: entry.file,
          localId: entry.id,
          updateType: "simple",
        })),
      ]);
      return;
    }
    let currentRfqId = rfqId;
    try {
      currentRfqId = await ensureRfqExists();
    } catch {
      setRfqError(`Unable to create the ${activeFormalDocumentLabel} before uploading the drawing.`);
      return;
    }
    setSaving(true);
    try {
      for (const file of files) {
        await uploadRfqFile(currentRfqId, file);
      }
      await syncRfq(currentRfqId);
      setProductDrawings((prev) => {
        const current = prev[productIndex] || [];
        const uploadedIds = new Set(localEntries.map((e) => e.id));
        const remaining = current.filter((e) => !uploadedIds.has(e.id));
        return { ...prev, [productIndex]: remaining };
      });
    } catch {
      setRfqError("Unable to upload drawing. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const handlePreviewFile = (file) => {
    if (!file?.url) return;
    if (file.source === "local") {
      setFilePreview(file);
      return;
    }
    const resolvedUrl = resolveFileUrl(file.url);
    if (resolvedUrl) {
      setFilePreview({ ...file, url: resolvedUrl });
    }
  };
  const handleDownloadFile = async (file) => {
    if (!file) return;
    const fileName = file.name || "downloaded-file";
    // Blob URL already cached from a previous preview — download directly without re-fetching.
    const cached = file.previewUrl;
    if (cached && cached.startsWith("blob:")) {
      const link = document.createElement("a");
      link.href = cached;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
    const rawUrl = cached || file.url;
    if (!rawUrl) {
      setRfqError("Download link not available for this file.");
      return;
    }
    try {
      let response;
      if (/^https?:\/\//i.test(rawUrl)) {
        // Azure SAS URLs are CORS-blocked — route all downloads through the backend.
        // prependApiBase: true ensures the call reaches the API server even when the
        // frontend is served on a different origin than the backend.
        const fileId = file.id ? String(file.id) : "";
        const currentRfqId = rfqId || "";
        if (fileId && currentRfqId) {
          response = await authorizedFetch(
            `/api/rfq/${encodeURIComponent(currentRfqId)}/costing-file/${encodeURIComponent(fileId)}/download`,
            { prependApiBase: true }
          );
        } else {
          response = await fetch(rawUrl);
        }
      } else {
        const resolvedUrl = resolveFileUrl(rawUrl);
        response = await authorizedFetch(resolvedUrl, { prependApiBase: false });
      }
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch {
      setRfqError("Unable to download this file. Please try again.");
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
    // If we're in Update mode, also remove from the pending-upload queue
    if (isRfqUpdateModeActive) {
      setPendingUpdateFiles((prev) => prev.filter((p) => p.localId !== fileId));
    }
  };
  const handleDeleteFile = async (file) => {
    if (!file) return;
    if (!allowFileDeletion) return;
    if (file.source === "local") {
      handleRemoveLocalFile(file.id);
      return;
    }
    if (!rfqId) return;
    // In Update mode: remove visually and queue for deletion on Save Changes / Submit
    if (isRfqUpdateModeActive) {
      setServerFiles((prev) => prev.filter((f) => f.id !== file.id));
      setPendingDeleteFiles((prev) => [...prev, file]);
      return;
    }
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
    if (!pipelineStageKeys.has(stageKey)) {
      return;
    }
    setPersistValidationView(false);
    setPersistCostingReviewView(false);
    setSelectedStage(stageKey);
    const stage = pipelineStages.find((entry) => entry.key === stageKey);
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
    setActiveRfqTab(isRfiDocument ? "rfi" : "new");
    setSelectedStage("RFQ");
    setSelectedSubPhase("Validation");
    setActiveStep("step-notes");
    setRfqValidationReached(true);
    setRfqFormEditEnabled(false);
  };
  const handleSubPhaseChange = (stageKey, subPhase) => {
    if (!pipelineStageKeys.has(stageKey)) {
      return;
    }
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
      finalAssistantResponse = sanitizeAssistantChatContent(String(reply?.response || ""));
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
  const handlePotentialChatEdit = async (visibleMessageIndex, message) => {
    if (!canUseRfqActions) return false;
    const trimmedMessage = String(message || "").trim();
    if (!trimmedMessage) return false;
    let currentRfqId = rfqId;
    try {
      currentRfqId = await ensureRfqExists();
    } catch {
      setRfqError("Unable to update this potential chat message right now.");
      return false;
    }
    const previousMessages = potentialChatMessages;
    const nextMessages = potentialChatMessages.slice(0, visibleMessageIndex);
    setRfqError("");
    setPotentialChatMessages([
      ...nextMessages,
      { role: "user", content: trimmedMessage }
    ]);
    let finalAssistantResponse = "";
    try {
      const reply = await editPotentialChatMessage(currentRfqId, {
        visibleMessageIndex,
        message: trimmedMessage
      });
      finalAssistantResponse = sanitizeAssistantChatContent(String(reply?.response || ""));
      if (reply?.lock_chat) {
        setPotentialChatCompleted(true);
      }
      if (reply?.rfq) {
        applyRfq(reply.rfq, { revealUpdatedRfqFields: true });
      }
    } catch (error) {
      setPotentialChatMessages(previousMessages);
      setRfqError(error?.message || "Unable to update this potential chat message.");
      return false;
    }
    const synced = await syncRfq(currentRfqId, {
      revealUpdatedRfqFields: true
    });
    if (!synced && finalAssistantResponse) {
      setPotentialChatMessages((prev) => [
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
      finalAssistantResponse = sanitizeAssistantChatContent(String(reply?.response || ""));
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
  const handleUnlockToUpdate = async () => {
    setRfqPostValidationUnlocked(true);
    setRfqChatMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content:
          "The RFQ has been unlocked for editing. **Which fields would you like to update?**\n\n" +
          "Describe the changes here — for example: *\"Update the target price for Product 1 to 45 EUR\"* — and I'll apply them for you.",
      },
    ]);
    try {
      const updatedRfq = await unlockChatForEdit(rfqId || rfqIdParam);
      if (updatedRfq) {
        applyRfq(updatedRfq, { syncChat: false });
      }
    } catch {
      // Unlock flag couldn't be persisted — the session-local state is still set,
      // so the user can still edit this session. On next refresh they'll see the lock again.
    }
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
          content: `I couldn't create the ${activeFormalDocumentLabel} record. Please retry in a moment.`
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
            : await sendChat(
              currentRfqId,
              payloadMessage,
              "rfq",
              activeFormalDocumentType,
              rfqPostValidationUnlocked
            );
      shouldAutoRedirect = Boolean(reply?.auto_redirect);
      finalAssistantResponse = sanitizeAssistantChatContent(String(reply?.response || ""));
      replyRfq = reply?.rfq || null;
      if (reply?.lock_chat && activeChatMode === "potential") {
        setPotentialChatCompleted(true);
      }
      if (replyRfq) {
        applyRfq(replyRfq, {
          revealUpdatedRfqFields: activeChatMode !== "offer"
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
        revealUpdatedRfqFields: activeChatMode !== "offer" && !replyRfq
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
  const handleAutofillBubbleSend = async (message, attachments = []) => {
    if (!canUseRfqActions) return;
    const trimmedMessage = message ? message.trim() : "";
    const attachmentNames = (attachments || [])
      .map((attachment) => attachment.name || attachment.file?.name)
      .filter(Boolean);
    const fallbackMessage = attachmentNames.length
      ? `Attached file${attachmentNames.length > 1 ? "s" : ""}: ${attachmentNames.join(", ")}`
      : "";
    const displayMessage = trimmedMessage || fallbackMessage;
    const payloadMessage = trimmedMessage || fallbackMessage;
    setAutofillMessages((prev) => [
      ...prev,
      { role: "user", content: displayMessage, attachments }
    ]);
    let currentRfqId = rfqId;
    try {
      currentRfqId = await ensureRfqExists();
    } catch {
      setAutofillMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `I couldn't create the ${activeFormalDocumentLabel} record. Please retry in a moment.`
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
        setAutofillMessages((prev) => [
          ...prev,
          { role: "assistant", content: "File upload failed. Please try again." }
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
    let finalAssistantResponse = "";
    try {
      const reply = await sendAutofillChat(currentRfqId, payloadMessage);
      finalAssistantResponse = sanitizeAssistantChatContent(String(reply?.response || ""));
    } catch {
      finalAssistantResponse = "I couldn't reach the server. Please retry in a moment.";
    } finally {
      const synced = await syncRfq(currentRfqId, { revealUpdatedRfqFields: true });
      if (!synced && finalAssistantResponse) {
        setAutofillMessages((prev) => [
          ...prev,
          { role: "assistant", content: finalAssistantResponse }
        ]);
      }
    }
  };
  const handleProceedToFormalRfq = async (documentType = "RFQ") => {
    if (!canUseRfqActions) return;
    let currentRfqId = rfqId;
    setRfqError("");
    try {
      currentRfqId = await ensureRfqExists();
    } catch {
      setRfqError("Unable to create the draft before proceeding.");
      return;
    }
    setProceedingToFormalRfq(true);
    try {
      const updatedRfq = await proceedToFormalRfq(currentRfqId, documentType);
      applyRfq(updatedRfq);
      setActiveRfqTab("new");
      setSelectedStage("RFQ");
      setSelectedSubPhase("RFQ form");
      const label = documentType === "RFI" ? "RFI" : "RFQ";
      setValidationSuccess(`Potential saved and promoted to the formal ${label}.`);
    } catch (error) {
      setRfqError(error?.message || "Unable to proceed.");
    } finally {
      setProceedingToFormalRfq(false);
    }
  };
  const handleProductSelect = (index, selectedName) => {
    const selected = productOptions.find(
      (p) => (p.product_name || p.product_line) === selectedName
    );
    setForm((prev) => {
      const currentProducts = Array.isArray(prev.products) && prev.products.length
        ? prev.products
        : [createEmptyProductItem()];
      const nextProducts = currentProducts.map((product, productIndex) => {
        if (productIndex !== index) {
          const p = { ...product };
          p.targetTo = calculateProductTargetTo(p);
          return p;
        }
        const nextProduct = {
          ...product,
          product: selectedName,
          productLine: selected ? selected.acronym : product.productLine,
        };
        nextProduct.targetTo = calculateProductTargetTo(nextProduct);
        return nextProduct;
      });
      return {
        ...prev,
        products: nextProducts,
        ...buildProductMirrorFields(nextProducts),
      };
    });
  };
  const handleSaveForm = async () => {
    if (!rfqId || !canUseRfqActions) return;
    setSaving(true);
    try {
      const updatedRfq = await updateRfqData(rfqId, buildRfqDataPayloadFromForm(form));
      // Update snapshot from response without calling applyRfq — applyRfq resets
      // the entire form (losing local file selections and the user's in-progress edits).
      if (updatedRfq) setRfqSnapshot(updatedRfq);
    } catch {
      setRfqError("Unable to auto-save. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const computeChangedRfqFields = (prevForm, nextForm) => {
    if (!prevForm) return [];
    const prevPayload = buildRfqDataPayloadFromForm(prevForm);
    const nextPayload = buildRfqDataPayloadFromForm(nextForm);
    const keys = new Set([...Object.keys(prevPayload), ...Object.keys(nextPayload)]);
    const changed = [];
    keys.forEach((key) => {
      if (key === "rfq_files" || key === "systematic_rfq_id") return;
      if (JSON.stringify(prevPayload[key]) !== JSON.stringify(nextPayload[key])) {
        changed.push(key);
      }
    });
    return changed;
  };
  const handleUpdateRFQ = () => {
    if (!rfqId || !canUseRfqActions) return;
    if (currentUserRole !== "OWNER" && !isRfqCreator) {
      showToast("You are not allowed to update this RFQ.", { type: "error", title: "Permission denied" });
      return;
    }
    _preUpdateSnapshotRef.current = { form: structuredClone(form) };
    setPendingUpdateFiles([]);
    setPendingDeleteFiles([]);
    setRfqEditSubmitType("simple");
    setIsRfqUpdateModeActive(true);
    showToast("Mode update on, you can make your changes and submit it.", { type: "info", title: "Update mode" });
  };
  const handleChangeIndexRFQ = () => {
    if (!rfqId || !canUseRfqActions) return;
    if (currentUserRole !== "OWNER" && !isRfqCreator) {
      showToast("You are not allowed to update this RFQ.", { type: "error", title: "Permission denied" });
      return;
    }
    const currentRef = rfqSnapshot?.rfq_data?.systematic_rfq_id || "";
    if (!currentRef) {
      setRfqError("Cannot change index: RFQ reference has not been assigned yet.");
      return;
    }
    if (!incrementRfqIndex(currentRef)) {
      setRfqError("Cannot change index: RFQ reference format is not valid.");
      return;
    }
    _preUpdateSnapshotRef.current = { form: structuredClone(form) };
    setPendingUpdateFiles([]);
    setPendingDeleteFiles([]);
    setRfqEditSubmitType("change_index");
    setIsRfqUpdateModeActive(true);
    showToast(
      "Change Index mode on — make your changes, then submit. The RFQ index will move to the next revision and costing will reset to pending validation.",
      { type: "info", title: "Change Index mode" }
    );
  };
  const handleSaveRfqUpdate = async () => {
    if (!rfqId || !canUseRfqActions) return;
    if (!allStepsComplete) {
      const firstIncompleteStep = getLeadingEdgeStepIdFromCompletion(displayStepCompletion);
      if (firstIncompleteStep) handleStepViewChange(firstIncompleteStep);
      setRfqError("Please complete all required fields before saving.");
      return;
    }
    const isChangeIndexSubmit = rfqEditSubmitType === "change_index";
    const hasPendingAttachmentChanges = pendingUpdateFiles.length > 0 || pendingDeleteFiles.length > 0;
    // For "simple" the diff drives the whole email field list; for "change_index" the
    // backend already computes its own field diff, so only the attachments flag is sent
    // (the backend unions it in — attachments/drawings are uploaded separately and would
    // otherwise never show up in either email's "Fields changed" list).
    const changedFieldsForEmail = isChangeIndexSubmit
      ? (hasPendingAttachmentChanges ? ["attachments"] : [])
      : (() => {
          const fields = computeChangedRfqFields(_preUpdateSnapshotRef.current?.form, form);
          if (hasPendingAttachmentChanges) fields.push("attachments");
          return fields;
        })();
    setSaving(true);
    try {
      await updateRfqData(rfqId, buildRfqDataPayloadFromForm(form), rfqEditSubmitType, changedFieldsForEmail);
      // The main data update above already performs the single index increment
      // (when rfqEditSubmitType === "change_index"), so every queued file in this
      // same submit is uploaded as "simple" — it will still be tagged with the
      // now-current (already incremented) revision. This avoids incrementing
      // once per file on top of the increment already applied above.
      let changeIndexConsumed = isChangeIndexSubmit;
      for (const { file, updateType } of pendingUpdateFiles) {
        let effectiveUpdateType = updateType;
        if (effectiveUpdateType === "change_index") {
          if (changeIndexConsumed) {
            effectiveUpdateType = "simple";
          } else {
            changeIndexConsumed = true;
          }
        }
        await uploadRfqFile(rfqId, file, effectiveUpdateType);
      }
      for (const file of pendingDeleteFiles) {
        await deleteRfqFile(rfqId, file.id, file.name);
      }
      setPendingUpdateFiles([]);
      setPendingDeleteFiles([]);
      // Clear local-only drawing entries — server drawings come back via syncRfq below
      setProductDrawings((prev) => {
        const cleared = {};
        for (const key of Object.keys(prev)) {
          const remaining = (prev[key] || []).filter((e) => e.source !== "local");
          if (remaining.length > 0) cleared[key] = remaining;
        }
        return cleared;
      });
      await syncRfq(rfqId);
      showToast(
        isChangeIndexSubmit
          ? "RFQ index updated and costing reset to pending validation."
          : "RFQ updated successfully.",
        { type: "success", title: isChangeIndexSubmit ? "RFQ index updated" : "RFQ updated" }
      );
      setRfqEditSubmitType("simple");
      setIsRfqUpdateModeActive(false);
      setSelectedStage("RFQ");
      setSelectedSubPhase("Validation");
      setActiveStep("step-notes");
      setRfqValidationReached(true);
      setRfqFormEditEnabled(false);
    } catch (error) {
      setRfqError("Unable to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const handleCancelRfqUpdate = () => {
    // Remove locally-queued uploads from localFiles and revoke their object URLs
    const addedLocalIds = new Set(pendingUpdateFiles.map((p) => p.localId).filter(Boolean));
    setLocalFiles((prev) => {
      prev.forEach((f) => { if (addedLocalIds.has(f.id) && f.url) URL.revokeObjectURL(f.url); });
      return prev.filter((f) => !addedLocalIds.has(f.id));
    });
    // Restore server files that were visually removed but not yet deleted on the server
    setServerFiles((prev) => [...prev, ...pendingDeleteFiles]);
    // Clear pending queues
    setPendingUpdateFiles([]);
    setPendingDeleteFiles([]);
    // Discard local-only pending drawings
    setProductDrawings((prev) => {
      const cleared = {};
      for (const key of Object.keys(prev)) {
        const remaining = (prev[key] || []).filter((e) => e.source !== "local");
        if (remaining.length > 0) cleared[key] = remaining;
      }
      return cleared;
    });
    // Restore form to the state it was in when Update mode was entered
    const snapshot = _preUpdateSnapshotRef.current;
    if (snapshot?.form) setForm(snapshot.form);
    _preUpdateSnapshotRef.current = null;
    setRfqEditSubmitType("simple");
    setIsRfqUpdateModeActive(false);
  };
  const _autoSaveTimerRef = useRef(null);
  const _autoSaveInitRef = useRef(false);
  const _autoCreateRef = useRef(false);
  const _latestFormRef = useRef(form);
  const _rfqIdRef = useRef(rfqId);
  const _canUseRfqActionsRef = useRef(canUseRfqActions);
  const _activeRfqTabRef = useRef(activeRfqTab);
  const _isRfqUpdateModeActiveRef = useRef(isRfqUpdateModeActive);
  const _preUpdateSnapshotRef = useRef(null);
  useEffect(() => { _latestFormRef.current = form; }, [form]);
  useEffect(() => { _rfqIdRef.current = rfqId; }, [rfqId]);
  useEffect(() => { _canUseRfqActionsRef.current = canUseRfqActions; }, [canUseRfqActions]);
  useEffect(() => { _activeRfqTabRef.current = activeRfqTab; }, [activeRfqTab]);
  useEffect(() => { _isRfqUpdateModeActiveRef.current = isRfqUpdateModeActive; }, [isRfqUpdateModeActive]);
  useEffect(() => {
    if (!_autoSaveInitRef.current) {
      _autoSaveInitRef.current = true;
      return;
    }
    if (_autoSaveTimerRef.current) clearTimeout(_autoSaveTimerRef.current);
    _autoSaveTimerRef.current = setTimeout(async () => {
      if (!_canUseRfqActionsRef.current) return;
      if (_isRfqUpdateModeActiveRef.current) return; // No auto-save in Update mode
      const currentRfqId = _rfqIdRef.current;
      if (!currentRfqId) {
        if (_autoCreateRef.current) return;
        // Only create if the user has actually entered some data (prevents StrictMode ghost-fires)
        const f = _latestFormRef.current;
        const hasData = Boolean(
          f.customer || f.projectName || f.rfqReceptionDate || f.expectedQuotationDate ||
          f.automotiveType || f.contactName || f.contactEmail || f.deliveryZone || f.country ||
          (Array.isArray(f.products) && f.products.some(p => p.product || p.partNumber || p.targetPrice))
        );
        if (!hasData) return;
        _autoCreateRef.current = true;
        try {
          const tab = _activeRfqTabRef.current;
          const mode = tab === "potential" ? "potential" : "rfq";
          const docType = tab === "potential" ? "POTENTIAL" : tab === "rfi" ? "RFI" : "RFQ";
          const created = await createRfq({ chat_mode: mode, document_type: docType });
          const newId = created.rfq_id;
          setRfqId(newId);
          setRfqCreatedInThisSession(true);
          // Use replaceState instead of navigate() to update the URL without triggering
          // React Router's init effect (which would applyRfq → reset form → cause a ghost save)
          window.history.replaceState(null, "", `/rfqs/new?id=${encodeURIComponent(newId)}`);
          await updateRfqData(newId, buildRfqDataPayloadFromForm(_latestFormRef.current));
        } catch {
          setRfqError("Unable to auto-save. Please try again.");
        } finally {
          _autoCreateRef.current = false;
        }
      } else {
        handleSaveForm();
      }
    }, 1500);
    return () => clearTimeout(_autoSaveTimerRef.current);
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleAssignValidator = async () => {
    if (!rfqId || !canUseRfqActions) return;
    setSaving(true);
    try {
      const updatedRfq = await updateRfqData(rfqId, buildRfqDataPayloadFromForm(_latestFormRef.current));
      // Update snapshot only — do NOT call syncRfq/applyRfq here, as that resets the entire
      // form from the backend and would overwrite any in-progress user edits (e.g. a recently
      // cleared qty/year that hasn't been auto-saved yet).
      if (updatedRfq) setRfqSnapshot(updatedRfq);
      const result = await assignValidator(rfqId);
      setForm((prev) => ({ ...prev, validatorEmail: result.zone_manager_email || prev.validatorEmail }));
    } catch {
      // silent — validator assignment is best-effort
    } finally {
      setSaving(false);
    }
  };
  const _lastValidatorAssignmentRef = useRef(null);
  useEffect(() => {
    if (!rfqId || !canUseRfqActions) return;
    const firstThreeComplete = ["step-client", "step-request", "step-schedule"].every(
      (id) => stepStates[id]?.isComplete
    );
    if (!firstThreeComplete) return;
    const deliveryZones = (form.volumes || [])
      .map((v) => String(v.deliveryZone || "").trim())
      .filter(Boolean)
      .sort()
      .join(",");
    const toTotalStr = String(form.toTotal || "").trim();
    // When toTotal is cleared, reset the assignment signature so the next valid value
    // triggers a fresh re-assignment, but don't call handleAssignValidator with empty data.
    if (!toTotalStr) {
      _lastValidatorAssignmentRef.current = null;
      return;
    }
    const signature = `${rfqId}|${deliveryZones}|${toTotalStr}`;
    if (_lastValidatorAssignmentRef.current === signature) return;
    _lastValidatorAssignmentRef.current = signature;
    handleAssignValidator();
  }, [rfqId, canUseRfqActions, stepStates, form.toTotal, form.volumes]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleSubmitToValidator = async () => {
    if (!rfqId || !canUseRfqActions) return;
    if (isRfqUpdateModeActive && currentUserRole !== "OWNER" && !isRfqCreator) {
      showToast("You are not allowed to update this RFQ.", { type: "error", title: "Permission denied" });
      return;
    }
    const assemblyMissingComponent = (form.products || []).some((p) => {
      const pl = String(p.productLine || "").trim().toLowerCase();
      return (pl === "ass" || pl === "assembly") && !String(p.components || "").trim();
    });
    if (assemblyMissingComponent) {
      setRfqError("Component is required for Assembly product lines.");
      return;
    }
    const isChangeIndexSubmit = rfqEditSubmitType === "change_index";
    const hasPendingAttachmentChanges = pendingUpdateFiles.length > 0 || pendingDeleteFiles.length > 0;
    const changedFieldsForEmail = isChangeIndexSubmit
      ? (hasPendingAttachmentChanges ? ["attachments"] : [])
      : (() => {
          const fields = computeChangedRfqFields(_preUpdateSnapshotRef.current?.form, form);
          if (hasPendingAttachmentChanges) fields.push("attachments");
          return fields;
        })();
    setSaving(true);
    setIsSubmittingToValidator(true);
    try {
      await updateRfqData(rfqId, buildRfqDataPayloadFromForm(form), rfqEditSubmitType, changedFieldsForEmail);
      // The main data update above already performs the single index increment
      // (when rfqEditSubmitType === "change_index"), so every queued file in this
      // same submit is uploaded as "simple" — it still picks up the now-current
      // (already incremented) revision. This avoids incrementing once per file
      // on top of the increment already applied above.
      let changeIndexConsumed = isChangeIndexSubmit;
      for (const { file, updateType } of pendingUpdateFiles) {
        let effectiveUpdateType = updateType;
        if (effectiveUpdateType === "change_index") {
          if (changeIndexConsumed) {
            effectiveUpdateType = "simple";
          } else {
            changeIndexConsumed = true;
          }
        }
        await uploadRfqFile(rfqId, file, effectiveUpdateType);
      }
      for (const file of pendingDeleteFiles) {
        await deleteRfqFile(rfqId, file.id, file.name);
      }
      setPendingUpdateFiles([]);
      setPendingDeleteFiles([]);
      setProductDrawings((prev) => {
        const cleared = {};
        for (const key of Object.keys(prev)) {
          const remaining = (prev[key] || []).filter((e) => e.source !== "local");
          if (remaining.length > 0) cleared[key] = remaining;
        }
        return cleared;
      });
      if (!form.validatorEmail) {
        const result = await assignValidator(rfqId);
        setForm((prev) => ({ ...prev, validatorEmail: result.zone_manager_email || prev.validatorEmail }));
      }
      await submitRfq(rfqId);
      await syncRfq(rfqId);
      setSelectedStage("RFQ");
      setSelectedSubPhase("Validation");
      setActiveStep("step-notes");
      setRfqValidationReached(true);
      setRfqFormEditEnabled(false);
      const wasUpdateMode = isRfqUpdateModeActive;
      setIsRfqUpdateModeActive(false);
      setRfqEditSubmitType("simple");
      _preUpdateSnapshotRef.current = null;
      showToast(
        isChangeIndexSubmit
          ? "RFQ index updated and costing reset to pending validation."
          : wasUpdateMode ? "RFQ updated and re-submitted successfully." : "RFQ submitted successfully.",
        {
          type: "success",
          title: isChangeIndexSubmit ? "RFQ index updated" : wasUpdateMode ? "RFQ updated" : "RFQ submitted"
        }
      );
    } catch (error) {
      await syncRfq(rfqId).catch(() => {});
      const isAiBlock = error?.status === 422 && error?.data?.detail?.ai_blocked;
      if (!isAiBlock) {
        setRfqError(error?.message || "Unable to submit. Please check all required fields.");
      }
    } finally {
      setSaving(false);
      setIsSubmittingToValidator(false);
    }
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!rfqId || !canUseRfqActions) return;
    setSaving(true);
    try {
      await updateRfqData(rfqId, buildRfqDataPayloadFromForm(form));
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
      const updatedRfq = await submitRevision(rfqId);
      const auditLogs = await getRfqAuditLogs(rfqId).catch(() => []);
      applyRfq(updatedRfq, { auditLogs });
      showToast("Updates submitted for validation.", {
        type: "success",
        title: "Updates submitted"
      });
    } catch (error) {
      await syncRfq(rfqId).catch(() => {});
      const isAiBlock = error?.status === 422 && error?.data?.detail?.ai_blocked;
      if (!isAiBlock) {
        setRfqError(error?.message || "Unable to submit updates.");
      }
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
    // When the validator and the creator are different people, the validator
    // specifies which fields the creator must update via the revision modal.
    if (!validatorIsCreator) {
      setRevisionComment("");
      setRevisionRequestModalOpen(true);
      return;
    }
    setOptimisticRevisionMode(true);
    setRfqFormEditEnabled(true);
    setPersistValidationView(false);
    setActiveRfqTab(isRfiDocument ? "rfi" : "new");
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
      showToast(`Revision mode enabled. Update the ${formalDocumentLabel} and submit your changes when ready.`, {
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
      await syncRfq(rfqId, { preserveNavigationState: false });
      showToast("RFQ approved. Begin costing.", { type: "success", title: "RFQ approved" });
      waitForSharePointUrl(rfqId);
    } catch (error) {
      setRfqError(error?.message || `Unable to approve this ${formalDocumentLabel}.`);
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
      setRfqError(error?.message || `Unable to load the ${formalDocumentLabel} data PDF preview.`);
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
    if (!rfqId || costingReviewActionId || !canReviewCostingfeasibility) return;
    setCostingReviewActionId("approve");
    setValidationSuccess("");
    setRfqError("");
    try {
      await submitCostingReview(rfqId, { scope: true });
      await syncRfq(rfqId);
      setPersistCostingReviewView(true);
      setSelectedStage("In costing");
      setSelectedSubPhase("feasibility");
      showToast("RFQ approved. Begin Feasibility. An email will be sent to R&D.", { type: "success", title: "RFQ approved" });
    } catch (error) {
      setRfqError(error?.message || "Unable to approve this feasibility review.");
    } finally {
      setCostingReviewActionId("");
    }
  };
  const handleRejectCostingReview = () => {
    if (costingReviewActionId || !canReviewCostingfeasibility) return;
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
    if (!rfqId || !canReviewCostingfeasibility) return;
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
      setSelectedSubPhase("feasibility");
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
    setCostingFileActionDraft([]);
    setExistingFeasibilityFilesInPopup(
      costingFiles.filter((f) => f.fileRole === "FEASIBILITY")
    );
    setRemovedExistingFeasibilityFileIds([]);
    setCostingFileActionModalOpen(true);
  };
  const handleCloseCostingFileActionModal = () => {
    if (costingFileActionPending) return;
    setCostingFileActionModalOpen(false);
    setCostingFileActionMode("UPLOADED");
    setCostingFileActionNote("");
    setCostingFileActionDraft([]);
    setExistingFeasibilityFilesInPopup([]);
    setRemovedExistingFeasibilityFileIds([]);
  };
  const handleCostingFileDraftChange = (event) => {
    const selected = Array.from(event.target.files || []);
    setCostingFileActionDraft((prev) => mergeFilesWithoutDuplicates(prev || [], selected));
    event.target.value = "";
  };
  const handleRemovePendingCostingFile = (fileToRemove) => {
    setCostingFileActionDraft((prev) =>
      (prev || []).filter(
        (f) =>
          !(f.name === fileToRemove.name &&
            f.size === fileToRemove.size &&
            f.lastModified === fileToRemove.lastModified)
      )
    );
  };
  const handleSubmitCostingFileAction = async (event) => {
    event.preventDefault();
    if (!rfqId || costingFileActionPending || !canManageCostingFeasibilityHandoff) return;
 
    const trimmedNote = String(costingFileActionNote || "").trim();
    if (!costingFeasibilityStatus) {
      setRfqError("Please select the feasibility status before submitting.");
      return;
    }
    const hasRemovals = removedExistingFeasibilityFileIds.length > 0;
    if (costingFileActionMode === "UPLOADED" && costingFileActionDraft.length === 0 && !hasRemovals) {
      setRfqError("Please choose the completed feasibility file before submitting.");
      return;
    }
    setCostingFileActionPending(true);
    setRfqError("");
    try {
      for (const entryId of removedExistingFeasibilityFileIds) {
        await deleteCostingFileEntry(rfqId, entryId);
      }
      if (costingFileActionDraft.length > 0 || costingFileActionMode === "NA") {
        await submitCostingFileAction(rfqId, {
          action: costingFileActionMode,
          note: trimmedNote,
          feasibilityStatus: costingFeasibilityStatus,
          files: costingFileActionMode === "UPLOADED" ? costingFileActionDraft : []
        });
      }
      await syncRfq(rfqId);
      setCostingFileActionModalOpen(false);
      setCostingFileActionMode("UPLOADED");
      setCostingFileActionNote("");
      setCostingFileActionDraft([]);
      setExistingFeasibilityFilesInPopup([]);
      setRemovedExistingFeasibilityFileIds([]);
      showToast(
        costingFileActionMode === "NA"
          ? "Marked as not applicable with your note."
          : "Feasibility file submitted successfully.",
        {
          type: "success",
          title: "Costing uploaded"
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
    setPricingFinalPriceDraft([]);
    setExistingPricingFilesInPopup(
      costingFiles.filter((f) => f.fileRole === "PRICING_FINAL_PRICE")
    );
    setRemovedExistingPricingFileIds([]);
    setPricingFinalPriceModalOpen(true);
  };
  const handleClosePricingFinalPriceModal = () => {
    if (pricingFinalPricePending) return;
    setPricingFinalPriceModalOpen(false);
    setExistingPricingFilesInPopup([]);
    setRemovedExistingPricingFileIds([]);
  };
  const handlePricingFinalPriceDraftChange = (event) => {
    const selected = Array.from(event.target.files || []);
    setPricingFinalPriceDraft((prev) => mergeFilesWithoutDuplicates(prev || [], selected));
    event.target.value = "";
  };
  const handleRemovePendingPricingFile = (fileToRemove) => {
    setPricingFinalPriceDraft((prev) =>
      (prev || []).filter(
        (f) =>
          !(f.name === fileToRemove.name &&
            f.size === fileToRemove.size &&
            f.lastModified === fileToRemove.lastModified)
      )
    );
  };
  const handleRemoveExistingFeasibilityFileFromPopup = (fileToRemove) => {
    setExistingFeasibilityFilesInPopup((prev) =>
      (prev || []).filter((f) => f.id !== fileToRemove.id)
    );
    if (fileToRemove?.id) {
      setRemovedExistingFeasibilityFileIds((prev) => [...prev, fileToRemove.id]);
    }
  };
  const handleRemoveExistingPricingFileFromPopup = (fileToRemove) => {
    setExistingPricingFilesInPopup((prev) =>
      (prev || []).filter((f) => f.id !== fileToRemove.id)
    );
    if (fileToRemove?.id) {
      setRemovedExistingPricingFileIds((prev) => [...prev, fileToRemove.id]);
    }
  };
  const handleSubmitPricingFinalPriceUpload = async (event) => {
    event.preventDefault();
    if (!rfqId || pricingFinalPricePending || !canManagePricingFinalPrice) return;
    const trimmedNote = String(pricingFinalPriceNote || "").trim();
    const hasRemovals = removedExistingPricingFileIds.length > 0;
    if (pricingFinalPriceDraft.length === 0 && !hasRemovals) {
      setRfqError("Please choose the costing file with final price before submitting.");
      return;
    }
    setPricingFinalPricePending(true);
    setRfqError("");
    try {
      for (const entryId of removedExistingPricingFileIds) {
        await deleteCostingFileEntry(rfqId, entryId);
      }
      if (pricingFinalPriceDraft.length > 0) {
        const updatedRfq = await uploadPricingFinalPriceFile(rfqId, {
          note: trimmedNote,
          files: pricingFinalPriceDraft
        });
        applyRfq(updatedRfq, { preserveActiveTab: true });
      } else {
        await syncRfq(rfqId);
      }
      setSelectedStage("In costing");
      setSelectedSubPhase("Pricing");
      setPricingFinalPriceModalOpen(false);
      setPricingFinalPriceNote("");
      setPricingFinalPriceDraft([]);
      setExistingPricingFilesInPopup([]);
      setRemovedExistingPricingFileIds([]);
      showToast(
        pricingFinalPriceDraft.length > 1
          ? `${pricingFinalPriceDraft.length} costing files with final price uploaded successfully. An email will be sent to the PLM to validate it.`
          : hasRemovals && pricingFinalPriceDraft.length === 0
            ? "Costing file(s) removed successfully."
            : "Costing file with final price uploaded successfully. An email will be sent to the PLM to validate it.",
        { type: "success", title: "Pricing uploaded" }
      );
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
      await hydrateRfqAfterMutation(rfqId);
      if (isRfiDocument) {
        setSelectedStage("In costing");
        setSelectedSubPhase("Pricing");
        showToast("Pricing file approved. RFI sent to requester and closed.", { type: "success", title: "RFQ approved" });
      } else {
        setSelectedStage("Offer");
        setSelectedSubPhase("Offer preparation");
        showToast("Pricing file approved. RFQ moved to offer preparation.", { type: "success", title: "RFQ approved" });
      }
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
      await hydrateRfqAfterMutation(rfqId);
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
  const handleSaveCostingfeasibility = async () => {
    if (!rfqId || costingSavePending || !canSaveCostingfeasibility) return;
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
    setCostingfeasibilitySaved(true);
    setValidationSuccess("");
    setRfqError("");
    try {
      await advanceRfqStatus(rfqId, {
        target_phase: "COSTING",
        target_sub_status: "PRICING"
      });
      setPersistCostingReviewView(false);
      await hydrateRfqAfterMutation(rfqId);
      setSelectedStage("In costing");
      setSelectedSubPhase("Pricing");
      showToast("Costing moved to pricing successfully. An email will be sent to the costing team.", { type: "success", title: "RFQ approved" });
    } catch (error) {
      setCostingfeasibilitySaved(false);
      setRfqError(error?.message || `Unable to move this ${formalDocumentLabel} to pricing.`);
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
      setValidationSuccess(`${formalDocumentLabel} rejected successfully.`);
    } catch (error) {
      setRfqError(error?.message || `Unable to reject this ${formalDocumentLabel}.`);
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
  const productRows = Array.isArray(form.products) && form.products.length
    ? form.products
    : [createEmptyProductItem()];
  const volumeRows = Array.isArray(form.volumes) ? form.volumes : [];
  const volumeYearColumns = useMemo(() => {
    const allYears = new Set();
    productRows.forEach((product, i) => {
      const sopYear = extractSopYear(product.sop);
      if (!Number.isNaN(sopYear) && sopYear > 1900) {
        for (let j = 0; j < 5; j++) allYears.add(sopYear + j);
      }
      const volMap = volumeRows[i]?.volumes || {};
      Object.keys(volMap).map(Number).filter((y) => !Number.isNaN(y)).forEach((y) => allYears.add(y));
    });
    return Array.from(allYears).sort((a, b) => a - b);
  }, [productRows, volumeRows]);
  const deliveryZoneOptions = useMemo(
    () => getDeliveryZoneOptions(form.deliveryZone),
    [form.deliveryZone]
  );
  const totalTargetTo = calculateTotalTargetTo(productRows);
  useEffect(() => {
    const computed = totalTargetTo > 0 ? totalTargetTo / 1000 : "";
    setForm((prev) => {
      const prevVal = prev.toTotal;
      if ((prevVal || "") === (computed || "")) return prev;
      return { ...prev, toTotal: computed };
    });
  }, [totalTargetTo]); // eslint-disable-line react-hooks/exhaustive-deps
  const sharedProductCurrency = useMemo(
    () =>
      sanitizeProductCurrencyCode(
        productRows.find((product) => sanitizeProductCurrencyCode(product?.currency))?.currency ||
        form.targetPriceCurrency
      ),
    [form.targetPriceCurrency, productRows]
  );
  const { ratesByCurrency, loadingByCurrency, fallbackByCurrency } = useEurFxRates(
    productRows.map((product) => product?.currency)
  );
  const totalTargetToK = useMemo(() => {
    return volumeRows.reduce((total, volume, idx) => {
      const linkedProduct = productRows[idx] || createEmptyProductItem();
      const rowSop = extractSopYear(linkedProduct.sop);
      const totalQty = volumeYearColumns.reduce((sum, year) => {
        return sum + Number(volume.volumes?.[year] || 0);
      }, 0);
      const currency = sanitizeProductCurrencyCode(linkedProduct.currency || "");
      const isEur = !currency || currency === "EUR";
      const eurRate = isEur ? 1 : (ratesByCurrency[currency] ?? 1);
      const rowNative = totalQty * Number(volume.targetPrice || 0);
      return total + rowNative * eurRate;
    }, 0);
  }, [volumeRows, productRows, volumeYearColumns, ratesByCurrency]);
  const sharedCurrencyRate = ratesByCurrency[sharedProductCurrency];
  const sharedCurrencyRateLoading = loadingByCurrency[sharedProductCurrency];
  const sharedCurrencyFallbackUsed = fallbackByCurrency[sharedProductCurrency];
  const totalTargetToNumber = parseNumericInputValue(totalTargetTo);
  const totalTargetToEurPreview = sharedProductCurrency &&
    sharedProductCurrency !== "EUR" &&
    totalTargetToNumber !== null &&
    Number.isFinite(sharedCurrencyRate)
    ? totalTargetToNumber * sharedCurrencyRate
    : null;
  const formatTurnover = (value) => {
    if (value === "" || value === null || value === undefined) return "";
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return number.toLocaleString("en-US", { maximumFractionDigits: 5 });
  };
  const formatTurnoverInThousands = (value) => {
    if (value === "" || value === null || value === undefined) return "";
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return (number / 1000).toLocaleString("en-US", { maximumFractionDigits: 5 });
  };

  useEffect(() => {
    const newToTotal = totalTargetTo > 0 ? totalTargetTo / 1000 : "";
    setForm((prev) => {
      if (String(prev.toTotal ?? "") === String(newToTotal)) return prev;
      return { ...prev, toTotal: newToTotal };
    });
  }, [totalTargetTo]); 

  useEffect(() => {
    if (totalTargetToEurPreview === null) return;
    const newToTotalLocal = totalTargetToEurPreview > 0 ? totalTargetToEurPreview / 1000 : "";
    setForm((prev) => {
      if (String(prev.toTotalLocal ?? "") === String(newToTotalLocal)) return prev;
      return { ...prev, toTotalLocal: newToTotalLocal };
    });
  }, [totalTargetToEurPreview]); 

  const sharedTurnoverUnit = sharedProductCurrency
    ? `k${sharedProductCurrency}`
    : "k";
  /* ACTION PLAN - DISABLED
  const ACTION_STATUSES = ["Open", "In Progress", "Done", "Cancelled"];
  const handleActionDraftChange = (field, value) => {
    setActionDraft((prev) => ({ ...prev, [field]: value }));
  };
  const handleAddAction = () => {
    if (!actionDraft.action.trim()) return;
    setActionItems((prev) => [...prev, { ...actionDraft, id: Date.now() }]);
    setActionDraft({ action: "", description: "", responsible: "", dueDate: "", status: "Open" });
    setActionFormOpen(false);
  };
  const handleDeleteAction = (id) => {
    setActionItems((prev) => prev.filter((a) => a.id !== id));
  };
  const handleStatusChange = (id, status) => {
    setActionItems((prev) => prev.map((a) => a.id === id ? { ...a, status } : a));
  };
  const STATUS_COLORS = {
    "Open":        "bg-violet-50 text-violet-700 border-violet-200",
    "In Progress": "bg-amber-50 text-amber-700 border-amber-200",
    "Done":        "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Cancelled":   "bg-slate-100 text-slate-500 border-slate-200",
  };
  const STATUS_DOT = {
    "Open":        "bg-violet-400",
    "In Progress": "bg-amber-400",
    "Done":        "bg-emerald-400",
    "Cancelled":   "bg-slate-400",
  };
  */
  return (
    <div className="min-h-screen overflow-y-auto bg-slate-100/70 flex flex-col lg:h-screen lg:overflow-hidden">
      <TopBar />
      {/* ── Action Plan Modal - DISABLED ─────────────────────────── */}
      {false && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setActionPlanOpen(false); }}
        >
          <div className="relative w-full max-w-[82vw] flex flex-col max-h-[90vh] rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(15,23,42,0.22)]"
            style={{ background: "linear-gradient(160deg,#f8faff 0%,#ffffff 100%)" }}
          >
            {/* Decorative blobs */}
            <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-tide/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-violet-400/10 blur-3xl" />
            {/* Header */}
            <div className="relative flex items-center justify-between border-b border-slate-100/80 bg-white/60 px-8 py-5 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-tide to-tide/70 text-white shadow-md">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 tracking-tight">Action Plan</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {actionItems.length === 0 ? "No actions yet" : `${actionItems.length} corrective action${actionItems.length > 1 ? "s" : ""}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActionFormOpen(true)}
                  disabled={actionFormOpen}
                  className="inline-flex items-center gap-2 rounded-xl bg-tide px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0"
                >
                  <Plus className="h-4 w-4" />
                  Add new corrective action
                </button>
                <button
                  type="button"
                  onClick={() => setActionPlanOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 hover:border-slate-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Table */}
            <div className="relative flex-1 overflow-y-auto px-8 py-6">
              <table className="w-full text-sm border-separate border-spacing-y-1">
                <colgroup>
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "12%" }} />
                </colgroup>
                <thead>
                  <tr>
                    {[
                      { label: "Action",      required: true  },
                      { label: "Description", required: true  },
                      { label: "Responsible", required: true  },
                      { label: "Due Date",    required: true  },
                      { label: "Status",      required: false },
                      { label: "Actions",     required: false },
                    ].map(({ label, required }) => (
                      <th key={label} className="pb-3 pr-4 text-left text-xs font-extrabold uppercase tracking-[0.18em] text-slate-700 last:pr-0">
                        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {actionItems.length === 0 && !actionFormOpen ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                            <ClipboardList className="h-7 w-7 opacity-40" />
                          </div>
                          <p className="text-sm font-medium">No corrective actions yet</p>
                          <p className="text-xs">Click <span className="font-semibold text-tide">Add new corrective action</span> to get started</p>
                        </div>
                      </td>
                    </tr>
                  ) : actionItems.map((item, idx) => (
                    <tr key={item.id} className="group">
                      <td className="rounded-l-xl bg-white px-4 py-3 pr-3 font-semibold text-slate-800 max-w-[150px] truncate shadow-sm border border-r-0 border-slate-100">{item.action}</td>
                      <td className="bg-white px-3 py-3 text-slate-500 max-w-[190px] truncate border-y border-slate-100">{item.description || <span className="text-slate-300">—</span>}</td>
                      <td className="bg-white px-3 py-3 text-slate-600 border-y border-slate-100">{item.responsible || <span className="text-slate-300">—</span>}</td>
                      <td className="bg-white px-3 py-3 text-slate-500 whitespace-nowrap border-y border-slate-100">{item.dueDate || <span className="text-slate-300">—</span>}</td>
                      <td className="bg-white px-3 py-3 border-y border-slate-100">
                        <select
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.id, e.target.value)}
                          className={`rounded-full border px-4 py-2 text-sm font-semibold appearance-none cursor-pointer focus:outline-none ${STATUS_COLORS[item.status] || STATUS_COLORS["Open"]}`}
                        >
                          {ACTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="rounded-r-xl bg-white px-3 py-3 border border-l-0 border-slate-100 shadow-sm">
                        <button
                          type="button"
                          onClick={() => handleDeleteAction(item.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition"
                        >
                          <Trash2 className="h-4.5 w-4.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {/* Inline new-row form */}
                  {actionFormOpen && (
                    <tr>
                      <td className="rounded-l-xl bg-tide/5 border border-r-0 border-tide/20 px-3 py-3">
                        <textarea
                          autoFocus
                          rows={3}
                          value={actionDraft.action}
                          onChange={(e) => handleActionDraftChange("action", e.target.value)}
                          placeholder="Action *"
                          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-tide/50 focus:outline-none focus:ring-2 focus:ring-tide/20"
                        />
                      </td>
                      <td className="bg-tide/5 border-y border-tide/20 px-3 py-3">
                        <textarea
                          rows={3}
                          value={actionDraft.description}
                          onChange={(e) => handleActionDraftChange("description", e.target.value)}
                          placeholder="Description"
                          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-tide/50 focus:outline-none focus:ring-2 focus:ring-tide/20"
                        />
                      </td>
                      <td className="bg-tide/5 border-y border-tide/20 px-3 py-3">
                        <textarea
                          rows={3}
                          value={actionDraft.responsible}
                          onChange={(e) => handleActionDraftChange("responsible", e.target.value)}
                          placeholder="Responsible"
                          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-tide/50 focus:outline-none focus:ring-2 focus:ring-tide/20"
                        />
                      </td>
                      <td className="bg-tide/5 border-y border-tide/20 px-3 py-3">
                        <input
                          type="date"
                          value={actionDraft.dueDate}
                          onChange={(e) => handleActionDraftChange("dueDate", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-tide/50 focus:outline-none focus:ring-2 focus:ring-tide/20"
                        />
                      </td>
                      <td className="bg-tide/5 border-y border-tide/20 px-3 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 shadow-sm">
                          <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                          Open
                        </span>
                      </td>
                      <td className="rounded-r-xl bg-tide/5 border border-l-0 border-tide/20 px-3 py-3">
                        <div className="flex flex-row items-center gap-2">
                          <button
                            type="button"
                            onClick={handleAddAction}
                            disabled={!actionDraft.action.trim()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-tide px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-tide/90 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Check className="h-3 w-3" /> Save
                          </button>
                          <button
                            type="button"
                            onClick={() => { setActionFormOpen(false); setActionDraft({ action: "", description: "", responsible: "", dueDate: "", status: "Open" }); }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                          >
                            <X className="h-3 w-3" /> Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-1 min-h-0 flex-col pt-4 pb-0 sm:pt-6 lg:pt-1 overflow-auto lg:overflow-hidden">
        <div className="w-full flex flex-1 min-h-0 flex-col overflow-auto lg:overflow-hidden">
          <div className="app-shell w-full flex flex-1 min-h-0 flex-col rounded-none border border-slate-200/70 shadow-card overflow-auto lg:overflow-hidden">
            <div className="flex flex-1 min-h-0 flex-col gap-6 lg:gap-2 overflow-auto lg:overflow-hidden">
              <div className="px-4 pt-2">
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    className="back-button"
                    onClick={() => navigate("/dashboard")}
                  >
                    <span className="text-xs sm:text-base">←</span>
                    Back
                  </button>
                  <div className="order-3 w-full pt-2 sm:order-none sm:w-auto sm:flex-1 sm:min-w-[240px]">
                    <div className="pipeline-shell newrfq-pipeline">
                      <div className="pipeline-bar">
                        {visibleStages.map((stage, index) => {
                          const isActive = groupedActiveStage === stage.key;
                          const isSelected = selectedStage === stage.key;
                          const isCompletedRfiCostingStep =
                            isCompletedRfiWorkflow && stage.key === "In costing";
                          const isCompleted =
                            index < stageIndex || isCompletedRfiCostingStep;
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
                          const stepState = isFailureTerminalStage && (isActive || isCompleted)
                            ? "pipeline-step-terminal"
                            : isCompleted
                              ? "pipeline-step-complete"
                              : isActive
                                ? "pipeline-step-active"
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
                                  ? `${formatFormalDocumentText(stage.label)} - ${stage.subPhases
                                    .map((subPhase) => formatFormalDocumentText(subPhase))
                                    .join(" > ")}`
                                  : formatFormalDocumentText(stage.label)
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
                                  {formatFormalDocumentText(stage.label)}
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
                                                  : isFailureTerminalStage
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
                                              : (isFailureTerminalStage ? "h-2 w-2 rounded-full bg-red-300" : "h-2 w-2 rounded-full bg-emerald-300")
                                            : "h-1.5 w-1.5 rounded-full bg-white/70";
                                        const labelClass = isSubActive
                                          ? "mt-0.5 max-w-[120px] text-center font-semibold leading-tight text-white"
                                          : isSubComplete
                                            ? isNeutralCompletedRfqForm
                                              ? "mt-0.5 max-w-[120px] text-center leading-tight text-white/85"
                                              : (isFailureTerminalStage ? "mt-0.5 max-w-[120px] text-center leading-tight text-red-100" : "mt-0.5 max-w-[120px] text-center leading-tight text-emerald-50")
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
                                            className={`relative z-10 flex flex-1 flex-col items-center rounded-lg border-0 bg-transparent px-0.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-white/85 transition focus:outline-none focus:ring-2 focus:ring-white/30 disabled:cursor-not-allowed disabled:opacity-45 sm:text-[11px] ${subPhaseSelectedClass} ${subPhaseHoverClass}`}
                                            aria-pressed={isSubSelected}
                                            aria-disabled={isSubDisabled || undefined}
                                            title={
                                              isSubDisabled
                                                ? isValidationSubPhase
                                                  ? holdSelfValidationPrompt
                                                    ? "Confirm the validator prompt to open this tab"
                                                    : `Submit the ${formalDocumentLabel} for validation to unlock this tab`
                                                  : isOfferValidationSubPhase
                                                    ? "This tab is locked for now"
                                                    : "Complete feasibility handoff to unlock this tab"
                                                : `${formatFormalDocumentText(stage.label)} - ${formatFormalDocumentText(subPhase)}`
                                            }
                                          >
                                            <span className={dotClass} />
                                            <span className={labelClass}>{formatFormalDocumentText(subPhase)}</span>
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
                  {/* ACTION PLAN BUTTON - DISABLED
                  <button
                    type="button"
                    onClick={() => setActionPlanOpen(true)}
                    className={`relative inline-flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm transition sm:h-14 sm:w-14 ${actionPlanOpen
                      ? "border-tide/30 bg-tide text-white"
                      : "border-slate-200/80 bg-white/90 text-slate-600 hover:-translate-y-0.5 hover:border-tide/35 hover:text-tide"
                      }`}
                    aria-label="Action plan"
                    title="Action plan"
                  >
                    <ClipboardList className="h-5 w-5" />
                    {actionItems.length > 0 && (
                      <span className={`absolute -right-1.5 -top-1.5 inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${actionPlanOpen ? "bg-white text-tide" : "bg-tide text-white"}`}>
                        {actionItems.length}
                      </span>
                    )}
                  </button>
                  */}
                  {isRfqStage && (isRfqFormView || isRfqValidationView) ? (
                    <button
                      type="button"
                      onClick={() => setDiscussionModalOpen(true)}
                      className={`relative order-2 ml-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm transition sm:order-none sm:ml-0 sm:h-14 sm:w-14 ${discussionModalOpen
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
                      className={`relative order-2 ml-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm transition sm:order-none sm:ml-0 sm:h-14 sm:w-14 ${isCostingDiscussionOpen
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
                  <div className="flex items-center gap-6 border-b border-slate-200/70 text-xs font-semibold text-slate-500 sm:text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isPotentialTabLocked) {
                          if (!hasPersistedDraft) {
                            setDocumentType("POTENTIAL");
                          }
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
                        if (!isRfiTabLocked) {
                          setDocumentType("RFI");
                          setActiveRfqTab("rfi");
                        }
                      }}
                      disabled={isRfiTabLocked}
                      className={`pb-1 transition disabled:cursor-not-allowed disabled:opacity-45 ${activeRfqTab === "rfi"
                        ? "border-b-2 border-tide text-ink"
                        : "hover:text-ink"
                        }`}
                      title={
                        isRfiTabLocked
                          ? isPotentialDraft
                            ? "Use Proceed as RFI to unlock this tab after starting a Potential request."
                            : "The document type is locked after a draft has been created."
                          : "RFI"
                      }
                    >
                      RFI
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isNewRfqTabLocked) {
                          setDocumentType("RFQ");
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
                          ? isPotentialDraft
                            ? "Use Proceed as RFQ to unlock this tab after starting a Potential request."
                            : "The document type is locked after a draft has been created."
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
                            Upload, review, and manage {formalDocumentLabel} attachments in one place.
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
                                                disabled={isDeleting || !allowFileDeletion}
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
                            Files added to this {formalDocumentLabel} will appear here in a compact list.
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
                className="grid w-full items-stretch gap-3 px-4 pb-0 sm:gap-4 sm:px-6 md:grid-cols-[0.22fr_1fr] lg:grid-cols-[var(--nav-col)_minmax(0,1fr)] lg:flex-1 lg:min-h-0 lg:px-0 overflow-auto lg:overflow-hidden"
                style={{
                  "--nav-col": navCollapsed ? "72px" : "0.24fr",
                }}
              >
                {!isRfqStage ? (
                  isCostingStage ? (
                    <section className="card col-span-full flex min-h-[280px] flex-col gap-6 overflow-x-hidden overflow-y-auto p-6 sm:p-8 lg:h-full lg:min-h-0">
                      {isReadOnlyViewer && (
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <svg className="h-4 w-4 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span className="text-sm font-medium text-slate-500">
                            You have <strong>view-only access</strong> to this RFQ. Actions are disabled.
                          </span>
                        </div>
                      )}
                      {shouldShowSharePointButton && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={!sharePointUrl}
                            onClick={handleOpenSharePoint}
                            title={sharePointUrl ? "Open SharePoint folder" : "SharePoint link not available yet"}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-2.5 sm:text-sm"
                          >
                            <FolderOpen className="h-4 w-4" />
                            SharePoint
                          </button>
                        </div>
                      )}
                      {!isCostingPricingView ? (
                        <>
                          <div className="rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-soft">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="max-w-3xl">
                                <h3 className="mt-2 font-display text-base text-ink sm:text-2xl">
                                  {formalDocumentLabel} Data
                                </h3>
                                <p className="mt-3 max-w-2xl text-xs leading-7 text-slate-600 sm:text-sm">
                                  Use Preview to open the PDF in a modal, or Download to save it.
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-3">
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-2.5 sm:text-sm"
                                  onClick={handleOpenCostingPdfPreview}
                                  disabled={!canDownloadCostingTemplate || templatePreviewPending}
                                >
                                  <Eye className="h-4 w-4" />
                                  {templatePreviewPending ? "Preparing preview..." : "Preview PDF"}
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-2.5 sm:text-sm"
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
                                <h2 className="mt-2 font-display text-base text-ink sm:text-2xl">
                                  {formalDocumentLabel} files
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
                                          <p className="truncate text-xs font-semibold text-ink sm:text-sm">
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
                                <p className="text-xs font-semibold text-ink sm:text-sm">
                                  No drawing files uploaded yet
                                </p>
                                <p className="mt-2 text-xs text-slate-500 sm:text-sm">
                                  Upload {formalDocumentLabel} files in{" "}
                                  <span className="font-medium text-ink">New {formalDocumentLabel} &gt; Step 1</span> and they
                                  will appear here.
                                </p>
                              </div>
                            )}
                          </div>
                        </>
                      ) : null}
                      {isCostingfeasibilityView ? (
                        <>
                          <div className="rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-soft">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                              <div className="max-w-2xl">
                                <h2 className="mt-2 font-display text-base text-ink sm:text-2xl">
                                  Reception review
                                </h2>
                                <ResponsibleTag
                                  label="Responsible"
                                  emails={formatResponsibleLeaders(rfqSnapshot?.costing_leaders)}
                                />
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
                                    <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 sm:text-xs">
                                      Reception audit
                                    </p>
                                    <div>
                                      <h4 className="text-sm font-semibold text-ink sm:text-lg">
                                        Decision recorded
                                      </h4>
                                    </div>
                                  </div>
                                  <span
                                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm ${isCostingReviewRejected
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
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                          Rejected at
                                        </p>
                                        <p className="mt-2 truncate text-sm font-semibold text-ink sm:overflow-visible sm:whitespace-normal sm:text-base">
                                          {formatValidationAuditDate(costingReviewAudit.rejectedAt)}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                          Rejected by
                                        </p>
                                        <p className="mt-2 truncate text-sm font-semibold text-ink sm:overflow-visible sm:whitespace-normal sm:text-base">
                                          {formatValidationAuditValue(costingReviewAudit.rejectedBy)}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm md:col-span-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                          Rejection reason
                                        </p>
                                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink sm:text-base">
                                          {formatValidationAuditValue(costingReviewAudit.rejectionReason)}
                                        </p>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="rounded-2xl border border-emerald-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                          Approved at
                                        </p>
                                        <p className="mt-2 truncate text-sm font-semibold text-ink sm:overflow-visible sm:whitespace-normal sm:text-base">
                                          {formatValidationAuditDate(costingReviewAudit.approvedAt)}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl border border-emerald-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                          Approved by
                                        </p>
                                        <p className="mt-2 truncate text-sm font-semibold text-ink sm:overflow-visible sm:whitespace-normal sm:text-base">
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
                                  className="inline-flex w-full sm:w-auto sm:min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 shadow-sm transition hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:py-3 sm:text-sm"
                                  onClick={handleRejectCostingReview}
                                  disabled={costingReviewButtonsDisabled}
                                  title={
                                    canReviewCostingfeasibility
                                      ? "Reject feasibility"
                                      : "Only the owner or costing team can review feasibility."
                                  }
                                >
                                  <X className="h-4 w-4" />
                                  {costingReviewActionId === "reject" ? "Rejecting..." : "Reject"}
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex w-full sm:w-auto sm:min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-emerald-600 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_16px_30px_-18px_rgba(5,150,105,0.9)] transition hover:-translate-y-0.5 hover:border-emerald-700 hover:bg-emerald-700 hover:shadow-[0_18px_34px_-18px_rgba(4,120,87,0.95)] disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:py-3 sm:text-sm"
                                  onClick={handleApproveCostingReview}
                                  disabled={costingReviewButtonsDisabled}
                                  title={
                                    canReviewCostingfeasibility
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
                                  <h2 className="mt-2 font-display text-base text-ink sm:text-2xl">
                                    Feasibility file
                                  </h2>
                                  <ResponsibleTag
                                    label="Responsible"
                                    emails={formatResponsibleLeaders(rfqSnapshot?.rnd_leaders)}
                                  />
                                  <p className="mt-2 text-xs leading-7 text-slate-600 sm:text-sm">
                                    Upload the feasibility document, then click Save to move this {formalDocumentLabel} to pricing.
                                  </p>
                                </div>
                              </div>
                              <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
                                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 sm:text-sm">
                                  Required Template
                                </h3>
                                <p className="mt-3 max-w-2xl text-xs leading-7 text-slate-500 sm:text-sm">
                                  Please download and complete this template before uploading your final feasibility analysis.
                                </p>
                                <div className="mt-4">
                                  <a
                                    href={feasibilityTemplate}
                                    download="Avocarbon_Feasibility_Template.xlsm"
                                    className="inline-flex items-center justify-center rounded-2xl border border-tide/20 bg-tide/10 px-3 py-2 text-xs font-semibold text-tide transition hover:-translate-y-0.5 hover:border-tide/35 hover:bg-tide/15 sm:px-4 sm:py-3 sm:text-sm"
                                  >
                                    Download Feasibility
                                  </a>
                                </div>
                              </div>
                              <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="max-w-2xl">
                                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 sm:text-sm">
                                    Complete feasibility handoff
                                  </h3>
                                  <p className="mt-2 text-xs leading-7 text-slate-600 sm:text-sm">
                                    Upload the finished feasibility file or mark the requirement as not applicable with a note.
                                  </p>
                                </div>
                              </div>
                              <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                  <div className="max-w-2xl">
                                    <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 sm:text-sm">
                                      Feasibility status
                                    </h4>
                                    <p className="mt-2 text-xs leading-7 text-slate-600 sm:text-sm">
                                      Choose the feasibility result before uploading the file or marking this handoff as not applicable.
                                    </p>
                                  </div>
                                  <div className="w-full max-w-md text-left">
                                    <SearchableSelectField
                                      label="Feasibility Status"
                                      value={costingFeasibilityStatus}
                                      onChange={(event) => setCostingFeasibilityStatus(event.target.value)}
                                      options={FEASIBILITY_STATUS_OPTIONS}
                                      placeholder="Not selected yet"
                                      disabled={
                                        !canManageCostingFeasibilityHandoff ||
                                        hasCompletedCostingFileAction ||
                                        costingFileActionPending
                                      }
                                    />
                                  </div>
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
                                    <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 sm:text-sm">
                                      Feasibility actions
                                    </h4>
                                    <p className="mt-2 text-xs leading-7 text-slate-600 sm:text-sm">
                                      Once a status is selected, choose whether to upload the finished feasibility file or record that no file is required.
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3">
                                    <button
                                      type="button"
                                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-2.5 sm:text-sm"
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
                                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-2.5 sm:text-sm"
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
                                      <h3 className="mt-3 text-sm font-semibold text-ink sm:text-lg">
                                        {effectiveCostingFileState?.fileStatus === "NA"
                                          ? "Feasibility file bypass recorded"
                                          : "Feasibility file received"}
                                      </h3>
                                      {String(effectiveCostingFileState?.note || "").trim() && (
                                        <p className="mt-2 text-xs leading-7 text-slate-600 sm:text-sm">
                                          {String(effectiveCostingFileState.note).trim()}
                                        </p>
                                      )}
                                    </div>
                                    {null}
                                  </div>
                                  <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                        Action by
                                      </p>
                                      <p className="mt-2 text-xs font-semibold text-ink sm:text-sm">
                                        {effectiveCostingFileState?.actionBy || "Unavailable"}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                        Recorded at
                                      </p>
                                      <p className="mt-2 text-xs font-semibold text-ink sm:text-sm">
                                        {formatFileDate(effectiveCostingFileState?.actionAt, { withTime: true })}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 min-w-0">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                        Files
                                      </p>
                                      {effectiveCostingFileState?.fileStatus === "NA" ? (
                                        <p className="mt-2 text-xs font-semibold text-ink sm:text-sm">No file required</p>
                                      ) : (() => {
                                        const feasibilityFiles = costingFiles.filter(
                                          (f) => f.fileRole === "FEASIBILITY"
                                        );
                                        return feasibilityFiles.length > 0 ? (
                                          <ul className="mt-2 flex flex-col gap-1.5">
                                            {feasibilityFiles.map((f) => (
                                              <li key={f.id} className="flex min-w-0 items-center justify-between gap-2">
                                                <span
                                                  className="min-w-0 truncate text-sm font-semibold text-ink"
                                                  title={f.name}
                                                >
                                                  {f.name}
                                                </span>
                                                {f.url && (
                                                  <div className="flex flex-shrink-0 items-center gap-1">
                                                    <button
                                                      type="button"
                                                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1 text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                                                      onClick={() => handlePreviewFile(f)}
                                                      title="View file"
                                                      aria-label="View file"
                                                    >
                                                      <Eye className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="inline-flex items-center justify-center rounded-lg border border-tide/20 bg-tide/10 p-1 text-tide transition hover:border-tide/35 hover:bg-tide/15"
                                                      onClick={() => handleDownloadFile(f)}
                                                      title="Download file"
                                                      aria-label="Download file"
                                                    >
                                                      <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                  </div>
                                                )}
                                              </li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <p className="mt-2 text-xs font-semibold text-ink sm:text-sm">
                                            {effectiveCostingFileState?.file?.name || "Unavailable"}
                                          </p>
                                        );
                                      })()}
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                        Feasibility status
                                      </p>
                                      <p className="mt-2 text-xs font-semibold text-ink sm:text-sm">
                                        {effectiveCostingFileState?.feasibilityStatus
                                          ? formatFeasibilityStatusLabel(
                                            effectiveCostingFileState.feasibilityStatus
                                          )
                                          : "Unavailable"}
                                      </p>
                                    </div>
                                  </div>
                                  {canManageCostingFeasibilityHandoff && (
                                    <div className="mt-4 flex justify-end">
                                      <button
                                        type="button"
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-2.5 sm:text-sm"
                                        onClick={() => openCostingFileActionModal("UPLOADED")}
                                        disabled={costingSavePending || costingFileActionPending}
                                        title="Replace the feasibility file"
                                      >
                                        <Upload className="h-4 w-4" />
                                        Replace Feasibility
                                      </button>
                                    </div>
                                  )}
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
                              {hasSavedCostingfeasibility ? (
                                <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 shadow-sm">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                        Feasibility handoff
                                      </p>
                                      <p className="mt-2 text-xs font-semibold text-ink sm:text-sm">
                                        Feasibility saved on {formatStandardTimestamp(
                                          feasibilitySavedAtDisplayValue
                                        )}
                                      </p>
                                    </div>
                                    <span className="inline-flex items-center gap-2 rounded-full border border-tide/20 bg-tide/10 px-3 py-2 text-sm font-semibold text-tide">
                                      <Check className="h-4 w-4" />
                                      Saved to pricing
                                    </span>
                                  </div>
                                  <p className="mt-3 text-sm text-slate-500">
                                    {feasibilitySaveAudit.completedBy
                                      ? `Recorded by ${feasibilitySaveAudit.completedBy}`
                                      : "Recorded in the pricing transition audit."}
                                  </p>
                                </div>
                              ) : (
                                <div className="mt-5 flex justify-end">
                                  <button
                                    type="button"
                                    className="inline-flex w-full sm:w-auto sm:min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-tide bg-tide px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#055d92] disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:py-3 sm:text-sm"
                                    onClick={handleSaveCostingfeasibility}
                                    disabled={!canSaveCostingfeasibility}
                                    title={
                                      canSaveCostingfeasibility
                                        ? "Save feasibility and move to pricing"
                                        : "Approve reception and complete the file action before saving."
                                    }
                                  >
                                    <Check className="h-4 w-4" />
                                    {costingSavePending ? "Saving..." : "Save"}
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                      {isCostingPricingView ? (
                        <div className="space-y-6">
                          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
                            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 sm:text-sm">
                              Required Template
                            </h3>
                            <p className="mt-3 max-w-2xl text-xs leading-7 text-slate-500 sm:text-sm">
                              Please download and complete this template before uploading your final pricing analysis.
                            </p>
                            <div className="mt-4">
                              <a
                                href={costingTemplate}
                                download="Avocarbon_Costing_Template.xlsm"
                                className="inline-flex items-center justify-center rounded-2xl border border-tide/20 bg-tide/10 px-4 py-3 text-sm font-semibold text-tide transition hover:-translate-y-0.5 hover:border-tide/35 hover:bg-tide/15"
                              >
                                Download Costing
                              </a>
                            </div>
                          </div>
 
                          {/* BOM section disabled */}
                          <div className="hidden rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-soft">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="max-w-2xl">
                                <h2 className="mt-2 font-display text-base text-ink sm:text-2xl">
                                  Costing file with BOM data
                                </h2>
                                <p className="mt-2 text-xs leading-7 text-slate-600 sm:text-sm">
                                  Upload the costing package used for pricing with its BOM note from this tab.
                                </p>
                              </div>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-2.5 sm:text-sm"
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
                                    <h3 className="mt-3 text-sm font-semibold text-ink sm:text-lg">
                                      BOM costing package received
                                    </h3>
                                    <p className="mt-2 text-xs leading-7 text-slate-600 sm:text-sm">
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
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-tide/20 bg-tide/10 px-3 py-1.5 text-xs font-semibold text-tide transition hover:-translate-y-0.5 hover:border-tide/35 hover:bg-tide/15 sm:px-4 sm:py-2.5 sm:text-sm"
                                      >
                                        Download
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
 
                                <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                      Uploaded by
                                    </p>
                                    <p className="mt-2 text-xs font-semibold text-ink sm:text-sm">
                                      {pricingBomUpload.uploadedBy || "Unavailable"}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                      Uploaded at
                                    </p>
                                    <p className="mt-2 text-xs font-semibold text-ink sm:text-sm">
                                      {formatFileDate(pricingBomUpload.uploadedAt, { withTime: true })}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                      File
                                    </p>
                                    <p className="mt-2 text-xs font-semibold text-ink sm:text-sm">
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
 
                          <div className="rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-soft">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="max-w-2xl">
                                <h2 className="mt-2 font-display text-base text-ink sm:text-2xl">
                                  Costing file with final price
                                </h2>
                                <ResponsibleTag
                                  label="Responsible"
                                  emails={formatResponsibleLeaders(rfqSnapshot?.costing_leaders)}
                                />
                                <p className="mt-2 text-xs leading-7 text-slate-600 sm:text-sm">
                                  Upload the final priced costing package.
                                </p>
                              </div>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-2.5 sm:text-sm"
                                onClick={openPricingFinalPriceModal}
                                disabled={!canManagePricingFinalPrice || pricingFinalPricePending}
                                title={
                                  canManagePricingFinalPrice
                                    ? "Upload final pricing"
                                    : "Final pricing upload is only available during the PRICING step."
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
                                      <h3 className="mt-3 text-sm font-semibold text-ink sm:text-lg">
                                        Final price costing package received
                                      </h3>
                                      {String(pricingFinalPriceUpload.note || "").trim() && (
                                        <p className="mt-2 text-xs leading-7 text-slate-600 sm:text-sm">
                                          {String(pricingFinalPriceUpload.note).trim()}
                                        </p>
                                      )}
                                    </div>
 
                                    {null}
                                  </div>
 
                                  <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                        Uploaded by
                                      </p>
                                      <p className="mt-2 text-xs font-semibold text-ink sm:text-sm">
                                        {pricingFinalPriceUpload.uploadedBy || "Unavailable"}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                        Uploaded at
                                      </p>
                                      <p className="mt-2 text-xs font-semibold text-ink sm:text-sm">
                                        {formatFileDate(pricingFinalPriceUpload.uploadedAt, { withTime: true })}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 min-w-0">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                        Files
                                      </p>
                                      {(() => {
                                        const pricingFiles = costingFiles.filter(
                                          (f) => f.fileRole === "PRICING_FINAL_PRICE"
                                        );
                                        return pricingFiles.length > 0 ? (
                                          <ul className="mt-2 flex flex-col gap-1.5">
                                            {pricingFiles.map((f) => (
                                              <li key={f.id} className="flex min-w-0 items-center justify-between gap-2">
                                                <span
                                                  className="min-w-0 truncate text-sm font-semibold text-ink"
                                                  title={f.name}
                                                >
                                                  {f.name}
                                                </span>
                                                {f.url && (
                                                  <div className="flex flex-shrink-0 items-center gap-1">
                                                    <button
                                                      type="button"
                                                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1 text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                                                      onClick={() => handlePreviewFile(f)}
                                                      title="View file"
                                                      aria-label="View file"
                                                    >
                                                      <Eye className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="inline-flex items-center justify-center rounded-lg border border-tide/20 bg-tide/10 p-1 text-tide transition hover:border-tide/35 hover:bg-tide/15"
                                                      onClick={() => handleDownloadFile(f)}
                                                      title="Download file"
                                                      aria-label="Download file"
                                                    >
                                                      <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                  </div>
                                                )}
                                              </li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <p className="mt-2 text-xs font-semibold text-ink sm:text-sm">
                                            {pricingFinalPriceUpload.file?.name || "Unavailable"}
                                          </p>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                </div>
 
                                {!pricingFinalPriceSaved ? (
                                  <div className="mt-5 flex justify-end">
                                    <button
                                      type="button"
                                      className="inline-flex w-full sm:w-auto sm:min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-tide bg-tide px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#055d92] disabled:cursor-not-allowed disabled:opacity-60"
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
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                          Costing File Validation
                                        </p>
                                        <h3 className="mt-2 text-sm font-semibold text-ink sm:text-lg">
                                          Validate the final pricing package
                                        </h3>
                                        <ResponsibleTag
                                          label="Responsible"
                                          emails={formatResponsibleLeaders(rfqSnapshot?.plm_leaders)}
                                        />
                                        <p className="mt-2 text-xs leading-7 text-slate-600 sm:text-sm">
                                          {hasRecordedPricingFileDecision
                                            ? "The pricing validation decision has been recorded for this final price package."
                                            : isRfiDocument
                                              ? `Approve to close this ${formalDocumentLabel} and notify the requester, or reject it to send the pricing back for a correction.`
                                              : "Approve to move this RFQ to the Offer stage, or reject it to send the pricing back for a correction."}
                                        </p>
                                      </div>
                                    </div>

                                    {hasRecordedPricingFileDecision ? (
                                      <section
                                        className={`mt-5 rounded-[24px] border p-5 shadow-soft ${isPricingFileRejected
                                          ? "border-red-200/80 bg-red-50/70"
                                          : "border-emerald-200/80 bg-emerald-50/70"
                                          }`}
                                      >
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                          <div className="space-y-2">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                              Costing validation audit
                                            </p>
                                            <div className="flex flex-wrap items-center gap-3">
                                              <span
                                                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${isPricingFileRejected
                                                  ? "border-red-200 bg-red-50 text-red-700"
                                                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                  }`}
                                              >
                                                {isPricingFileRejected ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                                                {isPricingFileRejected ? "Costing Rejected" : "Costing Approved"}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
 
                                        <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                                          <div className="rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-4 shadow-sm">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                              Action
                                            </p>
                                            <p className="mt-2 truncate text-sm font-semibold text-ink sm:overflow-visible sm:whitespace-normal sm:text-base">
                                              {isPricingFileRejected ? "Costing Rejected" : "Costing Approved"}
                                            </p>
                                          </div>
                                          <div className="rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-4 shadow-sm">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                              By whom
                                            </p>
                                            <p className="mt-2 truncate text-sm font-semibold text-ink sm:overflow-visible sm:whitespace-normal sm:text-base">
                                              {formatValidationAuditValue(
                                                isPricingFileRejected
                                                  ? pricingFileDecisionAudit.rejectedBy || currentUserEmail
                                                  : pricingFileDecisionAudit.approvedBy || currentUserEmail
                                              )}
                                            </p>
                                          </div>
                                          <div className="rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-4 shadow-sm">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                              When
                                            </p>
                                            <p className="mt-2 truncate text-sm font-semibold text-ink sm:overflow-visible sm:whitespace-normal sm:text-base">
                                              {formatStandardTimestamp(
                                                isPricingFileRejected
                                                  ? pricingFileDecisionAudit.rejectedAt
                                                  : pricingFileDecisionAudit.approvedAt
                                              )}
                                            </p>
                                          </div>
                                          {isPricingFileRejected ? (
                                            <div className="rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-4 shadow-sm md:col-span-3">
                                              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">
                                                Rejection reason
                                              </p>
                                              <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-ink">
                                                {formatValidationAuditValue(pricingFileDecisionAudit.rejectionReason)}
                                              </p>
                                            </div>
                                          ) : null}
                                        </div>
                                      </section>
                                    ) : (
                                      <div className="mt-5 flex flex-wrap items-center gap-3">
                                        <button
                                          type="button"
                                          className="inline-flex w-full sm:w-auto sm:min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-600 shadow-sm transition hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                          onClick={handleRejectPricingFileValidation}
                                          disabled={pricingFileValidationButtonsDisabled}
                                        >
                                          <X className="h-4 w-4" />
                                          {pricingFileValidationActionId === "reject" ? "Rejecting..." : "Reject"}
                                        </button>
                                        <button
                                          type="button"
                                          className="inline-flex w-full sm:w-auto sm:min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-emerald-600 bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(5,150,105,0.9)] transition hover:-translate-y-0.5 hover:border-emerald-700 hover:bg-emerald-700 hover:shadow-[0_18px_34px_-18px_rgba(4,120,87,0.95)] disabled:cursor-not-allowed disabled:opacity-60"
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
                                  Upload the final priced costing package.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </section>
                  ) : isOfferStage ? (
                    <OfferUnderConstruction />
                  ) : (
                    <div className="col-span-full flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200/80 bg-white/70 text-sm font-medium text-slate-500">
                      Empty stage
                    </div>
                  )
                ) : null}
                {isRfqFormView && activeRfqTab === "potential" ? (
                  <form
                    onSubmit={handleSubmit}
                    className="card relative min-h-0 overflow-y-auto overflow-x-hidden space-y-6 p-3 sm:p-4 md:p-5 md:col-span-2 lg:col-span-2 lg:h-full lg:min-h-0 lg:overflow-y-auto"
                  >
                    <div className="relative flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Potential</p>
                        <h2 className="font-display text-2xl text-ink sm:text-3xl">Potential intake</h2>
                        <p className="mt-2 text-sm font-semibold text-tide">
                          Opportunity: {form.potentialSystematicId || "Draft"}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          This tab mirrors the Potential chatbot. You can start here for a pre-sales assessment, or switch straight to RFI or New RFQ before any draft is created.
                        </p>
                      </div>
                    </div>
                    <div className="relative grid gap-6">
                      <section
                        id="potential-section-overview"
                        className="rounded-2xl border border-slate-200/70 bg-white/95 p-3 shadow-soft transition hover:shadow-md"
                      >
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
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <FormField label="Customer" name="potentialCustomer" value={form.potentialCustomer} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Customer location" name="potentialCustomerLocation" value={form.potentialCustomerLocation} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Application" name="potentialApplication" value={form.potentialApplication} onChange={handleChange} readOnly={potentialFieldReadOnly} autoExpand />
                          <FormField label="Industry served" name="potentialIndustry" value={form.potentialIndustry} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Planned product type" name="potentialProductType" value={form.potentialProductType} onChange={handleChange} readOnly={potentialFieldReadOnly} autoExpand />
                        </div>
                      </section>
                      <section
                        id="potential-section-strategy"
                        className="rounded-2xl border border-slate-200/70 bg-white/95 p-3 shadow-soft transition hover:shadow-md"
                      >
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
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
                      <section
                        id="potential-section-business"
                        className="rounded-2xl border border-slate-200/70 bg-white/95 p-3 shadow-soft transition hover:shadow-md"
                      >
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
                        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                      <section
                        id="potential-section-risks-do"
                        className="rounded-2xl border border-slate-200/70 bg-white/95 p-3 shadow-soft transition hover:shadow-md"
                      >
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
                      <section
                        id="potential-section-risks-not-do"
                        className="rounded-2xl border border-slate-200/70 bg-white/95 p-3 shadow-soft transition hover:shadow-md"
                      >
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
                      <section
                        id="potential-section-contact"
                        className="rounded-2xl border border-slate-200/70 bg-white/95 p-3 shadow-soft transition hover:shadow-md"
                      >
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
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <FormField label="Contact name" name="potentialContactName" value={form.potentialContactName} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Contact function" name="potentialContactFunction" value={form.potentialContactFunction} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Contact phone" name="potentialContactPhone" value={form.potentialContactPhone} onChange={handleChange} readOnly={potentialFieldReadOnly} />
                          <FormField label="Contact email" name="potentialContactEmail" type="email" value={form.potentialContactEmail} onChange={handleChange} readOnly={potentialFieldReadOnly} error={String(form.potentialContactEmail || "").toLowerCase().endsWith("@avocarbon.com") ? "Internal Avocarbon emails are not allowed." : null} />
                        </div>
                      </section>
                      <section className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-soft">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="font-display text-xl text-ink">Proceed to formal request</h3>
                            <p className="mt-2 text-sm text-slate-500">
                              When the shared Potential fields are complete, promote this opportunity to a formal RFQ or RFI.
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => handleProceedToFormalRfq("RFQ")}
                              disabled={!canProceedToFormalRfq || proceedingToFormalRfq}
                              className="gradient-button rounded-xl px-4 py-3 text-sm font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
                              title={
                                canProceedToFormalRfq
                                  ? "Proceed as formal RFQ"
                                  : "Complete the shared Potential fields in the chatbot before proceeding."
                              }
                            >
                              {proceedingToFormalRfq ? "Proceeding..." : "Proceed as RFQ"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleProceedToFormalRfq("RFI")}
                              disabled={!canProceedToFormalRfq || proceedingToFormalRfq}
                              className="outline-button rounded-xl px-4 py-3 text-sm font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
                              title={
                                canProceedToFormalRfq
                                  ? "Proceed as formal RFI"
                                  : "Complete the shared Potential fields in the chatbot before proceeding."
                              }
                            >
                              {proceedingToFormalRfq ? "Proceeding..." : "Proceed as RFI"}
                            </button>
                          </div>
                        </div>
                      </section>
                    </div>
                    <div className="pointer-events-none absolute -right-20 -top-28 h-56 w-56 rounded-full bg-tide/10 blur-3xl" />
                    <div className="pointer-events-none absolute -left-24 -bottom-28 h-60 w-60 rounded-full bg-sun/10 blur-3xl" />
                  </form>
                ) : null}
                {showRfqStepNavigation ? (
                  <aside
                    className={`card flex flex-col ${navCollapsed ? "p-3 sm:p-4" : "px-3 pt-4 pb-0 sm:px-4 sm:pt-5 sm:pb-0"
                      } lg:sticky lg:top-0 lg:h-full lg:min-h-0`}
                  >
                    <div className={`flex items-center ${navCollapsed ? "justify-center" : "justify-between"}`}>
                      {!navCollapsed ? (
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 sm:text-xs">{formalDocumentLabel} navigation</p>
                          <h2 className="mt-2 font-display text-base text-ink sm:text-xl">Form steps</h2>
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
                              className={`flex h-9 w-9 items-center justify-center rounded-2xl border text-xs font-semibold transition sm:h-10 sm:w-10 sm:text-sm ${isActive
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
                              aria-pressed={isActive}
                              aria-disabled={isLocked || undefined}
                              className={`group flex w-full gap-3 rounded-2xl border px-3 py-2 text-left text-xs transition sm:text-sm lg:px-2.5 lg:py-1.5 lg:text-[13px] ${isActive
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
                                  <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400 sm:text-xs">
                                    Step {index + 1}
                                  </span>
                                  <span className="font-semibold text-ink leading-snug break-words">
                                    {getStepDisplayLabel(step)}
                                  </span>
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-semibold sm:text-[10px] ${statusClasses}`}
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
                                            disabled={isDeleting || !allowFileDeletion}
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
                            The {formalDocumentLabel} creator and the owner can exchange messages here.
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
                              : `Only the ${formalDocumentLabel} creator and the owner can send messages in this discussion.`}
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
                {isRfqFormView && isFormalDocumentTab ? (
                  <form
                    onSubmit={handleSubmit}
                    className="card flex flex-col min-h-0 overflow-auto lg:overflow-hidden lg:h-full lg:min-h-0"
                  >
                    <div className="relative flex flex-col gap-4 border-b border-slate-200/70 p-5 sm:static sm:p-3 md:p-4 pb-5 mb-4">
                      <div className="flex flex-col gap-1.5">
                        {/* Grid 3 colonnes : [1fr step] [auto Update/CI] [auto Prev/Next]
                            col1=1fr garantit que Update/CI commence toujours au même x,
                            indépendamment de la longueur du titre du step. */}
                        <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-x-6 sm:gap-y-0">
                          {/* Col 1 — indicateur de step (1fr : largeur fixée par le grid, pas par le contenu) */}
                          <div className="flex min-w-0 items-center gap-3 pr-16 sm:gap-4 sm:pr-0">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-tide text-sm font-semibold text-white shadow-soft sm:h-14 sm:w-14 sm:text-lg">
                              {stepIndex + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400 sm:text-xs">Step</p>
                              <h2 className="font-display text-sm text-ink sm:text-2xl">
                                Step {stepIndex + 1}: {getStepDisplayLabel(activeStepData)}
                              </h2>
                            </div>
                          </div>
                          {/* Col 2 — Update / Change Index ou Save Changes / Cancel (Owner uniquement) — desktop only, mobile copy renders below the description */}
                          <div className="hidden items-center gap-2 sm:flex">
                            {rfqId && String(rfqSubStatusValue || "").trim().toUpperCase() !== "NEW_RFQ" && rfqSubStatusValue && canUseRfqActions && !isRevisionModeActive && (isRfqCreator || currentUserRole === "OWNER") && !isRfqUpdateModeActive ? (
                              <>
                                <div className="group relative">
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-tide/40 bg-tide/10 px-4 py-2 text-sm font-semibold text-tide shadow-sm transition hover:-translate-y-0.5 hover:border-tide/60 hover:bg-tide/20 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                                    onClick={handleUpdateRFQ}
                                    disabled={saving}
                                  >
                                    Update
                                  </button>
                                  <div className="pointer-events-none absolute top-full left-0 mt-2.5 hidden w-56 whitespace-normal rounded-lg bg-slate-800 px-3 py-2 text-xs text-white shadow-lg group-hover:block">
                                    Use for small updates — the RFQ reference stays the same.
                                    <div className="absolute left-5 bottom-full h-0 w-0 border-l-[5px] border-r-[5px] border-b-[5px] border-l-transparent border-r-transparent border-b-slate-800" />
                                  </div>
                                </div>
                                <div className="group relative">
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sun/40 bg-sun/10 px-4 py-2 text-sm font-semibold text-sun shadow-sm transition hover:-translate-y-0.5 hover:border-sun/60 hover:bg-sun/20 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                                    onClick={handleChangeIndexRFQ}
                                    disabled={saving}
                                  >
                                    Change Index
                                  </button>
                                  <div className="pointer-events-none absolute top-full left-0 mt-2.5 hidden w-56 whitespace-normal rounded-lg bg-slate-800 px-3 py-2 text-xs text-white shadow-lg group-hover:block">
                                    Use for big updates — the RFQ reference's revision index also changes.
                                    <div className="absolute left-5 bottom-full h-0 w-0 border-l-[5px] border-r-[5px] border-b-[5px] border-l-transparent border-r-transparent border-b-slate-800" />
                                  </div>
                                </div>
                              </>
                            ) : null}
                          </div>
                          {/* Col 3 — Previous / Next, ml-8 pour espace fixe avec Change Index */}
                          <div className="absolute right-3 top-3 flex items-center gap-1.5 sm:static sm:right-auto sm:top-auto sm:ml-8 sm:gap-2">
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
                            {!isRevisionModeActive && canUseRfqActions && saving ? (
                              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-tide" />
                                Saving…
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="prev-button disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => handleStepViewChange(stepIds[stepIndex - 1])}
                              disabled={isFirstStep || !canGoPrev}
                            >
                              <span className="text-xs sm:text-base">←</span>
                              <span className="hidden sm:inline">Previous</span>
                            </button>
                            <button
                              type="button"
                              className="next-button disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => handleStepViewChange(stepIds[stepIndex + 1])}
                              disabled={isLastStep || !canGoNext}
                            >
                              <span className="hidden sm:inline">Next</span>
                              <span className="text-xs sm:text-base">→</span>
                            </button>
                          </div>
                        </div>
                        {/* Description — en dessous, alignée avec le titre */}
                        <p className="pl-[3.75rem] text-xs text-slate-500 sm:pl-[4.5rem] sm:text-sm">
                          {isRevisionModeActive
                            ? "Revision mode is active. Update the form directly, then submit your updates."
                            : `Fill in the ${activeFormalDocumentLabel} form directly. Changes are auto-saved. Submit to the validator when ready.`}
                        </p>
                        {/* Col 2 mobile copy — Update / Change Index shown below the description, smaller, mobile only */}
                        {rfqId && String(rfqSubStatusValue || "").trim().toUpperCase() !== "NEW_RFQ" && rfqSubStatusValue && canUseRfqActions && !isRevisionModeActive && (isRfqCreator || currentUserRole === "OWNER") && !isRfqUpdateModeActive ? (
                          <div className="flex items-center gap-2 pl-[3.75rem] sm:hidden">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center gap-1 rounded-lg border border-tide/40 bg-tide/10 px-2.5 py-1.5 text-[11px] font-semibold text-tide shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={handleUpdateRFQ}
                              disabled={saving}
                            >
                              Update
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center gap-1 rounded-lg border border-sun/40 bg-sun/10 px-2.5 py-1.5 text-[11px] font-semibold text-sun shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={handleChangeIndexRFQ}
                              disabled={saving}
                            >
                              Change Index
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div ref={rfqFormScrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 sm:px-4 sm:pb-4 md:px-5 md:pb-5 lg:overflow-y-auto">
                      {activeStep === "step-client" ? (
                        <div
                          id="step-client"
                          className="scroll-mt-28 space-y-4"
                        >
                          <div className="flex flex-col gap-5">
                            <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-3 shadow-soft transition hover:shadow-md">
                              <h3 className="mt-2 font-display text-base font-semibold text-sun sm:text-xl">Customer details</h3>
                              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                <SearchableSelectField
                                  label="Automotive / Non automotive"
                                  name="automotiveType"
                                  value={form.automotiveType}
                                  onChange={handleChange}
                                  options={["Automotive", "Non automotive"]}
                                  readOnly={rfqFormFieldReadOnly}
                                  {...getRfqFieldRequirementProps("automotiveType")}
                                />
                                <SearchableSelectField label="Customer" name="customer" value={form.customer} onChange={handleChange} options={customerOptions} searchable searchPlaceholder="Search customer" readOnly={rfqFormFieldReadOnly} {...getRfqFieldRequirementProps("customer")} />
                                <FormField label="Project name" name="projectName" value={form.projectName} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand {...getRfqFieldRequirementProps("projectName")} />
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-3 shadow-soft transition hover:shadow-md">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <h3 className="mt-2 font-display text-base font-semibold text-sun sm:text-xl">Products</h3>
                                {!rfqFormFieldReadOnly && (
                                  <button
                                    type="button"
                                    className="outline-button inline-flex items-center gap-2 px-3 py-2 text-xs"
                                    onClick={handleAddProduct}
                                  >
                                    <Plus className="h-4 w-4" />
                                    Add Product
                                  </button>
                                )}
                              </div>
                              <div id="rfq-products" className="scroll-mt-28 mt-3 overflow-x-auto rounded-xl border border-slate-200/70">
                                    <table className="w-full min-w-[900px] text-left text-xs">
                                      <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500">
                                        <tr>
                                          <th className="px-3 py-3">{renderRequirementLabel("Product", getProductFieldRequirementProps("product"))}</th>
                                          <th className="px-3 py-3">{renderRequirementLabel("Product Line", getProductFieldRequirementProps("productLine"))}</th>
                                          {productRows.some((p) => { const v = String(p.productLine || "").trim().toLowerCase(); return v === "ass" || v === "assembly"; }) && (
                                            <th className="px-3 py-3 min-w-[280px]">{renderRequirementLabel("Components", getProductFieldRequirementProps("components"))}</th>
                                          )}
                                          <th className={`px-3 py-3 ${productRows.some((p) => p.costingData) ? "min-w-[220px]" : ""}`}>{renderRequirementLabel("Costing Data", getProductFieldRequirementProps("costingData"))}</th>
                                          <th className="px-3 py-3 w-[160px]">{renderRequirementLabel("Application", getProductFieldRequirementProps("application"))}</th>
                                          <th className="px-3 py-3">{renderRequirementLabel("Part Number", getProductFieldRequirementProps("partNumber"))}</th>
                                          <th className="px-3 py-3">{renderRequirementLabel("Drawing", getProductFieldRequirementProps("drawing"))}</th>
                                          <th className="px-3 py-3">{renderRequirementLabel("SOP Year", getProductFieldRequirementProps("sop"))}</th>
                                          <th className="px-3 py-3" aria-label="Remove product" />
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {productRows.map((product, productIndex) => (
                                          <tr key={`product-${productIndex}`} className="border-t border-slate-200/70 bg-white align-top">
                                            <td className="px-3 py-3">
                                              <div className="min-w-[230px]">
                                                <SearchableSelectField
                                                  name="product"
                                                  value={product.product}
                                                  onChange={(e) => handleProductSelect(productIndex, e.target.value)}
                                                  options={productOptions.map((opt) => opt.product_name || opt.product_line || "").filter(Boolean)}
                                                  readOnly={rfqFormFieldReadOnly}
                                                  portal
                                                />
                                              </div>
                                            </td>
                                            <td className="px-3 py-3">
                                              {rfqFormFieldReadOnly ? (
                                                <div className={`${PRODUCT_ROW_READONLY_VALUE_CLASSES} min-w-[120px]`}>
                                                  {product.productLine || "—"}
                                                </div>
                                              ) : (
                                                <input
                                                  className="input-field min-w-[120px]"
                                                  value={product.productLine || ""}
                                                  readOnly
                                                  aria-label={`Product ${productIndex + 1} product line`}
                                                />
                                              )}
                                            </td>
                                            {productRows.some((p) => { const v = String(p.productLine || "").trim().toLowerCase(); return v === "ass" || v === "assembly"; }) && (
                                              <td className="px-3 py-3">
                                                {(() => {
                                                  const pl = String(product.productLine || "").trim().toLowerCase();
                                                  if (pl !== "ass" && pl !== "assembly") return null;
                                                  return rfqFormFieldReadOnly ? (
                                                    <div className={`${PRODUCT_ROW_READONLY_VALUE_CLASSES} min-w-[280px] whitespace-pre-line`}>
                                                      {product.components || "—"}
                                                    </div>
                                                  ) : (
                                                    <AutoExpandTextarea
                                                      className="min-w-[280px]"
                                                      value={product.components}
                                                      onChange={(e) => handleProductChange(productIndex, "components", e.target.value)}
                                                      readOnly={rfqFormFieldReadOnly}
                                                      aria-label={`Product ${productIndex + 1} components`}
                                                    />
                                                  );
                                                })()}
                                              </td>
                                            )}
                                            <td className="px-3 py-3">
                                              {rfqFormFieldReadOnly ? (
                                                <div className={`${PRODUCT_ROW_READONLY_VALUE_CLASSES} whitespace-pre-line ${productRows.some((p) => p.costingData) ? "min-w-[220px]" : "min-w-[120px]"}`}>
                                                  {product.costingData || "—"}
                                                </div>
                                              ) : (
                                                <AutoExpandTextarea
                                                  className={productRows.some((p) => p.costingData) ? "min-w-[220px]" : "min-w-[120px]"}
                                                  value={product.costingData}
                                                  onChange={(e) => handleProductChange(productIndex, "costingData", e.target.value)}
                                                  readOnly={rfqFormFieldReadOnly}
                                                  aria-label={`Product ${productIndex + 1} costing data`}
                                                />
                                              )}
                                            </td>
                                            <td className="px-3 py-3">
                                              {rfqFormFieldReadOnly ? (
                                                <div className={`${PRODUCT_ROW_READONLY_VALUE_CLASSES} whitespace-pre-line w-[160px]`}>
                                                  {product.application || "—"}
                                                </div>
                                              ) : (
                                                <AutoExpandTextarea
                                                  className="w-[160px]"
                                                  value={product.application}
                                                  onChange={(e) => handleProductChange(productIndex, "application", e.target.value)}
                                                  readOnly={rfqFormFieldReadOnly}
                                                  aria-label={`Product ${productIndex + 1} application`}
                                                />
                                              )}
                                            </td>
                                            <td className="px-3 py-3">
                                              {rfqFormFieldReadOnly ? (
                                                <div className={`${PRODUCT_ROW_READONLY_VALUE_CLASSES} min-w-[130px]`}>
                                                  {product.partNumber || "—"}
                                                </div>
                                              ) : (
                                                <input
                                                  className="input-field min-w-[130px]"
                                                  value={product.partNumber || ""}
                                                  onChange={(e) => handleProductChange(productIndex, "partNumber", e.target.value)}
                                                  readOnly={rfqFormFieldReadOnly}
                                                  aria-label={`Product ${productIndex + 1} part number`}
                                                />
                                              )}
                                            </td>
                                            <td className="px-3 py-3">
                                              {(() => {
                                                const numProducts = productRows.length || 1;
                                                const serverDrawings = mergedFiles.filter((_, idx) => idx % numProducts === productIndex);
                                                const localDrawings = productDrawings[productIndex] || [];
                                                const hasAny = serverDrawings.length > 0 || localDrawings.length > 0;
                                                return (
                                                  <div className="flex flex-col gap-1.5 min-w-[150px]">
                                                    {/* Server-side drawings */}
                                                    {serverDrawings.map((serverDrawing) => {
                                                      const isDeleting = fileActionId === serverDrawing.id;
                                                      return (
                                                      <div key={serverDrawing.id} className="flex items-center gap-1.5">
                                                        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase ${getFileAccentClasses(serverDrawing.name)}`}>
                                                          {getFileExtension(serverDrawing.name).slice(0, 4)}
                                                        </span>
                                                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600" title={serverDrawing.name}>
                                                          {serverDrawing.name}
                                                        </span>
                                                        <div className="flex shrink-0 gap-0.5">
                                                          {serverDrawing.url && (
                                                            <button type="button" className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-1 text-slate-600 transition hover:border-tide/40 hover:text-tide" onClick={() => handlePreviewFile(serverDrawing)} title="View">
                                                              <Eye className="h-3 w-3" />
                                                            </button>
                                                          )}
                                                          {!rfqFormFieldReadOnly && allowFileDeletion && (
                                                            <button type="button" className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 p-1 text-red-600 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => setFileDeleteTarget(serverDrawing)} disabled={Boolean(isDeleting)} title="Delete">
                                                              <Trash2 className="h-3 w-3" />
                                                            </button>
                                                          )}
                                                        </div>
                                                      </div>
                                                      );
                                                    })}
                                                    {/* Local files (not yet uploaded) */}
                                                    {localDrawings.map((file, fileIdx) => (
                                                      <div key={fileIdx} className="flex items-center gap-1.5">
                                                        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase ${getFileAccentClasses(file.name)}`}>
                                                          {getFileExtension(file.name).slice(0, 4)}
                                                        </span>
                                                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600" title={file.name}>
                                                          {file.name}
                                                        </span>
                                                        <div className="flex shrink-0 gap-0.5">
                                                          <button type="button" className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-1 text-slate-600 transition hover:border-tide/40 hover:text-tide" onClick={() => handlePreviewFile(file)} title="View">
                                                            <Eye className="h-3 w-3" />
                                                          </button>
                                                          {!rfqFormFieldReadOnly && (
                                                            <button type="button" className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 p-1 text-red-600 transition hover:border-red-300 hover:bg-red-100" onClick={() => setProductDrawings((prev) => ({ ...prev, [productIndex]: (prev[productIndex] || []).filter((e) => e.id !== file.id) }))} title="Delete">
                                                              <Trash2 className="h-3 w-3" />
                                                            </button>
                                                          )}
                                                        </div>
                                                      </div>
                                                    ))}
                                                    {/* Empty state */}
                                                    {rfqFormFieldReadOnly && !hasAny && (
                                                      <span className="text-slate-400">—</span>
                                                    )}
                                                    {/* Add file button */}
                                                    {!rfqFormFieldReadOnly && (
                                                      <div className="mt-0.5">
                                                        <input
                                                          id={`product-drawing-${productIndex}`}
                                                          type="file"
                                                          multiple
                                                          className="hidden"
                                                          onChange={(e) => {
                                                            const files = Array.from(e.target.files || []);
                                                            handleProductDrawingUpload(productIndex, files);
                                                            e.target.value = "";
                                                          }}
                                                        />
                                                        <label
                                                          htmlFor={`product-drawing-${productIndex}`}
                                                          className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-tide/40 hover:text-tide"
                                                        >
                                                          Add file
                                                        </label>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })()}
                                            </td>
                                            <td className="px-3 py-3">
                                              {rfqFormFieldReadOnly ? (
                                                <div className={`${PRODUCT_ROW_READONLY_VALUE_CLASSES} min-w-[110px]`}>
                                                  {product.sop || "—"}
                                                </div>
                                              ) : (
                                                <input
                                                  className="input-field min-w-[110px]"
                                                  type="text"
                                                  value={product.sop ?? ""}
                                                  onChange={(e) => handleProductChange(productIndex, "sop", e.target.value)}
                                                  readOnly={rfqFormFieldReadOnly}
                                                  aria-label={`Product ${productIndex + 1} SOP`}
                                                />
                                              )}
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                              {rfqFormFieldReadOnly ? null : (
                                                <div className="flex items-center gap-1.5 justify-end">
                                                  <button
                                                    type="button"
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-tide/40 hover:text-tide disabled:cursor-not-allowed disabled:opacity-50"
                                                    onClick={handleAddProduct}
                                                    title="Add product row"
                                                    aria-label="Add product row"
                                                  >
                                                    <Plus className="h-4 w-4" />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                    onClick={() => handleRemoveProduct(productIndex)}
                                                    aria-label={`Delete product ${productIndex + 1}`}
                                                    title="Delete product"
                                                  >
                                                    <Trash2 className="h-4 w-4" />
                                                  </button>
                                                </div>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                              </div>
                            </div>
                            <div id="rfq-volumes" className="rounded-2xl border border-slate-200/70 bg-white/95 p-3 shadow-soft transition hover:shadow-md">
                              <h3 className="mt-2 font-display text-base font-semibold text-sun sm:text-xl">Volumes</h3>
                              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/70">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500">
                                    <tr>
                                      <th className="px-3 py-3">{renderRequirementLabel("Part Number", { required: true })}</th>
                                      <th className="px-3 py-3">{renderRequirementLabel("Revision Level", { optional: true })}</th>
                                      <th className="px-3 py-3">Qty / Year <span className="text-red-400">*</span></th>
                                      <th className="px-3 py-3">Target Price <span className="text-red-400">*</span></th>
                                      <th className="px-3 py-3">Target To (K)</th>
                                      <th className="px-3 py-3">{renderRequirementLabel("Delivery Zone", { required: true })}</th>
                                      <th className="px-3 py-3">{renderRequirementLabel("Delivery Plant", { required: true })}</th>
                                      <th className="px-3 py-3">{renderRequirementLabel("Country", { required: true })}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {productRows.map((linkedProduct, volumeIndex) => {
                                      const volume = volumeRows[volumeIndex] || {};
                                      const rowSop = extractSopYear(linkedProduct.sop);
                                      const productYears = (!Number.isNaN(rowSop) && rowSop > 1900)
                                        ? new Set(Array.from({ length: 5 }, (_, i) => rowSop + i))
                                        : new Set();
                                      return (
                                        <tr key={`volume-${volumeIndex}`} id={`rfq-volume-row-${volumeIndex}`} className="border-t border-slate-200/70 bg-white">
                                          <td className="px-3 py-3">
                                            <div className="group relative inline-block min-w-[130px]">
                                              <div className={`${PRODUCT_ROW_READONLY_VALUE_CLASSES} min-w-[130px]`}>
                                                {linkedProduct.partNumber || "—"}
                                              </div>
                                              <div className="pointer-events-none absolute bottom-full left-0 mb-2.5 hidden whitespace-nowrap rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white shadow-lg group-hover:block">
                                                Inherited from the products table above.
                                                <div className="absolute left-5 top-full h-0 w-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-slate-800" />
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-3 py-3">
                                            {rfqFormFieldReadOnly ? (
                                              <div className={`${PRODUCT_ROW_READONLY_VALUE_CLASSES} min-w-[100px]`}>
                                                {linkedProduct.revisionLevel || "—"}
                                              </div>
                                            ) : (
                                              <input
                                                className="input-field min-w-[100px]"
                                                value={linkedProduct.revisionLevel || ""}
                                                onChange={(e) => handleProductChange(volumeIndex, "revisionLevel", e.target.value)}
                                                placeholder="optional"
                                                aria-label={`Volume ${volumeIndex + 1} revision level`}
                                              />
                                            )}
                                          </td>
                                          <td className="px-3 py-3">
                                            <div className="flex min-w-[170px] flex-col gap-1.5">
                                              {!Number.isNaN(rowSop) && rowSop > 1900 ? (
                                                <>
                                                  {(() => {
                                                    const initialYears = Array.from({ length: 5 }, (_, i) => rowSop + i);
                                                    const extraYears = Object.keys(volume.volumes || {})
                                                      .map(Number)
                                                      .filter((y) => !Number.isNaN(y) && !initialYears.includes(y));
                                                    return [...new Set([...initialYears, ...extraYears])].sort((a, b) => a - b);
                                                  })().map((year) => (
                                                    <div key={year} className="flex items-center gap-2">
                                                      <span className="w-9 shrink-0 text-[10px] font-semibold text-slate-400">{year}</span>
                                                      {rfqFormFieldReadOnly ? (
                                                        <div className={`${PRODUCT_ROW_READONLY_VALUE_CLASSES} flex-1`}>
                                                          {volume.volumes?.[year] ?? "—"}
                                                        </div>
                                                      ) : (
                                                        <input
                                                          className="input-field min-w-[60px] flex-1"
                                                          type="number"
                                                          min="0"
                                                          value={volume.volumes?.[year] ?? ""}
                                                          onChange={(e) => handleVolumeChange(volumeIndex, `volumes.${year}`, e.target.value)}
                                                          aria-label={`Volume ${volumeIndex + 1} year ${year}`}
                                                        />
                                                      )}
                                                    </div>
                                                  ))}
                                                  {!rfqFormFieldReadOnly && (
                                                    <div className="qty-year-actions">
                                                      <button
                                                        type="button"
                                                        className="qty-year-add-btn"
                                                        onClick={() => handleAddQtyYear(volumeIndex)}
                                                        title="Add next year"
                                                        aria-label={`Add year to volume ${volumeIndex + 1}`}
                                                      >
                                                        +
                                                      </button>
                                                    </div>
                                                  )}
                                                </>
                                              ) : (
                                                <div className="group relative inline-block">
                                                  <div className={PRODUCT_ROW_READONLY_VALUE_CLASSES}>—</div>
                                                  <div className="pointer-events-none absolute bottom-full left-0 mb-2.5 hidden whitespace-nowrap rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white shadow-lg group-hover:block">
                                                    Set the SOP in the products table to enter yearly volumes.
                                                    <div className="absolute left-5 top-full h-0 w-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-slate-800" />
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          </td>
                                          <td className="px-3 py-3">
                                            <div className="min-w-[260px] rounded-xl border border-slate-200/70 bg-white p-3">
                                              <div className="mb-2 grid grid-cols-2 gap-2">
                                                <div>
                                                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Target Price <span className="text-red-400">*</span></p>
                                                  {rfqFormFieldReadOnly ? (
                                                    <div className={PRODUCT_ROW_READONLY_VALUE_CLASSES}>{volume.targetPrice || "—"}</div>
                                                  ) : (
                                                    <input
                                                      className="input-field w-full"
                                                      type="number"
                                                      min="0"
                                                      value={volume.targetPrice ?? ""}
                                                      onChange={(e) => handleVolumeChange(volumeIndex, "targetPrice", e.target.value)}
                                                      aria-label={`Volume ${volumeIndex + 1} target price`}
                                                    />
                                                  )}
                                                </div>
                                                <div>
                                                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Currency <span className="text-red-400">*</span></p>
                                                  <SearchableSelectField
                                                    value={linkedProduct.currency}
                                                    onChange={(e) => handleProductChange(volumeIndex, "currency", e.target.value)}
                                                    options={["EUR", "USD", "GBP", "CNY", "MXN", "JPY", "BRL", "INR"]}
                                                    readOnly={rfqFormFieldReadOnly}
                                                    portal
                                                  />
                                                </div>
                                              </div>
                                              <div>
                                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Price Source <span className="text-red-400">*</span></p>
                                                {rfqFormFieldReadOnly ? (
                                                  volume.priceSource ? (
                                                    <span className={`inline-block rounded-full border px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide ${volume.priceSource === "Estimated" ? "border-amber-300 bg-amber-50 text-amber-600" : "border-sky-300 bg-sky-50 text-sky-600"}`}>
                                                      {volume.priceSource}
                                                    </span>
                                                  ) : (
                                                    <span className="italic text-xs text-slate-400">Pending</span>
                                                  )
                                                ) : (
                                                  <div className="flex flex-wrap gap-1">
                                                    {[
                                                      { value: "Estimated", label: "Estimated", active: "border-amber-300 bg-amber-50 text-amber-600" },
                                                      { value: "Official Customer Price", label: "Official Customer Price", active: "border-sky-300 bg-sky-50 text-sky-600" }
                                                    ].map((opt) => (
                                                      <button
                                                        key={opt.value}
                                                        type="button"
                                                        onClick={() => handleVolumeChange(volumeIndex, "priceSource", volume.priceSource === opt.value ? "" : opt.value)}
                                                        className={`rounded-full border px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide transition ${volume.priceSource === opt.value ? opt.active : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-500"}`}
                                                        aria-label={`Volume ${volumeIndex + 1} price source ${opt.value}`}
                                                      >
                                                        {opt.label}
                                                      </button>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-3 py-3">
                                            {(() => {
                                              const totalQty = volumeYearColumns.reduce((sum, year) =>
                                                sum + (productYears.has(year) ? Number(volume.volumes?.[year] || 0) : 0), 0);
                                              const price = Number(volume.targetPrice || 0);
                                              const currency = sanitizeProductCurrencyCode(linkedProduct.currency || "");
                                              const isEur = !currency || currency === "EUR";
                                              const eurRate = isEur ? 1 : (ratesByCurrency[currency] ?? null);
                                              const isLoading = !isEur && loadingByCurrency[currency];
                                              const isFallback = !isEur && fallbackByCurrency[currency];
                                              const targetToNative = totalQty * price;
                                              const targetToEur = eurRate !== null ? targetToNative * eurRate : null;
                                              const targetToKeur = targetToEur !== null ? targetToEur / 1000 : null;
                                              const hasValue = volume.targetPrice && totalQty > 0;
                                              return (
                                                <div className="flex min-w-[150px] flex-col gap-0.5 rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 shadow-sm">
                                                  <div className="flex items-center gap-2">
                                                    <span className="flex-1 text-sm font-semibold text-ink">
                                                      {!hasValue ? "—"
                                                        : isLoading ? "…"
                                                        : targetToKeur !== null
                                                          ? targetToKeur.toLocaleString("en-US", { maximumFractionDigits: 5 })
                                                          : (targetToNative / 1000).toLocaleString("en-US", { maximumFractionDigits: 5 })}
                                                    </span>
                                                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-400">kEUR</span>
                                                  </div>
                                                  {hasValue && !isEur && eurRate !== null && !isLoading && (
                                                    <span className="text-[10px] text-slate-400">
                                                      1 {currency} = {Number(eurRate).toFixed(4)} EUR{isFallback ? " (est.)" : ""}
                                                    </span>
                                                  )}
                                                </div>
                                              );
                                            })()}
                                          </td>
                                          <td className="px-3 py-3">
                                            <div className="min-w-[175px]">
                                              <SearchableSelectField
                                                value={volume.deliveryZone}
                                                onChange={(e) => handleVolumeChange(volumeIndex, "deliveryZone", e.target.value)}
                                                options={DELIVERY_ZONE_OPTIONS}
                                                readOnly={rfqFormFieldReadOnly}
                                                portal
                                              />
                                            </div>
                                          </td>
                                          <td className="px-3 py-3">
                                            {rfqFormFieldReadOnly ? (
                                              <div className={`${PRODUCT_ROW_READONLY_VALUE_CLASSES} min-w-[110px]`}>
                                                {volume.plant || "—"}
                                              </div>
                                            ) : (
                                              <input
                                                className="input-field min-w-[110px]"
                                                value={volume.plant || ""}
                                                onChange={(e) => handleVolumeChange(volumeIndex, "plant", e.target.value)}
                                                aria-label={`Volume ${volumeIndex + 1} plant`}
                                              />
                                            )}
                                          </td>
                                          <td className="px-3 py-3">
                                            {rfqFormFieldReadOnly ? (
                                              <div className={`${PRODUCT_ROW_READONLY_VALUE_CLASSES} min-w-[110px]`}>
                                                {volume.country || "—"}
                                              </div>
                                            ) : (
                                              <input
                                                className="input-field min-w-[110px]"
                                                value={volume.country || ""}
                                                onChange={(e) => handleVolumeChange(volumeIndex, "country", e.target.value)}
                                                aria-label={`Volume ${volumeIndex + 1} country`}
                                              />
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              <div className="mt-4 flex justify-end">
                                <div className="flex flex-col items-start gap-1.5">
                                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                                    Total Target To
                                  </span>
                                  <div className="flex min-w-[400px] max-w-full items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-4 py-2.5 shadow-sm">
                                    <span className="flex-1 text-sm font-semibold text-ink">
                                      {(totalTargetToK / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-400">kEUR</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div id="rfq-logistics" className="rounded-2xl border border-slate-200/70 bg-white/95 p-3 shadow-soft transition hover:shadow-md">
                              <h3 className="mt-2 font-display text-base font-semibold text-sun sm:text-xl">Logistics details</h3>
                              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                <FormField label="Expected PO date" name="poDate" type="date" value={form.poDate} onChange={handleChange} readOnly={rfqFormFieldReadOnly} {...getRfqFieldRequirementProps("poDate")} />
                                <FormField label="Expected PPAP date" name="ppapDate" type="date" value={form.ppapDate} onChange={handleChange} readOnly={rfqFormFieldReadOnly} {...getRfqFieldRequirementProps("ppapDate")} />
                                <FormField label={`${formalDocumentLabel} reception date`} name="rfqReceptionDate" type="date" value={form.rfqReceptionDate} onChange={handleChange} readOnly={rfqFormFieldReadOnly} {...getRfqFieldRequirementProps("rfqReceptionDate")} />
                                <FormField label="Expected quotation date" name="expectedQuotationDate" type="date" value={form.expectedQuotationDate} onChange={handleChange} readOnly={rfqFormFieldReadOnly} {...getRfqFieldRequirementProps("expectedQuotationDate")} />
                              </div>
                            </div>
                            <div id="rfq-contact" className="rounded-2xl border border-slate-200/70 bg-white/95 p-3 shadow-soft transition hover:shadow-md">
                              <h3 className="mt-2 font-display text-base font-semibold text-sun sm:text-xl">Customer contact details</h3>
                              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                <FormField label="Contact name" name="contactName" value={form.contactName} onChange={handleChange} readOnly={rfqFormFieldReadOnly} {...getRfqFieldRequirementProps("contactName")} />
                                <FormField label="Contact function" name="contactFunction" value={form.contactFunction} onChange={handleChange} readOnly={rfqFormFieldReadOnly} {...getRfqFieldRequirementProps("contactFunction")} />
                                <FormField label="Contact phone" name="contactPhone" value={form.contactPhone} onChange={handleChange} readOnly={rfqFormFieldReadOnly} {...getRfqFieldRequirementProps("contactPhone")} />
                                <FormField label="Contact email" name="contactEmail" type="email" value={form.contactEmail} onChange={handleChange} readOnly={rfqFormFieldReadOnly} {...getRfqFieldRequirementProps("contactEmail")} error={isAvocarbonEmail(form.contactEmail) ? "Internal Avocarbon emails are not allowed." : (form.contactEmail && !isValidEmailFormat(form.contactEmail) ? "Please enter a valid email address." : null)} />
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
                          <div className="grid gap-4 lg:grid-cols-2">
                            <FormField label="Delivery Incoterm" name="deliveryIncoterm" value={form.deliveryIncoterm} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand {...getRfqFieldRequirementProps("deliveryIncoterm")} />
                            <FormField label="Incoterm Location" name="incotermLocation" value={form.incotermLocation} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand {...getRfqFieldRequirementProps("incotermLocation")} />
                            <FormField label="Expected Payment Terms" name="expectedPaymentTerms" value={form.expectedPaymentTerms} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand {...getRfqFieldRequirementProps("expectedPaymentTerms")} />
                            <SearchableSelectField
                              label="Type of Packaging"
                              name="typeOfPackaging"
                              value={form.typeOfPackaging}
                              onChange={handleChange}
                              options={["Cardboard divider", "One way tray", "Returnable plastic tray"]}
                              readOnly={rfqFormFieldReadOnly}
                              {...getRfqFieldRequirementProps("typeOfPackaging")}
                            />
                            <FormField label="Business Trigger" name="businessTrigger" value={form.businessTrigger} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand {...getRfqFieldRequirementProps("businessTrigger")} />
                            <FormField label="Customer Tooling Conditions" name="customerToolingConditions" value={form.customerToolingConditions} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand {...getRfqFieldRequirementProps("customerToolingConditions")} />
                            <FormField label="Entry Barriers" name="entryBarriers" value={form.entryBarriers} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand {...getRfqFieldRequirementProps("entryBarriers")} />
                          </div>
                        </div>
                      ) : null}
                      {activeStep === "step-schedule" ? (
                        <div
                          id="step-schedule"
                          className="scroll-mt-28 space-y-4 rounded-2xl border border-slate-200/70 bg-white/80 p-5"
                        >
                          <div className="grid gap-4 lg:grid-cols-2">
                            <ResponsibilityField label="Design responsible" name="designResponsible" value={form.designResponsible} customer={form.customer} onChange={handleChange} readOnly={rfqFormFieldReadOnly} {...getRfqFieldRequirementProps("designResponsible")} />
                            <ResponsibilityField label="Validation responsible" name="validationResponsible" value={form.validationResponsible} customer={form.customer} onChange={handleChange} readOnly={rfqFormFieldReadOnly} {...getRfqFieldRequirementProps("validationResponsible")} />
                            <ResponsibilityField label="Design owner" name="designOwner" value={form.designOwner} customer={form.customer} onChange={handleChange} readOnly={rfqFormFieldReadOnly} {...getRfqFieldRequirementProps("designOwner")} />
                            <ResponsibilityField label="Development costs" name="developmentCosts" value={form.developmentCosts} customer={form.customer} onChange={handleChange} readOnly={rfqFormFieldReadOnly} {...getRfqFieldRequirementProps("developmentCosts")} />
                            <SelectOrOtherField label="Technical capacity" name="technicalCapacity" value={form.technicalCapacity} onChange={handleChange} readOnly={rfqFormFieldReadOnly} options={["Yes", "No"]} {...getRfqFieldRequirementProps("technicalCapacity")} />
                            <SelectOrOtherField label="Scope" name="scope" value={form.scope} onChange={handleChange} readOnly={rfqFormFieldReadOnly} options={["Yes", "No"]} {...getRfqFieldRequirementProps("scope")} />
                            <FormField label="Strategic note" name="strategicNote" value={form.strategicNote} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand {...getRfqFieldRequirementProps("strategicNote")} />
                            <FormField label="Final recommendation" name="finalRecommendation" value={form.finalRecommendation} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand {...getRfqFieldRequirementProps("finalRecommendation")} />
                          </div>
                        </div>
                      ) : null}
                      {activeStep === "step-notes" ? (
                        <div
                          id="step-notes"
                          className="scroll-mt-28 space-y-4 rounded-2xl border border-slate-200/70 bg-white/80 p-5"
                        >
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                                Total Turnover
                              </p>
                              <div className="space-y-2 rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-semibold text-ink">
                                    {sharedProductCurrency && sharedProductCurrency !== "EUR"
                                      ? (sharedCurrencyFallbackUsed
                                          ? "FX unavailable"
                                          : sharedCurrencyRateLoading
                                            ? "Loading FX..."
                                            : totalTargetToEurPreview !== null
                                              ? formatTurnoverInThousands(totalTargetToEurPreview)
                                              : "—")
                                      : (formatTurnoverInThousands(totalTargetTo) || "—")}
                                  </div>
                                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    kEUR
                                  </span>
                                </div>
                                {sharedProductCurrency && sharedProductCurrency !== "EUR" && totalTargetToNumber !== null ? (
                                  <p className="text-[11px] font-medium text-slate-400">
                                    {formatTurnoverInThousands(totalTargetTo)} {sharedTurnoverUnit}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <FormField label="Validator Email" name="validatorEmail" type="email" value={form.validatorEmail} onChange={handleChange} readOnly {...getRfqFieldRequirementProps("validatorEmail")} />
                            </div>
                          </div>
                          {!rfqFormFieldReadOnly && canUseRfqActions ? (
                            <div className="mt-4 flex items-center justify-end gap-2">
                              {isRfqUpdateModeActive && (
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-100 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                                  onClick={handleCancelRfqUpdate}
                                  disabled={saving}
                                >
                                  Cancel
                                </button>
                              )}
                              <div className="group relative">
                                <button
                                  type="button"
                                  className="gradient-button rounded-xl px-6 py-3 text-sm font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={handleSubmitToValidator}
                                  disabled={saving || !rfqId || !allStepsComplete}
                                >
                                  {saving ? "Submitting..." : "Submit"}
                                </button>
                                {!allStepsComplete && (
                                  <div className="pointer-events-none absolute bottom-full right-0 mb-2.5 hidden whitespace-nowrap rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white shadow-lg group-hover:block">
                                    Please complete all steps before submitting.
                                    <div className="absolute right-5 top-full h-0 w-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-slate-800" />
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </form>
                ) : null}
                {isRfqValidationView ? (
                  <form
                    onSubmit={handleSubmit}
                    className={`card flex min-h-0 flex-col gap-6 overflow-y-auto p-5 sm:p-7 md:p-8 lg:h-full lg:min-h-0 lg:overflow-y-auto ${showRfqStepNavigation ? "md:col-span-1 lg:col-span-2" : "col-span-full"}`}
                  >
                    {(() => {
                      const aiVal = rfqSnapshot?.rfq_data?.ai_validation;
                      if (!aiVal) return null;
                      const aiApproved = Boolean(aiVal.approved);
                      const aiStatus = String(aiVal.status || "").toLowerCase();
                      const { conversationUrl: aiConversationUrl } = extractAiConversationMeta(aiVal);
                      const aiFields = Array.isArray(aiVal.fields_to_correct) ? aiVal.fields_to_correct : [];
                      const checkedAt = aiVal.checked_at
                        ? new Date(aiVal.checked_at).toLocaleString("fr-FR", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })
                        : null;
                      const isQueued = aiStatus === "queued";
                      const isProcessing = aiStatus === "processing";
                      const isSkipped = aiStatus === "skipped";
                      const borderCls = isQueued
                        ? "border-amber-200/80"
                        : isProcessing
                          ? "border-sky-200/80"
                        : isSkipped
                          ? "border-slate-200/80"
                          : aiApproved
                            ? "border-violet-200/80"
                            : "border-red-200/80";
                      const bgCls = isQueued
                        ? "bg-gradient-to-br from-amber-50 via-white to-white"
                        : isProcessing
                          ? "bg-gradient-to-br from-sky-50 via-white to-white"
                        : isSkipped
                          ? "bg-gradient-to-br from-slate-50 via-white to-white"
                          : aiApproved
                            ? "bg-gradient-to-br from-violet-50 via-white to-white"
                            : "bg-gradient-to-br from-red-50 via-white to-white";
                      const innerBorderCls = isQueued
                        ? "border-amber-100/80"
                        : isProcessing
                          ? "border-sky-100/80"
                        : isSkipped
                          ? "border-slate-100/80"
                          : aiApproved
                            ? "border-violet-100/80"
                            : "border-red-100/80";
                      const badgeCls = isQueued
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : isProcessing
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                        : isSkipped
                          ? "border-slate-200 bg-slate-50 text-slate-700"
                          : aiApproved
                            ? "border-violet-200 bg-violet-50 text-violet-700"
                            : "border-red-200 bg-red-50 text-red-700";
                      return (
                        <section className={`shrink-0 overflow-hidden rounded-[28px] border ${borderCls} ${bgCls} p-5 shadow-soft`}>
                          <div className={`flex flex-wrap items-start justify-between gap-4 border-b ${innerBorderCls} pb-4`}>
                            <div className="space-y-1">
                              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 sm:text-xs">AI pre-validation</p>
                              <h4 className="text-sm font-semibold text-ink sm:text-lg">Workspace Agent review</h4>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-3">
                              <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${badgeCls}`}>
                                {isQueued ? (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                ) : isProcessing ? (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                ) : isSkipped ? (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
                                  </svg>
                                ) : aiApproved ? (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                ) : (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                  </svg>
                                )}
                                {isQueued ? "Queued in Workspace Agent" : isProcessing ? "Review in progress" : isSkipped ? "AI validation skipped" : aiApproved ? "Approved by AI" : "Rejected by AI"}
                              </span>
                            </div>
                          </div>
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            {checkedAt && (
                              <div className={`rounded-2xl border ${innerBorderCls} bg-white/95 px-4 py-4 shadow-sm`}>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">Checked at</p>
                                <p className="mt-2 truncate text-sm font-semibold text-ink sm:overflow-visible sm:whitespace-normal sm:text-base">{checkedAt}</p>
                              </div>
                            )}
                            {aiConversationUrl ? (
                              <div className={`rounded-2xl border ${innerBorderCls} bg-white/95 px-4 py-4 shadow-sm`}>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">Agent conversation</p>
                                <p className="mt-2 text-xs leading-6 text-slate-700 sm:text-sm">
                                  Open the live ChatGPT conversation in a popup window.
                                </p>
                                <button
                                  type="button"
                                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:text-sm"
                                  onClick={() => openAgentConversationPopup(aiConversationUrl)}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Open conversation
                                </button>
                              </div>
                            ) : null}
                            {(aiVal.discussion || aiVal.message) && !isQueued && !isProcessing && (
                              <div className={`rounded-2xl border ${innerBorderCls} bg-white/95 px-4 py-4 shadow-sm md:col-span-2`}>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">Agent discussion</p>
                                <div className="mt-2 text-xs leading-6 text-slate-700 whitespace-pre-wrap sm:text-sm">
                                  {(aiVal.discussion || aiVal.message || "").split("\n").map((line, i, arr) => (
                                    <span key={i} className={/^\d+\.\s+\S/.test(line) ? "font-bold" : ""}>
                                      {line}{i < arr.length - 1 ? "\n" : ""}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </section>
                      );
                    })()}
                    <section className="shrink-0 rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-soft">
                      <div className="mb-4 pb-4 border-b border-slate-100">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-xs">Validator review</p>
                        <p className="mt-1 text-xs font-bold text-ink sm:text-sm">
                          {form.validatorEmail
                            ? <>Responsible validator : <span className="text-tide">{form.validatorEmail}</span></>
                            : "Validator validation"}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 sm:text-xs">
                            Checklist
                          </p>
                          <h3 className="mt-2 font-display text-base text-ink sm:text-xl">
                            {formalDocumentLabel} form completion
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
                              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-center transition hover:border-tide/40 hover:bg-white sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:text-left"
                            >
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400 sm:text-xs">
                                  Step {index + 1}
                                </p>
                                <p className="mt-1 text-xs font-semibold text-ink sm:text-sm">
                                  {getStepDisplayLabel(step)}
                                </p>
                              </div>
                              <span
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold sm:text-xs ${complete
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
                    {hasAnyValidationHistory ? (
                      <div className="shrink-0 space-y-4">
                        {(validationAudit.rounds.length > 0
                          ? validationAudit.rounds
                          : [{
                              roundNumber: 1,
                              type: isValidationRejected ? "rejected" : "approved",
                              at: isValidationRejected ? validationAudit.rejectedAt : validationAudit.approvedAt,
                              by: isValidationRejected ? validationAudit.rejectedBy : validationAudit.approvedBy,
                              reason: isValidationRejected ? validationAudit.rejectionReason : null,
                            }]
                        ).map((round) => {
                          const isRoundRejected = round.type === "rejected";
                          return (
                            <section
                              key={round.roundNumber}
                              className={`overflow-hidden rounded-[28px] border p-5 shadow-soft ${isRoundRejected
                                ? "border-red-200/80 bg-gradient-to-br from-red-50 via-white to-white"
                                : "border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-white"
                                }`}
                            >
                              <div className={`flex flex-wrap items-start justify-between gap-4 border-b pb-4 ${isRoundRejected ? "border-red-100/80" : "border-emerald-100/80"}`}>
                                <div className="space-y-2">
                                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 sm:text-xs">
                                    Validation audit{validationAudit.rounds.length > 1 ? ` — Round ${round.roundNumber}` : ""}
                                  </p>
                                  <h4 className="text-sm font-semibold text-ink sm:text-lg">Decision recorded</h4>
                                </div>
                                <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold sm:text-sm ${isRoundRejected
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  }`}>
                                  {isRoundRejected ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                                  {isRoundRejected ? "Rejected" : "Approved"}
                                </span>
                              </div>
                              <div className="mt-5 grid gap-4 md:grid-cols-2">
                                {isRoundRejected ? (
                                  <>
                                    <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">Rejected at</p>
                                      <p className="mt-2 truncate text-sm font-semibold text-ink sm:overflow-visible sm:whitespace-normal sm:text-base">{formatValidationAuditDate(round.at)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">Rejected by</p>
                                      <p className="mt-2 truncate text-sm font-semibold text-ink sm:overflow-visible sm:whitespace-normal sm:text-base">{formatValidationAuditValue(round.by)}</p>
                                    </div>
                                    {round.reason ? (
                                      <div className="rounded-2xl border border-red-100/80 bg-white/95 px-4 py-4 shadow-sm md:col-span-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">Rejected reason</p>
                                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink sm:text-base">{formatValidationAuditValue(round.reason)}</p>
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <>
                                    <div className="rounded-2xl border border-emerald-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">Approved at</p>
                                      <p className="mt-2 truncate text-sm font-semibold text-ink sm:overflow-visible sm:whitespace-normal sm:text-base">{formatValidationAuditDate(round.at)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-emerald-100/80 bg-white/95 px-4 py-4 shadow-sm">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:text-[11px]">Approved by</p>
                                      <p className="mt-2 truncate text-sm font-semibold text-ink sm:overflow-visible sm:whitespace-normal sm:text-base">{formatValidationAuditValue(round.by)}</p>
                                    </div>
                                  </>
                                )}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    ) : null}
                    {isRevisionLockedForNonCreator ? (
                      <div className="shrink-0 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 sm:text-sm">
                        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <span>Awaiting updates from the RFQ creator. Actions are locked until the creator submits their changes.</span>
                      </div>
                    ) : !hideValidationActionButtons ? (
                      <div className="shrink-0 flex flex-col gap-2 border-t border-slate-200/70 pt-2">
                        {aiValidationBlocksAction && (
                          <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700 sm:text-sm">
                            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                            <span>
                              {_aiValStatus === "queued"
                                ? "Actions are locked while the AI agent is reviewing this RFQ."
                                : "Actions are locked until the AI agent approves this RFQ."}
                            </span>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center justify-end gap-3">
                        {!validatorIsCreator && (
                        <button
                          type="button"
                          className="inline-flex min-w-[124px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                          onClick={handleValidationUpdate}
                          disabled={validationButtonsDisabled}
                        >
                          <Pencil className="h-4 w-4" />
                          Update
                        </button>
                        )}
                        <button
                          type="button"
                          className="inline-flex min-w-[124px] items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-xs font-semibold text-red-600 shadow-sm transition hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                          onClick={handleRejectValidation}
                          disabled={validationButtonsDisabled}
                        >
                          <X className="h-4 w-4" />
                          {validationActionId === "reject" ? "Rejecting..." : "Reject"}
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-w-[124px] items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-emerald-600 px-5 py-3 text-xs font-semibold text-white shadow-[0_16px_30px_-18px_rgba(5,150,105,0.9)] transition hover:-translate-y-0.5 hover:border-emerald-700 hover:bg-emerald-700 hover:shadow-[0_18px_34px_-18px_rgba(4,120,87,0.95)] disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                          onClick={handleApproveValidation}
                          disabled={validationButtonsDisabled}
                        >
                          <Check className="h-4 w-4" />
                          {validationActionId === "approve" ? "Approving..." : "Approve"}
                        </button>
                        </div>
                      </div>
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
                      <div className="relative flex h-full flex-col">
                        <button
                          type="button"
                          onPointerDown={handleResizeStart}
                          className="chat-resize-handle"
                          aria-label="Resize chatbot"
                        >
                          <span className="h-8 w-1 rounded-full bg-slate-400/70" />
                        </button>
                        {hasValidationLock && canUseRfqActions && !rfqPostValidationUnlocked && isFormalDocumentTab && (
                          <div className="mx-2 mt-2 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                            <span className="flex items-center gap-1.5 text-amber-800">
                              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                              <span className="font-medium">This RFQ is locked for editing.</span>
                            </span>
                            <button
                              type="button"
                              onClick={handleUnlockToUpdate}
                              className="whitespace-nowrap rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 hover:shadow-sm"
                            >
                              Unlock to update
                            </button>
                          </div>
                        )}
                        <div className="min-h-0 flex-1">
                        <ChatPanel
                          messages={chatFeed}
                          onSend={handleChatSend}
                          onEditMessage={
                            activeRfqTab === "potential"
                              ? handlePotentialChatEdit
                              : isOfferStage
                              ? handleOfferChatEdit
                              : isFormalDocumentTab
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
                                : `${activeFormalDocumentLabel} Assistant`
                          }
                        />
                        </div>
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
                  Exchange messages about this {formalDocumentLabel} in a clear and centralized space.
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
      {isRfqFormView ? (
        <button
          ref={autofillButtonRef}
          type="button"
          onClick={() => setAutofillBubbleOpen((prev) => !prev)}
          className={`fixed bottom-6 right-6 z-40 inline-flex h-12 w-12 items-center justify-center rounded-2xl border shadow-lg transition hover:-translate-y-0.5 ${autofillBubbleOpen
            ? "border-slate-200/80 bg-white text-slate-600 hover:border-tide/35 hover:text-tide"
            : "border-tide/30 bg-tide text-white"
            }`}
          aria-label="Fill form from text"
          title="Fill form from text"
        >
          <Bot className="h-6 w-6" />
        </button>
      ) : null}
      {isRfqFormView && autofillBubbleOpen ? (
        <div
          ref={autofillPanelRef}
          className="fixed bottom-24 right-6 z-40 h-[70vh] max-h-[560px] w-[380px] max-w-[92vw] overflow-hidden rounded-3xl border border-slate-200/70 shadow-2xl"
        >
          <ChatPanel
            messages={autofillFeed}
            onSend={handleAutofillBubbleSend}
            readOnly={isChatLocked}
            readOnlyMessage={chatReadOnlyMessage}
            onCollapse={() => setAutofillBubbleOpen(false)}
            eyebrow="Autofill"
            title="Paste & fill"
            showVoiceInput={false}
          />
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
            aria-label={`${formalDocumentLabel} files`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <div>
                <p className="chat-modal-title">{formalDocumentLabel} files</p>
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
                                  disabled={isDeleting || !allowFileDeletion}
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
                    Add files to this {formalDocumentLabel} and they will appear here.
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
            <div className="chat-modal-footer">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-tide/20 bg-tide/10 px-4 py-2.5 text-sm font-semibold text-tide transition hover:-translate-y-0.5 hover:border-tide/35 hover:bg-tide/15"
                onClick={() => handleDownloadFile(filePreview)}
              >
                <Download className="h-4 w-4" />
                Download
              </button>
            </div>
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
      {fileUploadModalOpen ? (
        <div
          className="chat-modal-backdrop"
          onClick={() => {
            if (!fileUploadPending) {
              setFileUploadModalOpen(false);
              setPendingUploadFiles([]);
            }
          }}
          role="presentation"
        >
          <div
            className="chat-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Upload files"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <div>
                <p className="chat-modal-title">Upload Files</p>
                <p className="mt-1 text-sm text-slate-500">
                  {pendingUploadFiles.length} file{pendingUploadFiles.length !== 1 ? "s" : ""} selected
                </p>
              </div>
              <button
                type="button"
                className="chat-modal-close"
                onClick={() => {
                  if (!fileUploadPending) {
                    setFileUploadModalOpen(false);
                    setPendingUploadFiles([]);
                  }
                }}
                aria-label="Close upload modal"
                disabled={fileUploadPending}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body">
              <div className="chat-modal-fallback">
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Update type
                  </p>
                  <div className="flex flex-col gap-3">
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 transition hover:border-tide/40 hover:bg-white">
                      <input
                        type="radio"
                        name="fileUpdateType"
                        value="simple"
                        checked={fileUpdateType === "simple"}
                        onChange={() => setFileUpdateType("simple")}
                        className="mt-0.5 accent-tide"
                      />
                      <div>
                        <p className="text-sm font-semibold text-ink">Simple update</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Upload files without changing the {formalDocumentLabel} reference.
                        </p>
                      </div>
                    </label>
                    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${!rfqSnapshot?.rfq_data?.systematic_rfq_id ? "cursor-not-allowed border-slate-200 bg-slate-50/50 opacity-50" : "border-slate-200 bg-slate-50/80 hover:border-tide/40 hover:bg-white"}`}>
                      <input
                        type="radio"
                        name="fileUpdateType"
                        value="change_index"
                        checked={fileUpdateType === "change_index"}
                        onChange={() => setFileUpdateType("change_index")}
                        disabled={!rfqSnapshot?.rfq_data?.systematic_rfq_id}
                        className="mt-0.5 accent-tide"
                      />
                      <div>
                        <p className="text-sm font-semibold text-ink">Change Index update</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {rfqSnapshot?.rfq_data?.systematic_rfq_id
                            ? "Increment the RFQ index by 1 along with the file upload."
                            : "Not available — RFQ reference has not been assigned yet."}
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
                {fileUpdateType === "change_index" && rfqSnapshot?.rfq_data?.systematic_rfq_id ? (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <p className="font-semibold">Reference will change:</p>
                    <p className="mt-1">
                      <span className="font-mono">{rfqSnapshot.rfq_data.systematic_rfq_id}</span>
                      {" → "}
                      <span className="font-mono font-bold">
                        {incrementRfqIndex(rfqSnapshot.rfq_data.systematic_rfq_id) ?? "—"}
                      </span>
                    </p>
                  </div>
                ) : null}
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Files to upload
                  </p>
                  <ul className="space-y-1.5">
                    {pendingUploadFiles.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <Upload className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{f.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="chat-modal-actions justify-end">
                  <button
                    type="button"
                    className="outline-button px-4 py-2 text-xs"
                    onClick={() => {
                      setFileUploadModalOpen(false);
                      setPendingUploadFiles([]);
                    }}
                    disabled={fileUploadPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="gradient-button rounded-xl px-4 py-2 text-xs font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleConfirmFileUpload}
                    disabled={fileUploadPending}
                  >
                    {fileUploadPending ? "Uploading..." : "Upload and save"}
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
                    ? `Explain why the feasibility file is not applicable for this ${formalDocumentLabel}.`
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
                    <span>File(s)</span>
                    <input
                      className="input-field"
                      type="file"
                      multiple
                      onChange={handleCostingFileDraftChange}
                      disabled={costingFileActionPending || !canManageCostingFeasibilityHandoff}
                    />
                    {(existingFeasibilityFilesInPopup.length > 0 || costingFileActionDraft.length > 0) ? (
                      <ul className="flex flex-col gap-1">
                        {existingFeasibilityFilesInPopup.map((f) => (
                          <li
                            key={f.id || f.name}
                            className="flex min-w-0 items-center gap-2"
                          >
                            <span
                              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] normal-case tracking-normal text-slate-500"
                              title={f.name}
                            >
                              {f.name}
                            </span>
                            <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                              Uploaded
                            </span>
                            <button
                              type="button"
                              className="shrink-0 rounded p-0.5 text-slate-400 hover:text-red-500 disabled:opacity-40"
                              onClick={() => handleRemoveExistingFeasibilityFileFromPopup(f)}
                              disabled={costingFileActionPending}
                              title={`Remove ${f.name}`}
                              aria-label={`Remove ${f.name}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </li>
                        ))}
                        {costingFileActionDraft.map((f) => (
                          <li
                            key={`${f.name}-${f.size}-${f.lastModified}`}
                            className="flex min-w-0 items-center gap-2"
                          >
                            <span
                              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] normal-case tracking-normal text-slate-500"
                              title={f.name}
                            >
                              {f.name}
                            </span>
                            <button
                              type="button"
                              className="shrink-0 rounded p-0.5 text-slate-400 hover:text-red-500 disabled:opacity-40"
                              onClick={() => handleRemovePendingCostingFile(f)}
                              disabled={costingFileActionPending}
                              title={`Remove ${f.name}`}
                              aria-label={`Remove ${f.name}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </label>
                ) : null}
                <label className="mt-4 flex w-full flex-col gap-2 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <span>Note <span className="normal-case tracking-normal font-normal text-slate-400">(optional)</span></span>
                  <textarea
                    className="textarea-field min-h-[140px]"
                    value={costingFileActionNote}
                    onChange={(event) => setCostingFileActionNote(event.target.value)}
                    placeholder="Add a note about this file (optional)..."
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
                  <span>File(s)</span>
                  <input
                    className="input-field"
                    type="file"
                    multiple
                    onChange={handlePricingFinalPriceDraftChange}
                    disabled={pricingFinalPricePending || !canManagePricingFinalPrice}
                  />
                  {(existingPricingFilesInPopup.length > 0 || pricingFinalPriceDraft.length > 0) ? (
                    <ul className="flex flex-col gap-1">
                      {existingPricingFilesInPopup.map((f) => (
                        <li
                          key={f.id || f.name}
                          className="flex min-w-0 items-center gap-2"
                        >
                          <span
                            className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] normal-case tracking-normal text-slate-500"
                            title={f.name}
                          >
                            {f.name}
                          </span>
                          <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                            Uploaded
                          </span>
                          <button
                            type="button"
                            className="shrink-0 rounded p-0.5 text-slate-400 hover:text-red-500 disabled:opacity-40"
                            onClick={() => handleRemoveExistingPricingFileFromPopup(f)}
                            disabled={pricingFinalPricePending}
                            title={`Remove ${f.name}`}
                            aria-label={`Remove ${f.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                      {pricingFinalPriceDraft.map((f) => (
                        <li
                          key={`${f.name}-${f.size}-${f.lastModified}`}
                          className="flex min-w-0 items-center gap-2"
                        >
                          <span
                            className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] normal-case tracking-normal text-slate-500"
                            title={f.name}
                          >
                            {f.name}
                          </span>
                          <button
                            type="button"
                            className="shrink-0 rounded p-0.5 text-slate-400 hover:text-red-500 disabled:opacity-40"
                            onClick={() => handleRemovePendingPricingFile(f)}
                            disabled={pricingFinalPricePending}
                            title={`Remove ${f.name}`}
                            aria-label={`Remove ${f.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </label>
                <label className="mt-4 flex w-full flex-col gap-2 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <span>Note <span className="normal-case tracking-normal font-normal text-slate-400">(optional)</span></span>
                  <textarea
                    className="textarea-field min-h-[140px]"
                    value={pricingFinalPriceNote}
                    onChange={(event) => setPricingFinalPriceNote(event.target.value)}
                    placeholder="Add a note about the final pricing package (optional)..."
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
              <p className="chat-modal-title">Request Update from Creator</p>
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
                  Specify which fields the creator must update. Your note will be sent by email to the creator.
                </p>
                <label className="mt-2 flex w-full flex-col gap-2 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <span>Fields to update &amp; instructions</span>
                  <textarea
                    className="textarea-field min-h-[140px]"
                    value={revisionComment}
                    onChange={(event) => setRevisionComment(event.target.value)}
                    placeholder="e.g. Please update the Target Price, Quantity, and Delivery Zone fields. The target price should reflect the latest customer quote."
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
            aria-label={`Reject ${formalDocumentLabel}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header border-b-red-100 bg-red-50/70">
              <p className="chat-modal-title text-red-700">Reject {formalDocumentLabel}</p>
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
                    placeholder={`Explain why this ${formalDocumentLabel} is rejected...`}
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
