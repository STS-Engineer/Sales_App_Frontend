import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TopBar from "../components/TopBar.jsx";
import RfqTable from "../components/RfqTable.jsx";
import { listRfqs } from "../api";
import { mapRfqToRow } from "../utils/rfq.js";

const STATUS_OPTIONS = [
  { key: "RFQ", label: "RFQ" },
  { key: "In costing", label: "In costing" },
  { key: "Offer preparation", label: "Offer preparation" },
  { key: "Offer validation", label: "Offer validation" },
  { key: "Get PO", label: "Get PO" },
  { key: "PO accepted", label: "PO accepted" },
  { key: "Mission accepted", label: "Mission accepted" },
  { key: "Mission not accepted", label: "Mission not accepted" },
  { key: "Get prototype orders", label: "Get prototype orders" },
  { key: "Prototype ongoing", label: "Prototype ongoing" },
  { key: "Lost", label: "Lost" },
  { key: "Cancelled", label: "Cancelled" }
];

// Visual type per status: "active" | "done" | "danger"
const STATUS_TYPES = {
  "RFQ": "active",
  "In costing": "active",
  "Offer preparation": "active",
  "Offer validation": "active",
  "Get PO": "active",
  "PO accepted": "done",
  "Mission accepted": "done",
  "Mission not accepted": "danger",
  "Get prototype orders": "active",
  "Prototype ongoing": "done",
  "Lost": "danger",
  "Cancelled": "danger"
};

const statusKeys = STATUS_OPTIONS.map((item) => item.key);
const ROWS_PER_PAGE_OPTIONS = [5, 10, 20, 50];

const normalizeStatus = (status) => {
  if (statusKeys.includes(status)) return status;
  return "RFQ";
};

const buildPageItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items = [1];
  const left = Math.max(2, currentPage - 1);
  const right = Math.min(totalPages - 1, currentPage + 1);

  if (left > 2) items.push("…");
  for (let page = left; page <= right; page += 1) {
    items.push(page);
  }
  if (right < totalPages - 1) items.push("…");
  items.push(totalPages);

  return items;
};

function PipelineStep({ status, count, isActive, onClick }) {
  const type = STATUS_TYPES[status.key] ?? "active";

  let dotClass =
    "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-150 ";

  if (isActive) {
    dotClass += "scale-110 border-blue-300 bg-blue-50 text-blue-600";
  } else if (type === "done") {
    dotClass += "border-emerald-200 bg-emerald-50 text-emerald-600";
  } else if (type === "danger") {
    dotClass += "border-rose-200 bg-rose-50 text-rose-500";
  } else {
    dotClass += "border-slate-200 bg-white text-slate-500";
  }

  let labelClass = "mt-2 max-w-[72px] text-center text-[10px] leading-tight ";
  if (isActive) {
    labelClass += "font-medium text-blue-600";
  } else if (type === "done") {
    labelClass += "text-emerald-600";
  } else if (type === "danger") {
    labelClass += "text-rose-400";
  } else {
    labelClass += "text-slate-400";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-1 cursor-pointer flex-col items-center py-2 focus:outline-none"
    >
      {/* Connector line (right side) — hidden on last child via parent */}
      <div className="pipeline-connector absolute left-1/2 top-6 h-px w-full bg-slate-200" />

      <div className="relative z-10">
        <div className={dotClass}>{count}</div>
      </div>

      <span className={labelClass}>{status.label}</span>
    </button>
  );
}

