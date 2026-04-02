import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import TopBar from "../components/TopBar.jsx";
import { listAllUsers, listPendingUsers, updateUserRole } from "../api";
import { getUserProfile } from "../utils/session.js";

const ROLE_OPTIONS = [
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "ZONE_MANAGER", label: "Zone Manager" },
  { value: "COSTING_TEAM", label: "Costing team" },
  { value: "PLANT_MANAGER", label: "Plant manager" },
  { value: "PLM", label: "PLM" },
  { value: "OWNER", label: "Owner" }
];

export default function UserValidation() {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [roleById, setRoleById] = useState({});
  const [openSelectId, setOpenSelectId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [approvedCount, setApprovedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dropdownRef = useRef(null);
  const profile = getUserProfile();
  const isOwner = profile.role === "OWNER";

  useEffect(() => {
    if (!isOwner) {
      return;
    }
    const loadUsers = async () => {
      setLoading(true);
      setError("");
      try {
        const [pending, all] = await Promise.all([
          listPendingUsers(),
          listAllUsers()
        ]);
        setPendingUsers(Array.isArray(pending) ? pending : []);
        const allCount = Array.isArray(all) ? all.length : 0;
        const pendingCountLocal = Array.isArray(pending) ? pending.length : 0;
        setApprovedCount(Math.max(allCount - pendingCountLocal, 0));
      } catch (err) {
        setError("Unable to load users. Please refresh.");
      } finally {
        setLoading(false);
      }
    };
    loadUsers();
  }, [isOwner]);

  useEffect(() => {
    if (!openSelectId) {
      return;
    }
    const handlePointer = (event) => {
      if (dropdownRef.current?.contains(event.target)) {
        return;
      }
      setOpenSelectId(null);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") {
        setOpenSelectId(null);
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openSelectId]);

  const pendingCount = pendingUsers.length;

  const handleRoleChange = (userId, value) => {
    setRoleById((prev) => ({ ...prev, [userId]: value }));
  };

  const handleApprove = async (user) => {
    const roleValue = roleById[user.user_id] || ROLE_OPTIONS[0].value;
    try {
      await updateUserRole(user.user_id, roleValue);
      const pending = await listPendingUsers();
      const all = await listAllUsers();
      setPendingUsers(Array.isArray(pending) ? pending : []);
      const allCount = Array.isArray(all) ? all.length : 0;
      const pendingCountLocal = Array.isArray(pending) ? pending.length : 0;
      setApprovedCount(Math.max(allCount - pendingCountLocal, 0));
    } catch (err) {
      setError("Unable to approve this user. Please try again.");
    }
  };

  const formattedUsers = useMemo(
    () =>
      pendingUsers.map((user) => ({
        ...user,
        displayName: user.full_name || user.email,
        requestedAtLabel: user.created_at
          ? new Date(user.created_at).toLocaleString()
          : "N/A"
      })),
    [pendingUsers]
  );

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return formattedUsers;
    }
    return formattedUsers.filter((user) =>
      [user.displayName, user.email].some((value) =>
        String(value || "").toLowerCase().includes(term)
      )
    );
  }, [formattedUsers, searchTerm]);

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
                    <h2 className="font-display text-2xl text-ink">Users to validate</h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Review requests, assign roles, and unlock access.
                    </p>
                  </div>
                  <div className="w-full sm:w-64">
                    <div className="relative">
                      <input
                        className="input-field w-full pl-12 pr-10"
                        type="text"
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
                {error ? (
                  <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
                    {error}
                  </div>
                ) : null}
                {loading ? (
                  <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-sm text-slate-500">
                    Loading users...
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-soft">
                    <span className="absolute left-0 top-0 h-full w-1.5 rounded-r-full bg-tide" />
                    <div className="flex items-center gap-4 pl-2">
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-tide/10 text-tide">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="7" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Pending</p>
                        <p className="mt-1 font-display text-3xl text-ink">{pendingCount}</p>
                      </div>
                    </div>
                  </div>
                  <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-soft">
                    <span className="absolute left-0 top-0 h-full w-1.5 rounded-r-full bg-mint" />
                    <div className="flex items-center gap-4 pl-2">
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-mint/10 text-mint">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Approved</p>
                        <p className="mt-1 font-display text-3xl text-ink">{approvedCount}</p>
                      </div>
                    </div>
                  </div>
                  <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-soft">
                    <span className="absolute left-0 top-0 h-full w-1.5 rounded-r-full bg-sun" />
                    <div className="flex items-center gap-4 pl-2">
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sun/10 text-sun">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 12h18" />
                          <path d="M12 3v18" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Total</p>
                        <p className="mt-1 font-display text-3xl text-ink">
                          {pendingCount + approvedCount}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {filteredUsers.length === 0 && !loading ? (
                  <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/70 p-6 text-center text-sm text-slate-500">
                    {searchTerm
                      ? "No users match your search."
                      : "No pending users right now."}
                  </div>
                ) : null}
                {filteredUsers.length > 0 ? (
                  <div className="space-y-4">
                    {filteredUsers.map((user) => (
                      <div
                        key={user.user_id}
                        className="flex flex-col gap-4 rounded-2xl border border-slate-200/70 bg-white/95 px-5 py-4 shadow-soft sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-base font-semibold text-ink">{user.displayName}</p>
                          <p className="text-sm text-slate-500">{user.email}</p>
                          <p className="mt-1 text-sm text-slate-400">
                            Requested: {user.requestedAtLabel}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <div
                            className="relative"
                            ref={openSelectId === user.user_id ? dropdownRef : null}
                          >
                            <button
                              type="button"
                              className="input-field min-w-[160px] text-left"
                              onClick={() =>
                                setOpenSelectId((prev) =>
                                  prev === user.user_id ? null : user.user_id
                                )
                              }
                              aria-haspopup="listbox"
                              aria-expanded={openSelectId === user.user_id}
                            >
                              <span className="block pr-6">
                                {ROLE_OPTIONS.find(
                                  (role) => role.value === roleById[user.user_id]
                                )?.label || ROLE_OPTIONS[0].label}
                              </span>
                              <span
                                className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition ${
                                  openSelectId === user.user_id ? "-rotate-180" : ""
                                }`}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M6 9l6 6 6-6" />
                                </svg>
                              </span>
                            </button>
                            {openSelectId === user.user_id ? (
                              <div
                                className="absolute right-0 z-10 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card"
                                role="listbox"
                              >
                                {ROLE_OPTIONS.map((role) => {
                                  const isActive =
                                    (roleById[user.user_id] || ROLE_OPTIONS[0].value) ===
                                    role.value;
                                  return (
                                    <button
                                      key={role.value}
                                      type="button"
                                      role="option"
                                      aria-selected={isActive}
                                      onClick={() => {
                                        handleRoleChange(user.user_id, role.value);
                                        setOpenSelectId(null);
                                      }}
                                      className={`flex w-full items-center justify-between px-3 py-2 text-sm font-semibold transition ${
                                        isActive
                                          ? "bg-slate-100 text-ink"
                                          : "text-slate-600 hover:bg-slate-50"
                                      }`}
                                    >
                                      <span>{role.label}</span>
                                      {isActive ? (
                                        <span className="text-tide">
                                          <svg
                                            viewBox="0 0 24 24"
                                            className="h-4 w-4"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                          >
                                            <path d="M20 6L9 17l-5-5" />
                                          </svg>
                                        </span>
                                      ) : null}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className="gradient-button rounded-xl px-4 py-3 text-sm font-semibold shadow-soft"
                            onClick={() => handleApprove(user)}
                          >
                            Confirm
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
