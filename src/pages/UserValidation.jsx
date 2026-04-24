import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import {
  deleteUser as deleteUserAccount,
  listAllUsers,
  updateUserRole
} from "../api";
import { clearSession, getUserProfile } from "../utils/session.js";

const ROLE_OPTIONS = [
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "ZONE_MANAGER", label: "Zone Manager" },
  { value: "COSTING_TEAM", label: "Costing Team" },
  { value: "RND", label: "R&D" },
  { value: "PLANT_MANAGER", label: "Plant Manager" },
  { value: "PLM", label: "PLM" },
  { value: "OWNER", label: "Owner" }
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
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState(ROLE_OPTIONS[0].value);
  const [approveSelectedUser, setApproveSelectedUser] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const profile = getUserProfile();
  const isOwner = profile.role === "OWNER";
  const currentUserEmail = profile.email;

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

  const isCurrentUser = (user) => user?.email === currentUserEmail;

  const closeEditModal = (force = false) => {
    if ((isSaving || isDeleting) && !force) {
      return;
    }
    setSelectedUser(null);
    setSelectedRole(ROLE_OPTIONS[0].value);
    setApproveSelectedUser(true);
    setDeleteTarget(null);
  };

  useEffect(() => {
    if (!isOwner) {
      return;
    }
    void loadUsers();
  }, [isOwner]);

  useEffect(() => {
    if (!selectedUser && !deleteTarget) {
      return;
    }
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }
      if (deleteTarget) {
        if (!isDeleting) {
          setDeleteTarget(null);
        }
        return;
      }
      closeEditModal();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedUser, deleteTarget, isSaving, isDeleting]);

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
    setApproveSelectedUser(user.is_approved || user.role === "OWNER");
    setDeleteTarget(null);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }

    const nextRoleIsOwner = selectedRole === "OWNER";
    const willApprove = selectedUser.is_approved || nextRoleIsOwner || approveSelectedUser;
    const isSelfOwnerDemotion =
      isCurrentUser(selectedUser) &&
      selectedUser.role === "OWNER" &&
      selectedRole !== "OWNER";

    setIsSaving(true);
    try {
      const payload = {
        role: selectedRole,
        ...(!selectedUser.is_approved
          ? { is_approved: nextRoleIsOwner ? true : approveSelectedUser }
          : {})
      };
      await updateUserRole(selectedUser.user_id, payload);
      closeEditModal(true);

      if (isSelfOwnerDemotion) {
        showToast("Your owner access changed. Please sign in again.", {
          type: "success",
          title: "Access updated"
        });
        clearSession();
        navigate("/", { replace: true });
        return;
      }

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
      await loadUsers();
    } catch (error) {
      showToast(error?.message || "Unable to update this user. Please try again.", {
        type: "error",
        title: "Update failed"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    const isDeletingCurrentUser = isCurrentUser(deleteTarget);

    setIsDeleting(true);
    try {
      await deleteUserAccount(deleteTarget.user_id);
      setDeleteTarget(null);
      closeEditModal(true);

      if (isDeletingCurrentUser) {
        showToast("Your account was deleted. Please sign in again.", {
          type: "success",
          title: "Account deleted"
        });
        clearSession();
        navigate("/", { replace: true });
        return;
      }

      showToast("User deleted successfully.", {
        type: "success",
        title: "User deleted"
      });
      await loadUsers();
    } catch (error) {
      showToast(error?.message || "Unable to delete this user. Please try again.", {
        type: "error",
        title: "Delete failed"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const selectedRoleIsOwner = selectedRole === "OWNER";
  const selectedUserIsCurrentUser = isCurrentUser(selectedUser);
  const showApprovalToggle =
    Boolean(selectedUser) && !selectedUser.is_approved && !selectedRoleIsOwner;
  const showOwnerApprovalNotice =
    Boolean(selectedUser) && !selectedUser.is_approved && selectedRoleIsOwner;

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
                      Filter users, review account status, and manage roles from one
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
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-ink">{user.displayName}</p>
                                  {isCurrentUser(user) ? (
                                    <span className="badge border-amber-200 bg-amber-50 text-amber-700">
                                      You
                                    </span>
                                  ) : null}
                                </div>
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
                                <button
                                  type="button"
                                  onClick={() => openEditModal(user)}
                                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-tide/40 hover:text-tide hover:shadow-md"
                                >
                                  Manage
                                </button>
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
                  Manage user access
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Update role access, approval status, or remove the account.
                </p>
              </div>
              <button
                type="button"
                className="chat-modal-close"
                onClick={() => closeEditModal()}
                aria-label="Close user editor"
                disabled={isSaving || isDeleting}
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
                    {selectedUserIsCurrentUser ? (
                      <span className="badge border-amber-200 bg-amber-50 text-amber-700">
                        Your account
                      </span>
                    ) : null}
                  </div>
                </div>

                {selectedUserIsCurrentUser ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
                    Changing your owner role or deleting this account will sign you out
                    immediately after the change is saved.
                  </div>
                ) : null}

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                    Role
                  </span>
                  <select
                    className="input-field w-full"
                    value={selectedRole}
                    onChange={(event) => setSelectedRole(event.target.value)}
                    disabled={isSaving || isDeleting}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>

                {showApprovalToggle ? (
                  <label className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={approveSelectedUser}
                      onChange={(event) => setApproveSelectedUser(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-tide focus:ring-tide/30"
                      disabled={isSaving || isDeleting}
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

                {showOwnerApprovalNotice ? (
                  <div className="rounded-2xl border border-sun/30 bg-sun/10 p-4 text-sm text-sun">
                    Owner accounts are approved automatically when saved.
                  </div>
                ) : null}

                <div className="rounded-2xl border border-red-200/80 bg-red-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-500">
                    Danger zone
                  </p>
                  <p className="mt-2 text-sm text-red-700">
                    Delete this account permanently and remove all access to the app.
                  </p>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 shadow-sm transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => setDeleteTarget(selectedUser)}
                      disabled={isSaving || isDeleting}
                    >
                      Delete user
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    className="outline-button px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => closeEditModal()}
                    disabled={isSaving || isDeleting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="gradient-button rounded-xl px-4 py-2.5 text-xs font-semibold shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSaving || isDeleting}
                  >
                    {isSaving ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="chat-modal-backdrop"
          onClick={() => {
            if (!isDeleting) {
              setDeleteTarget(null);
            }
          }}
          role="presentation"
        >
          <div
            className="chat-modal max-w-[520px] border border-red-200/80 shadow-[0_24px_70px_-40px_rgba(185,28,28,0.32)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header border-b-red-100 bg-red-50/70">
              <div>
                <p id="delete-user-modal-title" className="chat-modal-title text-red-700">
                  Delete user?
                </p>
                <p className="mt-1 text-xs text-red-500">
                  This action permanently removes the account.
                </p>
              </div>
              <button
                type="button"
                className="chat-modal-close h-10 w-10 rounded-xl border border-red-200/70 bg-white text-red-500 shadow-sm hover:border-red-300 hover:bg-red-50"
                onClick={() => setDeleteTarget(null)}
                aria-label="Close delete confirmation"
                disabled={isDeleting}
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
            <div className="chat-modal-body bg-gradient-to-b from-red-50/30 to-white">
              <div className="space-y-4 text-sm text-slate-600">
                <p>
                  Are you sure you want to delete{" "}
                  <strong className="text-ink">{deleteTarget.displayName}</strong>?
                </p>
                <p className="rounded-2xl border border-red-100 bg-white/80 p-4 text-xs leading-6 text-red-700">
                  {deleteTarget.role === "OWNER"
                    ? "Owner accounts can only be deleted when another owner still exists."
                    : "This will remove the user and revoke their access immediately."}
                  {isCurrentUser(deleteTarget)
                    ? " Because this is your account, you will be signed out right away."
                    : ""}
                </p>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    className="outline-button px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => setDeleteTarget(null)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 shadow-sm transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting..." : "Delete user"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
