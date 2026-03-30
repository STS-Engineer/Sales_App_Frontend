import { Link } from "react-router-dom";

const statusStyles = {
  RFQ: "border-tide/30 bg-tide/10 text-tide",
  Potential: "border-tide/30 bg-tide/10 text-tide",
  "New RFQ": "border-tide/30 bg-tide/10 text-tide",
  Validation: "border-tide/30 bg-tide/10 text-tide",
  "In costing": "border-sun/40 bg-sun/15 text-sun",
  Feasability: "border-sun/40 bg-sun/15 text-sun",
  Pricing: "border-sun/40 bg-sun/15 text-sun",
  "Offer preparation": "border-ink/25 bg-ink/10 text-ink",
  "Offer validation": "border-mint/40 bg-mint/15 text-mint",
  "Get PO": "border-sun/40 bg-sun/15 text-sun",
  "PO accepted": "border-mint/40 bg-mint/15 text-mint",
  "Mission accepted": "border-tide/30 bg-tide/10 text-tide",
  "Mission status": "border-tide/30 bg-tide/10 text-tide",
  "Mission not accepted": "border-sun/40 bg-sun/15 text-sun",
  "Get prototype orders": "border-tide/30 bg-tide/10 text-tide",
  "Prototype ongoing": "border-ink/25 bg-ink/10 text-ink",
  Lost: "border-slate-300 bg-slate-100 text-slate-600",
  Cancelled: "border-slate-300 bg-slate-100 text-slate-600",
  "In review": "border-tide/30 bg-tide/10 text-tide",
  New: "border-slate-300 bg-slate-100 text-slate-600",
  Negotiation: "border-sun/40 bg-sun/15 text-sun",
  Prepared: "border-mint/40 bg-mint/15 text-mint"
};

export default function RfqTable({ rows, footer }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-[1080px] w-full text-left text-sm">
          <thead className="bg-slate-100/80 text-xs uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-6 py-4">RFQ ID</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Product name</th>
              <th className="px-6 py-4">Product line</th>
              <th className="px-6 py-4">Application</th>
              <th className="px-6 py-4">TO Total</th>
              <th className="px-6 py-4">Delivery zone</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-slate-200/60 text-slate-600 transition hover:bg-white/70"
              >
                <td className="px-6 py-4 font-semibold text-ink">{row.id}</td>
                <td className="px-6 py-4 font-medium text-slate-700">
                  {row.customer || row.client || "—"}
                </td>
                <td className="px-6 py-4">{row.productName || "—"}</td>
                <td className="px-6 py-4">{row.productLine || row.item || "—"}</td>
                <td className="px-6 py-4">{row.application || "—"}</td>
                <td className="px-6 py-4 font-medium text-slate-700">
                  {typeof (row.toTotal ?? row.budget) === "number"
                    ? `${(row.toTotal ?? row.budget).toLocaleString("en-US")} TND`
                    : row.toTotal || row.budget || "—"}
                </td>
                <td className="px-6 py-4 font-medium text-slate-700">
                  {row.deliveryZone || row.location || "—"}
                </td>
                <td className="px-6 py-4">
                  <span className={`badge ${statusStyles[row.status] || "border-slate-300 bg-slate-100 text-slate-600"}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    to={`/rfqs/new?id=${encodeURIComponent(row.id)}`}
                    className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold text-white transition hover:shadow-sm"
                    style={{ borderColor: "#ef7807", backgroundColor: "#ef7807" }}
                  >
                    Open RFQ
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
