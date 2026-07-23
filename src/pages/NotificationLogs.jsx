import { useEffect, useMemo, useState } from "react";
import { getNotificationLogs } from "../api";

function getEmailTypeBadgeClass(emailType) {
  const a = String(emailType || "").toLowerCase();
  if (a.includes("reject") || a.includes("delete") || a.includes("cancel")) {
    return "border-red-200 bg-red-50 text-red-600";
  }
  if (a.includes("approve") || a.includes("accept") || a.includes("complete") || a.includes("ready")) {
    return "border-mint/40 bg-mint/10 text-mint";
  }
  if (a.includes("request") || a.includes("entry") || a.includes("begin")) {
    return "border-tide/30 bg-tide/10 text-tide";
  }
  if (a.includes("reminder") || a.includes("revision") || a.includes("revalidation")) {
    return "border-sun/30 bg-sun/10 text-sun";
  }
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function getInitials(text) {
  const clean = String(text || "").trim();
  if (!clean) return "?";
  const parts = clean.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatTimestamp(value) {
  if (!value) return { absolute: "—", relative: "" };
  const date = new Date(value);
  const absolute = date.toLocaleString();
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  let relative;
  if (diffMin < 1) relative = "just now";
  else if (diffMin < 60) relative = `${diffMin}m ago`;
  else if (diffMin < 1440) relative = `${Math.round(diffMin / 60)}h ago`;
  else relative = `${Math.round(diffMin / 1440)}d ago`;
  return { absolute, relative };
}

export default function NotificationLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNotificationLogs();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || "Unable to load notification logs.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return logs;
    }
    return logs.filter((log) =>
      [log.systematic_rfq_id, log.email_type, log.recipient_email].some((value) =>
        String(value || "").toLowerCase().includes(term)
      )
    );
  }, [searchTerm, logs]);

  const stats = useMemo(() => {
    const rfqs = new Set(logs.map((log) => log.systematic_rfq_id || log.rfq_id).filter(Boolean));
    const recipients = new Set(logs.map((log) => log.recipient_email).filter(Boolean));
    return { total: logs.length, rfqs: rfqs.size, recipients: recipients.size };
  }, [logs]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-100/60 px-6 py-10">
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-tide to-tide/70 text-white shadow-soft">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16v16H4z" />
                <path d="M4 6l8 7 8-7" />
              </svg>
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                System
              </p>
              <h1 className="font-display text-3xl text-ink">Notification logs</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <input
                className="input-field w-full pl-10"
                type="search"
                placeholder="Search RFQ, email type, recipient..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16.2 16.2L20 20" />
                </svg>
              </span>
            </div>
            <button
              type="button"
              onClick={() => void loadLogs()}
              className="outline-button flex items-center gap-2 px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 11a8 8 0 1 0-2.34 5.66" />
                <path d="M20 5v6h-6" />
              </svg>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-soft">
            <span className="absolute left-0 top-0 h-full w-1.5 rounded-r-full bg-tide" />
            <p className="pl-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Total logs
            </p>
            <p className="pl-2 mt-1 font-display text-3xl text-ink">{stats.total}</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-soft">
            <span className="absolute left-0 top-0 h-full w-1.5 rounded-r-full bg-mint" />
            <p className="pl-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              RFQs touched
            </p>
            <p className="pl-2 mt-1 font-display text-3xl text-ink">{stats.rfqs}</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-soft">
            <span className="absolute left-0 top-0 h-full w-1.5 rounded-r-full bg-sun" />
            <p className="pl-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Recipients
            </p>
            <p className="pl-2 mt-1 font-display text-3xl text-ink">{stats.recipients}</p>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 shadow-soft">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Loading notification logs...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {searchTerm ? "No logs match your search." : "No notification logs found."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100/90 text-xs uppercase tracking-widest text-slate-500 backdrop-blur">
                  <tr>
                    <th className="px-6 py-4 whitespace-nowrap">Timestamp</th>
                    <th className="px-6 py-4 whitespace-nowrap">RFQ ID</th>
                    <th className="px-6 py-4">Email type</th>
                    <th className="px-6 py-4 whitespace-nowrap">Recipient</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => {
                    const { absolute, relative } = formatTimestamp(log.sent_at);
                    return (
                      <tr
                        key={log.log_id}
                        className="border-t border-slate-200/60 text-slate-600 transition hover:bg-slate-50/80"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="font-medium text-slate-700">{absolute}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{relative}</p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-semibold text-ink">
                          {log.systematic_rfq_id || "—"}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`badge ${getEmailTypeBadgeClass(log.email_type)}`}>
                            {log.email_type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                              {getInitials(log.recipient_email)}
                            </span>
                            <span className="font-medium text-slate-700">
                              {log.recipient_email}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
