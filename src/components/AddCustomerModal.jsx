import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import FormField from "./FormField.jsx";
import SearchableSelectField from "./SearchableSelectField.jsx";
import {
  createSalesCustomer,
  getCustomerFormOptions,
  searchCustomerGroups,
  searchEmployees
} from "../api";

const COUNTRY_OPTIONS = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia",
  "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados",
  "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina",
  "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia",
  "Cameroon", "Canada", "Cape Verde", "Central African Republic", "Chad", "Chile",
  "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus",
  "Czech Republic", "Democratic Republic of the Congo", "Denmark", "Djibouti",
  "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea",
  "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon",
  "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Guatemala", "Guinea",
  "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hong Kong", "Hungary", "Iceland",
  "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast",
  "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kosovo", "Kuwait",
  "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya",
  "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia",
  "Maldives", "Mali", "Malta", "Mauritania", "Mauritius", "Mexico", "Moldova",
  "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia",
  "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria",
  "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Panama",
  "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia", "Rwanda", "Saudi Arabia", "Senegal", "Serbia",
  "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Somalia", "South Africa",
  "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden",
  "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo",
  "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States", "Uruguay",
  "Uzbekistan", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

const EMPTY_FORM = {
  customer_name: "",
  customer_code: "",
  customer_type: "",
  parent_customer_id: "",
  headquarter_country: "",
  country: "",
  city: "",
  zone_id: "",
  market_id: "",
  main_sales_people_id: "",
  main_kam_people_id: "",
  strategic_level: "",
  customer_scope: "",
  customer_files_link: "",
  comments: ""
};

