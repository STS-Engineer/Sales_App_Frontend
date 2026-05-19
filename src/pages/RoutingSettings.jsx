import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import TopBar from "../components/TopBar.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import {
  createRoutingConfig,
  deleteRoutingConfig as deleteRoutingConfigEntry,
  listProducts,
  listRoutingConfig,
  updateRoutingConfig
} from "../api";
import { getUserProfile } from "../utils/session.js";

const ROLE_OPTIONS = [
  { value: "COSTING", label: "Costing" },
  { value: "RND", label: "R&D" },
  { value: "PLM", label: "PLM" }
];

const EMPTY_FORM = {
  productLine: "",
  role: ROLE_OPTIONS[0].value,
  email: ""
};

function formatRoleLabel(role) {
  const match = ROLE_OPTIONS.find((option) => option.value === role);
  return match ? match.label : String(role || "");
}

export default function RoutingSettings() {
  const { showToast } = useToast();
  const profile = getUserProfile();
  const isOwner = profile.role === "OWNER";

  const [routingEntries, setRoutingEntries] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formState, setFormState] = useState(EMPTY_FORM);

  const loadData = async () => {
    setLoading(true);
    try {
      const [routingResponse, productsResponse] = await Promise.all([
        listRoutingConfig(),
        listProducts()
      ]);
      setRoutingEntries(Array.isArray(routingResponse) ? routingResponse : []);
      setProductOptions(
        Array.isArray(productsResponse?.products) ? productsResponse.products : []
      );
    } catch (error) {
      setRoutingEntries([]);
      setProductOptions([]);
      showToast("Unable to load routing settings. Please refresh.", {
        type: "error",
        title: "Loading failed"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOwner) {
      return;
    }
    void loadData();
  }, [isOwner]);

  const sortedProductOptions = useMemo(
    () =>
      [...productOptions].sort((left, right) =>
        String(left?.product_line || "").localeCompare(String(right?.product_line || ""))
      ),
    [productOptions]
  );

  const formattedEntries = useMemo(
    () =>
      routingEntries
        .map((entry) => ({
          ...entry,
          roleLabel: formatRoleLabel(entry.role),
          updatedAtLabel: entry.updated_at
            ? new Date(entry.updated_at).toLocaleString()
            : "N/A"
        }))
        .sort((left, right) => {
          const productCompare = String(left.product_line || "").localeCompare(
            String(right.product_line || "")
          );
          if (productCompare !== 0) {
            return productCompare;
          }
          return String(left.roleLabel || "").localeCompare(String(right.roleLabel || ""));
        }),
    [routingEntries]
  );

  const resetForm = () => {
    setEditingId(null);
    setFormState(EMPTY_FORM);
  };

  const handleFormChange = (key, value) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleEdit = (entry) => {
    setEditingId(entry.id);
    setFormState({
      productLine: entry.product_line || "",
      role: entry.role || ROLE_OPTIONS[0].value,
      email: entry.email || ""
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      product_line: formState.productLine,
      role: formState.role,
      email: formState.email
    };

    setIsSaving(true);
    try {
      if (editingId) {
        await updateRoutingConfig(editingId, payload);
        showToast("Routing assignment updated.", {
          type: "success",
          title: "Saved"
        });
      } else {
        await createRoutingConfig(payload);
        showToast("Routing assignment added.", {
          type: "success",
          title: "Created"
        });
      }
      resetForm();
      await loadData();
    } catch (error) {
      showToast(error?.message || "Unable to save this routing assignment.", {
        type: "error",
        title: "Save failed"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (routingId) => {
    setDeleteTargetId(routingId);
    try {
      await deleteRoutingConfigEntry(routingId);
      showToast("Routing assignment deleted.", {
        type: "success",
        title: "Deleted"
      });
      if (editingId === routingId) {
        resetForm();
      }
      await loadData();
    } catch (error) {
      showToast(error?.message || "Unable to delete this routing assignment.", {
        type: "error",
        title: "Delete failed"
      });
    } finally {
      setDeleteTargetId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70">
      <TopBar title="Routing settings" />

      <div className="px-6 py-10">
        {!isOwner ? (
          <div className="card p-6 text-center">
            <p className="text-sm font-semibold text-ink">Access restricted</p>
            <p className="mt-2 text-sm text-slate-500">
              Only the owner can manage product-line routing assignments.
            </p>
            <Link
              to="/dashboard"
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-tide/40 hover:shadow-md"
            >
              Back to dashboard
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            <div className="card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Owner panel
                  </p>
                  <h2 className="font-display text-2xl text-ink">
                    Product-line routing
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Configure which email receives Costing, R&amp;D, and PLM work for
                    each product line.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Active assignments
                  </p>
                  <p className="font-display text-3xl text-ink">{formattedEntries.length}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="card p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl text-ink">
                      {editingId ? "Edit assignment" : "Add assignment"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Choose a product line, role, and destination email.
                    </p>
                  </div>
                  {editingId ? (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-tide/40 hover:text-tide"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>

                <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-ink">
                      Product Line
                    </span>
                    <select
                      className="input-field w-full"
                      value={formState.productLine}
                      onChange={(event) => handleFormChange("productLine", event.target.value)}
                      required
                      disabled={isSaving}
                    >
                      <option value="">Select a product line</option>
                      {sortedProductOptions.map((option) => (
                        <option key={option.product_line} value={option.product_line}>
                          {option.product_line}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-ink">Role</span>
                    <select
                      className="input-field w-full"
                      value={formState.role}
                      onChange={(event) => handleFormChange("role", event.target.value)}
                      required
                      disabled={isSaving}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-ink">Email</span>
                    <input
                      className="input-field w-full"
                      type="email"
                      value={formState.email}
                      onChange={(event) => handleFormChange("email", event.target.value)}
                      placeholder="name@avocarbon.com"
                      required
                      disabled={isSaving}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center justify-center rounded-2xl bg-tide px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving
                      ? "Saving..."
                      : editingId
                        ? "Save changes"
                        : "Add assignment"}
                  </button>
                </form>
              </div>

              <div className="card overflow-hidden">
                <div className="border-b border-slate-200 px-6 py-5">
                  <h3 className="font-display text-xl text-ink">Current routing</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Review and maintain email routing for each product line.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50/90">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Product line
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Role
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Updated
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {loading ? (
                        <tr>
                          <td colSpan="5" className="px-6 py-8 text-center text-sm text-slate-500">
                            Loading routing assignments...
                          </td>
                        </tr>
                      ) : formattedEntries.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-6 py-8 text-center text-sm text-slate-500">
                            No routing assignments found yet.
                          </td>
                        </tr>
                      ) : (
                        formattedEntries.map((entry) => (
                          <tr key={entry.id}>
                            <td className="px-6 py-4 text-sm font-semibold text-ink">
                              {entry.product_line}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">{entry.roleLabel}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{entry.email}</td>
                            <td className="px-6 py-4 text-sm text-slate-500">{entry.updatedAtLabel}</td>
                            <td className="px-6 py-4">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEdit(entry)}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-tide/40 hover:text-tide"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(entry.id)}
                                  disabled={deleteTargetId === entry.id}
                                  className="rounded-xl border border-coral/20 bg-coral/10 px-3 py-2 text-sm font-semibold text-coral transition hover:bg-coral/15 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {deleteTargetId === entry.id ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
