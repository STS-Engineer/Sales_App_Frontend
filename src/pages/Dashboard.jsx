import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Globe, History, LayoutList, Menu, Pencil, TrendingUp, Trash2, Users, X } from "lucide-react";
import TopBar from "../components/TopBar.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import RfqTable from "../components/RfqTable.jsx";
import SearchableSelectField from "../components/SearchableSelectField.jsx";
import { listRfqs, getTeamView, getTeamMembers, getMarketViewSegment, getMarketView, getOldRfqs, updateOldRfq, updateOldRfqSubitem, deleteOldRfq, deleteOldRfqSubitem, listAllUsers, getKamOptions, getCustomerOptions } from "../api";
import { mapRfqToRow } from "../utils/rfq.js";
import { getUserProfile, hasRole } from "../utils/session.js";

const BASE_VIEW_OPTIONS = [
  { key: "detailed", label: "Detailed View" },
  { key: "global", label: "Global View" }
];

const HISTORY_VIEW_OPTION = { key: "history", label: "RFQ History View" };

const MOBILE_VIEW_ICONS = {
  detailed: LayoutList,
  global: Globe,
  team: Users,
  market: TrendingUp,
  history: History
};

const MOBILE_VIEW_BADGE_STYLES = [
  "bg-tide/10 text-tide",
  "bg-mint/15 text-mint",
  "bg-sun/15 text-sun"
];

const TYPE_FILTER_OPTIONS = [
  { key: "all", label: "All types" },
  { key: "RFQ", label: "RFQ" },
  { key: "RFI", label: "RFI" },
  { key: "POTENTIAL", label: "Potential" }
];

const getTypeOptionsForPhase = (phaseKey) => {
  if (phaseKey === "RFQ") {
    return TYPE_FILTER_OPTIONS;
  }
  if (phaseKey === "In costing") {
    return TYPE_FILTER_OPTIONS.filter((option) =>
      ["all", "RFQ", "RFI"].includes(option.key)
    );
  }
  return [];
};

const PHASES = [
  {
    key: "RFQ",
    label: "Request",
    statuses: ["New RFQ", "Validation", "Rejected by AI", "Cancelled"],
    subPhases: ["Request form", "Validation"]
  },
  {
    key: "In costing",
    label: "In costing",
    statuses: ["feasibility", "Pricing", "RFI completed", "Cancelled"],
    subPhases: ["feasibility", "Pricing"]
  },
  {
    key: "Offer",
    label: "Offer",
    statuses: ["Offer preparation", "Offer validation", "Cancelled"],
    subPhases: ["Offer preparation", "Offer validation"]
  },
  {
    key: "PO",
    label: "PO",
    statuses: ["Get PO", "PO accepted", "Mission accepted", "Mission not accepted", "Cancelled"],
    subPhases: ["Get PO", "PO accepted", "Mission status"]
  },
  {
    key: "Prototype",
    label: "Prototype",
    statuses: ["Get prototype orders", "Prototype ongoing", "Cancelled"],
    subPhases: ["Get prototype orders", "Prototype ongoing"]
  }
];

