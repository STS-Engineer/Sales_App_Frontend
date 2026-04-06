import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, Files, MessageSquare, Pencil, SendHorizontal, Trash2, Upload, X } from "lucide-react";
import { getToken, getUserProfile } from "../utils/session.js";
import { useNavigate, useSearchParams } from "react-router-dom";
import ChatPanel from "../components/ChatPanel.jsx";
import FormField from "../components/FormField.jsx";
import TopBar from "../components/TopBar.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import {
  createRfq,
  deleteRfqFile,
  getRfqAuditLogs,
  getRfq,
  sendChat,
  updateRfqData,
  validateRfq,
  uploadRfqFile
} from "../api";
import {
  mapBackendStatusToUi,
  mapBackendStatusToPipelineStage,
  mapChatHistory,
  mapRfqDataToForm
} from "../utils/rfq.js";

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
  expectedDeliveryConditions: "",
  expectedPaymentTerms: "",
  businessTrigger: "",
  customerToolingConditions: "",
  entryBarriers: "",
  designResponsible: "",
  validationResponsible: "",
  designOwner: "",
  developmentCosts: "",
  technicalCapacity: "",
  scope: "",
  customerStatus: "",
  strategicNote: "",
  finalRecommendation: "",
  toTotal: "",
  validatorEmail: "",
  item: "",
  quantity: "",
  budget: "",
  dueDate: "",
  status: "RFQ",
  owner: "",
  notes: "",
  location: "",
  potentialCustomerLocation: "",
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
    "deliveryZone",
    "plant",
    "country",
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
    "customerStatus",
    "strategicNote",
    "finalRecommendation"
  ],
  "step-notes": ["toTotal", "validatorEmail"]
};

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
  const raw =
    rfq?.rfq_files ||
    rfq?.files ||
    rfq?.attachments ||
    rfq?.rfq_data?.files ||
    rfq?.rfq_data?.rfq_files ||
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

const DISCUSSION_STORAGE_KEYS = ["discussion_messages", "discussionMessages"];

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
    authorRole: String(entry?.author_role || entry?.authorRole || "").trim()
  };
};

const extractDiscussionMessages = (rfqData = {}) => {
  const raw = DISCUSSION_STORAGE_KEYS.find((key) => Array.isArray(rfqData?.[key]))
    ? rfqData[DISCUSSION_STORAGE_KEYS.find((key) => Array.isArray(rfqData?.[key]))]
    : [];

  return raw
    .map((entry, index) => normalizeDiscussionMessage(entry, index))
    .filter(Boolean)
    .sort(
      (left, right) =>
        parseFileTimestamp(left?.createdAt) - parseFileTimestamp(right?.createdAt)
    );
};

