import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import TopBar from "../components/TopBar.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import RfqTable from "../components/RfqTable.jsx";
import { listRfqs, getTeamView, getTeamMembers, getOldRfqs, updateOldRfq, updateOldRfqSubitem } from "../api";
import { mapRfqToRow } from "../utils/rfq.js";
import { getUserProfile, hasRole } from "../utils/session.js";

const BASE_VIEW_OPTIONS = [
  { key: "detailed", label: "Detailed View" },
  { key: "global", label: "Global View" },
  { key: "history", label: "RFQ History View" }
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
    statuses: ["New RFQ", "Validation", "Cancelled"],
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
    if (status === "Validation") {
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
  "creation_journal",
  "creation_log",
  "monday_id",
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
  "type_business",
  "subitems_est_price_eur",
  "subelements_sales_limit_3",
  "twc_keur",
  "mirror_gmdc_k",
  "authorization_required",
  "capex_keur",
  "capital_keur",
  "gmdc_project_keur",
  "costing_number",
  "sales_project",
  "requester",
  "project_sales_keur",
  "gmdc_proj_percent",
  "old_new",
  "duplicate_of_old_new",
  "customer_text",
  "importance",
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
  "plant_to_deliver",
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
  "project_condition",
  "product_testing",
  "plant_audited",
  "iteration",
  "integration",
  "final_delivery",
  "duplicate_of_pipeline",
  "duplicate_of_pipeline_record_change",
  "id_test",
  "status_name",
  "duplicate_of_development_axis",
  "total_qty",
  "note",
  "mirror",
  "subitems_count",
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
  costing_number: "Chiffrage Number",
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
  subitems_count: "Subitems",
};

const buildOrderedOldRfqProjectColumns = (apiColumns = []) => {
  const visibleColumns = apiColumns.filter(
    (col) => !HIDDEN_OLD_RFQ_PROJECT_COLUMNS.has(col)
  );
  const orderedColumns = OLD_RFQ_PROJECT_COLUMN_ORDER.filter((col) =>
    visibleColumns.includes(col)
  );
  const remainingColumns = visibleColumns.filter(
    (col) => !OLD_RFQ_PROJECT_COLUMN_ORDER.includes(col)
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
]);

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
};