export default function AddCustomerModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [lookups, setLookups] = useState({
    zones: [],
    markets: [],
    customer_types: [],
    strategic_levels: [],
    customer_scopes: []
  });
  const [customerGroups, setCustomerGroups] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setError("");
    getCustomerFormOptions().then((data) => {
      if (data) setLookups((prev) => ({ ...prev, ...data }));
    }).catch(() => {});
    searchCustomerGroups().then((data) => {
      setCustomerGroups(Array.isArray(data?.customer_groups) ? data.customer_groups : []);
    }).catch(() => {});
    searchEmployees().then((data) => {
      setEmployees(Array.isArray(data?.employees) ? data.employees : []);
    }).catch(() => {});
  }, [open]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const isLegalEntity = form.customer_type === "Customer Legal Entity";

  const zoneOptions = useMemo(
    () => (lookups.zones || []).map((z) => ({ value: String(z.id), label: z.name })),
    [lookups.zones]
  );
  const marketOptions = useMemo(
    () => (lookups.markets || []).map((m) => ({ value: String(m.id), label: m.name })),
    [lookups.markets]
  );
  const parentGroupOptions = useMemo(
    () => customerGroups.map((g) => ({ value: String(g.id), label: g.name })),
    [customerGroups]
  );
  const employeeOptions = useMemo(
    () => employees.map((p) => ({ value: String(p.id), label: p.name || p.email || `#${p.id}` })),
    [employees]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customer_name.trim()) return setError("Customer name is required.");
    if (!form.customer_code.trim()) return setError("Customer code is required.");
    if (!form.customer_type) return setError("Customer type is required.");
    if (isLegalEntity && !form.parent_customer_id) {
      return setError("Parent customer group is required for a Customer Legal Entity.");
    }
    setError("");
    setSaving(true);
    try {
      const payload = {
        customer_name: form.customer_name.trim(),
        customer_code: form.customer_code.trim(),
        customer_type: form.customer_type,
        parent_customer_id: form.parent_customer_id ? Number(form.parent_customer_id) : null,
        headquarter_country: form.headquarter_country || null,
        country: form.country || null,
        city: form.city.trim() || null,
        zone_id: form.zone_id ? Number(form.zone_id) : null,
        market_id: form.market_id ? Number(form.market_id) : null,
        main_sales_people_id: form.main_sales_people_id ? Number(form.main_sales_people_id) : null,
        main_kam_people_id: form.main_kam_people_id ? Number(form.main_kam_people_id) : null,
        strategic_level: form.strategic_level || null,
        customer_scope: form.customer_scope || null,
        customer_files_link: form.customer_files_link.trim() || null,
        comments: form.comments.trim() || null
      };
      const created = await createSalesCustomer(payload);
      onCreated(created.customer_name);
    } catch (err) {
      setError(err?.message || "Failed to create customer.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="chat-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="chat-modal chat-modal--customer-form"
        role="dialog"
        aria-modal="true"
        aria-label="Add customer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-modal-header">
          <div>
            <p className="chat-modal-title">Add new customer</p>
            <p className="mt-1 text-sm text-slate-500">
              Create a new customer record in the sales customer directory. Please fill in the fields correctly.
            </p>
          </div>
          <button type="button" className="chat-modal-close" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="chat-modal-body grid flex-1 grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2">
            <FormField
              label="Customer name"
              name="customer_name"
              value={form.customer_name}
              onChange={handleChange}
              required
            />
            <FormField
              label="Customer code"
              name="customer_code"
              value={form.customer_code}
              onChange={handleChange}
              required
            />
            <SearchableSelectField
              label="Customer type"
              name="customer_type"
              value={form.customer_type}
              onChange={handleChange}
              options={lookups.customer_types || []}
              placeholder="— Select —"
              portal
              required
            />
            <SearchableSelectField
              label="Parent customer group"
              name="parent_customer_id"
              value={form.parent_customer_id}
              onChange={handleChange}
              options={parentGroupOptions}
              searchable
              searchPlaceholder="Search customer group"
              placeholder="— Select —"
              portal
              required={isLegalEntity}
              optional={!isLegalEntity}
            />
            <SearchableSelectField
              label="Headquarters country"
              name="headquarter_country"
              value={form.headquarter_country}
              onChange={handleChange}
              options={COUNTRY_OPTIONS}
              searchable
              searchPlaceholder="Search country"
              placeholder="— Select —"
              portal
              optional
            />
            <SearchableSelectField
              label="Country"
              name="country"
              value={form.country}
              onChange={handleChange}
              options={COUNTRY_OPTIONS}
              searchable
              searchPlaceholder="Search country"
              placeholder="— Select —"
              portal
              optional
            />
            <FormField
              label="City"
              name="city"
              value={form.city}
              onChange={handleChange}
              optional
            />
            <SearchableSelectField
              label="Sales zone"
              name="zone_id"
              value={form.zone_id}
              onChange={handleChange}
              options={zoneOptions}
              placeholder="— Select —"
              portal
              optional
            />
            <SearchableSelectField
              label="Market"
              name="market_id"
              value={form.market_id}
              onChange={handleChange}
              options={marketOptions}
              placeholder="— Select —"
              portal
              optional
            />
            <SearchableSelectField
              label="Main salesperson"
              name="main_sales_people_id"
              value={form.main_sales_people_id}
              onChange={handleChange}
              options={employeeOptions}
              searchable
              searchPlaceholder="Search employee"
              placeholder="— Select —"
              portal
              optional
            />
            <SearchableSelectField
              label="Main KAM"
              name="main_kam_people_id"
              value={form.main_kam_people_id}
              onChange={handleChange}
              options={employeeOptions}
              searchable
              searchPlaceholder="Search employee"
              placeholder="— Select —"
              portal
              optional
            />
            <SearchableSelectField
              label="Strategic level"
              name="strategic_level"
              value={form.strategic_level}
              onChange={handleChange}
              options={lookups.strategic_levels || []}
              placeholder="— Select —"
              portal
              optional
            />
            <SearchableSelectField
              label="Customer scope"
              name="customer_scope"
              value={form.customer_scope}
              onChange={handleChange}
              options={lookups.customer_scopes || []}
              placeholder="— Select —"
              portal
              optional
            />
            <FormField
              label="Documents link"
              name="customer_files_link"
              value={form.customer_files_link}
              onChange={handleChange}
              optional
            />
            <div className="sm:col-span-2">
              <FormField
                label="Comments"
                name="comments"
                value={form.comments}
                onChange={handleChange}
                autoExpand
                optional
              />
            </div>
          </div>
          <div className="chat-modal-footer gap-3">
            {error ? <span className="mr-auto text-sm font-medium text-red-600">{error}</span> : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-tide px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              {saving ? "Adding..." : "Add customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