const createDiscussionMessage = ({
  content,
  authorEmail,
  authorName,
  authorRole
}) => ({
  id:
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `discussion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  content,
  created_at: new Date().toISOString(),
  author_email: authorEmail,
  author_name: authorName,
  author_role: authorRole
});

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
const API_BASE = import.meta.env.VITE_API_URL || "https://sales-app-backend.azurewebsites.net";
const CHATBOT_INITIAL_GREETING =
  "Hello, I'm your sales assistant. I'll be helping you fill your RFQ. How would you like to proceed?\n1. Guide me step by step\n2. I will provide a whole paragraph";
const INITIAL_CHAT_MESSAGE = {
  role: "assistant",
  content: CHATBOT_INITIAL_GREETING
};

const withInitialChatMessage = (messages = []) => {
  if (!Array.isArray(messages) || !messages.length) {
    return [{ ...INITIAL_CHAT_MESSAGE }];
  }

  const hasInitialGreeting = messages.some(
    (message) =>
      message?.role === "assistant" &&
      String(message.content || "").trim() === CHATBOT_INITIAL_GREETING
  );

  return hasInitialGreeting
    ? messages
    : [{ ...INITIAL_CHAT_MESSAGE }, ...messages];
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
  const rfqIdParam = useMemo(() => searchParams.get("id"), [searchParams]);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [rfqId, setRfqId] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [loadingRfq, setLoadingRfq] = useState(false);
  const [rfqError, setRfqError] = useState("");
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
  const [discussionMessages, setDiscussionMessages] = useState([]);
  const [discussionDraft, setDiscussionDraft] = useState("");
  const [discussionSending, setDiscussionSending] = useState(false);
  const [discussionModalOpen, setDiscussionModalOpen] = useState(false);
  const [rfqCreatedByEmail, setRfqCreatedByEmail] = useState("");
  const [filePreview, setFilePreview] = useState(null);
  const [fileDeleteTarget, setFileDeleteTarget] = useState(null);
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [fileActionId, setFileActionId] = useState("");
  const [filePreviewLoadingId, setFilePreviewLoadingId] = useState("");
  const [validationActionId, setValidationActionId] = useState("");
  const [validationSuccess, setValidationSuccess] = useState("");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rfqFormEditEnabled, setRfqFormEditEnabled] = useState(false);
  const [rfqValidationReached, setRfqValidationReached] = useState(false);
  const [validationAudit, setValidationAudit] = useState(createEmptyValidationAudit);
  const [persistValidationView, setPersistValidationView] = useState(false);
  const rfqFileInputRef = useRef(null);
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
  const hasRecordedValidationDecision = Boolean(
    validationAudit.approvedAt || validationAudit.rejectedAt
  );
  const isValidationRejected = Boolean(validationAudit.rejectedAt);
  const validationButtonsDisabled = Boolean(
    validationActionId || hasRecordedValidationDecision
  );

  const chatFallback = useMemo(() => {
    if (loadingRfq) {
      return [{ role: "assistant", content: "Loading RFQ..." }];
    }
    return [
      {
        role: "assistant",
        content:
          "Please select your preferred language.\n1- English\n2- Français\n3- 中文\n4- Español\n5- Deutsch\n6- हिन्दी"
      }
    ];
  }, [loadingRfq]);

  const chatFeed = useMemo(() => withInitialChatMessage(chatMessages), [chatMessages]);
  const stepCompletion = useMemo(() => {
    const isFilled = (value) => {
      if (value === 0) return true;
      if (value === null || value === undefined) return false;
      return String(value).trim().length > 0;
    };
    return Object.fromEntries(
      STEPS.map((step) => {
        const fields = STEP_FIELDS[step.id] || [];
        const complete = fields.every((field) => isFilled(form[field]));
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
  const hasValidationLock =
    activeSubPhase === "Validation" ||
    rfqValidationReached ||
    hasWorkflowMovedBeyondRfq;

  const reviewNavigationUnlocked =
    isRfqStage &&
    (hasValidationLock || selectedSubPhase === "Validation");

  const highestUnlockedStepIndex = useMemo(() => {
    if (reviewNavigationUnlocked) {
      return lastStepIndex;
    }
    return Math.min(lastStepIndex, Math.max(0, highestCompletedStepIndex + 1));
  }, [reviewNavigationUnlocked, lastStepIndex, highestCompletedStepIndex]);

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
    hasValidationLock;
  const getActiveDisplaySubPhase = (stageKey) => {
    if (stageKey !== groupedActiveStage) return "";
    return activeSubPhase;
  };
  const rfqDisplaySubPhase = isRfqStage
    ? selectedSubPhase || getActiveDisplaySubPhase("RFQ") || "RFQ form"
    : "";
  const isRfqFormView = isRfqStage && rfqDisplaySubPhase === "RFQ form";
  const isRfqValidationView =
    isRfqStage && rfqDisplaySubPhase === "Validation";
  const isRfqFormReadOnly =
    hasValidationLock && !rfqFormEditEnabled;
  const isChatLocked =
    isChatOnly || hasValidationLock;
  const rfqFormFieldReadOnly = isChatOnly || isRfqFormReadOnly;
  const allowFileUpload = !saving && !isRfqFormReadOnly;
  const showRfqStepNavigation =
    activeRfqTab === "new" && isRfqStage && isRfqFormView;
  const showChatPanel =
    isRfqStage && !isRfqValidationView && activeRfqTab !== "files";
  const canParticipateInDiscussion = useMemo(() => {
    if (currentUserRole === "OWNER") return true;
    if (!rfqId && !rfqIdParam) return true;
    return normalizeEmailValue(currentUserEmail) === normalizeEmailValue(rfqCreatedByEmail);
  }, [currentUserEmail, currentUserRole, rfqCreatedByEmail, rfqId, rfqIdParam]);
  const getNextStepId = (stepId) => {
    const currentIndex = stepIds.indexOf(stepId);
    if (currentIndex < 0 || currentIndex >= stepIds.length - 1) {
      return "";
    }
    return stepIds[currentIndex + 1];
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
      if (persistValidationView) {
        return;
      }
      setSelectedStage(nextSelectedStage);
      setSelectedSubPhase(getActiveDisplaySubPhase(nextSelectedStage));
    }
  }, [activeStage, hasRecordedValidationDecision, persistValidationView]);

  useEffect(() => {
    const nextSelectedStage = normalizePipelineStageKey(activeStage);
    if (nextSelectedStage && selectedStage === nextSelectedStage) {
      setSelectedSubPhase(getActiveDisplaySubPhase(nextSelectedStage));
    }
  }, [activeSubPhase, allStepsComplete, activeStage, selectedStage]);

  useEffect(() => {
    setRfqFormEditEnabled(false);
    setRfqValidationReached(false);
    setPersistValidationView(false);
  }, [rfqId]);

  useEffect(() => {
    if (activeSubPhase === "Validation") {
      setRfqValidationReached(true);
    }
  }, [activeSubPhase]);

  useEffect(() => {
    const previousCompletion = previousStepCompletionRef.current;
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
      const shouldAutoAdvance =
        stepIndex >= 0 && stepIndex === Math.max(0, highestUnlockedStepIndex - 1);
      const nextStepId = getNextStepId(activeStep);
      if (nextStepId && shouldAutoAdvance) {
        setActiveStep(nextStepId);
      }
    }

    previousStepCompletionRef.current = stepCompletion;
  }, [
    activeRfqTab,
    isRfqFormView,
    isRfqFormReadOnly,
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

  const applyRfq = (rfq, { syncChat = true, auditLogs = [] } = {}) => {
    if (!rfq) return;
    const mappedFields = {
      ...mapRfqDataToForm(rfq),
      ...extractPotentialAssessmentFields(rfq?.rfq_data)
    };
    const nextUiStatus = mapBackendStatusToUi(rfq);
    const nextPipelineStage = mapBackendStatusToPipelineStage(rfq);
    const subStatusValue =
      typeof rfq?.sub_status === "string" ? rfq.sub_status : rfq?.sub_status?.value;
    handleMergeFields(mappedFields);
    setValidationAudit(extractValidationAudit(rfq, auditLogs));
    setDiscussionMessages(extractDiscussionMessages(rfq?.rfq_data));
    setRfqCreatedByEmail(String(rfq?.created_by_email || "").trim());
    setForm((prev) => ({
      ...prev,
      id: rfq.rfq_id,
      status: nextUiStatus
    }));
    setActiveStage(nextPipelineStage);
    setActiveRfqTab((prev) => {
      if (prev === "files") {
        return prev;
      }
      return rfq?.rfq_data?.chat_mode === "potential" || subStatusValue === "POTENTIAL"
        ? "potential"
        : "new";
    });
    if (nextPipelineStage === "RFQ" && nextUiStatus === "Validation") {
      setSelectedStage("RFQ");
      setSelectedSubPhase("Validation");
      setActiveStep("step-notes");
      setRfqValidationReached(true);
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
      setChatMessages((prev) =>
        mergeChatWithAttachments(mapChatHistory(rfq.chat_history), prev)
      );
    }
  };

  const syncRfq = async (targetId) => {
    const idToLoad = targetId || rfqId;
    if (!idToLoad) return false;
    setRfqError("");
    try {
      const { rfq, auditLogs } = await loadRfqSnapshot(idToLoad);
      applyRfq(rfq, { auditLogs });
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
          setForm(initialForm);
          setChatMessages([]);
          setActiveStage("RFQ");
          setSelectedStage("RFQ");
          setSelectedSubPhase("RFQ form");
          setActiveRfqTab("new");
          setActiveStep("step-client");
          setServerFiles([]);
          setLocalFiles([]);
          setDiscussionMessages([]);
          setDiscussionDraft("");
          setDiscussionSending(false);
          setDiscussionModalOpen(false);
          setRfqCreatedByEmail("");
          setValidationSuccess("");
          setValidationAudit(createEmptyValidationAudit());
          setRejectModalOpen(false);
          setRejectReason("");
          setRfqFormEditEnabled(false);
          setRfqValidationReached(false);
          setPersistValidationView(false);
          return;
        }

        const { rfq, auditLogs } = await loadRfqSnapshot(rfqIdParam);

        if (!alive) return;
        setRfqId(rfq.rfq_id);
        applyRfq(rfq, { auditLogs });
      } catch {
        if (!alive) return;
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

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleFilesChange = async (event) => {
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
      const token = getToken();
      const response = await fetch(resolvedUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
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

  const handleMergeFields = (fields) => {
    setForm((prev) => {
      const next = { ...prev };
      const aliasMap = {
        contact: "contactName",
        email: "contactEmail",
        phone: "contactPhone",
        validator_email: "validatorEmail",
        validatorEmail: "validatorEmail",
        product_name: "productName",
        product_line_acronym: "productLine",
        customer_name: "customer",
        responsibility_design: "designResponsible",
        design_responsible: "designResponsible",
        responsibility_validation: "validationResponsible",
        validation_responsible: "validationResponsible",
        product_ownership: "designOwner",
        design_owner: "designOwner",
        pays_for_development: "developmentCosts",
        development_costs: "developmentCosts",
        zone_manager_email: "validatorEmail",
        capacity_available: "technicalCapacity",
        technical_capacity: "technicalCapacity",
        customer_status: "customerStatus",
        strategic_note: "strategicNote",
        final_recommendation: "finalRecommendation",
      };

      Object.entries(fields || {}).forEach(([key, value]) => {
        const targetKey = aliasMap[key] || key;
        if (Array.isArray(value)) {
          next[targetKey] = value;
          return;
        }
        if (value !== null && value !== undefined && String(value).trim() !== "") {
          next[targetKey] = value;
        }
      });

      return next;
    });
  };

  const handleStageChange = (stageKey) => {
    setPersistValidationView(false);
    setSelectedStage(stageKey);
    const stage = PIPELINE_STAGES.find((entry) => entry.key === stageKey);
    setSelectedSubPhase(
      stageKey === groupedActiveStage
        ? getActiveDisplaySubPhase(stageKey)
        : stage?.subPhases?.[0] || ""
    );
  };

  const handleSubPhaseChange = (stageKey, subPhase) => {
    setPersistValidationView(false);
    if (
      stageKey === "RFQ" &&
      subPhase === "Validation" &&
      !canOpenRfqValidation
    ) {
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

  const handleChatSend = async (message, attachments = []) => {
    const trimmedMessage = message ? message.trim() : "";
    const attachmentNames = (attachments || [])
      .map((attachment) => attachment.name || attachment.file?.name)
      .filter(Boolean);
    const fallbackMessage = attachmentNames.length
      ? `Attached file${attachmentNames.length > 1 ? "s" : ""}: ${attachmentNames.join(", ")}`
      : "";
    const displayMessage = trimmedMessage || fallbackMessage;
    const payloadMessage = trimmedMessage || fallbackMessage;

    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: displayMessage, attachments }
    ]);

    let currentRfqId = rfqId;
    try {
      currentRfqId = await ensureRfqExists();
    } catch {
      setChatMessages((prev) => [
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
        setChatMessages((prev) => [
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
    try {
      const reply = await sendChat(
        currentRfqId,
        payloadMessage,
        activeRfqTab === "potential" ? "potential" : "rfq"
      );
      shouldAutoRedirect = Boolean(reply?.auto_redirect);
      finalAssistantResponse = String(reply?.response || "");
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I couldn't reach the server. Please retry in a moment."
        }
      ]);
    } finally {
      const synced = await syncRfq(currentRfqId);
      if (!synced && finalAssistantResponse) {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: finalAssistantResponse }
        ]);
      }
      if (shouldAutoRedirect) {
        navigate(`/rfqs/new?id=${encodeURIComponent(currentRfqId)}`);
      }
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!rfqId) return;
    setSaving(true);
    try {
      await syncRfq(rfqId);
    } finally {
      setSaving(false);
    }
  };

  const handleValidationUpdate = () => {
    setValidationSuccess("RFQ returned to the RFQ form for updates.");
    setRfqError("");
    setRfqFormEditEnabled(true);
    setPersistValidationView(false);
    setActiveRfqTab("new");
    handleSubPhaseChange("RFQ", "RFQ form");
  };

  const handleApproveValidation = async () => {
    if (!rfqId) return;
    setValidationActionId("approve");
    setValidationSuccess("");
    setRfqError("");
    try {
      await validateRfq(rfqId, { approved: true });
      await syncRfq(rfqId);
      setPersistValidationView(true);
      setSelectedStage("RFQ");
      setSelectedSubPhase("Validation");
      setValidationSuccess("RFQ approved successfully.");
    } catch (error) {
      setRfqError(error?.message || "Unable to approve this RFQ.");
    } finally {
      setValidationActionId("");
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
    setDiscussionSending(true);
    setRfqError("");

    try {
      currentRfqId = await ensureRfqExists();
      const latestRfq = await getRfq(currentRfqId);
      const latestMessages = extractDiscussionMessages(latestRfq?.rfq_data);
      const nextMessage = createDiscussionMessage({
        content,
        authorEmail: currentUserEmail,
        authorName: currentUserLabel,
        authorRole: currentUserRole || "COMMERCIAL"
      });

      await updateRfqData(currentRfqId, {
        discussion_messages: [...latestMessages, nextMessage]
      });

      setDiscussionDraft("");
      await syncRfq(currentRfqId);
    } catch (error) {
      setRfqError(error?.message || "Unable to send this message.");
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
                          const stepState = isActive && isTerminalStage
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
                                        return (
                                          <span
                                            key={`segment-${subPhase}`}
                                            className={[
                                              "h-1 flex-1 rounded-full",
                                              isSubComplete ? "bg-emerald-400" : "bg-white/25"
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
                                        const isSubDisabled =
                                          isValidationSubPhase && !canOpenRfqValidation;
                                        const currentSubPhaseIndex =
                                          stage.subPhases.indexOf(subPhase);
                                        const isSubComplete =
                                          isActive &&
                                          subPhaseIndex >= 0 &&
                                          currentSubPhaseIndex < subPhaseIndex;
                                        const dotClass = isSubActive
                                          ? "h-2 w-2 rounded-full bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.35)]"
                                          : isSubComplete
                                            ? "h-2 w-2 rounded-full bg-emerald-300"
                                            : "h-1.5 w-1.5 rounded-full bg-white/70";
                                        const labelClass = isSubActive
                                          ? "mt-0.5 max-w-[120px] text-center font-semibold leading-tight text-white"
                                          : isSubComplete
                                            ? "mt-0.5 max-w-[120px] text-center leading-tight text-emerald-50"
                                            : "mt-0.5 max-w-[120px] text-center leading-tight text-white/85";

                                        return (
                                          <button
                                            key={subPhase}
                                            type="button"
                                            onClick={() => handleSubPhaseChange(stage.key, subPhase)}
                                            disabled={isSubDisabled}
                                            className={`relative z-10 flex flex-1 flex-col items-center rounded-lg border-0 bg-transparent px-0.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-white/85 transition focus:outline-none focus:ring-2 focus:ring-white/30 disabled:cursor-not-allowed disabled:opacity-45 sm:text-[11px] ${isSubSelected ? "bg-white/10" : ""
                                              } ${isSubDisabled ? "" : "hover:bg-white/10"
                                              }`}
                                            aria-pressed={isSubSelected}
                                            aria-disabled={isSubDisabled || undefined}
                                            title={
                                              isSubDisabled
                                                ? "Submit the RFQ for validation to unlock this tab"
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
                  ) : null}
                </div>
              </div>

              {isRfqStage && isRfqFormView ? (
                <div className="px-4 sm:px-6">
                  <div className="flex items-center gap-6 border-b border-slate-200/70 text-sm font-semibold text-slate-500">
                    <button
                      type="button"
                      onClick={() => setActiveRfqTab("potential")}
                      className={`pb-1 transition ${activeRfqTab === "potential"
                        ? "border-b-2 border-tide text-ink"
                        : "hover:text-ink"
                        }`}
                    >
                      Potential
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRfqTab("new")}
                      className={`pb-1 transition ${activeRfqTab === "new"
                        ? "border-b-2 border-tide text-ink"
                        : "hover:text-ink"
                        }`}
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
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => setFileDeleteTarget(file)}
                                    disabled={isDeleting || isRfqFormReadOnly}
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
                  <div className="col-span-full flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200/80 bg-white/70 text-sm font-medium text-slate-500">
                    Empty stage
                  </div>
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
                          <FormField label="Customer" name="customer" value={form.customer} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <FormField label="Customer location" name="potentialCustomerLocation" value={form.potentialCustomerLocation} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <FormField label="Application" name="application" value={form.application} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                          <FormField label="Industry served" name="potentialIndustry" value={form.potentialIndustry} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <FormField label="Planned product type" name="potentialProductType" value={form.potentialProductType} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
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
                            <FormField label="Engagement reasons" name="potentialEngagementReason" value={form.potentialEngagementReason} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                          </div>
                          <FormField label="Idea source" name="potentialIdeaOwner" value={form.potentialIdeaOwner} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <FormField label="Current supplier" name="potentialCurrentSupplier" value={form.potentialCurrentSupplier} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                          <FormField label="Main win reason" name="potentialWinReason" value={form.potentialWinReason} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <div className="md:col-span-2">
                            <FormField label="Win rationale details" name="potentialWinDetails" value={form.potentialWinDetails} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                          </div>
                          <FormField label="Technical capabilities" name="potentialTechnicalCapability" value={form.potentialTechnicalCapability} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <FormField label="Strategic fit" name="potentialStrategyFit" value={form.potentialStrategyFit} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <div className="md:col-span-2">
                            <FormField label="Strategic fit details" name="potentialStrategyFitDetails" value={form.potentialStrategyFitDetails} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
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
                          <FormField label="Sales (kEUR)" name="potentialBusinessSalesKeur" type="number" value={form.potentialBusinessSalesKeur} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <FormField label="Margin (%)" name="potentialBusinessMarginPercent" type="number" value={form.potentialBusinessMarginPercent} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <FormField label="Margin (kEUR)" name="potentialBusinessMarginKeur" value={potentialMarginKeur} readOnly />
                          <FormField label="Start of production" name="potentialStartOfProduction" value={form.potentialStartOfProduction} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <FormField label="Development effort" name="potentialDevelopmentEffort" value={form.potentialDevelopmentEffort} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <div className="xl:col-span-3">
                            <FormField label="Side effects of engagement" name="potentialSideEffects" value={form.potentialSideEffects} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
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
                              readOnly={rfqFormFieldReadOnly}
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
                              readOnly={rfqFormFieldReadOnly}
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
                          <FormField label="Contact name" name="contactName" value={form.contactName} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <FormField label="Contact function" name="contactFunction" value={form.contactFunction} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <FormField label="Contact phone" name="contactPhone" value={form.contactPhone} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                          <FormField label="Contact email" name="contactEmail" type="email" value={form.contactEmail} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
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
                                              disabled={isDeleting || isRfqFormReadOnly}
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
                          </div>
                        </div>

                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
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
                                                disabled={isDeleting || isRfqFormReadOnly}
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
                                <FormField label="Quantity per year" name="qtyPerYear" type="text" value={form.qtyPerYear} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
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
                            <FormField label="Target Price" name="targetPrice" type="number" value={form.targetPrice} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
                            <FormField label="Expected Delivery Conditions" name="expectedDeliveryConditions" value={form.expectedDeliveryConditions} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
                            <FormField label="Expected Payment Terms" name="expectedPaymentTerms" value={form.expectedPaymentTerms} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
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
                            <FormField label="Customer status" name="customerStatus" value={form.customerStatus} onChange={handleChange} readOnly={rfqFormFieldReadOnly} autoExpand />
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
                            <FormField label="TO total" name="toTotal" type="number" value={form.toTotal} onChange={handleChange} readOnly={rfqFormFieldReadOnly} />
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
                          readOnly={isChatLocked}
                          onCollapse={() => setChatCollapsed(true)}
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
                  className="border-t border-slate-200/70 bg-white/90 p-5 sm:p-6"
                >
                  <div className="space-y-3">
                    <textarea
                      className="textarea-field min-h-[80px]"
                      value={discussionDraft}
                      onChange={(event) => setDiscussionDraft(event.target.value)}
                      disabled={discussionSending || !canParticipateInDiscussion}
                    />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="submit"
                        className="ml-auto inline-flex items-center justify-center gap-2 rounded-xl border border-tide bg-tide px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#055d92] disabled:cursor-not-allowed disabled:opacity-60"
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
                                  disabled={isDeleting || isRfqFormReadOnly}
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
    </div>
  );
}