const GROUPED_PHASE_MAP = {
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

const phaseKeys = PHASES.map((phase) => phase.key);
const knownStatuses = new Set(PHASES.flatMap((phase) => phase.statuses));
const ROWS_PER_PAGE_OPTIONS = [5, 10, 20, 50];
const DEFAULT_ROWS_PER_PAGE = 10;
const HISTORY_DEFAULT_ROWS_PER_PAGE = 5;
const EXCLUDED_STATUSES = new Set(["Lost"]);
const DEFAULT_SUBPHASE_STATUS = "New RFQ";
const requestLabel = (value) => Math.abs(Number(value || 0)) === 1 ? "Request" : "Requests";
const formatRequestCount = (value) => `${Number(value || 0)} ${requestLabel(value)}`;
const FILTER_STATUS_LABELS = {
  "New RFQ": "New request",
  Validation: "Pending for validation"
};

const mapStatusToProgressSubPhase = (phaseKey, status) => {
  if (phaseKey === "RFQ") {
    if (status === "New RFQ") {
      return "Request form";
    }
    if (status === "Validation" || status === "Rejected by AI") {
      return "Validation";
    }
  }

  if (phaseKey === "PO") {
    if (status === "Mission accepted" || status === "Mission not accepted") {
      return "Mission status";
    }
  }

  return status;
};

const normalizeStatus = (status) => {
  if (EXCLUDED_STATUSES.has(status)) return "";
  if (knownStatuses.has(status)) return status;
  return DEFAULT_SUBPHASE_STATUS;
};

const resolvePhaseKey = (rfq) => {
  if (GROUPED_PHASE_MAP[rfq.pipelineStage]) {
    return GROUPED_PHASE_MAP[rfq.pipelineStage];
  }

  const phaseFromStatus = PHASES.find((phase) => phase.statuses.includes(rfq.status));
  if (phaseFromStatus) {
    return phaseFromStatus.key;
  }

  return "RFQ";
};

const buildSearchHaystack = (rfq) =>
  [
    rfq.id,
    rfq.displayId,
    rfq.creator,
    rfq.customer,
    rfq.client,
    rfq.productName,
    rfq.productLine,
    rfq.item,
    rfq.application,
    rfq.deliveryZone,
    rfq.location,
    rfq.validator,
    rfq.validatorRole,
    rfq.documentType,
    rfq.status,
    rfq.pipelineStage,
    rfq.phaseKey,
    rfq.potentialSystematicId,
    rfq.potentialCustomer,
    rfq.potentialApplication,
    rfq.potentialLocation,
    rfq.dueDate
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const normalizeSector = (value) => {
  const s = String(value || "").trim().toLowerCase();
  if (s.includes("non")) return "non-automotive";
  if (s.includes("auto")) return "automotive";
  return "";
};

const getAvailableProductLines = (rfqs = []) =>
  Array.from(
    new Set(rfqs.map((rfq) => String(rfq.productLine || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

const applyProductLineFilter = (rfqs, selected) => {
  if (!selected || selected === "ALL") return rfqs;
  return rfqs.filter((rfq) => String(rfq.productLine || "").trim() === selected);
};

const formatOldRfqCell = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") return "-";
  return String(value);
};


const buildPageItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items = [1];
  const left = Math.max(2, currentPage - 1);
  const right = Math.min(totalPages - 1, currentPage + 1);

  if (left > 2) items.push("...");
  for (let page = left; page <= right; page += 1) {
    items.push(page);
  }
  if (right < totalPages - 1) items.push("...");
  items.push(totalPages);

  return items;
};

const HIDDEN_OLD_RFQ_PROJECT_COLUMNS = new Set([
  "old_rfq_id",
  "excel_row_number",
  "creation_log",
  "monday_id",
  "import_batch",
  "import_source_file",
  "import_source_row",
  "button",
  "subitems_count",
  "updated_at",
  "updated_by",
]);

const OLD_RFQ_PROJECT_COLUMN_ORDER = [
  "name",
  "product_type",
  "customers",
  "kam",
  "project_name",
  "customer_project_name",
  "application",
  "customer_application",
  "project_condition",
  "explication",
  "importance",
  "comment",
  "total_qty",
  "type_business",
  "costing_number",
  "quote_type",
  "final_delivery",
  "plant_to_deliver",
  "subitems_est_price_eur",
  "subelements_sales_limit_3",
  "twc_keur",
  "mirror_gmdc_k",
  "authorization_required",
  "capex_keur",
  "capital_keur",
  "gmdc_project_keur",
  "sales_project",
  "requester",
  "project_sales_keur",
  "gmdc_proj_percent",
  "old_new",
  "duplicate_of_old_new",
  "customer_text",
  "sector",
  "pre_sales_project_manager",
  "gmdc_proj",
  "sop",
  "success_rate",
  "volume_profile",
  "button",
  "interest_index",
  "sop_speed_index",
  "confidence_index",
  "gmdc_percent_index",
  "gmdc_value_index",
  "year_to_sop",
  "lifetime_index",
  "lifetime_year",
  "element_identifier",
  "chiffres_id",
  "text_volume_profile",
  "sop_percent",
  "sop_percent_1",
  "sop_percent_2",
  "sop_percent_3",
  "sop_percent_4",
  "sop_percent_5",
  "sop_percent_6",
  "sop_percent_7",
  "sop_percent_8",
  "sop_percent_9",
  "readiness",
  "product_testing",
  "plant_audited",
  "iteration",
  "integration",
  "duplicate_of_pipeline",
  "duplicate_of_pipeline_record_change",
  "id_test",
  "status_name",
  "duplicate_of_development_axis",
  "note",
  "mirror",
  "approval_status",
  "date_of_approval",
  "expected_date_of_answer",
  "calculated_date",
  "acknowledge_input",
  "costing_leader",
  "feasibility_leader",
  "creation_journal",
];

const OLD_RFQ_PROJECT_COLUMN_LABELS = {
  name: "Name",
  product_type: "Product Type",
  customers: "Customer",
  kam: "KAM",
  project_name: "Project Name",
  customer_project_name: "Customer Project Name",
  application: "Application",
  customer_application: "Customer Application",
  type_business: "Business Type",
  subitems_est_price_eur: "Subitems Est. Price (€)",
  subelements_sales_limit_3: "Subitems Sales Limit 3",
  twc_keur: "TWC (k€)",
  mirror_gmdc_k: "Mirror GMDC (k€)",
  authorization_required: "Authorization Required",
  capex_keur: "CAPEX (k€)",
  capital_keur: "Capital (k€)",
  gmdc_project_keur: "GMDC Project (k€)",
  sales_project: "Sales Project",
  requester: "Requester",
  project_sales_keur: "Project Sales (k€)",
  gmdc_proj_percent: "GMDC Project (%)",
  old_new: "Old / New",
  duplicate_of_old_new: "Duplicate Of Old/New",
  customer_text: "Customer Text",
  importance: "Importance",
  comment: "Comment",
  sector: "Sector",
  pre_sales_project_manager: "Pre-Sales Project Manager",
  gmdc_proj: "GMDC Project",
  sop: "SOP",
  success_rate: "Success Rate",
  volume_profile: "Volume Profile",
  button: "Button",
  interest_index: "Interest Index",
  sop_speed_index: "SOP Speed Index",
  confidence_index: "Confidence Index",
  gmdc_percent_index: "GMDC Percent Index",
  gmdc_value_index: "GMDC Value Index",
  year_to_sop: "Year To SOP",
  lifetime_index: "Lifetime Index",
  lifetime_year: "Lifetime Year",
  monday_id: "Monday ID",
  costing_number: "Request ID",
  plant_to_deliver: "Plant To Deliver",
  element_identifier: "Element Identifier",
  chiffres_id: "RFQ ID",
  text_volume_profile: "Text Volume Profile",
  sop_percent: "SOP %",
  sop_percent_1: "SOP % 1",
  sop_percent_2: "SOP % 2",
  sop_percent_3: "SOP % 3",
  sop_percent_4: "SOP % 4",
  sop_percent_5: "SOP % 5",
  sop_percent_6: "SOP % 6",
  sop_percent_7: "SOP % 7",
  sop_percent_8: "SOP % 8",
  sop_percent_9: "SOP % 9",
  readiness: "Readiness",
  project_condition: "Project Condition",
  explication: "Explication",
  product_testing: "Product Testing",
  plant_audited: "Plant Audited",
  iteration: "Iteration",
  integration: "Integration",
  final_delivery: "Final Delivery",
  duplicate_of_pipeline: "Duplicate Of Pipeline",
  duplicate_of_pipeline_record_change: "Duplicate Of Pipeline Record Change",
  id_test: "ID Test",
  status_name: "Status",
  duplicate_of_development_axis: "Duplicate Of Development Axis",
  total_qty: "Total Quantity",
  note: "Note",
  mirror: "Mirror",
  quote_type: "Quote Type",
  approval_status: "Approval Status",
  date_of_approval: "Date of Approval",
  expected_date_of_answer: "Expected Date of Answer",
  calculated_date: "Calculated Date",
  acknowledge_input: "Acknowledge Input",
  costing_leader: "Costing Leader",
  feasibility_leader: "Feasibility Leader",
  creation_journal: "Creation Date",
  subitems_count: "Subitems",
};

const buildOrderedOldRfqProjectColumns = (apiColumns = []) => {
  // Columns defined in the order list are always shown (unless explicitly hidden)
  const orderedColumns = OLD_RFQ_PROJECT_COLUMN_ORDER.filter(
    (col) => !HIDDEN_OLD_RFQ_PROJECT_COLUMNS.has(col)
  );
  // Any extra columns returned by the API but not in the defined order are appended
  const remainingColumns = apiColumns.filter(
    (col) =>
      !HIDDEN_OLD_RFQ_PROJECT_COLUMNS.has(col) &&
      !OLD_RFQ_PROJECT_COLUMN_ORDER.includes(col)
  );
  return [...orderedColumns, ...remainingColumns];
};

const getOldRfqProjectColumnLabel = (columnName) =>
  OLD_RFQ_PROJECT_COLUMN_LABELS[columnName] || columnName;

const HIDDEN_OLD_RFQ_SUBITEM_COLUMNS = new Set([
  "old_rfq_subitem_id",
  "old_rfq_id",
  "excel_row_number",
  "subitem_order",
  "parent_id",
  "import_batch",
  "import_source_file",
  "import_source_row",
  "year1",
  "year2",
  "year3",
  "year4",
  "year5",
  "year6",
  "year7",
  "year8",
  "year9",
  "year10",
  "year1_value",
  "year2_value",
  "year3_value",
  "year4_value",
  "year5_value",
  "year6_value",
  "year7_value",
  "year8_value",
  "year9_value",
  "year10_value",
  "volume_title",
  "updated_at",
  "updated_by",
]);

const QTY_YEAR_COLUMNS = Array.from({ length: 10 }, (_, i) => `qty_year_${i + 1}`);

const OLD_RFQ_SUBITEM_COLUMN_ORDER = [
  "name",
  "product_types",
  "application",
  "product_line_labels",
  "product_line_labels_text",
  "est_price_eur",
  "type_sales",
  "delivery_to",
  "final_delivery",
  "plant",
  "qty_kp",
  "std_gmdc_percent",
  "std_gmdc_percent_2",
  "difficulty",
  "capacity_steps_mp",
  "capacity_steps_mp_2",
  "capex_per_mp",
  "capex_per_mp_2",
  "development_axis",
  "twc_percent",
  "twc_percent_2",
  "success_rate",
  "sales_ke",
  "gmdc_keur",
  "roce_ro_cap",
  "roce_gmdc_cap",
  "twc",
  "capex_keur",
  "capital",
  "status",
  "importance",
  "project_name",
  "customer",
  "pipeline",
  "iteration",
  "safe_sales_keur",
  "product_line_description",
  "authorization_required",
  "product_types_2",
  "subitem_id",
  "chiffre_subitem_id",
  "sales_limit_1",
  "sales_limit_3",
  "prototype_a_sample_qty",
  "prototypes_b_sample_qty",
  "quotation_currency",
  "target_price",
  "qty_year_1",
  "qty_year_2",
  "qty_year_3",
  "qty_year_4",
  "qty_year_5",
  "qty_year_6",
  "qty_year_7",
  "qty_year_8",
  "qty_year_9",
  "qty_year_10",
  "maximum_value",
  "scenario_note",
  "created",
  "created_by",
  "modified",
  "modified_by",
  "scenario_id",
  "volume_title",
];

const OLD_RFQ_SUBITEM_COLUMN_LABELS = {
  name: "Name",
  product_types: "Product Type",
  application: "Application",
  product_line_labels: "Product Line Labels",
  product_line_labels_text: "Product Line Labels Text",
  est_price_eur: "Estimated Price (€)",
  type_sales: "Sales Type",
  delivery_to: "Delivery To",
  final_delivery: "Final Delivery",
  plant: "Plant",
  qty_kp: "Quantity (kp)",
  std_gmdc_percent: "Standard GMDC (%)",
  std_gmdc_percent_2: "Standard GMDC (%) 2",
  difficulty: "Difficulty",
  capacity_steps_mp: "Capacity Steps (Mp)",
  capacity_steps_mp_2: "Capacity Steps (Mp) 2",
  capex_per_mp: "CAPEX / MP",
  capex_per_mp_2: "CAPEX / MP 2",
  development_axis: "Development Axis",
  twc_percent: "TWC (%)",
  twc_percent_2: "TWC (%) 2",
  success_rate: "Success Rate",
  sales_ke: "Sales (k€)",
  gmdc_keur: "GMDC (k€)",
  roce_ro_cap: "ROCE (RO / CAP)",
  roce_gmdc_cap: "ROCE (GMDC / CAP)",
  twc: "TWC",
  capex_keur: "CAPEX (k€)",
  capital: "Capital",
  status: "Status",
  importance: "Importance",
  project_name: "Project Name",
  customer: "Customer",
  pipeline: "Pipeline",
  iteration: "Iteration",
  safe_sales_keur: "Safe Sales (k€)",
  product_line_description: "Product Line Description",
  authorization_required: "Authorization Required",
  product_types_2: "Product Type 2",
  subitem_id: "Subitem ID",
  chiffre_subitem_id: "Chiffre Subitem ID",
  sales_limit_1: "Sales Limit 1",
  sales_limit_3: "Sales Limit 3",
  prototype_a_sample_qty: "Prototype A Sample Qty",
  prototypes_b_sample_qty: "Prototypes B Sample Qty",
  quotation_currency: "Quotation Currency",
  target_price: "Target Price",
  qty_year_1: "Qty/Year 1",
  qty_year_2: "Qty/Year 2",
  qty_year_3: "Qty/Year 3",
  qty_year_4: "Qty/Year 4",
  qty_year_5: "Qty/Year 5",
  qty_year_6: "Qty/Year 6",
  qty_year_7: "Qty/Year 7",
  qty_year_8: "Qty/Year 8",
  qty_year_9: "Qty/Year 9",
  qty_year_10: "Qty/Year 10",
  maximum_value: "Maximum Value",
  scenario_note: "Scenario Note",
  created: "Created",
  created_by: "Created By",
  modified: "Modified",
  modified_by: "Modified By",
  scenario_id: "Scenario ID",
  volume_title: "Volume Title",
};

const buildOrderedOldRfqSubitemColumns = (apiColumns = []) => {
  const visibleColumns = apiColumns.filter(
    (col) => !HIDDEN_OLD_RFQ_SUBITEM_COLUMNS.has(col)
  );
  // Inject the 10 virtual qty_year columns (always present)
  QTY_YEAR_COLUMNS.forEach((col) => {
    if (!visibleColumns.includes(col)) visibleColumns.push(col);
  });
  const orderedColumns = OLD_RFQ_SUBITEM_COLUMN_ORDER.filter((col) =>
    visibleColumns.includes(col)
  );
  const remainingColumns = visibleColumns.filter(
    (col) => !OLD_RFQ_SUBITEM_COLUMN_ORDER.includes(col)
  );
  return [...orderedColumns, ...remainingColumns];
};

const getOldRfqSubitemColumnLabel = (columnName) =>
  OLD_RFQ_SUBITEM_COLUMN_LABELS[columnName] || columnName;

const formatVolumeYears = (subitem) => {
  const rows = [];
  for (let i = 1; i <= 10; i += 1) {
    const year = String(subitem?.[`year${i}`] || "").trim();
    const value = String(subitem?.[`year${i}_value`] || "").trim();
    if (year && value) {
      rows.push(`${year} : ${value}`);
    }
  }
  return rows.length > 0 ? rows.join("\n") : "-";
};

const TruncatedCell = ({ value }) => {
  const textRef = useRef(null);
  const wrapperRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [tooltipPos, setTooltipPos] = useState(null);

  const displayValue =
    value === null || value === undefined || String(value).trim() === ""
      ? "-"
      : String(value);

  useEffect(() => {
    const checkOverflow = () => {
      const element = textRef.current;
      if (!element) { setIsOverflowing(false); return; }
      setIsOverflowing(element.scrollWidth > element.clientWidth);
    };

    checkOverflow();

    const element = textRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(element);
    window.addEventListener("resize", checkOverflow);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", checkOverflow);
    };
  }, [displayValue]);

  const handleMouseEnter = () => {
    if (!isOverflowing || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setTooltipPos({
      bottom: window.innerHeight - rect.top + 12,
      left: rect.left,
    });
  };

  const handleMouseLeave = () => setTooltipPos(null);

  return (
    <>
      <div
        ref={wrapperRef}
        className="history-truncated-cell"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <span ref={textRef} className="history-truncated-text">
          {displayValue}
        </span>
      </div>
      {tooltipPos && createPortal(
        <div
          className="history-tooltip-portal"
          style={{ bottom: `${tooltipPos.bottom}px`, left: `${tooltipPos.left}px` }}
        >
          {displayValue}
        </div>,
        document.body
      )}
    </>
  );
};

const formatCreationJournal = (value) => {
  if (!value || String(value).trim() === "") return "-";
  const str = String(value).trim();
  // Format: "Name Month DD, YYYY H:MM AM/PM"  e.g. "Taha Khiari Sep 5, 2024 4:09 PM"
  const namedMatch = str.match(
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)/i
  );
  if (namedMatch) return namedMatch[0].trim();
  // Format: "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS"
  const isoMatch = str.match(/\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}(?::\d{2})?/);
  if (isoMatch) return isoMatch[0].replace("T", " ");
  return str;
};

// Canonical key for name deduplication: sort words so "John Doe" === "Doe John"
const wordSortKey = (s) => String(s ?? "").trim().toLowerCase().split(/\s+/).sort().join(" ");

// Date columns that should use a date picker in edit mode
const OLD_RFQ_DATE_COLUMNS = new Set(["sop", "date_of_approval", "expected_date_of_answer", "calculated_date"]);
const SUBITEM_DATE_COLUMNS = new Set(["created", "modified"]);

// Convert any stored date string to YYYY-MM-DD for <input type="date">
const toDateInputValue = (val) => {
  if (!val) return "";
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
};

const extractHrefFromHtml = (htmlStr) => {
  if (!htmlStr || typeof htmlStr !== "string") return null;
  const match = htmlStr.match(/href=["']([^"']+)["']/i);
  return match ? match[1] : null;
};

const NoteCell = ({ value }) => {
  const href = extractHrefFromHtml(value);
  if (!href) return <TruncatedCell value={value} />;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="history-note-link-btn"
    >
      ↗ Link
    </a>
  );
};

const OLD_NEW_OPTIONS = ["Old", "New"];

const PRODUCT_TESTING_OPTIONS = ["On going", "NOK", "OK"];

const TYPE_BUSINESS_OPTIONS = ["Base Business", "Business increase", "New business", "Carry over"];

const IMPORTANCE_OPTIONS = ["Must take", "High", "Normal"];

const SECTOR_OPTIONS = ["Automotive", "Non Automotive", "Power Tools & consumers", "Industry"];

const VOLUME_PROFILE_OPTIONS = ["Normal", "Base business", "Fast", "Slow"];

const INTEGRATION_OPTIONS = ["Integrated", "Delete"];

const QUOTE_TYPE_OPTIONS = ["RFQ", "RFI"];

const PRODUCT_LINE_LABELS_OPTIONS = ["Assembly", "Friction", "Injection", "Brushes", "Chockes", "Seals"];

const DELIVERY_TO_OPTIONS = ["Assembly plant", "Final Customer"];

const APPLICATION_OPTIONS = [
  "Electronics",
  "Electric pumps",
  "Dynamic Sealing",
  "Micro-Motors",
  "Traction",
  "FHP and others",
  "Comfort and auxiliary motors",
];

const ApplicationEditCell = ({ value, onChange }) => {
  const isStandard = APPLICATION_OPTIONS.includes(value ?? "");
  const [othersMode, setOthersMode] = useState(
    !isStandard && (value ?? "") !== ""
  );

  if (othersMode) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <input
          type="text"
          className="history-inline-edit-input"
          placeholder="Type custom value..."
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          title="Back to list"
          style={{ flexShrink: 0, fontSize: "12px", color: "#64748b", background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}
          onClick={() => { setOthersMode(false); onChange(""); }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <SearchableSelectField
      value={value ?? ""}
      onChange={(e) => {
        if (e.target.value === "__others__") {
          setOthersMode(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
      options={[...APPLICATION_OPTIONS, { value: "__others__", label: "Others" }]}
      placeholder="— select —"
      portal
      menuWidth="content"
      optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
      buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
      valueClassName="truncate text-inherit text-[13px]"
      chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
    />
  );
};

const SelectWithOthersCell = ({ value, onChange, options, searchable, searchPlaceholder }) => {
  const isStandard = options.includes(value ?? "");
  const [othersMode, setOthersMode] = useState(
    !isStandard && (value ?? "") !== ""
  );

  if (othersMode) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <input
          type="text"
          className="history-inline-edit-input"
          placeholder="Type custom value..."
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          title="Back to list"
          style={{ flexShrink: 0, fontSize: "12px", color: "#64748b", background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}
          onClick={() => { setOthersMode(false); onChange(""); }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <SearchableSelectField
      value={value ?? ""}
      onChange={(e) => {
        if (e.target.value === "__others__") {
          setOthersMode(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
      options={[...options, { value: "__others__", label: "Others" }]}
      placeholder="— select —"
      searchable={searchable}
      searchPlaceholder={searchPlaceholder}
      portal
      menuWidth="content"
      optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
      buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
      valueClassName="truncate text-inherit text-[13px]"
      chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
    />
  );
};

const KamEditCell = ({ value, onChange, options }) => {
  const [inputValue, setInputValue] = useState(value ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [portalPos, setPortalPos] = useState(null);
  const inputRef = useRef(null);
  const portalRef = useRef(null);

  useEffect(() => {
    setInputValue(value ?? "");
  }, [value]);

  const term = inputValue.trim().toLowerCase();
  const filtered = term ? options.filter((o) => o.toLowerCase().includes(term)) : options;

  const openDropdown = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setPortalPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const closeDropdown = () => {
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e) => {
      if (
        inputRef.current && !inputRef.current.contains(e.target) &&
        portalRef.current && !portalRef.current.contains(e.target)
      ) {
        closeDropdown();
      }
    };
    const handleScroll = (e) => {
      if (portalRef.current && portalRef.current.contains(e.target)) return;
      closeDropdown();
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", closeDropdown);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", closeDropdown);
    };
  }, [isOpen]);

  const handleSelect = (opt) => {
    setInputValue(opt);
    onChange(opt);
    closeDropdown();
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) { openDropdown(); return; }
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (isOpen && highlightedIndex >= 0 && filtered[highlightedIndex]) {
        e.preventDefault();
        handleSelect(filtered[highlightedIndex]);
      } else {
        closeDropdown();
      }
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        type="text"
        className="history-inline-edit-input"
        style={{ paddingRight: "22px" }}
        value={inputValue}
        onFocus={openDropdown}
        onClick={openDropdown}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(e.target.value);
          if (!isOpen) openDropdown();
          else setHighlightedIndex(-1);
        }}
        onKeyDown={handleKeyDown}
      />
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#64748b"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
      {isOpen && portalPos && createPortal(
        <div
          ref={portalRef}
          className="kam-combobox-portal"
          style={{ top: `${portalPos.top}px`, left: `${portalPos.left}px`, width: `${portalPos.width}px` }}
        >
          {filtered.length > 0 ? (
            filtered.map((opt, idx) => (
              <div
                key={opt}
                className={`kam-combobox-item${idx === highlightedIndex ? " kam-combobox-item--active" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                onMouseEnter={() => setHighlightedIndex(idx)}
              >
                {opt}
              </div>
            ))
          ) : (
            <div className="kam-combobox-empty">Aucune correspondance — valeur libre conservée</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

const FINAL_DELIVERY_OPTIONS = [
  "Asie",
  "Europe",
  "Korea/Japan",
  "South America",
  "India",
  "North America",
  "Africa",
];

const PLANT_OPTIONS = [
  "Tunisia",
  "Poitiers",
  "Amiens",
  "Frankfurt",
  "Monterrey",
  "Chennai",
  "Kunshan",
  "Tianjin",
  "Daegu",
  "All Plants",
];

const QUOTATION_CURRENCY_OPTIONS = ["EUR", "USD", "GBP", "CNY", "MXN", "JPL", "BRL", "INR", "RMB"];

const PROJECT_CONDITION_OPTIONS = [
  "1 On boarding",
  "2 RFI",
  "3 Prototyping",
  "4 RFQ",
  "5 Costing",
  "6 Generate Offer",
  "7 Negociation",
  "8 PO Signed",
  "9 LOST",
  "10 APQP Process",
  "11 In production",
  "12 On Hold",
  "Base Line",
];

const HISTORY_BADGE_COLUMNS = new Set(["old_new", "sector", "type_business", "quote_type", "importance", "volume_profile", "project_condition", "approval_status"]);

const getHistoryBadgeClass = (columnName, value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "-") return null;

  if (columnName === "old_new") {
    if (normalized.includes("new")) return "badge border-green-300 bg-green-50 text-green-700";
    if (normalized.includes("old")) return "badge border-amber-300 bg-amber-50 text-amber-700";
    return "badge border-slate-300 bg-slate-100 text-slate-600";
  }

  if (columnName === "sector") {
    if (normalized.includes("non")) return "badge whitespace-nowrap border-orange-300 bg-orange-50 text-orange-600";
    return "badge whitespace-nowrap border-tide/30 bg-tide/10 text-tide";
  }

  if (columnName === "type_business") {
    if (normalized.includes("new")) return "badge border-green-300 bg-green-50 text-green-700";
    if (normalized.includes("replacement")) return "badge border-rose-300 bg-rose-50 text-rose-600";
    if (normalized.includes("serial")) return "badge border-sky-300 bg-sky-50 text-sky-600";
    return "badge border-slate-300 bg-slate-100 text-slate-600";
  }

  if (columnName === "quote_type") {
    if (normalized === "rfi") return "badge border-coral/30 bg-coral/10 text-coral";
    if (normalized === "potential") return "badge border-sun/40 bg-sun/15 text-sun";
    if (normalized === "rfq") return "badge border-tide/30 bg-tide/10 text-tide";
    return "badge border-slate-300 bg-slate-100 text-slate-600";
  }

  if (columnName === "importance") {
    if (normalized.includes("high") || normalized.includes("critical") || normalized.includes("urgent")) return "badge border-rose-300 bg-rose-50 text-rose-600";
    if (normalized.includes("medium") || normalized.includes("normal") || normalized.includes("moderate")) return "badge border-sun/40 bg-sun/15 text-sun";
    if (normalized.includes("low") || normalized.includes("minor")) return "badge border-green-300 bg-green-50 text-green-700";
    return "badge border-slate-300 bg-slate-100 text-slate-600";
  }

  if (columnName === "volume_profile") {
    if (normalized.includes("high") || normalized.includes("large") || normalized.includes("grow")) return "badge border-green-300 bg-green-50 text-green-700";
    if (normalized.includes("medium") || normalized.includes("mid") || normalized.includes("stable")) return "badge border-sun/40 bg-sun/15 text-sun";
    if (normalized.includes("low") || normalized.includes("small") || normalized.includes("declin")) return "badge border-rose-300 bg-rose-50 text-rose-600";
    return "badge border-slate-300 bg-slate-100 text-slate-600";
  }

  if (columnName === "approval_status") {
    if (normalized.includes("approved") || normalized.includes("accepted")) return "badge border-green-300 bg-green-50 text-green-700";
    if (normalized.includes("rejected") || normalized.includes("declined") || normalized.includes("refused")) return "badge border-rose-300 bg-rose-50 text-rose-600";
    if (normalized.includes("pending") || normalized.includes("waiting") || normalized.includes("in review") || normalized.includes("review")) return "badge border-sun/40 bg-sun/15 text-sun";
    if (normalized.includes("cancelled") || normalized.includes("canceled")) return "badge border-slate-300 bg-slate-100 text-slate-600";
    if (normalized.includes("on hold") || normalized.includes("hold")) return "badge border-amber-300 bg-amber-50 text-amber-700";
    return "badge border-slate-300 bg-slate-100 text-slate-600";
  }

  if (columnName === "project_condition") {
    if (normalized.includes("on boarding") || normalized.includes("onboarding")) return "badge border-tide/30 bg-tide/10 text-tide";
    if (normalized.includes("2 rfi") || normalized === "rfi") return "badge border-coral/30 bg-coral/10 text-coral";
    if (normalized.includes("prototyping")) return "badge border-violet-300 bg-violet-50 text-violet-600";
    if (normalized.includes("4 rfq") || normalized === "rfq") return "badge border-sky-300 bg-sky-50 text-sky-600";
    if (normalized.includes("costing")) return "badge border-sun/40 bg-sun/15 text-sun";
    if (normalized.includes("generate offer") || normalized.includes("offer")) return "badge border-mint/40 bg-mint/15 text-mint";
    if (normalized.includes("negociation") || normalized.includes("negotiation")) return "badge border-indigo-300 bg-indigo-50 text-indigo-600";
    if (normalized.includes("po signed")) return "badge border-green-300 bg-green-50 text-green-700";
    if (normalized.includes("lost")) return "badge border-slate-300 bg-slate-100 text-slate-600";
    if (normalized.includes("apqp")) return "badge border-orange-300 bg-orange-50 text-orange-600";
    if (normalized.includes("in production")) return "badge border-emerald-200 bg-emerald-50 text-emerald-700";
    if (normalized.includes("on hold")) return "badge border-amber-300 bg-amber-50 text-amber-700";
    if (normalized.includes("base line") || normalized.includes("baseline")) return "badge border-rose-300 bg-rose-50 text-rose-600";
    return "badge border-slate-300 bg-slate-100 text-slate-600";
  }

  if (columnName === "plant") {
    if (normalized.includes("tunisia"))    return "badge border-tide/30 bg-tide/10 text-tide";
    if (normalized.includes("poitiers"))   return "badge border-coral/30 bg-coral/10 text-coral";
    if (normalized.includes("amiens"))     return "badge border-violet-300 bg-violet-50 text-violet-600";
    if (normalized.includes("frankfurt"))  return "badge border-sky-300 bg-sky-50 text-sky-600";
    if (normalized.includes("monterrey"))  return "badge border-sun/40 bg-sun/15 text-sun";
    if (normalized.includes("chennai"))    return "badge border-mint/40 bg-mint/15 text-mint";
    if (normalized.includes("kunshan"))    return "badge border-indigo-300 bg-indigo-50 text-indigo-600";
    if (normalized.includes("tianjin"))    return "badge border-rose-300 bg-rose-50 text-rose-600";
    if (normalized.includes("daegu"))      return "badge border-emerald-300 bg-emerald-50 text-emerald-700";
    if (normalized.includes("all plants")) return "badge border-slate-400 bg-slate-200 text-slate-700";
    return "badge border-slate-300 bg-slate-100 text-slate-600";
  }

  return "badge border-slate-300 bg-slate-100 text-slate-600";
};

const HistoryValueBadge = ({ columnName, value }) => {
  const displayValue =
    value === null || value === undefined || String(value).trim() === ""
      ? "-"
      : String(value);
  const badgeClass = getHistoryBadgeClass(columnName, displayValue);
  if (!badgeClass) return <span className="text-slate-400">-</span>;
  return <span className={badgeClass}>{displayValue}</span>;
};

export default function Dashboard() {
  const { showToast } = useToast();
  const { role } = getUserProfile();
  const canSeeTeamView = hasRole("ZONE_MANAGER");
  const isOwner = hasRole("OWNER");

  const [rfqs, setRfqs] = useState([]);
  const [viewMode, setViewMode] = useState("detailed");
  const [activeStatus, setActiveStatus] = useState("RFQ");
  const [activeSubStatus, setActiveSubStatus] = useState("all");
  const [activeTypeFilter, setActiveTypeFilter] = useState("all");
  const [globalPhaseFilter, setGlobalPhaseFilter] = useState("all");
  const [teamKamFilter, setTeamKamFilter] = useState("all");
  const [teamPersonFilter, setTeamPersonFilter] = useState("all");
  const [detailedSectorFilter, setDetailedSectorFilter] = useState("all");
  const [globalSectorFilter, setGlobalSectorFilter] = useState("all");
  const [teamSectorFilter, setTeamSectorFilter] = useState("all");
  const [selectedDetailedProductLine, setSelectedDetailedProductLine] = useState("ALL");
  const [selectedGlobalProductLine, setSelectedGlobalProductLine] = useState("ALL");
  const [selectedTeamProductLine, setSelectedTeamProductLine] = useState("ALL");
  const [oldRfqs, setOldRfqs] = useState([]);
  const [oldRfqProjectColumns, setOldRfqProjectColumns] = useState([]);
  const [oldRfqSubitemColumns, setOldRfqSubitemColumns] = useState([]);
  const [oldRfqsLoading, setOldRfqsLoading] = useState(false);
  const [oldRfqsError, setOldRfqsError] = useState("");
  const [editingOldRfqId, setEditingOldRfqId] = useState(null);
  const [editingOldRfqData, setEditingOldRfqData] = useState({});
  const [savingOldRfqId, setSavingOldRfqId] = useState(null);
  const [isEditingAllRows, setIsEditingAllRows] = useState(false);
  const [editingAllRowsData, setEditingAllRowsData] = useState({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [subitemGlobalEditMode, setSubitemGlobalEditMode] = useState(false);
  const [subitemGlobalEditData, setSubitemGlobalEditData] = useState({});
  const [savingSubitemsGlobal, setSavingSubitemsGlobal] = useState(false);
  const [fillDrag, setFillDrag] = useState(null);
  const [focusedFillCell, setFocusedFillCell] = useState(null);
  const [deletingOldRfqId, setDeletingOldRfqId] = useState(null);
  const [deletingSubitemId, setDeletingSubitemId] = useState(null);
  const [deleteRowConfirm, setDeleteRowConfirm] = useState(null);
  const [deleteSubitemConfirm, setDeleteSubitemConfirm] = useState(null);
  const [oldSearchTerm, setOldSearchTerm] = useState("");
  const [oldCustomerFilter, setOldCustomerFilter] = useState("");
  const [oldKamFilter, setOldKamFilter] = useState("");
  const [oldSectorFilter, setOldSectorFilter] = useState("");
  const [oldApplicationFilter, setOldApplicationFilter] = useState("");
  const [oldBusinessTypeFilter, setOldBusinessTypeFilter] = useState("");
  const [oldStatusFilter, setOldStatusFilter] = useState("");
  const [selectedOldProject, setSelectedOldProject] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [commercialUsers, setCommercialUsers] = useState([]);
  const [customerDbNames, setCustomerDbNames] = useState([]);
  const [costingUsers, setCostingUsers] = useState([]);
  const [rndUsers, setRndUsers] = useState([]);
  const [teamData, setTeamData] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [marketSegment, setMarketSegment] = useState(null);
  const [marketData, setMarketData] = useState([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketTypeFilter, setMarketTypeFilter] = useState("all");
  const [marketStatusFilter, setMarketStatusFilter] = useState("all");
  const [marketKamFilter, setMarketKamFilter] = useState("");
  const viewOptions = [
    ...BASE_VIEW_OPTIONS,
    ...(canSeeTeamView ? [{ key: "team", label: "Team View" }] : []),
    ...(marketSegment ? [{ key: "market", label: "Market View" }] : []),
    HISTORY_VIEW_OPTION
  ];
  const [searchTerm, setSearchTerm] = useState("");
  const [mobileViewMenuOpen, setMobileViewMenuOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [hiddenProjectColumns, setHiddenProjectColumns] = useState(new Set());
  const [showProjectColsMenu, setShowProjectColsMenu] = useState(false);
  const [hiddenSubitemColumns, setHiddenSubitemColumns] = useState(new Set());
  const [showSubitemColsMenu, setShowSubitemColsMenu] = useState(false);
  const [compactedProjectColumns, setCompactedProjectColumns] = useState(new Set());
  const [compactedSubitemColumns, setCompactedSubitemColumns] = useState(new Set());
  const projectColsMenuRef = useRef(null);
  const subitemColsMenuRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await listRfqs();
        if (Array.isArray(data)) {
          setRfqs(data.map(mapRfqToRow));
        } else {
          setRfqs([]);
        }
      } catch (error) {
        setRfqs([]);
        showToast("Unable to load requests. Please refresh.", {
          type: "error",
          title: "Loading failed"
        });
      }
    };

    load();
  }, [showToast]);

  useEffect(() => {
    if (!canSeeTeamView) return;
    const load = async () => {
      setTeamLoading(true);
      try {
        const data = await getTeamView();
        setTeamData(Array.isArray(data) ? data.map(mapRfqToRow) : []);
      } catch {
        setTeamData([]);
        showToast("Unable to load team data. Please refresh.", {
          type: "error",
          title: "Team data unavailable"
        });
      } finally {
        setTeamLoading(false);
      }
    };
    load();
  }, [canSeeTeamView, showToast]);

  // Load team members for Zone Manager's Team View Person filter
  useEffect(() => {
    if (!canSeeTeamView) return;
    getTeamMembers()
      .then((data) => setTeamMembers(Array.isArray(data) ? data : []))
      .catch(() => setTeamMembers([]));
  }, [canSeeTeamView]);

  // Determine whether the current user has a market segment (automotive /
  // industry / large accounts) — controls whether the Market View tab shows.
  useEffect(() => {
    getMarketViewSegment()
      .then((data) => setMarketSegment(data?.segment || null))
      .catch(() => setMarketSegment(null));
  }, []);

  useEffect(() => {
    if (!marketSegment) return;
    const load = async () => {
      setMarketLoading(true);
      try {
        const data = await getMarketView();
        setMarketData(Array.isArray(data) ? data.map(mapRfqToRow) : []);
      } catch {
        setMarketData([]);
        showToast("Unable to load market data. Please refresh.", {
          type: "error",
          title: "Market data unavailable"
        });
      } finally {
        setMarketLoading(false);
      }
    };
    load();
  }, [marketSegment, showToast]);

  // Load commercial names from v_sales_organisation (KPI_DB_Final) for KAM dropdown
  useEffect(() => {
    getKamOptions()
      .then((data) => {
        const names = Array.isArray(data?.names) ? data.names.filter(Boolean) : [];
        setCommercialUsers(names);
      })
      .catch(() => setCommercialUsers([]));
  }, []);

  // Load customer names from v_sales_customer_directory (KPI_DB_Final) for Customer dropdown
  useEffect(() => {
    getCustomerOptions()
      .then((data) => {
        const names = Array.isArray(data?.names) ? data.names.filter(Boolean) : [];
        setCustomerDbNames(names);
      })
      .catch(() => setCustomerDbNames([]));
  }, []);

  // Load costing team users for Costing Leader dropdown (best-effort)
  useEffect(() => {
    if (!isOwner) return;
    listAllUsers()
      .then((users) => {
        const names = (Array.isArray(users) ? users : [])
          .filter((u) => {
            const roles = Array.isArray(u.roles) ? u.roles : [u.role];
            return roles.some((r) => String(r).toUpperCase().includes("COSTING_TEAM"));
          })
          .map((u) => u.full_name || u.email)
          .filter(Boolean);
        setCostingUsers(names);
      })
      .catch(() => setCostingUsers([]));
  }, [isOwner]);

  // Load R&D users for Feasibility Leader dropdown (best-effort)
  useEffect(() => {
    if (!isOwner) return;
    listAllUsers()
      .then((users) => {
        const names = (Array.isArray(users) ? users : [])
          .filter((u) => {
            const roles = Array.isArray(u.roles) ? u.roles : [u.role];
            return roles.some((r) => String(r).toUpperCase() === "RND");
          })
          .map((u) => u.full_name || u.email)
          .filter(Boolean);
        setRndUsers(names);
      })
      .catch(() => setRndUsers([]));
  }, [isOwner]);

  useEffect(() => {
    const load = async () => {
      setOldRfqsLoading(true);
      setOldRfqsError("");
      try {
        const data = await getOldRfqs();
        setOldRfqs(Array.isArray(data?.items) ? data.items : []);
        setOldRfqProjectColumns(
          buildOrderedOldRfqProjectColumns(
            Array.isArray(data?.project_columns) ? data.project_columns : []
          )
        );
        setOldRfqSubitemColumns(
          buildOrderedOldRfqSubitemColumns(
            Array.isArray(data?.subitem_columns) ? data.subitem_columns : []
          )
        );
      } catch {
        setOldRfqs([]);
        setOldRfqProjectColumns([]);
        setOldRfqSubitemColumns([]);
        setOldRfqsError("Unable to load historical data. Please refresh.");
      } finally {
        setOldRfqsLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedOldProject) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedOldProject(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedOldProject]);

  useEffect(() => {
    if (!showProjectColsMenu) return undefined;
    const handle = (e) => {
      if (projectColsMenuRef.current && !projectColsMenuRef.current.contains(e.target)) {
        setShowProjectColsMenu(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showProjectColsMenu]);

  useEffect(() => {
    if (!showSubitemColsMenu) return undefined;
    const handle = (e) => {
      if (subitemColsMenuRef.current && !subitemColsMenuRef.current.contains(e.target)) {
        setShowSubitemColsMenu(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showSubitemColsMenu]);

  useEffect(() => {
    if (viewMode !== "history") {
      setSelectedOldProject(null);
    }
  }, [viewMode]);

  const rfqsWithPhase = useMemo(
    () => rfqs.map((rfq) => ({ ...rfq, phaseKey: resolvePhaseKey(rfq) })),
    [rfqs]
  );

  const detailedRfqs = useMemo(
    () =>
      rfqsWithPhase
        .map((rfq) => ({ ...rfq, status: normalizeStatus(rfq.status) }))
        .filter((rfq) => rfq.status),
    [rfqsWithPhase]
  );

  const typeFilteredGlobalRfqs = useMemo(
    () =>
      rfqsWithPhase.filter(
        (rfq) => activeTypeFilter === "all" || rfq.documentType === activeTypeFilter
      ),
    [activeTypeFilter, rfqsWithPhase]
  );

  const activePhase = PHASES.find((phase) => phase.key === activeStatus) || PHASES[0];
  const activeStatusIndex = Math.max(phaseKeys.indexOf(activePhase.key), 0);
  const subStatusOptions = activePhase.statuses;
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const detailedTypeFilterOptions = useMemo(
    () => getTypeOptionsForPhase(activePhase.key),
    [activePhase.key]
  );
  const detailedTypeFilterKeys = useMemo(
    () => new Set(detailedTypeFilterOptions.map((option) => option.key)),
    [detailedTypeFilterOptions]
  );
  const effectiveDetailedTypeFilter =
    detailedTypeFilterKeys.has(activeTypeFilter) ? activeTypeFilter : "all";
  const showDetailedTypeFilter = detailedTypeFilterOptions.length > 0;

  const filteredDetailedRfqs = useMemo(
    () =>
      detailedRfqs.filter((rfq) => {
        if (
          effectiveDetailedTypeFilter !== "all" &&
          rfq.documentType !== effectiveDetailedTypeFilter
        ) {
          return false;
        }
        if (detailedSectorFilter !== "all" && normalizeSector(rfq.sector) !== detailedSectorFilter) return false;
        const isTerminal = rfq.status === "Cancelled" || rfq.status === "Lost";
        if (isTerminal) {
          if (rfq.phaseKey !== activePhase.key) return false;
        } else if (!activePhase.statuses.includes(rfq.status)) {
          return false;
        }

        if (activeSubStatus !== "all" && rfq.status !== activeSubStatus) return false;
        if (!normalizedSearchTerm) return true;
        return buildSearchHaystack(rfq).includes(normalizedSearchTerm);
      }),
    [
      activePhase,
      activeSubStatus,
      detailedRfqs,
      detailedSectorFilter,
      effectiveDetailedTypeFilter,
      normalizedSearchTerm
    ]
  );

  const filteredGlobalRfqs = useMemo(
    () =>
      typeFilteredGlobalRfqs.filter((rfq) => {
        if (globalPhaseFilter !== "all" && rfq.phaseKey !== globalPhaseFilter) return false;
        if (globalSectorFilter !== "all" && normalizeSector(rfq.sector) !== globalSectorFilter) return false;
        if (!normalizedSearchTerm) return true;
        return buildSearchHaystack(rfq).includes(normalizedSearchTerm);
      }),
    [globalPhaseFilter, globalSectorFilter, normalizedSearchTerm, typeFilteredGlobalRfqs]
  );

  const filteredTeamData = useMemo(
    () =>
      teamData.filter((rfq) => {
        if (
          teamPersonFilter !== "all" &&
          (rfq.creatorEmail || "").toLowerCase() !== teamPersonFilter.toLowerCase()
        ) {
          return false;
        }
        if (teamSectorFilter !== "all" && normalizeSector(rfq.sector) !== teamSectorFilter) return false;
        if (!normalizedSearchTerm) return true;
        return buildSearchHaystack(rfq).includes(normalizedSearchTerm);
      }),
    [teamData, teamPersonFilter, teamSectorFilter, normalizedSearchTerm]
  );

  const filteredMarketData = useMemo(
    () =>
      marketData.filter((rfq) => {
        if (marketTypeFilter !== "all" && rfq.documentType !== marketTypeFilter) return false;
        if (marketStatusFilter !== "all" && normalizeStatus(rfq.status) !== marketStatusFilter) return false;
        if (marketKamFilter && wordSortKey(rfq.creator) !== wordSortKey(marketKamFilter)) return false;
        if (!normalizedSearchTerm) return true;
        return buildSearchHaystack(rfq).includes(normalizedSearchTerm);
      }),
    [marketData, marketTypeFilter, marketStatusFilter, marketKamFilter, normalizedSearchTerm]
  );

  const oldRfqProjects = useMemo(
    () => (Array.isArray(oldRfqs) ? oldRfqs : []).map((project, index) => ({
      ...project,
      historyKey: String(project.old_rfq_id ?? project.name ?? `old-rfq-${index}`),
      subitems: Array.isArray(project.subitems) ? project.subitems : [],
      subitems_count: project.subitems_count ?? (Array.isArray(project.subitems) ? project.subitems.length : 0),
    })),
    [oldRfqs]
  );

  const visibleProjectColumns = useMemo(
    () => oldRfqProjectColumns.filter((col) => !hiddenProjectColumns.has(col)),
    [oldRfqProjectColumns, hiddenProjectColumns]
  );

  const visibleSubitemColumns = useMemo(
    () => oldRfqSubitemColumns.filter((col) => !hiddenSubitemColumns.has(col)),
    [oldRfqSubitemColumns, hiddenSubitemColumns]
  );

  const subitemRowIds = useMemo(
    () => (selectedOldProject?.subitems || []).map((s) => s.old_rfq_subitem_id),
    [selectedOldProject]
  );

  const toggleProjectColumn = (col) => {
    setHiddenProjectColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  const toggleSubitemColumn = (col) => {
    setHiddenSubitemColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  const toggleCompactProjectColumn = (col) => {
    setCompactedProjectColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  const toggleCompactSubitemColumn = (col) => {
    setCompactedSubitemColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  const filterOldOpts = (vals) => {
    const seen = new Map();
    vals.forEach((v) => {
      if (v === null || v === undefined) return;
      const s = String(v).trim();
      if (s === "" || s === "-" || s.toLowerCase() === "empty") return;
      const key = wordSortKey(s);
      if (!seen.has(key)) seen.set(key, s);
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  };

  const oldCustomerOptions = useMemo(
    () => filterOldOpts(oldRfqProjects.map((p) => p.customers)),
    [oldRfqProjects]
  );
  const oldKamOptions = useMemo(
    () => filterOldOpts(oldRfqProjects.map((p) => p.kam)),
    [oldRfqProjects]
  );
  const marketKamOptions = useMemo(
    () => filterOldOpts(marketData.map((rfq) => rfq.creator)),
    [marketData]
  );
  // KAM edit options: prefer commercial users from API, fall back to unique KAMs from data
  const kamEditOptions = useMemo(
    () => commercialUsers.length > 0 ? commercialUsers : oldKamOptions,
    [commercialUsers, oldKamOptions]
  );
  // Customer edit options: prefer DB names, fall back to unique customers from data
  const customerEditOptions = useMemo(
    () => customerDbNames.length > 0 ? customerDbNames : filterOldOpts(oldRfqProjects.map((p) => p.customers)),
    [customerDbNames, oldRfqProjects]
  );
  // Costing Leader edit options: prefer costing team users from API, fall back to unique values from data
  const costingLeaderOptions = useMemo(
    () => costingUsers.length > 0 ? costingUsers : filterOldOpts(oldRfqProjects.map((p) => p.costing_leader)),
    [costingUsers, oldRfqProjects]
  );
  // Feasibility Leader edit options: prefer R&D users from API, fall back to unique values from data
  const feasibilityLeaderOptions = useMemo(
    () => rndUsers.length > 0 ? rndUsers : filterOldOpts(oldRfqProjects.map((p) => p.feasibility_leader)),
    [rndUsers, oldRfqProjects]
  );
  const oldSectorOptions = useMemo(
    () => filterOldOpts(oldRfqProjects.map((p) => p.sector)),
    [oldRfqProjects]
  );
  const oldApplicationOptions = useMemo(
    () => filterOldOpts(oldRfqProjects.map((p) => p.application)),
    [oldRfqProjects]
  );
  const oldBusinessTypeOptions = useMemo(
    () => filterOldOpts(oldRfqProjects.map((p) => p.type_business)),
    [oldRfqProjects]
  );
  const oldStatusOptions = useMemo(
    () => filterOldOpts(oldRfqProjects.map((p) => p.project_condition)),
    [oldRfqProjects]
  );

  const filteredOldRfqs = useMemo(() => {
    const search = oldSearchTerm.trim().toLowerCase();

    return oldRfqProjects.filter((project) => {
      if (oldCustomerFilter && wordSortKey(project.customers) !== wordSortKey(oldCustomerFilter)) return false;
      if (oldKamFilter && wordSortKey(project.kam) !== wordSortKey(oldKamFilter)) return false;
      if (oldSectorFilter && wordSortKey(project.sector) !== wordSortKey(oldSectorFilter)) return false;
      if (oldApplicationFilter && wordSortKey(project.application) !== wordSortKey(oldApplicationFilter)) return false;
      if (oldBusinessTypeFilter && wordSortKey(project.type_business) !== wordSortKey(oldBusinessTypeFilter)) return false;
      if (oldStatusFilter && wordSortKey(project.project_condition) !== wordSortKey(oldStatusFilter)) return false;
      if (!search) return true;
      const projectText = Object.values(project)
        .filter((v) => v !== null && v !== undefined && !Array.isArray(v) && typeof v !== "object")
        .join(" ")
        .toLowerCase();
      const subitemsText = (project.subitems || [])
        .map((s) => Object.values(s).filter(Boolean).join(" "))
        .join(" ")
        .toLowerCase();
      return projectText.includes(search) || subitemsText.includes(search);
    });
  }, [
    oldApplicationFilter,
    oldBusinessTypeFilter,
    oldCustomerFilter,
    oldKamFilter,
    oldRfqProjects,
    oldSearchTerm,
    oldSectorFilter,
    oldStatusFilter
  ]);

  const handleOpenSubitemsModal = (project) => {
    setSelectedOldProject(project);
  };

  const handleCloseSubitemsModal = () => {
    setSelectedOldProject(null);
  };

  const NON_EDITABLE_OLD_RFQ_COLUMNS = new Set(["old_rfq_id", "excel_row_number", "subitems_count"]);

  const isOldRfqColumnEditable = (columnName) => !NON_EDITABLE_OLD_RFQ_COLUMNS.has(columnName);

  const NON_EDITABLE_SUBITEM_COLUMNS = new Set(["old_rfq_subitem_id", "old_rfq_id", "excel_row_number", "subitem_order", "parent_id"]);

  const isSubitemColumnEditable = (columnName) => !NON_EDITABLE_SUBITEM_COLUMNS.has(columnName);

  const handleStartSubitemGlobalEdit = () => {
    const data = {};
    (selectedOldProject?.subitems || []).forEach((s) => {
      data[s.old_rfq_subitem_id] = { ...s };
    });
    setSubitemGlobalEditData(data);
    setSubitemGlobalEditMode(true);
  };

  const handleSubitemGlobalFieldChange = (subitemId, colName, val) => {
    setSubitemGlobalEditData((prev) => ({
      ...prev,
      [subitemId]: { ...(prev[subitemId] || {}), [colName]: val },
    }));
  };

  const handleCancelSubitemsGlobal = () => {
    setSubitemGlobalEditMode(false);
    setSubitemGlobalEditData({});
  };

  const handleSaveSubitemsGlobal = async () => {
    setSavingSubitemsGlobal(true);
    try {
      await Promise.all(
        (selectedOldProject?.subitems || []).map(async (subitem) => {
          const editData = subitemGlobalEditData[subitem.old_rfq_subitem_id];
          if (!editData) return;
          const payload = {};
          oldRfqSubitemColumns.forEach((col) => {
            if (isSubitemColumnEditable(col) && !QTY_YEAR_COLUMNS.includes(col)) {
              payload[col] = editData[col] ?? null;
            }
          });
          for (let n = 1; n <= 10; n++) {
            payload[`year${n}`] = editData[`year${n}`] ?? null;
            payload[`year${n}_value`] = editData[`year${n}_value`] ?? null;
          }
          const response = await updateOldRfqSubitem(subitem.old_rfq_subitem_id, payload);
          const updatedItem = response?.item || editData;
          setSelectedOldProject((prev) =>
            prev ? { ...prev, subitems: (prev.subitems || []).map((s) => s.old_rfq_subitem_id === subitem.old_rfq_subitem_id ? { ...s, ...updatedItem } : s) } : prev
          );
          setOldRfqs((prev) =>
            prev.map((p) =>
              p.old_rfq_id === selectedOldProject.old_rfq_id
                ? { ...p, subitems: (p.subitems || []).map((s) => s.old_rfq_subitem_id === subitem.old_rfq_subitem_id ? { ...s, ...updatedItem } : s) }
                : p
            )
          );
        })
      );
      setSubitemGlobalEditMode(false);
      setSubitemGlobalEditData({});
    } catch {
      showToast("error", "Failed to save subitems");
    } finally {
      setSavingSubitemsGlobal(false);
    }
  };

  const handleStartGlobalEdit = () => {
    const dataMap = {};
    oldRfqProjects.forEach((p) => { dataMap[p.old_rfq_id] = { ...p }; });
    setEditingAllRowsData(dataMap);
    setIsEditingAllRows(true);
  };

  const handleCancelGlobalEdit = () => {
    setIsEditingAllRows(false);
    setEditingAllRowsData({});
  };

  const handleGlobalEditFieldChange = (rfqId, columnName, value) => {
    setEditingAllRowsData((prev) => ({
      ...prev,
      [rfqId]: { ...(prev[rfqId] || {}), [columnName]: value },
    }));
  };

  const startFillDrag = (e, table, colName, sourceId, value, rowIds) => {
    e.preventDefault();
    e.stopPropagation();
    setFillDrag({ table, colName, sourceId, value, rowIds, hoverId: sourceId });
  };

  const handleFillDragEnter = (table, rowId) => {
    setFillDrag((prev) => (prev && prev.table === table ? { ...prev, hoverId: rowId } : prev));
  };

  const isCellInFillRange = (table, colName, rowId) => {
    if (!fillDrag || fillDrag.table !== table || fillDrag.colName !== colName) return false;
    const sourceIdx = fillDrag.rowIds.indexOf(fillDrag.sourceId);
    const hoverIdx = fillDrag.rowIds.indexOf(fillDrag.hoverId);
    const idx = fillDrag.rowIds.indexOf(rowId);
    if (sourceIdx === -1 || hoverIdx === -1 || idx === -1) return false;
    const start = Math.min(sourceIdx, hoverIdx);
    const end = Math.max(sourceIdx, hoverIdx);
    return idx >= start && idx <= end;
  };

  useEffect(() => {
    if (!fillDrag) return;
    const commitFillDrag = () => {
      setFillDrag((current) => {
        if (!current) return null;
        const { table, colName, sourceId, value, rowIds, hoverId } = current;
        const sourceIdx = rowIds.indexOf(sourceId);
        const hoverIdx = rowIds.indexOf(hoverId);
        if (sourceIdx !== -1 && hoverIdx !== -1) {
          const start = Math.min(sourceIdx, hoverIdx);
          const end = Math.max(sourceIdx, hoverIdx);
          for (let i = start; i <= end; i += 1) {
            const id = rowIds[i];
            if (id === sourceId) continue;
            if (table === "project") {
              handleGlobalEditFieldChange(id, colName, value);
            } else {
              handleSubitemGlobalFieldChange(id, colName, value);
            }
          }
        }
        return null;
      });
    };
    window.addEventListener("mouseup", commitFillDrag);
    return () => window.removeEventListener("mouseup", commitFillDrag);
  }, [fillDrag]);

  const handleSaveAllRows = async () => {
    setIsSavingAll(true);
    const originalById = {};
    oldRfqProjects.forEach((p) => { originalById[p.old_rfq_id] = p; });

    const modifiedIds = Object.keys(editingAllRowsData).filter((idStr) => {
      const id = Number(idStr);
      const original = originalById[id];
      const edited = editingAllRowsData[idStr];
      if (!original) return false;
      return oldRfqProjectColumns.some(
        (col) => isOldRfqColumnEditable(col) && String(edited[col] ?? "") !== String(original[col] ?? "")
      );
    });

    if (modifiedIds.length === 0) {
      setIsEditingAllRows(false);
      setEditingAllRowsData({});
      setIsSavingAll(false);
      showToast("No changes to save.", { type: "info", title: "No changes" });
      return;
    }

    let savedCount = 0;
    let errorCount = 0;
    for (const idStr of modifiedIds) {
      const id = Number(idStr);
      setSavingOldRfqId(id);
      try {
        const editData = editingAllRowsData[idStr];
        const payload = {};
        oldRfqProjectColumns.forEach((columnName) => {
          if (isOldRfqColumnEditable(columnName)) {
            payload[columnName] = editData[columnName] ?? null;
          }
        });
        const response = await updateOldRfq(id, payload);
        const updatedItem = response?.item || editData;
        setOldRfqs((prev) =>
          prev.map((p) => p.old_rfq_id === id ? { ...p, ...updatedItem } : p)
        );
        savedCount++;
      } catch {
        errorCount++;
      }
      setSavingOldRfqId(null);
    }

    setIsEditingAllRows(false);
    setEditingAllRowsData({});
    setIsSavingAll(false);
    if (errorCount === 0) {
      showToast(`${savedCount} row${savedCount > 1 ? "s" : ""} saved successfully.`, { type: "success", title: "Saved" });
    } else {
      showToast(`${savedCount} saved, ${errorCount} failed.`, { type: "error", title: "Partial save" });
    }
  };

  const handleDeleteOldRfqRow = (project) => {
    setDeleteRowConfirm({ rfqId: project.old_rfq_id, subitems_count: project.subitems?.length ?? 0 });
  };

  const handleConfirmDeleteRow = async () => {
    if (!deleteRowConfirm) return;
    const { rfqId } = deleteRowConfirm;
    setDeletingOldRfqId(rfqId);
    setDeleteRowConfirm(null);
    try {
      await deleteOldRfq(rfqId);
      setOldRfqs((prev) => prev.filter((p) => p.old_rfq_id !== rfqId));
      showToast("History row deleted.", { type: "success", title: "Deleted" });
    } catch {
      showToast("Unable to delete history row.", { type: "error", title: "Delete failed" });
    } finally {
      setDeletingOldRfqId(null);
    }
  };

  const handleDeleteSubitem = (subitemId, parentRfqId) => {
    setDeleteSubitemConfirm({ subitemId, parentRfqId });
  };

  const handleConfirmDeleteSubitem = async () => {
    if (!deleteSubitemConfirm) return;
    const { subitemId, parentRfqId } = deleteSubitemConfirm;
    setDeletingSubitemId(subitemId);
    setDeleteSubitemConfirm(null);
    try {
      await deleteOldRfqSubitem(subitemId);
      setSelectedOldProject((prev) =>
        prev
          ? { ...prev, subitems: (prev.subitems || []).filter((s) => s.old_rfq_subitem_id !== subitemId) }
          : prev
      );
      setOldRfqs((prev) =>
        prev.map((project) =>
          project.old_rfq_id === parentRfqId
            ? { ...project, subitems: (project.subitems || []).filter((s) => s.old_rfq_subitem_id !== subitemId) }
            : project
        )
      );
      showToast("Subitem deleted.", { type: "success", title: "Deleted" });
    } catch {
      showToast("Unable to delete subitem.", { type: "error", title: "Delete failed" });
    } finally {
      setDeletingSubitemId(null);
    }
  };

  const detailedProductLineOptions = useMemo(
    () => getAvailableProductLines(filteredDetailedRfqs),
    [filteredDetailedRfqs]
  );
  const globalProductLineOptions = useMemo(
    () => getAvailableProductLines(filteredGlobalRfqs),
    [filteredGlobalRfqs]
  );
  const teamProductLineOptions = useMemo(
    () => getAvailableProductLines(filteredTeamData),
    [filteredTeamData]
  );

  const shouldShowDetailedProductLineFilter = detailedProductLineOptions.length > 1;
  const shouldShowGlobalProductLineFilter = globalProductLineOptions.length > 1;
  const shouldShowTeamProductLineFilter = teamProductLineOptions.length > 1;

  const finalDetailedRfqs = useMemo(
    () => applyProductLineFilter(filteredDetailedRfqs, selectedDetailedProductLine),
    [filteredDetailedRfqs, selectedDetailedProductLine]
  );
  const finalGlobalRfqs = useMemo(
    () => applyProductLineFilter(filteredGlobalRfqs, selectedGlobalProductLine),
    [filteredGlobalRfqs, selectedGlobalProductLine]
  );
  const finalTeamData = useMemo(
    () => applyProductLineFilter(filteredTeamData, selectedTeamProductLine),
    [filteredTeamData, selectedTeamProductLine]
  );

  const activeRows =
    viewMode === "team"
      ? finalTeamData
      : viewMode === "market"
        ? filteredMarketData
        : viewMode === "global"
          ? finalGlobalRfqs
          : viewMode === "history"
            ? filteredOldRfqs
            : finalDetailedRfqs;
  const totalRows = activeRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalRows);

  const paginatedRfqs = useMemo(
    () => activeRows.slice(startIndex, endIndex),
    [activeRows, endIndex, startIndex]
  );

  const paginatedRfqRowIds = useMemo(
    () => paginatedRfqs.map((p) => p.old_rfq_id),
    [paginatedRfqs]
  );

  const pageItems = useMemo(
    () => buildPageItems(safePage, pageCount),
    [pageCount, safePage]
  );

  const startItem = totalRows === 0 ? 0 : startIndex + 1;
  const endItem = totalRows === 0 ? 0 : endIndex;
  useEffect(() => {
    setPage(1);
    setActiveSubStatus("all");
    setActiveTypeFilter("all");
  }, [activeStatus]);

  useEffect(() => {
    if (viewMode !== "detailed") {
      return;
    }
    if (activeTypeFilter !== "all" && !detailedTypeFilterKeys.has(activeTypeFilter)) {
      setActiveTypeFilter("all");
    }
  }, [activeTypeFilter, detailedTypeFilterKeys, viewMode]);

  useEffect(() => {
    setPage(1);
  }, [activeSubStatus, activeTypeFilter, detailedSectorFilter, globalPhaseFilter, globalSectorFilter, teamKamFilter, teamPersonFilter, teamSectorFilter, marketTypeFilter, marketStatusFilter, marketKamFilter, selectedDetailedProductLine, selectedGlobalProductLine, selectedTeamProductLine, rowsPerPage, searchTerm, viewMode, oldSearchTerm, oldCustomerFilter, oldKamFilter, oldSectorFilter, oldApplicationFilter, oldBusinessTypeFilter, oldStatusFilter]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  useEffect(() => {
    setRowsPerPage(viewMode === "history" ? HISTORY_DEFAULT_ROWS_PER_PAGE : DEFAULT_ROWS_PER_PAGE);
  }, [viewMode]);

  useEffect(() => {
    if (!canSeeTeamView && viewMode === "team") {
      setViewMode("detailed");
    }
  }, [canSeeTeamView, viewMode]);

  useEffect(() => {
    if (!marketSegment && viewMode === "market") {
      setViewMode("detailed");
    }
  }, [marketSegment, viewMode]);

  useEffect(() => {
    if (selectedDetailedProductLine !== "ALL" && !detailedProductLineOptions.includes(selectedDetailedProductLine)) {
      setSelectedDetailedProductLine("ALL");
    }
  }, [selectedDetailedProductLine, detailedProductLineOptions]);

  useEffect(() => {
    if (selectedGlobalProductLine !== "ALL" && !globalProductLineOptions.includes(selectedGlobalProductLine)) {
      setSelectedGlobalProductLine("ALL");
    }
  }, [selectedGlobalProductLine, globalProductLineOptions]);

  useEffect(() => {
    if (selectedTeamProductLine !== "ALL" && !teamProductLineOptions.includes(selectedTeamProductLine)) {
      setSelectedTeamProductLine("ALL");
    }
  }, [selectedTeamProductLine, teamProductLineOptions]);

  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(Number(event.target.value));
    setPage(1);
  };

  const tableFooter = (
    <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-slate-600">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-ink">
          {startItem}-{endItem}
        </span>
        <span className="text-slate-400">of</span>
        <span className="font-semibold text-ink">{totalRows}</span>
        <span className="ml-2 text-xs uppercase tracking-[0.3em] text-slate-400">
          Rows
        </span>
        <select
          className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-tide/30"
          value={rowsPerPage}
          onChange={handleRowsPerPageChange}
        >
          {ROWS_PER_PAGE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="outline-button px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={safePage === 1}
        >
          Prev
        </button>
        {pageItems.map((item, index) =>
          item === "..." ? (
            <span key={`ellipsis-${index}`} className="px-2 text-slate-400">
              ...
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => setPage(item)}
              className={[
                "inline-flex h-9 min-w-[36px] items-center justify-center rounded-xl border text-xs font-semibold transition",
                item === safePage
                  ? "text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              ].join(" ")}
              style={
                item === safePage
                  ? { borderColor: "#ef7807", backgroundColor: "#ef7807" }
                  : undefined
              }
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          className="outline-button px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
          disabled={safePage === pageCount}
        >
          Next
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <TopBar />

      <div className="px-1 py-4 sm:px-2 sm:py-6 md:px-3 md:py-9 xl:px-4 xl:py-10">
        <div className="w-full">
          <div className="app-shell rounded-[24px] border border-slate-200/70 p-3 shadow-card sm:rounded-[32px] sm:p-5 md:p-6 xl:p-7">
            <div className="flex flex-col gap-4 sm:gap-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-600 shadow-soft transition hover:bg-slate-100 sm:hidden"
                    onClick={() => setMobileViewMenuOpen(true)}
                    aria-label="Open view options"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                  <div className="hidden rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-soft sm:inline-flex">
                    {viewOptions.map((view) => {
                      const isActive = viewMode === view.key;
                      return (
                        <button
                          key={view.key}
                          type="button"
                          onClick={() => setViewMode(view.key)}
                          className={[
                            "rounded-xl px-4 py-2 text-sm font-semibold transition",
                            isActive
                              ? "text-white shadow-sm"
                              : "text-slate-600 hover:bg-slate-100"
                          ].join(" ")}
                          style={
                            isActive
                              ? { backgroundColor: "#ef7807" }
                              : undefined
                          }
                        >
                          {view.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to="/rfqs/new"
                    className="gradient-button rounded-xl px-3 py-2.5 text-xs font-semibold shadow-soft sm:px-4 sm:py-3 sm:text-sm"
                  >
                    + New request
                  </Link>
                </div>
              </div>

              {createPortal(
              <div
                className={`fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 sm:hidden ${
                  mobileViewMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                onClick={() => setMobileViewMenuOpen(false)}
                role="presentation"
              >
                <div
                  className={`flex h-full w-72 max-w-[82vw] flex-col gap-1 overflow-hidden rounded-r-[28px] border-r border-slate-200/70 bg-white p-3 shadow-card transition-transform duration-300 ${
                    mobileViewMenuOpen ? "translate-x-0" : "-translate-x-full"
                  }`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-gradient-to-r from-tide/10 to-mint/5 px-3 py-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-tide">
                        Views
                      </p>
                      <p className="font-display text-base text-ink">Switch view</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-tide/40 hover:text-tide"
                      onClick={() => setMobileViewMenuOpen(false)}
                      aria-label="Close view options"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="my-1 h-px bg-slate-200/70" />
                  <div className="flex flex-col gap-1.5 overflow-y-auto py-1">
                    {viewOptions.map((view, index) => {
                      const isActive = viewMode === view.key;
                      const Icon = MOBILE_VIEW_ICONS[view.key] || LayoutList;
                      const badgeClass =
                        MOBILE_VIEW_BADGE_STYLES[index % MOBILE_VIEW_BADGE_STYLES.length];
                      return (
                        <button
                          key={view.key}
                          type="button"
                          onClick={() => {
                            setViewMode(view.key);
                            setMobileViewMenuOpen(false);
                          }}
                          className={[
                            "group flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-xs font-semibold transition",
                            isActive ? "text-white shadow-sm" : "text-ink hover:bg-slate-100"
                          ].join(" ")}
                          style={isActive ? { backgroundColor: "#ef7807" } : undefined}
                        >
                          <span
                            className={[
                              "inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl transition",
                              isActive ? "bg-white/20 text-white" : badgeClass
                            ].join(" ")}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          {view.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>,
              document.body
              )}

              {viewMode === "detailed" ? (
                <>
                  <div className="card p-3 pt-4 dashboard-pipeline sm:p-5 sm:pt-6 xl:p-6 xl:pt-7">
                    <div className="pipeline-shell">
                      <div className="pipeline-bar">
                        {PHASES.map((phase, index) => {
                          const isActive = activeStatus === phase.key;
                          const isCompleted = index < activeStatusIndex;
                          const stepState =
                            isActive
                              ? "pipeline-step-active"
                              : isCompleted
                                ? "pipeline-step-complete"
                                : "pipeline-step-idle";

                          return (
                            <button
                              key={phase.key}
                              type="button"
                              onClick={() => setActiveStatus(phase.key)}
                              className={`pipeline-step ${stepState} py-2.5 md:py-3 xl:py-4`}
                              aria-current={isActive ? "step" : undefined}
                              title={
                                phase.subPhases?.length
                                  ? `${phase.label} - ${phase.subPhases.join(" > ")}`
                                  : phase.label
                              }
                            >
                              <span className="block text-[11px] tracking-[0.10em] md:text-[13px] md:tracking-[0.12em] lg:text-[14px] xl:text-[16px] xl:tracking-[0.12em]">
                                {phase.label}
                              </span>
                              {phase.subPhases?.length ? (
                                <div className="mt-1.5 w-full px-1 xl:mt-2 xl:px-2">
                                  <div className="relative">
                                    <span
                                      className="absolute left-1 right-1 top-1 h-px bg-white/40 xl:left-2 xl:right-2"
                                      aria-hidden="true"
                                    />
                                    <div className="flex items-start justify-between gap-1">
                                      {phase.subPhases.map((subPhase) => {
                                        const progressSubPhase = mapStatusToProgressSubPhase(
                                          phase.key,
                                          activeSubStatus
                                        );
                                        const isSubActive =
                                          activeStatus === phase.key &&
                                          activeSubStatus !== "all" &&
                                          subPhase === progressSubPhase;
                                        const dotClass = isSubActive
                                          ? "h-2 w-2 rounded-full bg-white shadow-[0_0_0_4px_rgba(56,189,248,0.45)] xl:h-3 xl:w-3"
                                          : "h-1.5 w-1.5 rounded-full bg-white/70 xl:h-2 xl:w-2";
                                        const labelClass = isSubActive
                                          ? "mt-0.5 max-w-[80px] text-center font-semibold leading-tight text-white xl:max-w-[120px]"
                                          : "mt-0.5 max-w-[80px] text-center leading-tight text-white/85 xl:max-w-[120px]";

                                        return (
                                          <div
                                            key={subPhase}
                                            className="relative z-10 flex flex-1 flex-col items-center text-[9px] font-medium normal-case tracking-normal text-white/85 md:text-[10px] xl:text-[12px]"
                                          >
                                            <span className={dotClass} />
                                            <span className={labelClass}>{subPhase}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Detailed View</p>
                      <h2 className="font-display text-2xl text-ink">
                        Requests
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex w-full flex-col gap-1 sm:w-72">
                        <span className="invisible text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]">
                          Search
                        </span>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            >
                              <circle cx="11" cy="11" r="7" />
                              <path d="M20 20l-3.5-3.5" />
                            </svg>
                          </span>
                          <input
                            className="input-field w-full py-2 pl-9 text-xs sm:py-3 sm:pl-10 sm:text-sm"
                            type="search"
                            placeholder="Search requests"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                          />
                        </div>
                      </div>
                      {showDetailedTypeFilter ? (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-32">
                          <label
                            className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]"
                            htmlFor="typeFilter"
                          >
                            Type
                          </label>
                          <SearchableSelectField
                            id="typeFilter"
                            name="typeFilter"
                            value={effectiveDetailedTypeFilter}
                            onChange={(event) => setActiveTypeFilter(event.target.value)}
                            options={detailedTypeFilterOptions.map((option) => ({
                              value: option.key,
                              label: option.label
                            }))}
                            portal
                            menuMinWidth={220}
                            buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                            valueClassName="truncate text-tide"
                            chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                          />
                        </div>
                      ) : null}
                      <div className="flex flex-col gap-1 sm:self-end sm:w-36">
                        <label
                          className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]"
                          htmlFor="detailedSectorFilter"
                        >
                          Sector
                        </label>
                        <SearchableSelectField
                          id="detailedSectorFilter"
                          name="detailedSectorFilter"
                          value={detailedSectorFilter}
                          onChange={(event) => setDetailedSectorFilter(event.target.value)}
                          options={[
                            { value: "all", label: "All Sectors" },
                            { value: "automotive", label: "Automotive" },
                            { value: "non-automotive", label: "Non-Automotive" }
                          ]}
                          portal
                          menuMinWidth={220}
                          buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                          valueClassName="truncate text-tide"
                          chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                        />
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end sm:w-40">
                        <label
                          className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]"
                          htmlFor="subStatusFilter"
                        >
                          Status
                        </label>
                        <SearchableSelectField
                          id="subStatusFilter"
                          name="subStatusFilter"
                          value={activeSubStatus}
                          onChange={(event) => setActiveSubStatus(event.target.value)}
                          options={[
                            { value: "all", label: "All" },
                            ...subStatusOptions.map((status) => ({
                              value: status,
                              label: FILTER_STATUS_LABELS[status] || status
                            }))
                          ]}
                          portal
                          menuMinWidth={220}
                          buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                          valueClassName="truncate text-tide"
                          chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                        />
                      </div>
                      {shouldShowDetailedProductLineFilter && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-40">
                          <label
                            className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]"
                            htmlFor="detailedProductLineFilter"
                          >
                            Product Line
                          </label>
                          <SearchableSelectField
                            id="detailedProductLineFilter"
                            name="detailedProductLineFilter"
                            value={selectedDetailedProductLine}
                            onChange={(event) => setSelectedDetailedProductLine(event.target.value)}
                            options={[
                              { value: "ALL", label: "All Product Lines" },
                              ...detailedProductLineOptions.map((pl) => ({ value: pl, label: pl }))
                            ]}
                            portal
                            menuMinWidth={220}
                            buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                            valueClassName="truncate text-tide"
                            chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                          />
                        </div>
                      )}
                      <span className="badge mt-3 border-sun/40 bg-gradient-to-r from-sun/20 to-sun/5 px-3 py-1.5 text-xs font-semibold text-sun shadow-soft sm:mt-4 sm:px-4 sm:py-2 sm:text-sm">
                        {formatRequestCount(finalDetailedRfqs.length)}
                      </span>
                    </div>
                  </div>

                  <RfqTable
                    rows={paginatedRfqs}
                    showValidatorColumn={activePhase.key === "RFQ"}
                    footer={tableFooter}
                  />
                </>
              ) : viewMode === "global" ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Global View</p>
                      <h2 className="font-display text-2xl text-ink">
                        All requests
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex w-full flex-col gap-1 sm:w-72">
                        <span className="invisible text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]">
                          Search
                        </span>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            >
                              <circle cx="11" cy="11" r="7" />
                              <path d="M20 20l-3.5-3.5" />
                            </svg>
                          </span>
                          <input
                            className="input-field w-full py-2 pl-9 text-xs sm:py-3 sm:pl-10 sm:text-sm"
                            type="search"
                            placeholder="Search all requests"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end sm:w-32">
                        <label
                          className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]"
                          htmlFor="globalTypeFilter"
                        >
                          Type
                        </label>
                        <SearchableSelectField
                          id="globalTypeFilter"
                          name="globalTypeFilter"
                          value={activeTypeFilter}
                          onChange={(event) => setActiveTypeFilter(event.target.value)}
                          options={TYPE_FILTER_OPTIONS.map((option) => ({
                            value: option.key,
                            label: option.label
                          }))}
                          portal
                          menuMinWidth={220}
                          buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                          valueClassName="truncate text-tide"
                          chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                        />
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end sm:w-36">
                        <label
                          className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]"
                          htmlFor="globalPhaseFilter"
                        >
                          Phase
                        </label>
                        <SearchableSelectField
                          id="globalPhaseFilter"
                          name="globalPhaseFilter"
                          value={globalPhaseFilter}
                          onChange={(event) => setGlobalPhaseFilter(event.target.value)}
                          options={[
                            { value: "all", label: "All phases" },
                            ...PHASES.map((phase) => ({ value: phase.key, label: phase.label }))
                          ]}
                          portal
                          menuMinWidth={220}
                          buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                          valueClassName="truncate text-tide"
                          chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                        />
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end sm:w-36">
                        <label
                          className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]"
                          htmlFor="globalSectorFilter"
                        >
                          Sector
                        </label>
                        <SearchableSelectField
                          id="globalSectorFilter"
                          name="globalSectorFilter"
                          value={globalSectorFilter}
                          onChange={(event) => setGlobalSectorFilter(event.target.value)}
                          options={[
                            { value: "all", label: "All Sectors" },
                            { value: "automotive", label: "Automotive" },
                            { value: "non-automotive", label: "Non-Automotive" }
                          ]}
                          portal
                          menuMinWidth={220}
                          buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                          valueClassName="truncate text-tide"
                          chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                        />
                      </div>
                      {shouldShowGlobalProductLineFilter && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-40">
                          <label
                            className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]"
                            htmlFor="globalProductLineFilter"
                          >
                            Product Line
                          </label>
                          <SearchableSelectField
                            id="globalProductLineFilter"
                            name="globalProductLineFilter"
                            value={selectedGlobalProductLine}
                            onChange={(event) => setSelectedGlobalProductLine(event.target.value)}
                            options={[
                              { value: "ALL", label: "All Product Lines" },
                              ...globalProductLineOptions.map((pl) => ({ value: pl, label: pl }))
                            ]}
                            portal
                            menuMinWidth={220}
                            buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                            valueClassName="truncate text-tide"
                            chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                          />
                        </div>
                      )}
                      <span className="badge mt-3 border-sun/40 bg-gradient-to-r from-sun/20 to-sun/5 px-3 py-1.5 text-xs font-semibold text-sun shadow-soft sm:mt-4 sm:px-4 sm:py-2 sm:text-sm">
                        {formatRequestCount(finalGlobalRfqs.length)}
                      </span>
                    </div>
                  </div>

                  <RfqTable
                    rows={paginatedRfqs}
                    showPhaseColumn
                    footer={tableFooter}
                  />
                </>
              ) : viewMode === "history" ? (
                <>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">RFQ History View</p>
                        <h2 className="font-display text-2xl text-ink">Old projects</h2>
                      </div>
                      <div className="w-full sm:w-[480px]">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3">
                              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                            </svg>
                          </span>
                          <input
                            className="input-field w-full py-2 pl-9 text-xs sm:py-3 sm:pl-10 sm:text-sm"
                            type="search"
                            placeholder="Search old projects…"
                            value={oldSearchTerm}
                            onChange={(event) => setOldSearchTerm(event.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {oldCustomerOptions.length > 0 && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-40">
                          <label className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]" htmlFor="oldCustomerFilter">Customer</label>
                          <SearchableSelectField
                            id="oldCustomerFilter"
                            name="oldCustomerFilter"
                            value={oldCustomerFilter}
                            onChange={(event) => setOldCustomerFilter(event.target.value)}
                            options={[
                              { value: "", label: "All Customers" },
                              ...oldCustomerOptions.map((opt) => ({ value: opt, label: opt }))
                            ]}
                            placeholder="All Customers"
                            searchable
                            searchPlaceholder="Search customer"
                            portal
                            menuMinWidth={280}
                            buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                            valueClassName="truncate text-tide"
                            chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                          />
                        </div>
                      )}
                      {oldKamOptions.length > 0 && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-32">
                          <label className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]" htmlFor="oldKamFilter">KAM</label>
                          <SearchableSelectField
                            id="oldKamFilter"
                            name="oldKamFilter"
                            value={oldKamFilter}
                            onChange={(event) => setOldKamFilter(event.target.value)}
                            options={[
                              { value: "", label: "All KAMs" },
                              ...oldKamOptions.map((opt) => ({ value: opt, label: opt }))
                            ]}
                            placeholder="All KAMs"
                            searchable
                            searchPlaceholder="Search KAM"
                            portal
                            menuMinWidth={280}
                            buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                            valueClassName="truncate text-tide"
                            chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                          />
                        </div>
                      )}
                      {oldSectorOptions.length > 0 && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-36">
                          <label className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]" htmlFor="oldSectorFilter">Sector</label>
                          <SearchableSelectField
                            id="oldSectorFilter"
                            name="oldSectorFilter"
                            value={oldSectorFilter}
                            onChange={(event) => setOldSectorFilter(event.target.value)}
                            options={[
                              { value: "", label: "All Sectors" },
                              ...oldSectorOptions.map((opt) => ({ value: opt, label: opt }))
                            ]}
                            placeholder="All Sectors"
                            portal
                            menuMinWidth={220}
                            buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                            valueClassName="truncate text-tide"
                            chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                          />
                        </div>
                      )}
                      {oldApplicationOptions.length > 0 && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-40">
                          <label className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]" htmlFor="oldApplicationFilter">Application</label>
                          <SearchableSelectField
                            id="oldApplicationFilter"
                            name="oldApplicationFilter"
                            value={oldApplicationFilter}
                            onChange={(event) => setOldApplicationFilter(event.target.value)}
                            options={[
                              { value: "", label: "All Applications" },
                              ...oldApplicationOptions.map((opt) => ({ value: opt, label: opt }))
                            ]}
                            placeholder="All Applications"
                            portal
                            menuMinWidth={220}
                            buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                            valueClassName="truncate text-tide"
                            chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                          />
                        </div>
                      )}
                      {oldBusinessTypeOptions.length > 0 && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-44">
                          <label className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]" htmlFor="oldBusinessTypeFilter">Business Type</label>
                          <SearchableSelectField
                            id="oldBusinessTypeFilter"
                            name="oldBusinessTypeFilter"
                            value={oldBusinessTypeFilter}
                            onChange={(event) => setOldBusinessTypeFilter(event.target.value)}
                            options={[
                              { value: "", label: "All Business Types" },
                              ...oldBusinessTypeOptions.map((opt) => ({ value: opt, label: opt }))
                            ]}
                            placeholder="All Business Types"
                            portal
                            menuMinWidth={220}
                            buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                            valueClassName="truncate text-tide"
                            chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                          />
                        </div>
                      )}
                      {oldStatusOptions.length > 0 && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-40">
                          <label className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px] whitespace-nowrap" htmlFor="oldStatusFilter">Project Condition</label>
                          <SearchableSelectField
                            id="oldStatusFilter"
                            name="oldStatusFilter"
                            value={oldStatusFilter}
                            onChange={(event) => setOldStatusFilter(event.target.value)}
                            options={[
                              { value: "", label: "All Conditions" },
                              ...oldStatusOptions.map((opt) => ({ value: opt, label: opt }))
                            ]}
                            placeholder="All Conditions"
                            portal
                            menuMinWidth={220}
                            buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                            valueClassName="truncate text-tide"
                            chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                          />
                        </div>
                      )}
                      <span className="badge mt-3 border-sun/40 bg-gradient-to-r from-sun/20 to-sun/5 px-3 py-1.5 text-xs font-semibold text-sun shadow-soft sm:mt-4 sm:px-4 sm:py-2 sm:text-sm">
                        {formatRequestCount(filteredOldRfqs.length)}
                      </span>
                      <div className="ml-auto flex items-center gap-2 sm:self-end sm:mt-0 mt-3">
                        <div className="relative" ref={projectColsMenuRef}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                            onClick={() => setShowProjectColsMenu((v) => !v)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>
                            </svg>
                            Columns
                            {hiddenProjectColumns.size > 0 && (
                              <span className="col-picker-badge">{hiddenProjectColumns.size}</span>
                            )}
                          </button>
                          {showProjectColsMenu && (
                            <div className="col-picker-dropdown">
                              <div className="col-picker-header">
                                <span className="col-picker-title">Show / Hide Columns</span>
                                <div className="col-picker-actions">
                                  <button type="button" onClick={() => setHiddenProjectColumns(new Set())}>Show all</button>
                                  <button type="button" onClick={() => setHiddenProjectColumns(new Set(oldRfqProjectColumns))}>Hide all</button>
                                </div>
                              </div>
                              <div className="col-picker-list">
                                {oldRfqProjectColumns.map((col) => (
                                  <label key={col} className="col-picker-item">
                                    <input
                                      type="checkbox"
                                      checked={!hiddenProjectColumns.has(col)}
                                      onChange={() => toggleProjectColumn(col)}
                                    />
                                    <span>{getOldRfqProjectColumnLabel(col)}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        {isEditingAllRows ? (
                          <>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isSavingAll}
                              onClick={handleCancelGlobalEdit}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="gradient-button inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isSavingAll}
                              onClick={handleSaveAllRows}
                            >
                              {isSavingAll ? "Saving..." : "Save All"}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                            style={{ borderColor: "#046eaf", backgroundColor: "#046eaf" }}
                            disabled={isSavingAll}
                            onClick={handleStartGlobalEdit}
                          >
                            <Pencil size={14} />
                            Update
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {oldRfqsLoading ? (
                    <div className="card overflow-hidden">
                      <div className="flex items-center justify-center py-16 text-sm text-slate-400">
                        Loading historical data…
                      </div>
                    </div>
                  ) : oldRfqsError ? (
                    <div className="card overflow-hidden">
                      <div className="flex items-center justify-center py-16 text-sm text-red-400">
                        {oldRfqsError}
                      </div>
                    </div>
                  ) : (
                    <div className="card overflow-hidden">
                      <div className="history-table-scroll">
                        <table className="history-table text-left text-sm">
                          <thead className="bg-slate-100/80 text-xs uppercase tracking-widest text-slate-500">
                            <tr>
                              {visibleProjectColumns.map((colName) => {
                                const isCompacted = compactedProjectColumns.has(colName);
                                return (
                                  <th
                                    key={colName}
                                    className={[
                                      colName === "name" ? "history-sticky-name-header" : "",
                                      isCompacted ? "col-compacted-th" : ""
                                    ].filter(Boolean).join(" ")}
                                  >
                                    {isCompacted ? (
                                      <button
                                        type="button"
                                        className="col-expand-btn"
                                        title={`Expand: ${getOldRfqProjectColumnLabel(colName)}`}
                                        onClick={() => toggleCompactProjectColumn(colName)}
                                      >▶</button>
                                    ) : (
                                      <div className="col-header-inner">
                                        <span className="col-header-label">{getOldRfqProjectColumnLabel(colName)}</span>
                                        <button
                                          type="button"
                                          className="col-compact-btn"
                                          title="Compact column"
                                          onClick={() => toggleCompactProjectColumn(colName)}
                                        >◀</button>
                                      </div>
                                    )}
                                  </th>
                                );
                              })}
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedRfqs.length > 0 ? paginatedRfqs.map((project) => {
                              const rowEditData = editingAllRowsData[project.old_rfq_id] || {};
                              return (
                              <tr
                                key={project.old_rfq_id ?? project.name}
                                onMouseEnter={() => fillDrag && handleFillDragEnter("project", project.old_rfq_id)}
                                className={`border-t border-slate-200/60 text-slate-600 transition ${isEditingAllRows ? "bg-blue-50/40" : "hover:bg-white/70"}`}
                              >
                                {visibleProjectColumns.map((colName) => {
                                  if (compactedProjectColumns.has(colName)) {
                                    return (
                                      <td
                                        key={colName}
                                        className={[colName === "name" ? "history-sticky-name-cell" : "", "col-compacted-td"].join(" ")}
                                      />
                                    );
                                  }
                                  const isEditableColumn = isOldRfqColumnEditable(colName);
                                  const isFillFocused = !!focusedFillCell && focusedFillCell.table === "project" && focusedFillCell.colName === colName && focusedFillCell.rowId === project.old_rfq_id;
                                  const isFillHighlighted = isCellInFillRange("project", colName, project.old_rfq_id);
                                  return (
                                  <td key={colName} className={colName === "name" ? "history-sticky-name-cell" : ""}>
                                  <div
                                    className={`fill-cell-wrapper${isFillHighlighted ? " fill-cell-highlight" : ""}`}
                                    onFocus={() => setFocusedFillCell({ table: "project", colName, rowId: project.old_rfq_id })}
                                    onBlur={() => setFocusedFillCell(null)}
                                  >
                                    {isEditingAllRows && isEditableColumn ? (
                                      colName === "project_condition" ? (
                                        <SearchableSelectField
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(e) => handleGlobalEditFieldChange(project.old_rfq_id, colName, e.target.value)}
                                          options={PROJECT_CONDITION_OPTIONS}
                                          placeholder="— select —"
                                          portal
                                          menuWidth="content"
                                          optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                          buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                          valueClassName="truncate text-inherit text-[13px]"
                                          chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                        />
                                      ) : colName === "final_delivery" ? (
                                        <SearchableSelectField
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(e) => handleGlobalEditFieldChange(project.old_rfq_id, colName, e.target.value)}
                                          options={FINAL_DELIVERY_OPTIONS}
                                          placeholder="— select —"
                                          portal
                                          menuWidth="content"
                                          optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                          buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                          valueClassName="truncate text-inherit text-[13px]"
                                          chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                        />
                                      ) : colName === "old_new" ? (
                                        <SearchableSelectField
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(e) => handleGlobalEditFieldChange(project.old_rfq_id, colName, e.target.value)}
                                          options={OLD_NEW_OPTIONS}
                                          placeholder="— select —"
                                          portal
                                          menuWidth="content"
                                          optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                          buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                          valueClassName="truncate text-inherit text-[13px]"
                                          chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                        />
                                      ) : colName === "product_testing" ? (
                                        <SearchableSelectField
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(e) => handleGlobalEditFieldChange(project.old_rfq_id, colName, e.target.value)}
                                          options={PRODUCT_TESTING_OPTIONS}
                                          placeholder="— select —"
                                          portal
                                          menuWidth="content"
                                          optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                          buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                          valueClassName="truncate text-inherit text-[13px]"
                                          chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                        />
                                      ) : colName === "type_business" ? (
                                        <SearchableSelectField
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(e) => handleGlobalEditFieldChange(project.old_rfq_id, colName, e.target.value)}
                                          options={TYPE_BUSINESS_OPTIONS}
                                          placeholder="— select —"
                                          portal
                                          menuWidth="content"
                                          optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                          buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                          valueClassName="truncate text-inherit text-[13px]"
                                          chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                        />
                                      ) : colName === "importance" ? (
                                        <SearchableSelectField
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(e) => handleGlobalEditFieldChange(project.old_rfq_id, colName, e.target.value)}
                                          options={IMPORTANCE_OPTIONS}
                                          placeholder="— select —"
                                          portal
                                          menuWidth="content"
                                          optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                          buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                          valueClassName="truncate text-inherit text-[13px]"
                                          chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                        />
                                      ) : colName === "costing_leader" ? (
                                        <SelectWithOthersCell
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(val) => handleGlobalEditFieldChange(project.old_rfq_id, colName, val)}
                                          options={costingLeaderOptions}
                                          searchable
                                          searchPlaceholder="Search costing leader"
                                        />
                                      ) : colName === "feasibility_leader" ? (
                                        <SelectWithOthersCell
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(val) => handleGlobalEditFieldChange(project.old_rfq_id, colName, val)}
                                          options={feasibilityLeaderOptions}
                                          searchable
                                          searchPlaceholder="Search feasibility leader"
                                        />
                                      ) : colName === "customers" ? (
                                        <SelectWithOthersCell
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(val) => handleGlobalEditFieldChange(project.old_rfq_id, colName, val)}
                                          options={customerEditOptions}
                                          searchable
                                          searchPlaceholder="Search customer"
                                        />
                                      ) : colName === "kam" ? (
                                        <SelectWithOthersCell
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(val) => handleGlobalEditFieldChange(project.old_rfq_id, colName, val)}
                                          options={kamEditOptions}
                                          searchable
                                          searchPlaceholder="Search KAM"
                                        />
                                      ) : colName === "requester" || colName === "duplicate_of_old_new" ? (
                                        <SelectWithOthersCell
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(val) => handleGlobalEditFieldChange(project.old_rfq_id, colName, val)}
                                          options={kamEditOptions}
                                          searchable
                                          searchPlaceholder="Search"
                                        />
                                      ) : colName === "application" ? (
                                        <ApplicationEditCell
                                          value={rowEditData["application"] ?? ""}
                                          onChange={(val) => handleGlobalEditFieldChange(project.old_rfq_id, "application", val)}
                                        />
                                      ) : colName === "sector" ? (
                                        <SearchableSelectField
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(e) => handleGlobalEditFieldChange(project.old_rfq_id, colName, e.target.value)}
                                          options={SECTOR_OPTIONS}
                                          placeholder="— select —"
                                          portal
                                          menuWidth="content"
                                          optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                          buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                          valueClassName="truncate text-inherit text-[13px]"
                                          chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                        />
                                      ) : colName === "volume_profile" ? (
                                        <SearchableSelectField
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(e) => handleGlobalEditFieldChange(project.old_rfq_id, colName, e.target.value)}
                                          options={VOLUME_PROFILE_OPTIONS}
                                          placeholder="— select —"
                                          portal
                                          menuWidth="content"
                                          optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                          buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                          valueClassName="truncate text-inherit text-[13px]"
                                          chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                        />
                                      ) : colName === "quote_type" ? (
                                        <SearchableSelectField
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(e) => handleGlobalEditFieldChange(project.old_rfq_id, colName, e.target.value)}
                                          options={QUOTE_TYPE_OPTIONS}
                                          placeholder="— select —"
                                          portal
                                          menuWidth="content"
                                          optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                          buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                          valueClassName="truncate text-inherit text-[13px]"
                                          chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                        />
                                      ) : colName === "integration" ? (
                                        <SearchableSelectField
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(e) => handleGlobalEditFieldChange(project.old_rfq_id, colName, e.target.value)}
                                          options={INTEGRATION_OPTIONS}
                                          placeholder="— select —"
                                          portal
                                          menuWidth="content"
                                          optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                          buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                          valueClassName="truncate text-inherit text-[13px]"
                                          chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                        />
                                      ) : OLD_RFQ_DATE_COLUMNS.has(colName) ? (
                                        <input
                                          type="date"
                                          className="history-inline-edit-input"
                                          value={toDateInputValue(rowEditData[colName])}
                                          onChange={(e) => handleGlobalEditFieldChange(project.old_rfq_id, colName, e.target.value)}
                                        />
                                      ) : (
                                        <input
                                          type="text"
                                          className="history-inline-edit-input"
                                          value={rowEditData[colName] ?? ""}
                                          onChange={(e) => handleGlobalEditFieldChange(project.old_rfq_id, colName, e.target.value)}
                                        />
                                      )
                                    ) : HISTORY_BADGE_COLUMNS.has(colName) ? (
                                      <HistoryValueBadge columnName={colName} value={project[colName]} />
                                    ) : colName === "note" ? (
                                      <NoteCell value={project[colName]} />
                                    ) : colName === "creation_journal" ? (
                                      <TruncatedCell value={formatCreationJournal(project[colName])} />
                                    ) : (
                                      <TruncatedCell value={project[colName]} />
                                    )}
                                    {isEditingAllRows && isEditableColumn && isFillFocused && (
                                      <div
                                        className="fill-handle"
                                        onMouseDown={(e) => startFillDrag(e, "project", colName, project.old_rfq_id, rowEditData[colName] ?? "", paginatedRfqRowIds)}
                                      />
                                    )}
                                  </div>
                                  </td>
                                  );
                                })}
                                <td className="history-action-cell">
                                  <div className="flex flex-row items-center gap-1 pr-2">
                                    {(project.subitems?.length ?? 0) > 0 ? (
                                      <button
                                        type="button"
                                        className="history-subitems-btn inline-flex items-center justify-center whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-sm"
                                        style={{ borderColor: "#94a3b8", backgroundColor: "#94a3b8" }}
                                        onClick={() => handleOpenSubitemsModal(project)}
                                      >
                                        View subitems ({project.subitems.length})
                                      </button>
                                    ) : (
                                      <span className="history-muted text-xs font-medium text-slate-400">No subitems</span>
                                    )}
                                    <button
                                      type="button"
                                      className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                                      style={{ borderColor: "#dc2626", backgroundColor: "#dc2626" }}
                                      disabled={isSavingAll || deletingOldRfqId === project.old_rfq_id}
                                      onClick={() => handleDeleteOldRfqRow(project)}
                                    >
                                      {deletingOldRfqId === project.old_rfq_id ? (
                                        "Deleting..."
                                      ) : (
                                        <>
                                          <Trash2 size={12} />
                                          Delete
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              );
                            }) : (
                              <tr>
                                <td colSpan={visibleProjectColumns.length + 1} className="px-4 py-16 text-center text-sm text-slate-400">
                                  No old RFQs found
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="border-t border-slate-200/70 bg-slate-50/70 px-4 py-3">
                        {tableFooter}
                      </div>
                    </div>
                  )}
                </>
              ) : viewMode === "market" ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Market View</p>
                      <h2 className="font-display text-2xl text-ink">
                        {marketSegment === "automotive"
                          ? "Automotive market"
                          : marketSegment === "industry"
                            ? "Industry market"
                            : marketSegment === "large_accounts"
                              ? "Large accounts"
                              : "Market"}
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex w-full flex-col gap-1 sm:w-72">
                        <span className="invisible text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]">
                          Search
                        </span>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            >
                              <circle cx="11" cy="11" r="7" />
                              <path d="M20 20l-3.5-3.5" />
                            </svg>
                          </span>
                          <input
                            className="input-field w-full py-2 pl-9 text-xs sm:py-3 sm:pl-10 sm:text-sm"
                            type="search"
                            placeholder="Search all requests"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end sm:w-32">
                        <label
                          className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]"
                          htmlFor="marketTypeFilter"
                        >
                          Type
                        </label>
                        <SearchableSelectField
                          id="marketTypeFilter"
                          name="marketTypeFilter"
                          value={marketTypeFilter}
                          onChange={(event) => setMarketTypeFilter(event.target.value)}
                          options={TYPE_FILTER_OPTIONS.map((option) => ({
                            value: option.key,
                            label: option.label
                          }))}
                          placeholder="All types"
                          portal
                          menuMinWidth={220}
                          buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                          valueClassName="truncate text-tide"
                          chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                        />
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end sm:w-40">
                        <label
                          className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]"
                          htmlFor="marketStatusFilter"
                        >
                          Status
                        </label>
                        <SearchableSelectField
                          id="marketStatusFilter"
                          name="marketStatusFilter"
                          value={marketStatusFilter}
                          onChange={(event) => setMarketStatusFilter(event.target.value)}
                          options={[
                            { value: "all", label: "All statuses" },
                            ...Array.from(knownStatuses).map((status) => ({
                              value: status,
                              label: FILTER_STATUS_LABELS[status] || status
                            }))
                          ]}
                          placeholder="All statuses"
                          portal
                          menuMinWidth={220}
                          buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                          valueClassName="truncate text-tide"
                          chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                        />
                      </div>
                      {marketKamOptions.length > 0 && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-32">
                          <label className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]" htmlFor="marketKamFilter">KAM</label>
                          <SearchableSelectField
                            id="marketKamFilter"
                            name="marketKamFilter"
                            value={marketKamFilter}
                            onChange={(event) => setMarketKamFilter(event.target.value)}
                            options={[
                              { value: "", label: "All KAMs" },
                              ...marketKamOptions.map((opt) => ({ value: opt, label: opt }))
                            ]}
                            placeholder="All KAMs"
                            searchable
                            searchPlaceholder="Search KAM"
                            portal
                            menuMinWidth={280}
                            buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                            valueClassName="truncate text-tide"
                            chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                          />
                        </div>
                      )}
                      <span className="badge mt-3 border-sun/40 bg-gradient-to-r from-sun/20 to-sun/5 px-3 py-1.5 text-xs font-semibold text-sun shadow-soft sm:mt-4 sm:px-4 sm:py-2 sm:text-sm">
                        {formatRequestCount(filteredMarketData.length)}
                      </span>
                    </div>
                  </div>

                  {marketLoading ? (
                    <div className="card overflow-hidden">
                      <div className="flex items-center justify-center py-16 text-sm text-slate-400">
                        Loading market data…
                      </div>
                    </div>
                  ) : (
                    <RfqTable
                      rows={paginatedRfqs}
                      showPhaseColumn
                      footer={tableFooter}
                    />
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Team View</p>
                      <h2 className="font-display text-2xl text-ink">
                        My team
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex w-full flex-col gap-1 sm:w-72">
                        <span className="invisible text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]">
                          Search
                        </span>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            >
                              <circle cx="11" cy="11" r="7" />
                              <path d="M20 20l-3.5-3.5" />
                            </svg>
                          </span>
                          <input
                            className="input-field w-full py-2 pl-9 text-xs sm:py-3 sm:pl-10 sm:text-sm"
                            type="search"
                            placeholder="Search all requests"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end sm:w-40">
                        <label
                          className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]"
                          htmlFor="teamPersonFilter"
                        >
                          Person
                        </label>
                        <SearchableSelectField
                          id="teamPersonFilter"
                          name="teamPersonFilter"
                          value={teamPersonFilter}
                          onChange={(event) => setTeamPersonFilter(event.target.value)}
                          options={[
                            { value: "all", label: "All people" },
                            ...teamMembers.map((m) => ({ value: m.email, label: m.person }))
                          ]}
                          searchable
                          searchPlaceholder="Search person"
                          portal
                          menuMinWidth={260}
                          buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                          valueClassName="truncate text-tide"
                          chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                        />
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end sm:w-36">
                        <label
                          className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]"
                          htmlFor="teamSectorFilter"
                        >
                          Sector
                        </label>
                        <SearchableSelectField
                          id="teamSectorFilter"
                          name="teamSectorFilter"
                          value={teamSectorFilter}
                          onChange={(event) => setTeamSectorFilter(event.target.value)}
                          options={[
                            { value: "all", label: "All Sectors" },
                            { value: "automotive", label: "Automotive" },
                            { value: "non-automotive", label: "Non-Automotive" }
                          ]}
                          portal
                          menuMinWidth={220}
                          buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                          valueClassName="truncate text-tide"
                          chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                        />
                      </div>
                      {shouldShowTeamProductLineFilter && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-40">
                          <label
                            className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-[10px]"
                            htmlFor="teamProductLineFilter"
                          >
                            Product Line
                          </label>
                          <SearchableSelectField
                            id="teamProductLineFilter"
                            name="teamProductLineFilter"
                            value={selectedTeamProductLine}
                            onChange={(event) => setSelectedTeamProductLine(event.target.value)}
                            options={[
                              { value: "ALL", label: "All Product Lines" },
                              ...teamProductLineOptions.map((pl) => ({ value: pl, label: pl }))
                            ]}
                            portal
                            menuMinWidth={220}
                            buttonClassName="w-full flex items-center justify-between gap-2 rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-3 py-2 text-xs font-semibold shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30 text-left normal-case tracking-normal sm:px-3.5 sm:py-2.5 sm:text-[13px] min-[1050px]:px-4 min-[1050px]:py-3 min-[1050px]:text-sm"
                            valueClassName="truncate text-tide"
                            chevronClassName="h-4 w-4 flex-shrink-0 text-tide"
                          />
                        </div>
                      )}
                      <span className="badge mt-3 border-sun/40 bg-gradient-to-r from-sun/20 to-sun/5 px-3 py-1.5 text-xs font-semibold text-sun shadow-soft sm:mt-4 sm:px-4 sm:py-2 sm:text-sm">
                        {formatRequestCount(finalTeamData.length)}
                      </span>
                    </div>
                  </div>

                  {teamLoading ? (
                    <div className="card overflow-hidden">
                      <div className="flex items-center justify-center py-16 text-sm text-slate-400">
                        Loading team data…
                      </div>
                    </div>
                  ) : (
                    <RfqTable
                      rows={paginatedRfqs}
                      showPhaseColumn
                      footer={tableFooter}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {selectedOldProject ? (
        <div
          className="chat-modal-backdrop"
          onClick={handleCloseSubitemsModal}
          role="presentation"
        >
          <div
            className="chat-modal history-subitems-modal border border-slate-200/80 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-subitems-modal-title"
            onClick={(event) => event.stopPropagation()}
            style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div className="chat-modal-header">
              <div className="min-w-0 flex-1 sm:flex-none">
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 sm:text-xs">RFQ History View</p>
                <p id="history-subitems-modal-title" className="chat-modal-title mt-1">
                  {selectedOldProject.project_name || selectedOldProject.name || "Project subitems"}
                </p>
                <p className="mt-1 truncate text-[11px] text-slate-500 sm:text-sm">
                  {[selectedOldProject.customers, selectedOldProject.kam, `${selectedOldProject.subitems_count} subitems`]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
              </div>
              <div className="flex items-center gap-3 subitems-modal-actions">
                {subitemGlobalEditMode ? (
                  <>
                    <button
                      type="button"
                      className="history-save-btn"
                      disabled={savingSubitemsGlobal}
                      onClick={handleSaveSubitemsGlobal}
                    >
                      {savingSubitemsGlobal ? "Saving..." : "Save All"}
                    </button>
                    <button
                      type="button"
                      className="history-cancel-btn"
                      disabled={savingSubitemsGlobal}
                      onClick={handleCancelSubitemsGlobal}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-sm"
                    style={{ borderColor: "#046eaf", backgroundColor: "#046eaf" }}
                    onClick={handleStartSubitemGlobalEdit}
                  >
                    <Pencil size={12} />
                    Update
                  </button>
                )}
                <div className="relative" ref={subitemColsMenuRef}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                    onClick={() => setShowSubitemColsMenu((v) => !v)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>
                    </svg>
                    Columns
                    {hiddenSubitemColumns.size > 0 && (
                      <span className="col-picker-badge">{hiddenSubitemColumns.size}</span>
                    )}
                  </button>
                  {showSubitemColsMenu && (
                    <div className="col-picker-dropdown col-picker-dropdown--right">
                      <div className="col-picker-header">
                        <span className="col-picker-title">Show / Hide Columns</span>
                        <div className="col-picker-actions">
                          <button type="button" onClick={() => setHiddenSubitemColumns(new Set())}>Show all</button>
                          <button type="button" onClick={() => setHiddenSubitemColumns(new Set(oldRfqSubitemColumns))}>Hide all</button>
                        </div>
                      </div>
                      <div className="col-picker-list">
                        {oldRfqSubitemColumns.map((col) => (
                          <label key={col} className="col-picker-item">
                            <input
                              type="checkbox"
                              checked={!hiddenSubitemColumns.has(col)}
                              onChange={() => toggleSubitemColumn(col)}
                            />
                            <span>{getOldRfqSubitemColumnLabel(col)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="chat-modal-close"
                  onClick={handleCloseSubitemsModal}
                  aria-label="Close subitems modal"
                >
                  x
                </button>
              </div>
            </div>
            <div
              className="chat-modal-body bg-gradient-to-b from-slate-50/40 to-white"
              style={{ height: "auto", display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, overflow: "hidden", padding: "24px" }}
            >
              {(selectedOldProject.subitems || []).length > 0 ? (
                <div
                  className="history-subitems-scroll rounded-2xl border border-slate-200/70"
                  style={{ overflowX: "auto", overflowY: "auto", flex: "1 1 auto", minHeight: 0, maxHeight: "70vh" }}
                >
                  <table className="history-subitems-table text-left text-sm">
                    <thead className="bg-slate-100/80 text-xs uppercase tracking-widest text-slate-500">
                      <tr>
                        {visibleSubitemColumns.map((colName) => {
                          const isCompacted = compactedSubitemColumns.has(colName);
                          return (
                            <th
                              key={colName}
                              className={[
                                colName === "name" ? "history-sticky-name-header" : "",
                                isCompacted ? "col-compacted-th" : ""
                              ].filter(Boolean).join(" ") || undefined}
                            >
                              {isCompacted ? (
                                <button
                                  type="button"
                                  className="col-expand-btn"
                                  title={`Expand: ${getOldRfqSubitemColumnLabel(colName)}`}
                                  onClick={() => toggleCompactSubitemColumn(colName)}
                                >▶</button>
                              ) : (
                                <div className="col-header-inner">
                                  <span className="col-header-label">{getOldRfqSubitemColumnLabel(colName)}</span>
                                  <button
                                    type="button"
                                    className="col-compact-btn"
                                    title="Compact column"
                                    onClick={() => toggleCompactSubitemColumn(colName)}
                                  >◀</button>
                                </div>
                              )}
                            </th>
                          );
                        })}
                        <th className="history-subitem-action-cell">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedOldProject.subitems || []).map((subitem, index) => {
                        const isInEditMode = subitemGlobalEditMode;
                        const subitemEditData = subitemGlobalEditData[subitem.old_rfq_subitem_id];
                        const subitemOnChange = (colName, val) =>
                          handleSubitemGlobalFieldChange(subitem.old_rfq_subitem_id, colName, val);
                        return (
                          <tr
                            key={`${selectedOldProject.old_rfq_id}-subitem-${index}`}
                            onMouseEnter={() => fillDrag && handleFillDragEnter("subitem", subitem.old_rfq_subitem_id)}
                            className={`border-t border-slate-200/60 text-slate-600 transition ${isInEditMode ? "bg-blue-50/40" : "hover:bg-white/70"}`}
                          >
                            {visibleSubitemColumns.map((colName) => {
                              if (compactedSubitemColumns.has(colName)) {
                                return (
                                  <td
                                    key={colName}
                                    className={[colName === "name" ? "history-sticky-name-cell" : "", "col-compacted-td"].join(" ")}
                                  />
                                );
                              }
                              const qtyYearMatch = colName.match(/^qty_year_(\d+)$/);
                              if (qtyYearMatch) {
                                const n = parseInt(qtyYearMatch[1]);
                                if (isInEditMode) {
                                  return (
                                    <td key={colName}>
                                      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                                        <input
                                          type="text"
                                          className="history-inline-edit-input"
                                          placeholder="Year"
                                          value={subitemEditData?.[`year${n}`] ?? ""}
                                          onChange={(e) => subitemOnChange(`year${n}`, e.target.value)}
                                          style={{ width: "60px" }}
                                        />
                                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>:</span>
                                        <input
                                          type="text"
                                          className="history-inline-edit-input"
                                          placeholder="Qty"
                                          value={subitemEditData?.[`year${n}_value`] ?? ""}
                                          onChange={(e) => subitemOnChange(`year${n}_value`, e.target.value)}
                                        />
                                      </div>
                                    </td>
                                  );
                                }
                                const yr = String(subitem?.[`year${n}`] ?? "").trim();
                                const qty = String(subitem?.[`year${n}_value`] ?? "").trim();
                                const display = yr && qty ? `${yr}: ${qty}` : yr || qty || "-";
                                return (
                                  <td key={colName}>
                                    <TruncatedCell value={display} />
                                  </td>
                                );
                              }
                              const editable = isSubitemColumnEditable(colName);
                              const isFillFocused = !!focusedFillCell && focusedFillCell.table === "subitem" && focusedFillCell.colName === colName && focusedFillCell.rowId === subitem.old_rfq_subitem_id;
                              const isFillHighlighted = isCellInFillRange("subitem", colName, subitem.old_rfq_subitem_id);
                              return (
                                <td key={colName} className={colName === "name" ? "history-sticky-name-cell" : ""}>
                                <div
                                  className={`fill-cell-wrapper${isFillHighlighted ? " fill-cell-highlight" : ""}`}
                                  onFocus={() => setFocusedFillCell({ table: "subitem", colName, rowId: subitem.old_rfq_subitem_id })}
                                  onBlur={() => setFocusedFillCell(null)}
                                >
                                  {isInEditMode && editable ? (
                                    colName === "product_line_labels" ? (
                                      <SearchableSelectField
                                        value={subitemEditData?.[colName] ?? ""}
                                        onChange={(e) => subitemOnChange(colName, e.target.value)}
                                        options={PRODUCT_LINE_LABELS_OPTIONS}
                                        placeholder="— select —"
                                        portal
                                        menuWidth="content"
                                        optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                        buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                        valueClassName="truncate text-inherit text-[13px]"
                                        chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                      />
                                    ) : colName === "delivery_to" ? (
                                      <SearchableSelectField
                                        value={subitemEditData?.[colName] ?? ""}
                                        onChange={(e) => subitemOnChange(colName, e.target.value)}
                                        options={DELIVERY_TO_OPTIONS}
                                        placeholder="— select —"
                                        portal
                                        menuWidth="content"
                                        optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                        buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                        valueClassName="truncate text-inherit text-[13px]"
                                        chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                      />
                                    ) : colName === "application" ? (
                                      <ApplicationEditCell
                                        value={subitemEditData?.["application"] ?? ""}
                                        onChange={(val) => subitemOnChange("application", val)}
                                      />
                                    ) : colName === "final_delivery" ? (
                                      <SearchableSelectField
                                        value={subitemEditData?.[colName] ?? ""}
                                        onChange={(e) => subitemOnChange(colName, e.target.value)}
                                        options={FINAL_DELIVERY_OPTIONS}
                                        placeholder="— select —"
                                        portal
                                        menuWidth="content"
                                        optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                        buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                        valueClassName="truncate text-inherit text-[13px]"
                                        chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                      />
                                    ) : colName === "plant" ? (
                                      <SearchableSelectField
                                        value={subitemEditData?.[colName] ?? ""}
                                        onChange={(e) => subitemOnChange(colName, e.target.value)}
                                        options={PLANT_OPTIONS}
                                        placeholder="— select —"
                                        portal
                                        menuWidth="content"
                                        optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                        buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                        valueClassName="truncate text-inherit text-[13px]"
                                        chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                      />
                                    ) : colName === "status" ? (
                                      <SearchableSelectField
                                        value={subitemEditData?.[colName] ?? ""}
                                        onChange={(e) => subitemOnChange(colName, e.target.value)}
                                        options={PROJECT_CONDITION_OPTIONS}
                                        placeholder="— select —"
                                        portal
                                        menuWidth="content"
                                        optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                        buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                        valueClassName="truncate text-inherit text-[13px]"
                                        chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                      />
                                    ) : colName === "importance" ? (
                                      <SearchableSelectField
                                        value={subitemEditData?.[colName] ?? ""}
                                        onChange={(e) => subitemOnChange(colName, e.target.value)}
                                        options={IMPORTANCE_OPTIONS}
                                        placeholder="— select —"
                                        portal
                                        menuWidth="content"
                                        optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                        buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                        valueClassName="truncate text-inherit text-[13px]"
                                        chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                      />
                                    ) : colName === "pipeline" ? (
                                      <SearchableSelectField
                                        value={subitemEditData?.[colName] ?? ""}
                                        onChange={(e) => subitemOnChange(colName, e.target.value)}
                                        options={INTEGRATION_OPTIONS}
                                        placeholder="— select —"
                                        portal
                                        menuWidth="content"
                                        optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                        buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                        valueClassName="truncate text-inherit text-[13px]"
                                        chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                      />
                                    ) : colName === "quotation_currency" ? (
                                      <SearchableSelectField
                                        value={subitemEditData?.[colName] ?? ""}
                                        onChange={(e) => subitemOnChange(colName, e.target.value)}
                                        options={QUOTATION_CURRENCY_OPTIONS}
                                        placeholder="— select —"
                                        portal
                                        menuWidth="content"
                                        optionListClassName="text-[13px] font-medium normal-case tracking-normal text-ink"
                                        buttonClassName="history-inline-edit-input flex items-center justify-between gap-1 text-left normal-case tracking-normal"
                                        valueClassName="truncate text-inherit text-[13px]"
                                        chevronClassName="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                                      />
                                    ) : colName === "customer" || colName === "customers" ? (
                                      <SelectWithOthersCell
                                        value={subitemEditData?.[colName] ?? ""}
                                        onChange={(val) => subitemOnChange(colName, val)}
                                        options={customerEditOptions}
                                        searchable
                                        searchPlaceholder="Search customer"
                                      />
                                    ) : colName === "created_by" || colName === "modified_by" ? (
                                      <SelectWithOthersCell
                                        value={subitemEditData?.[colName] ?? ""}
                                        onChange={(val) => subitemOnChange(colName, val)}
                                        options={kamEditOptions}
                                        searchable
                                        searchPlaceholder="Search"
                                      />
                                    ) : SUBITEM_DATE_COLUMNS.has(colName) ? (
                                      <input
                                        type="date"
                                        className="history-inline-edit-input"
                                        value={toDateInputValue(subitemEditData?.[colName])}
                                        onChange={(e) => subitemOnChange(colName, e.target.value)}
                                      />
                                    ) : (
                                      <input
                                        type="text"
                                        className="history-inline-edit-input"
                                        value={subitemEditData?.[colName] ?? ""}
                                        onChange={(e) => subitemOnChange(colName, e.target.value)}
                                      />
                                    )
                                  ) : colName === "status" ? (
                                    <HistoryValueBadge columnName="project_condition" value={subitem[colName]} />
                                  ) : colName === "importance" ? (
                                    <HistoryValueBadge columnName="importance" value={subitem[colName]} />
                                  ) : colName === "plant" ? (
                                    <HistoryValueBadge columnName="plant" value={subitem[colName]} />
                                  ) : (
                                    <TruncatedCell value={subitem[colName]} />
                                  )}
                                  {subitemGlobalEditMode && editable && isFillFocused && (
                                    <div
                                      className="fill-handle"
                                      onMouseDown={(e) => startFillDrag(e, "subitem", colName, subitem.old_rfq_subitem_id, subitemEditData?.[colName] ?? "", subitemRowIds)}
                                    />
                                  )}
                                </div>
                                </td>
                              );
                            })}
                            <td className="history-subitem-action-cell">
                              <div className="flex flex-row items-center gap-1 pr-2">
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                                  style={{ borderColor: "#dc2626", backgroundColor: "#dc2626" }}
                                  disabled={savingSubitemsGlobal || deletingSubitemId === subitem.old_rfq_subitem_id}
                                  onClick={() => handleDeleteSubitem(subitem.old_rfq_subitem_id, selectedOldProject.old_rfq_id)}
                                >
                                  {deletingSubitemId === subitem.old_rfq_subitem_id ? (
                                    "Deleting..."
                                  ) : (
                                    <>
                                      <Trash2 size={12} />
                                      Delete
                                    </>
                                  )}
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
                <div className="flex items-center justify-center px-6 py-16 text-sm text-slate-400">
                  No subitems available for this project.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {deleteRowConfirm ? (
        <div
          className="chat-modal-backdrop"
          onClick={() => setDeleteRowConfirm(null)}
          role="presentation"
        >
          <div
            className="chat-modal"
            style={{ width: "min(92vw, 440px)" }}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete history row"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="chat-modal-header">
              <p className="chat-modal-title">Delete history row?</p>
              <button
                type="button"
                className="chat-modal-close"
                onClick={() => setDeleteRowConfirm(null)}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12" /><path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body">
              <div className="chat-modal-fallback">
                <p className="text-sm text-slate-600">
                  Are you sure you want to delete this history row?
                  {deleteRowConfirm.subitems_count > 0 && (
                    <span className="block mt-1 font-semibold text-red-600">
                      This will also delete {deleteRowConfirm.subitems_count} subitem{deleteRowConfirm.subitems_count > 1 ? "s" : ""}. This action cannot be undone.
                    </span>
                  )}
                  {deleteRowConfirm.subitems_count === 0 && (
                    <span className="block mt-1 text-slate-500">This action cannot be undone.</span>
                  )}
                </p>
                <div className="chat-modal-actions justify-end mt-4">
                  <button
                    type="button"
                    className="outline-button px-4 py-2 text-xs"
                    onClick={() => setDeleteRowConfirm(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 shadow-sm transition hover:border-red-300 hover:bg-red-100"
                    onClick={handleConfirmDeleteRow}
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteSubitemConfirm ? (
        <div
          className="chat-modal-backdrop"
          onClick={() => setDeleteSubitemConfirm(null)}
          role="presentation"
        >
          <div
            className="chat-modal"
            style={{ width: "min(92vw, 440px)" }}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete subitem"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="chat-modal-header">
              <p className="chat-modal-title">Delete subitem?</p>
              <button
                type="button"
                className="chat-modal-close"
                onClick={() => setDeleteSubitemConfirm(null)}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12" /><path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body">
              <div className="chat-modal-fallback">
                <p className="text-sm text-slate-600">
                  Are you sure you want to delete this subitem?
                  <span className="block mt-1 text-slate-500">This action cannot be undone.</span>
                </p>
                <div className="chat-modal-actions justify-end mt-4">
                  <button
                    type="button"
                    className="outline-button px-4 py-2 text-xs"
                    onClick={() => setDeleteSubitemConfirm(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 shadow-sm transition hover:border-red-300 hover:bg-red-100"
                    onClick={handleConfirmDeleteSubitem}
                  >
                    <Trash2 size={13} />
                    Delete
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
