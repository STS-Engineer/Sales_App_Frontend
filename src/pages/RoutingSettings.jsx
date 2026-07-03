import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import TopBar from "../components/TopBar.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import {
  deleteRoutingConfig,
  deleteViewer,
  listAllUsers,
  listProducts,
  listRoutingConfig,
  listViewers,
  setRoutingAssignment,
  setViewerAssignment
} from "../api";
import { getUserProfile, hasRole } from "../utils/session.js";

const ROLE_OPTIONS = [
  { value: "COSTING", label: "Costing" },
  { value: "RND", label: "R&D" },
  { value: "PLM", label: "PLM" }
];

const EMPTY_LEADER_FORM = {
  productLine: "",
  role: ROLE_OPTIONS[0].value,
  selectedEmails: [],
  emailFilter: ""
};

const EMPTY_VIEWER_FORM = {
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

function UserChecklist({ users, selectedEmails, onToggle, isSaving, filter, onFilterChange, onClearAll, label }) {
  const checklistUsers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const systemEmailSet = new Set(users.map((u) => u.email.toLowerCase()));
    const extraItems = selectedEmails
      .filter((e) => !systemEmailSet.has(e.toLowerCase()))
      .map((e) => ({ email: e, full_name: null, external: true }));
    const combined = [...users.map((u) => ({ ...u, external: false })), ...extraItems];
    if (!q) return combined;
    return combined.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name || "").toLowerCase().includes(q)
    );
  }, [users, filter, selectedEmails]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">
          {label}
          {selectedEmails.length > 0 && (
            <span className="ml-2 rounded-full bg-tide/10 px-2 py-0.5 text-xs font-semibold text-tide">
              {selectedEmails.length} selected
            </span>
          )}
        </span>
        {selectedEmails.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-slate-400 hover:text-coral"
            disabled={isSaving}
          >
            Clear all
          </button>
        )}
      </div>
      <input
        className="input-field mb-2 w-full text-sm"
        placeholder="Filter users..."
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        disabled={isSaving}
      />
      <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white">
        {checklistUsers.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-400">No users found.</p>
        ) : (
          checklistUsers.map((user) => {
            const isChecked = selectedEmails.includes(user.email);
            return (
              <label
                key={user.email}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-slate-50 ${isChecked ? "bg-tide/5" : ""}`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 flex-shrink-0 rounded accent-tide"
                  checked={isChecked}
                  onChange={() => onToggle(user.email)}
                  disabled={isSaving}
                />
                <div className="min-w-0">
                  {user.full_name ? (
                    <>
                      <p className="truncate font-medium text-ink">{user.full_name}</p>
                      <p className="truncate text-xs text-slate-400">{user.email}</p>
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
  );
}

export default function RoutingSettings() {
  const { showToast } = useToast();
  const profile = getUserProfile();
  const isOwner = hasRole("OWNER");

  const [routingEntries, setRoutingEntries] = useState([]);
  const [viewerEntries, setViewerEntries] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Leader form state
  const [leaderForm, setLeaderForm] = useState(EMPTY_LEADER_FORM);
  const [isSavingLeader, setIsSavingLeader] = useState(false);
  const [isDeletingLeaderId, setIsDeletingLeaderId] = useState(null);

  // Viewer form state
  const [viewerForm, setViewerForm] = useState(EMPTY_VIEWER_FORM);
  const [isSavingViewer, setIsSavingViewer] = useState(false);
  const [isDeletingViewerId, setIsDeletingViewerId] = useState(null);

  // Active panel: "leaders" | "viewers"
  const [activePanel, setActivePanel] = useState("leaders");

  const loadData = async () => {
    setLoading(true);
    try {
      const [routingResponse, viewersResponse, productsResponse, usersResponse] = await Promise.all([
        listRoutingConfig(),
        listViewers(),
        listProducts(),
        listAllUsers()
      ]);
      setRoutingEntries(Array.isArray(routingResponse) ? routingResponse : []);
      setViewerEntries(Array.isArray(viewersResponse) ? viewersResponse : []);
      setProductOptions(
        Array.isArray(productsResponse?.products) ? productsResponse.products : []
      );
      setAllUsers(
        Array.isArray(usersResponse) ? usersResponse.filter((u) => u.is_approved) : []
      );
    } catch {
      setRoutingEntries([]);
      setViewerEntries([]);
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

  const sortedProductOptions = useMemo(
    () =>
      [...productOptions].sort((a, b) =>
        String(a?.product_line || "").localeCompare(String(b?.product_line || ""))
      ),
    [productOptions]
  );

  // Unique product line names for dropdowns (no duplicates)
  const uniqueProductLineNames = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const p of sortedProductOptions) {
      const pl = String(p?.product_line || "").trim();
      if (pl && !seen.has(pl.toLowerCase())) {
        seen.add(pl.toLowerCase());
        result.push(pl);
      }
    }
    return result;
  }, [sortedProductOptions]);

  // Helper: currently-assigned leader emails for a group
  const getLeaderEmails = (productLine, role) => {
    if (!productLine || !role) return [];
    return routingEntries
      .filter((e) => e.product_line === productLine && e.role === role)
      .map((e) => e.email);
  };

  // Helper: currently-assigned viewer emails for a group
  const getViewerEmails = (productLine, role) => {
    if (!productLine || !role) return [];
    return viewerEntries
      .filter((e) => e.product_line === productLine && e.role === role)
      .map((e) => e.user_email);
  };

  // Grouped entries for the table (combines leaders + viewers)
  const groupedEntries = useMemo(() => {
    const groups = {};

    for (const entry of routingEntries) {
      const key = `${entry.product_line}|||${entry.role}`;
      if (!groups[key]) {
        groups[key] = {
          product_line: entry.product_line,
          role: entry.role,
          roleLabel: formatRoleLabel(entry.role),
          leaderEntries: [],
          viewerEntries: [],
          latestUpdatedAt: null
        };
      }
      groups[key].leaderEntries.push({ id: entry.id, email: entry.email });
      const d = entry.updated_at ? new Date(entry.updated_at) : null;
      if (d && !Number.isNaN(d.getTime())) {
        if (!groups[key].latestUpdatedAt || d > new Date(groups[key].latestUpdatedAt)) {
          groups[key].latestUpdatedAt = entry.updated_at;
        }
      }
    }

    // Ensure all product lines × roles have a group (even if no leaders yet)
    for (const entry of viewerEntries) {
      const key = `${entry.product_line}|||${entry.role}`;
      if (!groups[key]) {
        groups[key] = {
          product_line: entry.product_line,
          role: entry.role,
          roleLabel: formatRoleLabel(entry.role),
          leaderEntries: [],
          viewerEntries: [],
          latestUpdatedAt: null
        };
      }
      groups[key].viewerEntries.push({ id: entry.id, email: entry.user_email });
      const d = entry.updated_at ? new Date(entry.updated_at) : null;
      if (d && !Number.isNaN(d.getTime())) {
        if (!groups[key].latestUpdatedAt || d > new Date(groups[key].latestUpdatedAt)) {
          groups[key].latestUpdatedAt = entry.updated_at;
        }
      }
    }

    return Object.values(groups).sort((a, b) => {
      const pc = String(a.product_line || "").localeCompare(String(b.product_line || ""));
      return pc !== 0 ? pc : String(a.roleLabel || "").localeCompare(String(b.roleLabel || ""));
    });
  }, [routingEntries, viewerEntries]);

  // --------------- Leader handlers ---------------

  const handleLeaderProductLineChange = (value) => {
    setLeaderForm((prev) => ({
      ...prev,
      productLine: value,
      selectedEmails: getLeaderEmails(value, prev.role),
      emailFilter: ""
    }));
  };

  const handleLeaderRoleChange = (value) => {
    setLeaderForm((prev) => ({
      ...prev,
      role: value,
      selectedEmails: getLeaderEmails(prev.productLine, value),
      emailFilter: ""
    }));
  };

  const toggleLeaderEmail = (email) => {
    setLeaderForm((prev) => ({
      ...prev,
      selectedEmails: prev.selectedEmails.includes(email)
        ? prev.selectedEmails.filter((e) => e !== email)
        : [...prev.selectedEmails, email]
    }));
  };

  const handleManageLeaders = (group) => {
    setActivePanel("leaders");
    setLeaderForm({
      productLine: group.product_line,
      role: group.role,
      selectedEmails: group.leaderEntries.map((e) => e.email),
      emailFilter: ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteLeader = async (routingId, userEmail, productLine, role) => {
    setIsDeletingLeaderId(routingId);
    try {
      await deleteRoutingConfig(routingId);
      await loadData();
      showToast(`${userEmail} removed from ${productLine} / ${formatRoleLabel(role)} leaders.`, {
        type: "success",
        title: "Removed"
      });
    } catch (error) {
      showToast(error?.message || "Unable to remove this leader.", {
        type: "error",
        title: "Delete failed"
      });
    } finally {
      setIsDeletingLeaderId(null);
    }
  };

  const handleSubmitLeaders = async (event) => {
    event.preventDefault();
    if (!leaderForm.productLine || !leaderForm.role) return;
    setIsSavingLeader(true);
    try {
      await setRoutingAssignment({
        product_line: leaderForm.productLine,
        role: leaderForm.role,
        emails: leaderForm.selectedEmails
      });
      showToast(
        `Leaders saved for ${leaderForm.productLine} / ${formatRoleLabel(leaderForm.role)}.`,
        { type: "success", title: "Saved" }
      );
      setLeaderForm(EMPTY_LEADER_FORM);
      await loadData();
    } catch (error) {
      showToast(error?.message || "Unable to save leaders.", {
        type: "error",
        title: "Save failed"
      });
    } finally {
      setIsSavingLeader(false);
    }
  };

  // --------------- Viewer handlers ---------------

  const handleViewerProductLineChange = (value) => {
    setViewerForm((prev) => ({
      ...prev,
      productLine: value,
      selectedEmails: getViewerEmails(value, prev.role),
      emailFilter: ""
    }));
  };

  const handleViewerRoleChange = (value) => {
    setViewerForm((prev) => ({
      ...prev,
      role: value,
      selectedEmails: getViewerEmails(prev.productLine, value),
      emailFilter: ""
    }));
  };

  const toggleViewerEmail = (email) => {
    setViewerForm((prev) => ({
      ...prev,
      selectedEmails: prev.selectedEmails.includes(email)
        ? prev.selectedEmails.filter((e) => e !== email)
        : [...prev.selectedEmails, email]
    }));
  };

  const handleManageViewers = (group) => {
    setActivePanel("viewers");
    setViewerForm({
      productLine: group.product_line,
      role: group.role,
      selectedEmails: group.viewerEntries.map((e) => e.email),
      emailFilter: ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteViewer = async (viewerId, userEmail, productLine, role) => {
    setIsDeletingViewerId(viewerId);
    try {
      await deleteViewer(viewerId);
      await loadData();
      showToast(`${userEmail} removed from ${productLine} / ${formatRoleLabel(role)} viewers.`, {
        type: "success",
        title: "Removed"
      });
    } catch (error) {
      showToast(error?.message || "Unable to remove this viewer.", {
        type: "error",
        title: "Delete failed"
      });
    } finally {
      setIsDeletingViewerId(null);
    }
  };

  const handleSubmitViewers = async (event) => {
    event.preventDefault();
    if (!viewerForm.productLine || !viewerForm.role) return;
    setIsSavingViewer(true);
    try {
      await setViewerAssignment({
        product_line: viewerForm.productLine,
        role: viewerForm.role,
        viewer_emails: viewerForm.selectedEmails
      });
      showToast(
        `Viewers saved for ${viewerForm.productLine} / ${formatRoleLabel(viewerForm.role)}.`,
        { type: "success", title: "Saved" }
      );
      setViewerForm(EMPTY_VIEWER_FORM);
      await loadData();
    } catch (error) {
      showToast(error?.message || "Unable to save viewers.", {
        type: "error",
        title: "Save failed"
      });
    } finally {
      setIsSavingViewer(false);
    }
  };

  const isLeaderGroupSelected = Boolean(leaderForm.productLine);
  const isViewerGroupSelected = Boolean(viewerForm.productLine);

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
                    Configure <strong>Leaders</strong> who receive notifications and manage RFQs,
                    and <strong>Viewers</strong> who have read-only access to RFQs by product line.
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

            <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
              {/* Left panel — form tabs */}
              <div className="space-y-4">
                {/* Tab switcher */}
                <div className="card overflow-hidden p-1">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setActivePanel("leaders")}
                      className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                        activePanel === "leaders"
                          ? "bg-tide text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Manage Leaders
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePanel("viewers")}
                      className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                        activePanel === "viewers"
                          ? "bg-tide text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Manage Viewers
                    </button>
                  </div>
                </div>

                {/* Leaders panel */}
                {activePanel === "leaders" && (
                  <div className="card p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-display text-xl text-ink">
                          {isLeaderGroupSelected ? "Edit Leaders" : "Select a group"}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Leaders receive notifications and can act on RFQs.
                        </p>
                      </div>
                      {isLeaderGroupSelected ? (
                        <button
                          type="button"
                          onClick={() => setLeaderForm(EMPTY_LEADER_FORM)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-tide/40 hover:text-tide"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>

                    <form className="mt-6 space-y-4" onSubmit={handleSubmitLeaders}>
                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-ink">
                          Product Line
                        </span>
                        <select
                          className="input-field w-full"
                          value={leaderForm.productLine}
                          onChange={(e) => handleLeaderProductLineChange(e.target.value)}
                          required
                          disabled={isSavingLeader}
                        >
                          <option value="">Select a product line</option>
                          {uniqueProductLineNames.map((pl) => (
                            <option key={pl} value={pl}>
                              {pl}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-ink">Role</span>
                        <select
                          className="input-field w-full"
                          value={leaderForm.role}
                          onChange={(e) => handleLeaderRoleChange(e.target.value)}
                          required
                          disabled={isSavingLeader}
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {leaderForm.productLine ? (
                        <UserChecklist
                          users={allUsers}
                          selectedEmails={leaderForm.selectedEmails}
                          onToggle={toggleLeaderEmail}
                          isSaving={isSavingLeader}
                          filter={leaderForm.emailFilter}
                          onFilterChange={(v) => setLeaderForm((p) => ({ ...p, emailFilter: v }))}
                          onClearAll={() => setLeaderForm((p) => ({ ...p, selectedEmails: [] }))}
                          label="Leaders"
                        />
                      ) : null}

                      <button
                        type="submit"
                        disabled={isSavingLeader || !leaderForm.productLine}
                        className="inline-flex items-center justify-center rounded-2xl bg-tide px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingLeader ? "Saving..." : "Save Leaders"}
                      </button>
                    </form>
                  </div>
                )}

                {/* Viewers panel */}
                {activePanel === "viewers" && (
                  <div className="card p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-display text-xl text-ink">
                          {isViewerGroupSelected ? "Edit Viewers" : "Select a group"}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Viewers can open and read RFQs for this product line — no edit access.
                        </p>
                      </div>
                      {isViewerGroupSelected ? (
                        <button
                          type="button"
                          onClick={() => setViewerForm(EMPTY_VIEWER_FORM)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-tide/40 hover:text-tide"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>

                    <form className="mt-6 space-y-4" onSubmit={handleSubmitViewers}>
                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-ink">
                          Product Line
                        </span>
                        <select
                          className="input-field w-full"
                          value={viewerForm.productLine}
                          onChange={(e) => handleViewerProductLineChange(e.target.value)}
                          required
                          disabled={isSavingViewer}
                        >
                          <option value="">Select a product line</option>
                          {uniqueProductLineNames.map((pl) => (
                            <option key={pl} value={pl}>
                              {pl}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-ink">Role</span>
                        <select
                          className="input-field w-full"
                          value={viewerForm.role}
                          onChange={(e) => handleViewerRoleChange(e.target.value)}
                          required
                          disabled={isSavingViewer}
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {viewerForm.productLine ? (
                        <UserChecklist
                          users={allUsers}
                          selectedEmails={viewerForm.selectedEmails}
                          onToggle={toggleViewerEmail}
                          isSaving={isSavingViewer}
                          filter={viewerForm.emailFilter}
                          onFilterChange={(v) => setViewerForm((p) => ({ ...p, emailFilter: v }))}
                          onClearAll={() => setViewerForm((p) => ({ ...p, selectedEmails: [] }))}
                          label="Viewers"
                        />
                      ) : null}

                      <button
                        type="submit"
                        disabled={isSavingViewer || !viewerForm.productLine}
                        className="inline-flex items-center justify-center rounded-2xl bg-tide px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingViewer ? "Saving..." : "Save Viewers"}
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* Right panel — grouped table */}
              <div className="card overflow-hidden">
                <div className="border-b border-slate-200 px-6 py-5">
                  <h3 className="font-display text-xl text-ink">Current routing</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Each row shows <strong>Leaders</strong> and <strong>Viewers</strong> for a product line and role.
                    Click <strong>Manage</strong> to edit a group.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50/90">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Product line
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Role
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Leaders
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Viewers
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Updated At
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {loading ? (
                        <tr>
                          <td colSpan="6" className="px-6 py-8 text-center text-sm text-slate-500">
                            Loading routing assignments...
                          </td>
                        </tr>
                      ) : groupedEntries.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-6 py-8 text-center text-sm text-slate-500">
                            No routing assignments found yet.
                          </td>
                        </tr>
                      ) : (
                        groupedEntries.map((group) => {
                          const isLeaderActive =
                            activePanel === "leaders" &&
                            leaderForm.productLine === group.product_line &&
                            leaderForm.role === group.role;
                          const isViewerActive =
                            activePanel === "viewers" &&
                            viewerForm.productLine === group.product_line &&
                            viewerForm.role === group.role;
                          const isActive = isLeaderActive || isViewerActive;

                          return (
                            <tr
                              key={`${group.product_line}|||${group.role}`}
                              className={isActive ? "bg-tide/5" : ""}
                            >
                              <td className="px-4 py-4 text-sm font-semibold text-ink">
                                {group.product_line}
                              </td>
                              <td className="px-4 py-4 text-sm text-slate-600">
                                {group.roleLabel}
                              </td>

                              {/* Leaders cell */}
                              <td className="px-4 py-4">
                                {group.leaderEntries.length === 0 ? (
                                  <span className="text-xs text-slate-400">No leaders</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {group.leaderEntries.map((entry) => (
                                      <span
                                        key={entry.id}
                                        className="inline-flex items-center gap-1 rounded-lg bg-tide/10 pl-2.5 pr-1.5 py-1 text-xs font-medium text-tide"
                                      >
                                        {entry.email}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleDeleteLeader(
                                              entry.id,
                                              entry.email,
                                              group.product_line,
                                              group.role
                                            )
                                          }
                                          disabled={isDeletingLeaderId === entry.id}
                                          title={`Remove leader ${entry.email}`}
                                          className="flex-shrink-0 rounded px-0.5 text-tide/60 transition hover:bg-red-100 hover:text-red-500 disabled:opacity-50"
                                        >
                                          {isDeletingLeaderId === entry.id ? "…" : "×"}
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>

                              {/* Viewers cell */}
                              <td className="px-4 py-4">
                                {group.viewerEntries.length === 0 ? (
                                  <span className="text-xs text-slate-400">No viewers</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {group.viewerEntries.map((entry) => (
                                      <span
                                        key={entry.id}
                                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 pl-2.5 pr-1.5 py-1 text-xs font-medium text-slate-600"
                                      >
                                        {entry.email}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleDeleteViewer(
                                              entry.id,
                                              entry.email,
                                              group.product_line,
                                              group.role
                                            )
                                          }
                                          disabled={isDeletingViewerId === entry.id}
                                          title={`Remove viewer ${entry.email}`}
                                          className="flex-shrink-0 rounded px-0.5 text-slate-400 transition hover:bg-red-100 hover:text-red-500 disabled:opacity-50"
                                        >
                                          {isDeletingViewerId === entry.id ? "…" : "×"}
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>

                              <td className="px-4 py-4 text-sm text-slate-500">
                                {formatUpdatedAt(group.latestUpdatedAt)}
                              </td>

                              <td className="px-4 py-4">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleManageLeaders(group)}
                                    className="rounded-xl border border-tide/30 bg-tide/5 px-3 py-1.5 text-xs font-semibold text-tide transition hover:bg-tide/10"
                                  >
                                    Leaders
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleManageViewers(group)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                                  >
                                    Viewers
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