export default function Dashboard() {
  const [rfqs, setRfqs] = useState([]);
  const [activeStatus, setActiveStatus] = useState("RFQ");
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
      }
    };
    load();
  }, []);

  const normalizedRfqs = useMemo(
    () => rfqs.map((rfq) => ({ ...rfq, status: normalizeStatus(rfq.status) })),
    [rfqs]
  );

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(statusKeys.map((key) => [key, 0]));
    normalizedRfqs.forEach((rfq) => {
      counts[rfq.status] += 1;
    });
    return counts;
  }, [normalizedRfqs]);

  const filteredRfqs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return normalizedRfqs.filter((rfq) => {
      if (rfq.status !== activeStatus) return false;
      if (!term) return true;
      const haystack = [
        rfq.id,
        rfq.customer,
        rfq.client,
        rfq.productName,
        rfq.productLine,
        rfq.item,
        rfq.application,
        rfq.deliveryZone,
        rfq.location,
        rfq.owner,
        rfq.status,
        rfq.dueDate
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [normalizedRfqs, activeStatus, searchTerm]);

  const totalRows = filteredRfqs.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalRows);

  const paginatedRfqs = useMemo(
    () => filteredRfqs.slice(startIndex, endIndex),
    [filteredRfqs, startIndex, endIndex]
  );

  const pageItems = useMemo(
    () => buildPageItems(safePage, pageCount),
    [safePage, pageCount]
  );

  const startItem = totalRows === 0 ? 0 : startIndex + 1;
  const endItem = totalRows === 0 ? 0 : endIndex;

  useEffect(() => {
    setPage(1);
  }, [activeStatus, searchTerm, rowsPerPage]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(Number(event.target.value));
    setPage(1);
  };

  return (
    <div className="min-h-screen">
      <TopBar />

      <div className="px-6 py-10">
        <div className="w-full">
          <div className="app-shell rounded-[32px] border border-slate-200/70 p-6 shadow-card md:p-8">
            <div className="flex flex-col gap-8">

              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Overview</p>
                  <h2 className="font-display text-3xl text-ink">Dashboard</h2>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-full sm:w-64">
                    <input
                      className="input-field w-full"
                      type="search"
                      placeholder="Search RFQs"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>
                  <Link
                    to="/rfqs/new"
                    className="gradient-button rounded-xl px-4 py-3 text-sm font-semibold shadow-soft"
                  >
                    + New RFQ
                  </Link>
                </div>
              </div>

              {/* Pipeline */}
              <div className="card p-6 pt-7">
                {/* Overflow container with horizontal scroll on small screens */}
                <div className="overflow-x-auto py-2">
                  <div className="flex min-w-[860px] items-start py-1">
                    {STATUS_OPTIONS.map((status, index) => (
                      <div
                        key={status.key}
                        className="relative flex flex-1 flex-col items-center"
                      >
                        {/* Connector line between steps */}
                        {index < STATUS_OPTIONS.length - 1 && (
                          <div className="absolute left-1/2 top-5 h-px w-full bg-slate-200" />
                        )}

                        {/* Dot */}
                        <div className="relative z-10 mb-3">
                          <button
                            type="button"
                            onClick={() => setActiveStatus(status.key)}
                            className={[
                              "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-all duration-150 focus:outline-none",
                              activeStatus === status.key
                                ? "scale-110 border-blue-300 bg-blue-50 text-blue-600 shadow-sm"
                                : STATUS_TYPES[status.key] === "done"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-600 hover:scale-105"
                                : STATUS_TYPES[status.key] === "danger"
                                ? "border-rose-200 bg-rose-50 text-rose-500 hover:scale-105"
                                : "border-slate-200 bg-white text-slate-500 hover:scale-105 hover:border-slate-300"
                            ].join(" ")}
                          >
                            {statusCounts[status.key]}
                          </button>
                        </div>

                        {/* Label */}
                        <span
                          className={[
                            "max-w-[80px] text-center text-xs leading-tight",
                            activeStatus === status.key
                              ? "font-medium text-blue-600"
                              : STATUS_TYPES[status.key] === "done"
                              ? "text-emerald-600"
                              : STATUS_TYPES[status.key] === "danger"
                              ? "text-rose-400"
                              : "text-slate-400"
                          ].join(" ")}
                        >
                          {status.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Filtered list header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Filtered list</p>
                  <h2 className="font-display text-2xl text-ink">{activeStatus}</h2>
                </div>
                <span className="badge border-slate-300 bg-white text-slate-600">
                  {filteredRfqs.length} RFQs
                </span>
              </div>

              <RfqTable
                rows={paginatedRfqs}
                footer={
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
                        item === "…" ? (
                          <span key={`ellipsis-${index}`} className="px-2 text-slate-400">
                            …
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
                        onClick={() =>
                          setPage((prev) => Math.min(pageCount, prev + 1))
                        }
                        disabled={safePage === pageCount}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
