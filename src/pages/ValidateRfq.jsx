import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TopBar from "../components/TopBar.jsx";
import { getRfq, validateRfq } from "../api";
import { mapBackendStatusToUi } from "../utils/rfq.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const resolveFileUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
};

const formatStatus = (status) => {
  if (!status) return "—";
  return String(status)
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const normalizeFiles = (rfq) => {
  const data = rfq?.rfq_data || {};
  const validatorEmail =
    data.zone_manager_email ||
    rfq?.zone_manager_email ||
    data.validator_email ||
    "—";
  const raw =
    data.rfq_files ||
    data.files ||
    data.attachments ||
    data.rfq_file_path ||
    data.rfq_file_paths ||
    [];
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];

  return items.map((entry, index) => {
    if (typeof entry === "string") {
      const name = entry.split("/").pop() || `file-${index + 1}`;
      if (entry.startsWith("/") || entry.startsWith("http")) {
        return { name, url: resolveFileUrl(entry) };
      }
      if (data.rfq_file_path) {
        return { name, url: resolveFileUrl(data.rfq_file_path) };
      }
      return { name, url: "" };
    }
    const name =
      entry?.name ||
      entry?.filename ||
      entry?.file_name ||
      entry?.original_name ||
      `file-${index + 1}`;
    const url = resolveFileUrl(entry?.url || entry?.path || entry?.file_url || "");
    return { name, url };
  });
};

export default function ValidateRfq() {
  const { id } = useParams();
  const [rfq, setRfq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(null);
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    let active = true;
    if (!id) return;
    setLoading(true);
    setError("");
    setErrorStatus(null);
    getRfq(id)
      .then((data) => {
        if (!active) return;
        setRfq(data);
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || "Unable to load this RFQ.");
        setErrorStatus(err?.status || null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const data = rfq?.rfq_data || {};
  const phaseValue =
    typeof rfq?.phase === "string" ? rfq?.phase : rfq?.phase?.value;
  const subStatusValue =
    typeof rfq?.sub_status === "string" ? rfq?.sub_status : rfq?.sub_status?.value;
  const legacyStatusValue =
    typeof rfq?.status === "string" ? rfq?.status : rfq?.status?.value;
  const statusValue = subStatusValue || legacyStatusValue;
  const statusLabel = rfq ? mapBackendStatusToUi(rfq) : "—";
  const canValidate =
    statusValue === "PENDING_VALIDATION" ||
    (phaseValue === "RFQ" && subStatusValue === "IN_VALIDATION");
  const validatorEmail =
    data.zone_manager_email ||
    rfq?.zone_manager_email ||
    data.validator_email ||
    "—";

  const infoItems = useMemo(
    () => [
      { label: "RFQ ID", value: data.systematic_rfq_id || rfq?.rfq_id || "—" },
      { label: "Customer", value: data.customer_name || data.customer || "—" },
      { label: "Application", value: data.application || "—" },
      {
        label: "Product",
        value: data.product_name || data.product_line_acronym || "—"
      },
      { label: "Product line", value: data.product_line_acronym || "—" },
      { label: "Delivery zone", value: data.delivery_zone || "—" },
      { label: "Country", value: data.country || "—" },
      { label: "Annual volume", value: data.annual_volume || "—" },
      { label: "TO Total (K€)", value: data.to_total || "—" },
      { label: "Zone Manager", value: validatorEmail }
    ],
    [data, rfq?.rfq_id, rfq?.zone_manager_email, validatorEmail]
  );

  const files = useMemo(() => normalizeFiles(rfq), [rfq]);

  const handleApprove = async () => {
    if (!id || !canValidate) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await validateRfq(id, { approved: true });
      setSuccess("RFQ accepted successfully.");
      setRfq((prev) =>
        prev
          ? {
              ...prev,
              phase: "COSTING",
              sub_status: "FEASIBILITY",
              status: "IN_COSTING_FEASIBILITY"
            }
          : prev
      );
    } catch (err) {
      setError(err?.message || "Unable to accept this RFQ.");
      setErrorStatus(err?.status || null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!id || !canValidate) return;
    if (!rejectionReason.trim()) {
      setError("Please provide a rejection reason.");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await validateRfq(id, {
        approved: false,
        rejection_reason: rejectionReason.trim()
      });
      setSuccess("RFQ rejected. The requester has been notified.");
      setRfq((prev) =>
        prev
          ? {
              ...prev,
              phase: "CLOSED",
              sub_status: "LOST",
              status: "REJECTED"
            }
          : prev
      );
    } catch (err) {
      setError(err?.message || "Unable to reject this RFQ.");
      setErrorStatus(err?.status || null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <TopBar />

      <div className="px-6 py-10">
        <div className="w-full">
          <div className="app-shell rounded-[32px] border border-slate-200/70 p-6 shadow-card md:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Validation
                  </p>
                  <h2 className="font-display text-3xl text-ink">
                    Review &amp; Validate RFQ
                  </h2>
                </div>
                <span className="badge border-slate-300 bg-white text-slate-600">
                  {statusLabel}
                </span>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-sm text-slate-500">
                  Loading RFQ...
                </div>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
                  <p>{error}</p>
                  {errorStatus === 401 ? (
                    <p className="mt-2 text-xs text-coral">
                      Please sign in to validate this RFQ.{" "}
                      <Link to="/" className="font-semibold underline">
                        Go to login
                      </Link>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {success ? (
                <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {success}
                </div>
              ) : null}

              {rfq ? (
                <div className="card p-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {infoItems.map((item) => (
                      <div key={item.label} className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                          {item.label}
                        </p>
                        <p className="text-sm font-semibold text-ink">
                          {item.value || "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {rfq && files.length ? (
                <div className="card p-6">
                  <h3 className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    RFQ Files
                  </h3>
                  <div className="mt-4 flex flex-col gap-2">
                    {files.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/90 px-4 py-3 text-sm text-slate-600"
                      >
                        <span className="font-medium text-ink">{file.name}</span>
                        {file.url ? (
                          <a
                            href={file.url}
                            className="outline-button px-3 py-2 text-xs"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open file
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">No link</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {rfq ? (
                <div className="card p-6">
                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                        Decision
                      </p>
                      <h3 className="mt-2 font-display text-2xl text-ink">
                        Accept or Reject
                      </h3>
                    </div>

                    {!canValidate ? (
                      <p className="text-sm text-slate-500">
                        This RFQ is not pending validation. No action is required.
                      </p>
                    ) : (
                      <>
                        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          <span>Rejection reason (required if rejecting)</span>
                          <textarea
                            className="textarea-field min-h-[120px]"
                            value={rejectionReason}
                            onChange={(event) => setRejectionReason(event.target.value)}
                            placeholder="Explain why this RFQ is rejected..."
                          />
                        </label>

                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            className="gradient-button rounded-xl px-5 py-3 text-sm font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={handleApprove}
                            disabled={submitting}
                          >
                            Accept RFQ
                          </button>
                          <button
                            type="button"
                            className="outline-button px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={handleReject}
                            disabled={submitting}
                          >
                            Reject RFQ
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
