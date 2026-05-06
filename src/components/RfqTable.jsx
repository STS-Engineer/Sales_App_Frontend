import { Link } from "react-router-dom";

const statusStyles = {
  RFQ: "border-tide/30 bg-tide/10 text-tide",
  Potential: "border-tide/30 bg-tide/10 text-tide",
  "New RFQ": "border-tide/30 bg-tide/10 text-tide",
  Validation: "border-tide/30 bg-tide/10 text-tide",
  "In costing": "border-sun/40 bg-sun/15 text-sun",
  Feasability: "border-sun/40 bg-sun/15 text-sun",
  Pricing: "border-sun/40 bg-sun/15 text-sun",
  "RFI completed": "border-emerald-200 bg-emerald-50 text-emerald-700",
  Offer: "border-ink/25 bg-ink/10 text-ink",
  "Offer preparation": "border-ink/25 bg-ink/10 text-ink",
  "Offer validation": "border-mint/40 bg-mint/15 text-mint",
  PO: "border-mint/40 bg-mint/15 text-mint",
  "Get PO": "border-sun/40 bg-sun/15 text-sun",
  "PO accepted": "border-mint/40 bg-mint/15 text-mint",
  "Mission accepted": "border-tide/30 bg-tide/10 text-tide",
  "Mission status": "border-tide/30 bg-tide/10 text-tide",
  "Mission not accepted": "border-sun/40 bg-sun/15 text-sun",
  Prototype: "border-tide/30 bg-tide/10 text-tide",
  "Get prototype orders": "border-tide/30 bg-tide/10 text-tide",
  "Prototype ongoing": "border-ink/25 bg-ink/10 text-ink",
  Lost: "border-slate-300 bg-slate-100 text-slate-600",
  Cancelled: "border-slate-300 bg-slate-100 text-slate-600",
  "In review": "border-tide/30 bg-tide/10 text-tide",
  New: "border-slate-300 bg-slate-100 text-slate-600",
  Negotiation: "border-sun/40 bg-sun/15 text-sun",
  Prepared: "border-mint/40 bg-mint/15 text-mint"
};

const statusLabels = {
  "New RFQ": "New request",
  Validation: "Pending for validation"
};

const documentTypeStyles = {
  RFQ: "border-tide/30 bg-tide/10 text-tide",
  RFI: "border-coral/30 bg-coral/10 text-coral",
  POTENTIAL: "border-sun/40 bg-sun/15 text-sun"
};

const documentTypeLabels = {
  RFQ: "RFQ",
  RFI: "RFI",
  POTENTIAL: "Potential"
};

const formatToTotal = (value) => {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (typeof value === "number") {
    return `${value.toLocaleString("en-US")} kEUR`;
  }
  return value;
};

const formatValidator = (row) => row.validator || "-";

const formatPhase = (row) => row.phaseKey || row.pipelineStage || "-";

export default function RfqTable({
  rows,
  footer,
  showValidatorColumn = false,
  showPhaseColumn = false
}) {
  const minWidthClass =
    showValidatorColumn && showPhaseColumn
      ? "min-w-[1220px]"
      : showValidatorColumn || showPhaseColumn
        ? "min-w-[1120px]"
        : "min-w-[980px]";

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className={`w-full text-left text-sm ${minWidthClass}`}>
          <thead className="bg-slate-100/80 text-xs uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-4 py-4">Document ID</th>
              <th className="px-4 py-4">Type</th>
              <th className="px-4 py-4">Customer</th>
              <th className="px-4 py-4">Creator</th>
              <th className="px-4 py-4">Product name</th>
              <th className="px-4 py-4">Product line</th>
              <th className="px-4 py-4">Application</th>
              <th className="px-4 py-4">TO Total</th>
              {showPhaseColumn ? (
                <th className="px-4 py-4">Phase</th>
              ) : null}
              {showValidatorColumn ? (
                <th className="px-4 py-4">Validator</th>
              ) : null}
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-slate-200/60 text-slate-600 transition hover:bg-white/70"
              >
                <td className="px-4 py-4 font-semibold text-ink">
                  <span className="block max-w-[150px] truncate">
                    {row.displayId || row.id}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span
                    className={`badge ${
                      documentTypeStyles[row.documentType] ||
                      "border-slate-300 bg-slate-100 text-slate-600"
                    }`}
                  >
                    {documentTypeLabels[row.documentType] || row.documentType || "RFQ"}
                  </span>
                </td>
                <td className="px-4 py-4 font-medium text-slate-700">
                  <span className="block max-w-[150px] truncate">
                    {row.customer || row.client || "-"}
                  </span>
                </td>
                <td className="px-4 py-4 font-medium text-slate-700">
                  <span className="block max-w-[150px] truncate">
                    {row.creator || "-"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="block max-w-[150px] truncate">
                    {row.productName || "-"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="block max-w-[120px] truncate">
                    {row.productLine || row.item || "-"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="block max-w-[140px] truncate">
                    {row.application || "-"}
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap font-medium text-slate-700">
                  <span className="block max-w-[110px] truncate">
                    {formatToTotal(row.toTotal ?? row.budget)}
                  </span>
                </td>
                {showPhaseColumn ? (
                  <td className="px-4 py-4">
                    <span
                      className={`badge ${
                        statusStyles[formatPhase(row)] ||
                        "border-slate-300 bg-slate-100 text-slate-600"
                      }`}
                    >
                      {formatPhase(row)}
                    </span>
                  </td>
                ) : null}
                {showValidatorColumn ? (
                  <td className="px-4 py-4 font-medium text-slate-700">
                    <span className="block max-w-[180px] truncate">
                      {formatValidator(row)}
                    </span>
                  </td>
                ) : null}
                <td className="px-4 py-4">
                  <span
                    className={`badge ${
                      statusStyles[row.status] ||
                      "border-slate-300 bg-slate-100 text-slate-600"
                    }`}
                  >
                    {statusLabels[row.status] || row.status}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    to={`/rfqs/new?id=${encodeURIComponent(row.id)}`}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold text-white transition hover:shadow-sm"
                    style={{ borderColor: "#ef7807", backgroundColor: "#ef7807" }}
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer ? (
        <div className="border-t border-slate-200/70 bg-slate-50/70 px-4 py-3">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
