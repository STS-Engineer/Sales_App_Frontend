import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TopBar from "../components/TopBar.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import { listAllUsers, updateUserRole } from "../api";
import { getUserProfile } from "../utils/session.js";

const ROLE_OPTIONS = [
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "ZONE_MANAGER", label: "Zone Manager" },
  { value: "COSTING_TEAM", label: "Costing Team" },
  { value: "PLANT_MANAGER", label: "Plant Manager" },
  { value: "PLM", label: "PLM" }
];

const EMPTY_STATE_COPY = {
  pending: "No pending users right now.",
  approved: "No approved users right now.",
  owners: "No owner accounts found."
};

function formatRoleLabel(role) {
  const match = ROLE_OPTIONS.find((option) => option.value === role);
  if (match) {
    return match.label;
  }
  return String(role || "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function SummaryCard({
  accentClass,
  count,
  icon,
  iconClassName,
  isActive,
  label,
  onClick
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`relative overflow-hidden rounded-2xl border bg-white/95 p-4 text-left shadow-soft transition focus:outline-none focus:ring-2 focus:ring-tide/30 ${
        isActive
          ? "border-tide/60 bg-tide/5 shadow-md"
          : "border-slate-200/70 hover:border-tide/40 hover:shadow-md"
      }`}
    >
      <span className={`absolute left-0 top-0 h-full w-1.5 rounded-r-full ${accentClass}`} />
      <div className="flex items-center gap-4 pl-2">
        <span
          className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${iconClassName}`}
        >
          {icon}
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            {label}
          </p>
          <p className="mt-1 font-display text-3xl text-ink">{count}</p>
        </div>
      </div>
    </button>
  );
}

export default function UserValidation() {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState(ROLE_OPTIONS[0].value);
  const [approveSelectedUser, setApproveSelectedUser] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const profile = getUserProfile();
  const isOwner = profile.role === "OWNER";

  const loadUsers = async () => {
    setLoading(true);
    try {
      const allUsers = await listAllUsers();
      setUsers(Array.isArray(allUsers) ? allUsers : []);
    } catch (error) {
      setUsers([]);
      showToast("Unable to load users. Please refresh.", {
        type: "error",
        title: "Loading failed"
      });
    } finally {
      setLoading(false);
    }
  };

  const closeEditModal = (force = false) => {
    if (isSaving && !force) {
      return;
    }
    setSelectedUser(null);
    setSelectedRole(ROLE_OPTIONS[0].value);
    setApproveSelectedUser(true);
  };

  useEffect(() => {
    if (!isOwner) {
      return;
    }
    void loadUsers();
  }, [isOwner]);

  useEffect(() => {
    if (!selectedUser) {
      return;
    }
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeEditModal();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedUser, isSaving]);

  const formattedUsers = useMemo(
    () =>
      users.map((user) => ({
        ...user,
        displayName: user.full_name || user.email,
        roleLabel: formatRoleLabel(user.role),
        statusLabel: user.is_approved ? "Approved" : "Pending",
        requestedAtLabel: user.created_at
          ? new Date(user.created_at).toLocaleString()
          : "N/A"
      })),
    [users]
  );

  const pendingCount = useMemo(
    () => formattedUsers.filter((user) => !user.is_approved).length,
    [formattedUsers]
  );

  const approvedCount = useMemo(
    () => formattedUsers.filter((user) => user.is_approved && user.role !== "OWNER").length,
    [formattedUsers]
  );

  const ownerCount = useMemo(
    () => formattedUsers.filter((user) => user.role === "OWNER").length,
    [formattedUsers]
  );

  const tabUsers = useMemo(() => {
    if (activeTab === "approved") {
      return formattedUsers.filter(
        (user) => user.is_approved && user.role !== "OWNER"
      );
    }
    if (activeTab === "owners") {
      return formattedUsers.filter((user) => user.role === "OWNER");
    }
    return formattedUsers.filter((user) => !user.is_approved);
  }, [activeTab, formattedUsers]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return tabUsers;
    }
    return tabUsers.filter((user) =>
      [
        user.displayName,
        user.email,
        user.roleLabel,
        user.statusLabel,
        user.requestedAtLabel
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [searchTerm, tabUsers]);

  const openEditModal = (user) => {
    setSelectedUser(user);
    setSelectedRole(
      ROLE_OPTIONS.some((option) => option.value === user.role)
        ? user.role
        : ROLE_OPTIONS[0].value
    );
    setApproveSelectedUser(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }

    const willApprove = selectedUser.is_approved ? true : approveSelectedUser;

    setIsSaving(true);
    try {
      const payload = {
        role: selectedRole,
        ...(!selectedUser.is_approved ? { is_approved: approveSelectedUser } : {})
      };
      await updateUserRole(selectedUser.user_id, payload);
      showToast(
        willApprove && !selectedUser.is_approved
          ? "User updated and approved successfully."
          : "User updated successfully.",
        {
          type: "success",
          title:
            willApprove && !selectedUser.is_approved ? "User approved" : "User updated"
        }
      );
      closeEditModal(true);
      await loadUsers();
    } catch (error) {
      showToast(
        error?.message || "Unable to update this user. Please try again.",
        {
          type: "error",
          title: "Update failed"
        }
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70">
      <TopBar />

      <div className="px-6 py-10">
        <div className="w-full">
          {!isOwner ? (
            <div className="card p-6 text-center">
              <p className="text-sm font-semibold text-ink">Access restricted</p>
              <p className="mt-2 text-sm text-slate-500">
                Only the owner can validate new users.
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
              <div className="card space-y-7 p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      Owner panel
                    </p>
                    <h2 className="font-display text-2xl text-ink">
                      User access management
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Filter users, review account status, and update roles from one
                      place.
                    </p>
                  </div>
                  <div className="w-full sm:w-72">
                    <div className="relative">
                      <input
                        className="input-field w-full pl-12 pr-10"
                        type="search"
                        placeholder="Search users"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                      />
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="11" cy="11" r="6.5" />
                          <path d="M16.2 16.2L20 20" />
                        </svg>
                      </span>
                      {searchTerm ? (
                        <button
                          type="button"
                          onClick={() => setSearchTerm("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                          aria-label="Clear search"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <path d="M6 6l12 12" />
                            <path d="M18 6l-12 12" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                    <p
                      className={`mt-2 text-xs text-slate-500 transition ${
                        searchTerm ? "opacity-100" : "opacity-0"
                      }`}
                      aria-live="polite"
                      aria-atomic="true"
                      aria-hidden={!searchTerm}
                    >
                      {searchTerm
                        ? `${filteredUsers.length} result${
                            filteredUsers.length === 1 ? "" : "s"
                          }`
                        : "\u00A0"}
                    </p>
                  </div>
                </div>

                {loading ? (
                  <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-sm text-slate-500">
                    Loading users...
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-3">
                  <SummaryCard
                    label="Pending"
                    count={pendingCount}
                    isActive={activeTab === "pending"}
                    onClick={() => setActiveTab("pending")}
                    accentClass="bg-tide"
                    iconClassName="bg-tide/10 text-tide"
                    icon={
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="7" />
                      </svg>
                    }
                  />
                  <SummaryCard
                    label="Approved"
                    count={approvedCount}
                    isActive={activeTab === "approved"}
                    onClick={() => setActiveTab("approved")}
                    accentClass="bg-mint"
                    iconClassName="bg-mint/10 text-mint"
                    icon={
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    }
                  />
                  <SummaryCard
                    label="Owners"
                    count={ownerCount}
                    isActive={activeTab === "owners"}
                    onClick={() => setActiveTab("owners")}
                    accentClass="bg-sun"
                    iconClassName="bg-sun/10 text-sun"
                    icon={
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                        <path d="M4 21a8 8 0 0 1 16 0" />
                      </svg>
                    }
                  />
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 shadow-soft">
                  {filteredUsers.length === 0 && !loading ? (
                    <div className="p-6 text-center text-sm text-slate-500">
                      {searchTerm
                        ? "No users match your search in this tab."
                        : EMPTY_STATE_COPY[activeTab]}
                    </div>
                  ) : null}

                  {filteredUsers.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-[760px] w-full text-left text-sm">
                        <thead className="bg-slate-100/80 text-xs uppercase tracking-widest text-slate-500">
                          <tr>
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">Email</th>
                            <th className="px-6 py-4">Role</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right" aria-label="Actions" />
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((user) => (
                            <tr
                              key={user.user_id}
                              className="border-t border-slate-200/60 text-slate-600 transition hover:bg-white/70"
                            >
                              <td className="px-6 py-4">
                                <p className="font-semibold text-ink">{user.displayName}</p>
                                <p className="mt-1 text-xs text-slate-400">
                                  Requested: {user.requestedAtLabel}
                                </p>
                              </td>
                              <td className="px-6 py-4 font-medium text-slate-700">
                                {user.email}
                              </td>
                              <td className="px-6 py-4">
                                <span className="badge border-slate-200 bg-slate-100 text-slate-700">
                                  {user.roleLabel}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span
                                  className={`badge ${
                                    user.is_approved
                                      ? "border-mint/40 bg-mint/10 text-mint"
                                      : "border-tide/30 bg-tide/10 text-tide"
                                  }`}
                                >
                                  {user.statusLabel}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                {user.role === "OWNER" ? (
                                  <span className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-400">
                                    Protected
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(user)}
                                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-tide/40 hover:text-tide hover:shadow-md"
                                  >
                                    Edit Role
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedUser ? (
        <div
          className="chat-modal-backdrop"
          onClick={() => closeEditModal()}
          role="presentation"
        >
          <div
            className="chat-modal max-w-[580px] border border-slate-200/80 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-role-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <div>
                <p id="user-role-modal-title" className="chat-modal-title">
                  Edit user role
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Update role access and approval status.
                </p>
              </div>
              <button
                type="button"
                className="chat-modal-close"
                onClick={() => closeEditModal()}
                aria-label="Close user role editor"
                disabled={isSaving}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body">
              <form className="space-y-5" onSubmit={handleSave}>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                  <p className="text-base font-semibold text-ink">
                    {selectedUser.displayName}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{selectedUser.email}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="badge border-slate-200 bg-white text-slate-700">
                      {selectedUser.roleLabel}
                    </span>
                    <span
                      className={`badge ${
                        selectedUser.is_approved
                          ? "border-mint/40 bg-mint/10 text-mint"
                          : "border-tide/30 bg-tide/10 text-tide"
                      }`}
                    >
                      {selectedUser.statusLabel}
                    </span>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                    Role
                  </span>
                  <select
                    className="input-field w-full"
                    value={selectedRole}
                    onChange={(event) => setSelectedRole(event.target.value)}
                    disabled={isSaving}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>

                {!selectedUser.is_approved ? (
                  <label className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={approveSelectedUser}
                      onChange={(event) => setApproveSelectedUser(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-tide focus:ring-tide/30"
                      disabled={isSaving}
                    />
                    <span>
                      <span className="block font-semibold text-ink">Approve user</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        Leave this checked to activate the account immediately after
                        saving.
                      </span>
                    </span>
                  </label>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    className="outline-button px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => closeEditModal()}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="gradient-button rounded-xl px-4 py-2.5 text-xs font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