const buildOrderedOldRfqSubitemColumns = (apiColumns = []) => {
  const visibleColumns = apiColumns.filter(
    (col) => !HIDDEN_OLD_RFQ_SUBITEM_COLUMNS.has(col)
  );
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

const HISTORY_BADGE_COLUMNS = new Set(["old_new", "sector", "type_business"]);

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
  const viewOptions = canSeeTeamView
    ? [...BASE_VIEW_OPTIONS, { key: "team", label: "Team View" }]
    : BASE_VIEW_OPTIONS;

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
  const [editingSubitemId, setEditingSubitemId] = useState(null);
  const [editingSubitemData, setEditingSubitemData] = useState({});
  const [savingSubitemId, setSavingSubitemId] = useState(null);
  const [oldSearchTerm, setOldSearchTerm] = useState("");
  const [oldCustomerFilter, setOldCustomerFilter] = useState("");
  const [oldKamFilter, setOldKamFilter] = useState("");
  const [oldSectorFilter, setOldSectorFilter] = useState("");
  const [oldApplicationFilter, setOldApplicationFilter] = useState("");
  const [oldBusinessTypeFilter, setOldBusinessTypeFilter] = useState("");
  const [oldStatusFilter, setOldStatusFilter] = useState("");
  const [selectedOldProject, setSelectedOldProject] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamData, setTeamData] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

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
    if (viewMode !== "team") return;
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
  }, [viewMode, showToast]);

  // Load team members for Zone Manager's Team View Person filter
  useEffect(() => {
    if (!canSeeTeamView) return;
    getTeamMembers()
      .then((data) => setTeamMembers(Array.isArray(data) ? data : []))
      .catch(() => setTeamMembers([]));
  }, [canSeeTeamView]);

  useEffect(() => {
    if (viewMode !== "history") return;
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
  }, [viewMode]);

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
        if (teamPersonFilter !== "all" && rfq.creator !== teamPersonFilter) return false;
        if (teamSectorFilter !== "all" && normalizeSector(rfq.sector) !== teamSectorFilter) return false;
        if (!normalizedSearchTerm) return true;
        return buildSearchHaystack(rfq).includes(normalizedSearchTerm);
      }),
    [teamData, teamPersonFilter, teamSectorFilter, normalizedSearchTerm]
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

  const filterOldOpts = (vals) =>
    Array.from(new Set(vals.filter((v) => {
      if (v === null || v === undefined) return false;
      const s = String(v).trim();
      return s !== "" && s !== "-" && s.toLowerCase() !== "empty";
    }))).sort((a, b) => String(a).localeCompare(String(b)));

  const oldCustomerOptions = useMemo(
    () => filterOldOpts(oldRfqProjects.map((p) => p.customers)),
    [oldRfqProjects]
  );
  const oldKamOptions = useMemo(
    () => filterOldOpts(oldRfqProjects.map((p) => p.kam)),
    [oldRfqProjects]
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
    () => filterOldOpts(oldRfqProjects.map((p) => p.status_name)),
    [oldRfqProjects]
  );

  const filteredOldRfqs = useMemo(() => {
    const search = oldSearchTerm.trim().toLowerCase();

    return oldRfqProjects.filter((project) => {
      if (oldCustomerFilter && project.customers !== oldCustomerFilter) return false;
      if (oldKamFilter && project.kam !== oldKamFilter) return false;
      if (oldSectorFilter && project.sector !== oldSectorFilter) return false;
      if (oldApplicationFilter && project.application !== oldApplicationFilter) return false;
      if (oldBusinessTypeFilter && project.type_business !== oldBusinessTypeFilter) return false;
      if (oldStatusFilter && project.status_name !== oldStatusFilter) return false;
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
    setEditingSubitemId(null);
    setEditingSubitemData({});
    setSavingSubitemId(null);
  };

  const NON_EDITABLE_OLD_RFQ_COLUMNS = new Set(["old_rfq_id", "excel_row_number", "subitems_count"]);

  const isOldRfqColumnEditable = (columnName) => !NON_EDITABLE_OLD_RFQ_COLUMNS.has(columnName);

  const NON_EDITABLE_SUBITEM_COLUMNS = new Set(["old_rfq_subitem_id", "old_rfq_id", "excel_row_number", "subitem_order", "parent_id"]);

  const isSubitemColumnEditable = (columnName) => !NON_EDITABLE_SUBITEM_COLUMNS.has(columnName);

  const handleStartSubitemEdit = (subitem) => {
    setEditingSubitemId(subitem.old_rfq_subitem_id);
    setEditingSubitemData({ ...subitem });
  };

  const handleCancelSubitemEdit = () => {
    setEditingSubitemId(null);
    setEditingSubitemData({});
    setSavingSubitemId(null);
  };

  const handleSubitemEditFieldChange = (columnName, value) => {
    setEditingSubitemData((prev) => ({ ...prev, [columnName]: value }));
  };

  const handleSaveSubitemRow = async (subitemId) => {
    setSavingSubitemId(subitemId);
    try {
      const payload = {};
      oldRfqSubitemColumns.forEach((columnName) => {
        if (isSubitemColumnEditable(columnName)) {
          payload[columnName] = editingSubitemData?.[columnName] ?? null;
        }
      });

      const response = await updateOldRfqSubitem(subitemId, payload);
      const updatedItem = response?.item || editingSubitemData;

      setSelectedOldProject((prev) =>
        prev
          ? {
              ...prev,
              subitems: (prev.subitems || []).map((s) =>
                s.old_rfq_subitem_id === subitemId ? { ...s, ...updatedItem } : s
              ),
            }
          : prev
      );
      setOldRfqs((prev) =>
        prev.map((project) =>
          project.old_rfq_id === updatedItem.old_rfq_id
            ? {
                ...project,
                subitems: (project.subitems || []).map((s) =>
                  s.old_rfq_subitem_id === subitemId ? { ...s, ...updatedItem } : s
                ),
              }
            : project
        )
      );

      setEditingSubitemId(null);
      setEditingSubitemData({});
      setSavingSubitemId(null);
      showToast("Subitem updated successfully.", { type: "success", title: "Saved" });
    } catch {
      setSavingSubitemId(null);
      showToast("Unable to update subitem.", { type: "error", title: "Save failed" });
    }
  };

  const handleStartOldRfqEdit = (project) => {
    setEditingOldRfqId(project.old_rfq_id);
    setEditingOldRfqData({ ...project });
  };

  const handleCancelOldRfqEdit = () => {
    setEditingOldRfqId(null);
    setEditingOldRfqData({});
    setSavingOldRfqId(null);
  };

  const handleOldRfqEditFieldChange = (columnName, value) => {
    setEditingOldRfqData((prev) => ({ ...prev, [columnName]: value }));
  };

  const handleSaveOldRfqRow = async (oldRfqId) => {
    setSavingOldRfqId(oldRfqId);
    try {
      const payload = {};
      oldRfqProjectColumns.forEach((columnName) => {
        if (isOldRfqColumnEditable(columnName)) {
          payload[columnName] = editingOldRfqData?.[columnName] ?? null;
        }
      });

      const response = await updateOldRfq(oldRfqId, payload);
      const updatedItem = response?.item || editingOldRfqData;

      setOldRfqs((prev) =>
        prev.map((project) =>
          project.old_rfq_id === oldRfqId
            ? { ...project, ...updatedItem }
            : project
        )
      );

      setEditingOldRfqId(null);
      setEditingOldRfqData({});
      setSavingOldRfqId(null);
      showToast("RFQ history row updated successfully.", { type: "success", title: "Saved" });
    } catch {
      setSavingOldRfqId(null);
      showToast("Unable to update RFQ history row.", { type: "error", title: "Save failed" });
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
  }, [activeSubStatus, activeTypeFilter, detailedSectorFilter, globalPhaseFilter, globalSectorFilter, teamKamFilter, teamPersonFilter, teamSectorFilter, selectedDetailedProductLine, selectedGlobalProductLine, selectedTeamProductLine, rowsPerPage, searchTerm, viewMode, oldSearchTerm, oldCustomerFilter, oldKamFilter, oldSectorFilter, oldApplicationFilter, oldBusinessTypeFilter, oldStatusFilter]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  useEffect(() => {
    if (!canSeeTeamView && viewMode === "team") {
      setViewMode("detailed");
    }
  }, [canSeeTeamView, viewMode]);

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
            <div className="flex flex-col gap-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-soft">
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
                    className="gradient-button rounded-xl px-4 py-3 text-sm font-semibold shadow-soft"
                  >
                    + New request
                  </Link>
                </div>
              </div>

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

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Detailed View</p>
                      <h2 className="font-display text-2xl text-ink">
                        Requests
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex w-full flex-col gap-1 sm:w-72">
                        <span className="invisible text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
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
                            className="input-field w-full pl-10"
                            type="search"
                            placeholder="Search requests"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                          />
                        </div>
                      </div>
                      {showDetailedTypeFilter ? (
                        <div className="flex flex-col gap-1 sm:self-end">
                          <label
                            className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400"
                            htmlFor="typeFilter"
                          >
                            Type
                          </label>
                          <div className="group relative">
                            <select
                              id="typeFilter"
                              className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                              value={effectiveDetailedTypeFilter}
                              onChange={(event) => setActiveTypeFilter(event.target.value)}
                            >
                              {detailedTypeFilterOptions.map((option) => (
                                <option key={option.key} value={option.key}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </span>
                          </div>
                        </div>
                      ) : null}
                      <div className="flex flex-col gap-1 sm:self-end">
                        <label
                          className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400"
                          htmlFor="detailedSectorFilter"
                        >
                          Sector
                        </label>
                        <div className="group relative">
                          <select
                            id="detailedSectorFilter"
                            className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                            value={detailedSectorFilter}
                            onChange={(event) => setDetailedSectorFilter(event.target.value)}
                          >
                            <option value="all">All Sectors</option>
                            <option value="automotive">Automotive</option>
                            <option value="non-automotive">Non-Automotive</option>
                          </select>
                          <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end">
                        <label
                          className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400"
                          htmlFor="subStatusFilter"
                        >
                          Status
                        </label>
                        <div className="group relative">
                          <select
                            id="subStatusFilter"
                            className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                            value={activeSubStatus}
                            onChange={(event) => setActiveSubStatus(event.target.value)}
                          >
                            <option value="all">All</option>
                            {subStatusOptions.map((status) => (
                              <option key={status} value={status}>
                                {FILTER_STATUS_LABELS[status] || status}
                              </option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </span>
                        </div>
                      </div>
                      {shouldShowDetailedProductLineFilter && (
                        <div className="flex flex-col gap-1 sm:self-end">
                          <label
                            className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400"
                            htmlFor="detailedProductLineFilter"
                          >
                            Product Line
                          </label>
                          <div className="group relative">
                            <select
                              id="detailedProductLineFilter"
                              className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                              value={selectedDetailedProductLine}
                              onChange={(event) => setSelectedDetailedProductLine(event.target.value)}
                            >
                              <option value="ALL">All Product Lines</option>
                              {detailedProductLineOptions.map((pl) => (
                                <option key={pl} value={pl}>{pl}</option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </span>
                          </div>
                        </div>
                      )}
                      <span className="badge mt-3 border-sun/40 bg-gradient-to-r from-sun/20 to-sun/5 px-4 py-2 text-sm font-semibold text-sun shadow-soft sm:mt-4">
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
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Global View</p>
                      <h2 className="font-display text-2xl text-ink">
                        All requests
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex w-full flex-col gap-1 sm:w-72">
                        <span className="invisible text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
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
                            className="input-field w-full pl-10"
                            type="search"
                            placeholder="Search all requests"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end">
                        <label
                          className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400"
                          htmlFor="globalTypeFilter"
                        >
                          Type
                        </label>
                        <div className="group relative">
                          <select
                            id="globalTypeFilter"
                            className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                            value={activeTypeFilter}
                            onChange={(event) => setActiveTypeFilter(event.target.value)}
                          >
                            {TYPE_FILTER_OPTIONS.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end">
                        <label
                          className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400"
                          htmlFor="globalPhaseFilter"
                        >
                          Phase
                        </label>
                        <div className="group relative">
                          <select
                            id="globalPhaseFilter"
                            className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                            value={globalPhaseFilter}
                            onChange={(event) => setGlobalPhaseFilter(event.target.value)}
                          >
                            <option value="all">All phases</option>
                            {PHASES.map((phase) => (
                              <option key={phase.key} value={phase.key}>
                                {phase.label}
                              </option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end">
                        <label
                          className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400"
                          htmlFor="globalSectorFilter"
                        >
                          Sector
                        </label>
                        <div className="group relative">
                          <select
                            id="globalSectorFilter"
                            className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                            value={globalSectorFilter}
                            onChange={(event) => setGlobalSectorFilter(event.target.value)}
                          >
                            <option value="all">All Sectors</option>
                            <option value="automotive">Automotive</option>
                            <option value="non-automotive">Non-Automotive</option>
                          </select>
                          <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </span>
                        </div>
                      </div>
                      {shouldShowGlobalProductLineFilter && (
                        <div className="flex flex-col gap-1 sm:self-end">
                          <label
                            className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400"
                            htmlFor="globalProductLineFilter"
                          >
                            Product Line
                          </label>
                          <div className="group relative">
                            <select
                              id="globalProductLineFilter"
                              className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                              value={selectedGlobalProductLine}
                              onChange={(event) => setSelectedGlobalProductLine(event.target.value)}
                            >
                              <option value="ALL">All Product Lines</option>
                              {globalProductLineOptions.map((pl) => (
                                <option key={pl} value={pl}>{pl}</option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </span>
                          </div>
                        </div>
                      )}
                      <span className="badge mt-3 border-sun/40 bg-gradient-to-r from-sun/20 to-sun/5 px-4 py-2 text-sm font-semibold text-sun shadow-soft sm:mt-4">
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
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">RFQ History View</p>
                      <h2 className="font-display text-2xl text-ink">Old projects</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex w-full flex-col gap-1 sm:w-56">
                        <span className="invisible text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">Search</span>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3">
                              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                            </svg>
                          </span>
                          <input
                            className="input-field w-full pl-10"
                            type="search"
                            placeholder="Search old projects…"
                            value={oldSearchTerm}
                            onChange={(event) => setOldSearchTerm(event.target.value)}
                          />
                        </div>
                      </div>
                      {oldCustomerOptions.length > 0 && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-40">
                          <label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400" htmlFor="oldCustomerFilter">Customer</label>
                          <div className="group relative">
                            <select
                              id="oldCustomerFilter"
                              className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                              value={oldCustomerFilter}
                              onChange={(event) => setOldCustomerFilter(event.target.value)}
                            >
                              <option value="">All Customers</option>
                              {oldCustomerOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                            <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                            </span>
                          </div>
                        </div>
                      )}
                      {oldKamOptions.length > 0 && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-36">
                          <label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400" htmlFor="oldKamFilter">KAM</label>
                          <div className="group relative">
                            <select
                              id="oldKamFilter"
                              className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                              value={oldKamFilter}
                              onChange={(event) => setOldKamFilter(event.target.value)}
                            >
                              <option value="">All KAMs</option>
                              {oldKamOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                            <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                            </span>
                          </div>
                        </div>
                      )}
                      {oldSectorOptions.length > 0 && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-36">
                          <label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400" htmlFor="oldSectorFilter">Sector</label>
                          <div className="group relative">
                            <select
                              id="oldSectorFilter"
                              className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                              value={oldSectorFilter}
                              onChange={(event) => setOldSectorFilter(event.target.value)}
                            >
                              <option value="">All Sectors</option>
                              {oldSectorOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                            <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                            </span>
                          </div>
                        </div>
                      )}
                      {oldApplicationOptions.length > 0 && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-44">
                          <label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400" htmlFor="oldApplicationFilter">Application</label>
                          <div className="group relative">
                            <select
                              id="oldApplicationFilter"
                              className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                              value={oldApplicationFilter}
                              onChange={(event) => setOldApplicationFilter(event.target.value)}
                            >
                              <option value="">All Applications</option>
                              {oldApplicationOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                            <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                            </span>
                          </div>
                        </div>
                      )}
                      {oldBusinessTypeOptions.length > 0 && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-44">
                          <label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400" htmlFor="oldBusinessTypeFilter">Business Type</label>
                          <div className="group relative">
                            <select
                              id="oldBusinessTypeFilter"
                              className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                              value={oldBusinessTypeFilter}
                              onChange={(event) => setOldBusinessTypeFilter(event.target.value)}
                            >
                              <option value="">All Business Types</option>
                              {oldBusinessTypeOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                            <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                            </span>
                          </div>
                        </div>
                      )}
                      {oldStatusOptions.length > 0 && (
                        <div className="flex flex-col gap-1 sm:self-end sm:w-36">
                          <label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400" htmlFor="oldStatusFilter">Status</label>
                          <div className="group relative">
                            <select
                              id="oldStatusFilter"
                              className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                              value={oldStatusFilter}
                              onChange={(event) => setOldStatusFilter(event.target.value)}
                            >
                              <option value="">All Statuses</option>
                              {oldStatusOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                            <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                            </span>
                          </div>
                        </div>
                      )}
                      <span className="badge mt-3 border-sun/40 bg-gradient-to-r from-sun/20 to-sun/5 px-4 py-2 text-sm font-semibold text-sun shadow-soft sm:mt-4">
                        {formatRequestCount(filteredOldRfqs.length)}
                      </span>
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
                              {oldRfqProjectColumns.map((colName) => (
                                <th key={colName}>{getOldRfqProjectColumnLabel(colName)}</th>
                              ))}
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedRfqs.length > 0 ? paginatedRfqs.map((project) => {
                              const isEditingThisRow = editingOldRfqId === project.old_rfq_id;
                              return (
                              <tr
                                key={project.old_rfq_id ?? project.name}
                                className={`border-t border-slate-200/60 text-slate-600 transition ${isEditingThisRow ? "bg-blue-50/40" : "hover:bg-white/70"}`}
                              >
                                {oldRfqProjectColumns.map((colName) => {
                                  const isEditableColumn = isOldRfqColumnEditable(colName);
                                  return (
                                  <td key={colName}>
                                    {isEditingThisRow && isEditableColumn ? (
                                      <input
                                        type="text"
                                        className="history-inline-edit-input"
                                        value={editingOldRfqData?.[colName] ?? ""}
                                        onChange={(e) => handleOldRfqEditFieldChange(colName, e.target.value)}
                                      />
                                    ) : HISTORY_BADGE_COLUMNS.has(colName) ? (
                                      <HistoryValueBadge columnName={colName} value={project[colName]} />
                                    ) : (
                                      <TruncatedCell value={project[colName]} />
                                    )}
                                  </td>
                                  );
                                })}
                                <td className="history-action-cell">
                                  <div className="flex flex-row flex-wrap items-center gap-1">
                                    {(project.subitems?.length ?? 0) > 0 ? (
                                      <button
                                        type="button"
                                        className="history-subitems-btn inline-flex items-center justify-center whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-sm"
                                        style={{ borderColor: "#ef7807", backgroundColor: "#ef7807" }}
                                        onClick={() => handleOpenSubitemsModal(project)}
                                      >
                                        View subitems ({project.subitems.length})
                                      </button>
                                    ) : (
                                      <span className="history-muted text-xs font-medium text-slate-400">No subitems</span>
                                    )}
                                    {isEditingThisRow ? (
                                      <>
                                        <button
                                          type="button"
                                          className="history-save-btn"
                                          disabled={savingOldRfqId === project.old_rfq_id}
                                          onClick={() => handleSaveOldRfqRow(project.old_rfq_id)}
                                        >
                                          {savingOldRfqId === project.old_rfq_id ? "Saving..." : "Save"}
                                        </button>
                                        <button
                                          type="button"
                                          className="history-cancel-btn"
                                          disabled={savingOldRfqId === project.old_rfq_id}
                                          onClick={handleCancelOldRfqEdit}
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        className="history-subitems-btn inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                                        style={{ borderColor: "#046eaf", backgroundColor: "#046eaf" }}
                                        disabled={editingOldRfqId !== null}
                                        onClick={() => handleStartOldRfqEdit(project)}
                                      >
                                        <Pencil size={12} />
                                        Update
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              );
                            }) : (
                              <tr>
                                <td colSpan={oldRfqProjectColumns.length + 1} className="px-4 py-16 text-center text-sm text-slate-400">
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
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Team View</p>
                      <h2 className="font-display text-2xl text-ink">
                        My team
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex w-full flex-col gap-1 sm:w-72">
                        <span className="invisible text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
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
                            className="input-field w-full pl-10"
                            type="search"
                            placeholder="Search all requests"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end">
                        <label
                          className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400"
                          htmlFor="teamPersonFilter"
                        >
                          Person
                        </label>
                        <div className="group relative">
                          <select
                            id="teamPersonFilter"
                            className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                            value={teamPersonFilter}
                            onChange={(event) => setTeamPersonFilter(event.target.value)}
                          >
                            <option value="all">All people</option>
                            {teamMembers.map((m) => (
                              <option key={m.email} value={m.email}>{m.person}</option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 sm:self-end">
                        <label
                          className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400"
                          htmlFor="teamSectorFilter"
                        >
                          Sector
                        </label>
                        <div className="group relative">
                          <select
                            id="teamSectorFilter"
                            className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                            value={teamSectorFilter}
                            onChange={(event) => setTeamSectorFilter(event.target.value)}
                          >
                            <option value="all">All Sectors</option>
                            <option value="automotive">Automotive</option>
                            <option value="non-automotive">Non-Automotive</option>
                          </select>
                          <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </span>
                        </div>
                      </div>
                      {shouldShowTeamProductLineFilter && (
                        <div className="flex flex-col gap-1 sm:self-end">
                          <label
                            className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400"
                            htmlFor="teamProductLineFilter"
                          >
                            Product Line
                          </label>
                          <div className="group relative">
                            <select
                              id="teamProductLineFilter"
                              className="w-full appearance-none rounded-2xl border border-tide/40 bg-gradient-to-r from-tide/20 to-tide/5 px-4 py-3 pr-10 text-sm font-semibold text-tide shadow-soft transition hover:border-tide/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-tide/30"
                              value={selectedTeamProductLine}
                              onChange={(event) => setSelectedTeamProductLine(event.target.value)}
                            >
                              <option value="ALL">All Product Lines</option>
                              {teamProductLineOptions.map((pl) => (
                                <option key={pl} value={pl}>{pl}</option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute right-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-tide transition-transform duration-200 group-focus-within:rotate-180">
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </span>
                          </div>
                        </div>
                      )}
                      <span className="badge mt-3 border-sun/40 bg-gradient-to-r from-sun/20 to-sun/5 px-4 py-2 text-sm font-semibold text-sun shadow-soft sm:mt-4">
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
            className="chat-modal w-[min(96vw,1600px)] border border-slate-200/80 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-subitems-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">RFQ History View</p>
                <p id="history-subitems-modal-title" className="chat-modal-title mt-1">
                  {selectedOldProject.project_name || selectedOldProject.name || "Project subitems"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {[selectedOldProject.customers, selectedOldProject.kam, `${selectedOldProject.subitems_count} subitems`]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
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
            <div className="chat-modal-body bg-gradient-to-b from-slate-50/40 to-white">
              {(selectedOldProject.subitems || []).length > 0 ? (
                <div className="history-subitems-scroll px-6 py-6">
                  <table className="history-subitems-table text-left text-sm">
                    <thead className="bg-slate-100/80 text-xs uppercase tracking-widest text-slate-500">
                      <tr>
                        {oldRfqSubitemColumns.map((colName) => (
                          <th key={colName}>{getOldRfqSubitemColumnLabel(colName)}</th>
                        ))}
                        <th className="history-subitem-action-cell">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedOldProject.subitems || []).map((subitem, index) => {
                        const isEditingThisSubitem = editingSubitemId === subitem.old_rfq_subitem_id;
                        return (
                          <tr
                            key={`${selectedOldProject.old_rfq_id}-subitem-${index}`}
                            className={`border-t border-slate-200/60 text-slate-600 transition ${isEditingThisSubitem ? "bg-blue-50/40" : "hover:bg-white/70"}`}
                          >
                            {oldRfqSubitemColumns.map((colName) => {
                              const editable = isSubitemColumnEditable(colName);
                              return (
                                <td key={colName}>
                                  {isEditingThisSubitem && editable ? (
                                    <input
                                      type="text"
                                      className="history-inline-edit-input"
                                      value={editingSubitemData?.[colName] ?? ""}
                                      onChange={(e) => handleSubitemEditFieldChange(colName, e.target.value)}
                                    />
                                  ) : (
                                    <TruncatedCell value={subitem[colName]} />
                                  )}
                                </td>
                              );
                            })}
                            <td className="history-subitem-action-cell">
                              <div className="flex flex-row flex-wrap items-center gap-1">
                                {isEditingThisSubitem ? (
                                  <>
                                    <button
                                      type="button"
                                      className="history-save-btn"
                                      disabled={savingSubitemId === subitem.old_rfq_subitem_id}
                                      onClick={() => handleSaveSubitemRow(subitem.old_rfq_subitem_id)}
                                    >
                                      {savingSubitemId === subitem.old_rfq_subitem_id ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      type="button"
                                      className="history-cancel-btn"
                                      disabled={savingSubitemId === subitem.old_rfq_subitem_id}
                                      onClick={handleCancelSubitemEdit}
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="history-subitems-btn inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                                    style={{ borderColor: "#046eaf", backgroundColor: "#046eaf" }}
                                    disabled={editingSubitemId !== null}
                                    onClick={() => handleStartSubitemEdit(subitem)}
                                  >
                                    <Pencil size={12} />
                                    Update
                                  </button>
                                )}
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
    </div>
  );
}
