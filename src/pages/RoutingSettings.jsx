import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import TopBar from "../components/TopBar.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import {
  deleteRoutingConfig,
  listAllUsers,
  listProducts,
  listRoutingConfig,
  setRoutingAssignment
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
  selectedEmails: [],
  emailFilter: ""
};

function formatRoleLabel(role) {
  const match = ROLE_OPTIONS.find((o) => o.value === role);
  return match ? match.label : String(role || "");
}

function formatUpdatedAt(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function RoutingSettings() {
  const { showToast } = useToast();
  const profile = getUserProfile();
  const isOwner = profile.role === "OWNER";

  const [routingEntries, setRoutingEntries] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState(null);
  const [formState, setFormState] = useState(EMPTY_FORM);

  const loadData = async () => {
    setLoading(true);
    try {
      const [routingResponse, productsResponse, usersResponse] = await Promise.all([
        listRoutingConfig(),
        listProducts(),
        listAllUsers()
      ]);
      setRoutingEntries(Array.isArray(routingResponse) ? routingResponse : []);
      setProductOptions(
        Array.isArray(productsResponse?.products) ? productsResponse.products : []
      );
      setAllUsers(
        Array.isArray(usersResponse) ? usersResponse.filter((u) => u.is_approved) : []
      );
    } catch {
      setRoutingEntries([]);
      setProductOptions([]);
      setAllUsers([]);
      showToast("Unable to load routing settings. Please refresh.", {
        type: "error",
        title: "Loading failed"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOwner) return;
    void loadData();
  }, [isOwner]);

  // Return currently-assigned emails for a (productLine, role) pair
  const getAssignedEmails = (productLine, role) => {
    if (!productLine || !role) return [];
    return routingEntries
      .filter((e) => e.product_line === productLine && e.role === role)
      .map((e) => e.email);
  };

  const sortedProductOptions = useMemo(
    () =>
      [...productOptions].sort((a, b) =>
        String(a?.product_line || "").localeCompare(String(b?.product_line || ""))
      ),
    [productOptions]
  );

  // Entries grouped by (product_line, role) for the table
  const groupedEntries = useMemo(() => {
    const groups = {};
    for (const entry of routingEntries) {
      const key = `${entry.product_line}|||${entry.role}`;
      if (!groups[key]) {
        groups[key] = {
          product_line: entry.product_line,
          role: entry.role,
          roleLabel: formatRoleLabel(entry.role),
          emails: [],
          entries: [],
          latestUpdatedAt: null
        };
      }
      groups[key].emails.push(entry.email);
      groups[key].entries.push({ id: entry.id, email: entry.email });
      const entryDate = entry.updated_at ? new Date(entry.updated_at) : null;
      if (entryDate && !Number.isNaN(entryDate.getTime())) {
        if (!groups[key].latestUpdatedAt || entryDate > new Date(groups[key].latestUpdatedAt)) {
          groups[key].latestUpdatedAt = entry.updated_at;
        }
      }
    }
    return Object.values(groups).sort((a, b) => {
      const pc = String(a.product_line || "").localeCompare(String(b.product_line || ""));
      return pc !== 0 ? pc : String(a.roleLabel || "").localeCompare(String(b.roleLabel || ""));
    });
  }, [routingEntries]);

  const resetForm = () => setFormState(EMPTY_FORM);

  const handleDeleteRoutingUser = async (routingId, userEmail, productLine, role) => {
    console.log("DEBUG ROUTING DELETE", { productLine, role, userEmail });
    setIsDeletingId(routingId);
    try {
      await deleteRoutingConfig(routingId);
      await loadData();
      showToast(`${userEmail} removed from ${productLine} / ${formatRoleLabel(role)}.`, {
        type: "success",
        title: "Removed"
      });
    } catch (error) {
      showToast(error?.message || "Unable to remove this assignment.", {
        type: "error",
        title: "Delete failed"
      });
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleProductLineChange = (value) => {
    setFormState((prev) => ({
      ...prev,
      productLine: value,
      selectedEmails: getAssignedEmails(value, prev.role),
      emailFilter: ""
    }));
  };

  const handleRoleChange = (value) => {
    setFormState((prev) => ({
      ...prev,
      role: value,
      selectedEmails: getAssignedEmails(prev.productLine, value),
      emailFilter: ""
    }));
  };

  const toggleEmail = (email) => {
    setFormState((prev) => {
      const already = prev.selectedEmails.includes(email);
      return {
        ...prev,
        selectedEmails: already
          ? prev.selectedEmails.filter((e) => e !== email)
          : [...prev.selectedEmails, email]
      };
    });
  };

  const handleManage = (group) => {
    setFormState({
      productLine: group.product_line,
      role: group.role,
      selectedEmails: [...group.emails],
      emailFilter: ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formState.productLine || !formState.role) return;

    console.log("DEBUG ROUTING SETTINGS SAVE", {
      productLine: formState.productLine,
      role: formState.role,
      selectedUsers: formState.selectedEmails,
      userEmails: formState.selectedEmails
    });

    setIsSaving(true);
    try {
      await setRoutingAssignment({
        product_line: formState.productLine,
        role: formState.role,
        emails: formState.selectedEmails
      });
      showToast(
        `Assignment saved for ${formState.productLine} / ${formatRoleLabel(formState.role)}.`,
        { type: "success", title: "Saved" }
      );
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

  // Users shown in the checklist:
  // - All approved system users
  // - Plus any currently-selected emails that are NOT in the system (legacy / manual)
  const checklistUsers = useMemo(() => {
    const filter = formState.emailFilter.trim().toLowerCase();
    const systemEmailSet = new Set(allUsers.map((u) => u.email.toLowerCase()));

    const extraItems = formState.selectedEmails
      .filter((e) => !systemEmailSet.has(e.toLowerCase()))
      .map((e) => ({ email: e, full_name: null, external: true }));

    const combined = [
      ...allUsers.map((u) => ({ ...u, external: false })),
      ...extraItems
    ];

    if (!filter) return combined;
    return combined.filter(
      (u) =>
        u.email.toLowerCase().includes(filter) ||
        (u.full_name || "").toLowerCase().includes(filter)
    );
  }, [allUsers, formState.emailFilter, formState.selectedEmails]);

  const isGroupSelected = Boolean(formState.productLine);

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
            {/* Header */}
            <div className="card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Owner panel
                  </p>
                  <h2 className="font-display text-2xl text-ink">Product-line routing</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Configure which users receive Costing, R&amp;D, and PLM notifications
                    for each product line. Multiple users can be assigned per role.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Active groups
                  </p>
                  <p className="font-display text-3xl text-ink">{groupedEntries.length}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
              {/* Left panel — form */}
              <div className="card p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl text-ink">
                      {isGroupSelected ? "Manage assignment" : "Select a group"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Choose a product line and role, then select the users to assign.
                    </p>
                  </div>
                  {isGroupSelected ? (
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
                  {/* Product line */}
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-ink">
                      Product Line
                    </span>
                    <select
                      className="input-field w-full"
                      value={formState.productLine}
                      onChange={(e) => handleProductLineChange(e.target.value)}
                      required
                      disabled={isSaving}
                    >
                      <option value="">Select a product line</option>
                      {sortedProductOptions.map((opt) => (
                        <option key={opt.product_line} value={opt.product_line}>
                          {opt.product_line}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Role */}
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-ink">Role</span>
                    <select
                      className="input-field w-full"
                      value={formState.role}
                      onChange={(e) => handleRoleChange(e.target.value)}
                      required
                      disabled={isSaving}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* User checklist — shown only when product line is selected */}
                  {formState.productLine ? (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-ink">
                          Assigned users
                          {formState.selectedEmails.length > 0 && (
                            <span className="ml-2 rounded-full bg-tide/10 px-2 py-0.5 text-xs font-semibold text-tide">
                              {formState.selectedEmails.length} selected
                            </span>
                          )}
                        </span>
                        {formState.selectedEmails.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setFormState((p) => ({ ...p, selectedEmails: [] }))
                            }
                            className="text-xs text-slate-400 hover:text-coral"
                            disabled={isSaving}
                          >
                            Clear all
                          </button>
                        )}
                      </div>

                      {/* Search filter */}
                      <input
                        className="input-field mb-2 w-full text-sm"
                        placeholder="Filter users..."
                        value={formState.emailFilter}
                        onChange={(e) =>
                          setFormState((p) => ({ ...p, emailFilter: e.target.value }))
                        }
                        disabled={isSaving}
                      />

                      {/* Scrollable user list */}
                      <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                        {checklistUsers.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-slate-400">
                            No users found.
                          </p>
                        ) : (
                          checklistUsers.map((user) => {
                            const isChecked = formState.selectedEmails.includes(user.email);
                            return (
                              <label
                                key={user.email}
                                className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-slate-50 ${isChecked ? "bg-tide/5" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 flex-shrink-0 rounded accent-tide"
                                  checked={isChecked}
                                  onChange={() => toggleEmail(user.email)}
                                  disabled={isSaving}
                                />
                                <div className="min-w-0">
                                  {user.full_name ? (
                                    <>
                                      <p className="truncate font-medium text-ink">
                                        {user.full_name}
                                      </p>
                                      <p className="truncate text-xs text-slate-400">
                                        {user.email}
                                      </p>
                                    </>
                                  ) : (
                                    <p className="truncate text-ink">{user.email}</p>
                                  )}
                                  {user.external && (
                                    <p className="text-xs text-amber-500">Manual assignment</p>
                                  )}
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isSaving || !formState.productLine}
                    className="inline-flex items-center justify-center rounded-2xl bg-tide px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? "Saving..." : "Save assignment"}
                  </button>
                </form>
              </div>

              {/* Right panel — grouped table */}
              <div className="card overflow-hidden">
                <div className="border-b border-slate-200 px-6 py-5">
                  <h3 className="font-display text-xl text-ink">Current routing</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Each row shows all users assigned to a product line and role.
                    Click <strong>Manage</strong> to edit a group.
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
                          Assigned users
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Updated At
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {loading ? (
                        <tr>
                          <td
                            colSpan="5"
                            className="px-6 py-8 text-center text-sm text-slate-500"
                          >
                            Loading routing assignments...
                          </td>
                        </tr>
                      ) : groupedEntries.length === 0 ? (
                        <tr>
                          <td
                            colSpan="5"
                            className="px-6 py-8 text-center text-sm text-slate-500"
                          >
                            No routing assignments found yet.
                          </td>
                        </tr>
                      ) : (
                        groupedEntries.map((group) => {
                          const isActive =
                            formState.productLine === group.product_line &&
                            formState.role === group.role;
                          return (
                            <tr
                              key={`${group.product_line}|||${group.role}`}
                              className={isActive ? "bg-tide/5" : ""}
                            >
                              <td className="px-6 py-4 text-sm font-semibold text-ink">
                                {group.product_line}
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-600">
                                {group.roleLabel}
                              </td>
                              <td className="px-6 py-4">
                                {group.entries.length === 0 ? (
                                  <span className="text-xs text-slate-400">
                                    No users assigned
                                  </span>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {group.entries.map((entry) => (
                                      <span
                                        key={entry.id}
                                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 pl-2.5 pr-1.5 py-1 text-xs font-medium text-slate-700"
                                      >
                                        {entry.email}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleDeleteRoutingUser(
                                              entry.id,
                                              entry.email,
                                              group.product_line,
                                              group.role
                                            )
                                          }
                                          disabled={isDeletingId === entry.id}
                                          title={`Remove ${entry.email}`}
                                          className="flex-shrink-0 rounded px-0.5 text-slate-400 transition hover:bg-red-100 hover:text-red-500 disabled:opacity-50"
                                        >
                                          {isDeletingId === entry.id ? "…" : "×"}
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-500">
                                {formatUpdatedAt(group.latestUpdatedAt)}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => handleManage(group)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-tide/40 hover:text-tide"
                                  >
                                    Manage
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
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