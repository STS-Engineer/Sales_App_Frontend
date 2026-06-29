import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TopBar from "../components/TopBar.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import RfqTable from "../components/RfqTable.jsx";
import { listRfqs, getTeamView, getTeamMembers } from "../api";
import { mapRfqToRow } from "../utils/rfq.js";
import { getUserProfile } from "../utils/session.js";

const BASE_VIEW_OPTIONS = [
  { key: "detailed", label: "Detailed View" },
  { key: "global", label: "Global View" }
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

export default function Dashboard() {
  const { showToast } = useToast();
  const { role } = getUserProfile();
  const canSeeTeamView = role === "ZONE_MANAGER";
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
    if (role !== "ZONE_MANAGER") return;
    getTeamMembers()
      .then((data) => setTeamMembers(Array.isArray(data) ? data : []))
      .catch(() => setTeamMembers([]));
  }, [role]);


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

  const activeRows =
    viewMode === "team"
      ? filteredTeamData
      : viewMode === "global"
        ? filteredGlobalRfqs
        : filteredDetailedRfqs;
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
  }, [activeSubStatus, activeTypeFilter, detailedSectorFilter, globalPhaseFilter, globalSectorFilter, teamKamFilter, teamPersonFilter, teamSectorFilter, rowsPerPage, searchTerm, viewMode]);

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
                      <span className="badge mt-3 border-sun/40 bg-gradient-to-r from-sun/20 to-sun/5 px-4 py-2 text-sm font-semibold text-sun shadow-soft sm:mt-4">
                        {formatRequestCount(filteredDetailedRfqs.length)}
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
                      <span className="badge mt-3 border-sun/40 bg-gradient-to-r from-sun/20 to-sun/5 px-4 py-2 text-sm font-semibold text-sun shadow-soft sm:mt-4">
                        {formatRequestCount(filteredGlobalRfqs.length)}
                      </span>
                    </div>
                  </div>

                  <RfqTable
                    rows={paginatedRfqs}
                    showPhaseColumn
                    footer={tableFooter}
                  />
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
                      <span className="badge mt-3 border-sun/40 bg-gradient-to-r from-sun/20 to-sun/5 px-4 py-2 text-sm font-semibold text-sun shadow-soft sm:mt-4">
                        {formatRequestCount(filteredTeamData.length)}
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
    </div>
  );
}
