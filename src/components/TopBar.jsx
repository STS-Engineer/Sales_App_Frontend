import { useEffect, useRef, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";
import { getMe } from "../api";
import {
  clearSession,
  getCurrentUserRole,
  getUserProfile,
  hasAnyRole,
  hasRole,
  setCurrentUserRole,
  setUserProfile
} from "../utils/session.js";

const ROLE_LABELS = {
  COMMERCIAL: "Commercial",
  ZONE_MANAGER: "Zone Manager",
  COSTING_TEAM: "Costing Team",
  RND: "R&D",
  PLANT_MANAGER: "Plant Manager",
  PLM: "PLM",
  OWNER: "Owner"
};

const formatRoleLabel = (role) =>
  ROLE_LABELS[role] ||
  String(role || "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

export default function TopBar({ title, action }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const location = useLocation();
  const [profile, setProfile] = useState(() => getUserProfile());
  const storedEmail = profile.email;
  const storedRole = getCurrentUserRole();
  const storedName = profile.name || storedEmail;
  const displayName = storedName || "User";
  const displayRole = storedRole ? formatRoleLabel(storedRole) : "";
  const isOwner = hasRole("OWNER");
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const handleSignOut = () => {
    clearSession();
  };

  const isKpiRoute = location.pathname.startsWith("/kpis");

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled || !me?.email) return;
        setUserProfile({
          email: me.email,
          role: me.role,
          roles: me.roles || [me.role].filter(Boolean),
          name: me.full_name || me.email.split("@")[0]
        });
        setCurrentUserRole(me.role);
        setProfile(getUserProfile());
      })
      .catch(() => {
        // Keep the cached profile if the refresh fails (e.g. offline).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handlePointer = (event) => {
      if (menuRef.current?.contains(event.target)) {
        return;
      }
      if (triggerRef.current?.contains(event.target)) {
        return;
      }
      setMenuOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  return (
    <div className="sticky top-0 z-50 w-full border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 sm:flex-nowrap sm:gap-4 sm:px-5 lg:px-10">
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 sm:gap-3 transition hover:opacity-90"
            aria-label="Go to dashboard"
          >
            <img src={logo} alt="AVO Carbon Group" className="h-7 w-auto sm:h-9" />
            <span className="mx-1 h-6 w-[3px] rounded-full bg-slate-300 sm:mx-2 sm:h-8" aria-hidden="true" />
            <span className="font-semibold text-base tracking-tight text-ink sm:text-xl lg:text-2xl">
              Sales Management
            </span>
          </Link>
          {title ? <h1 className="font-display text-lg text-ink sm:text-2xl">{title}</h1> : null}
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:gap-3">
          {action}
          {hasAnyRole(["OWNER", "ZONE_MANAGER", "COMMERCIAL"]) && (
            <Link
              to="/kpis"
              className={[
                "inline-flex flex-shrink-0 items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-semibold shadow-sm transition sm:gap-1.5 sm:px-3 sm:py-2 sm:text-xs min-[1050px]:gap-2 min-[1050px]:px-4 min-[1050px]:py-2.5 min-[1050px]:text-sm",
                isKpiRoute
                  ? "border-tide/70 bg-gradient-to-r from-tide to-mint text-white"
                  : "border-slate-200 bg-white/90 text-slate-600 hover:border-tide/40 hover:text-tide hover:shadow-md"
              ].join(" ")}
            >
              <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden min-[1050px]:inline">Dashboard</span>
            </Link>
          )}
          <div className="relative ml-auto w-[85%] flex-none sm:ml-0 sm:w-auto sm:min-w-0 sm:shrink">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              ref={triggerRef}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-2 py-1.5 shadow-sm transition hover:border-tide/40 hover:shadow-md sm:gap-3 sm:px-3 min-[1050px]:min-w-[340px]"
            >
              <span className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-tide/10 text-[11px] font-bold text-tide sm:h-8 sm:w-8 sm:text-xs">
                {initials || "U"}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-mint sm:h-3 sm:w-3" />
              </span>
              <div className="min-w-0 flex-1 text-left leading-tight min-[1050px]:max-w-[190px] min-[1050px]:flex-none">
                <p className="truncate text-xs font-semibold text-ink sm:text-sm">{displayName}</p>
                {displayRole ? (
                  <span className="mt-0.5 inline-flex max-w-full items-center rounded-full bg-tide/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-tide">
                    <span className="truncate">{displayRole}</span>
                  </span>
                ) : null}
              </div>
              <span
                className={`ml-auto inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition sm:h-7 sm:w-7 ${
                  menuOpen ? "rotate-180 border-tide/40 text-tide" : ""
                }`}
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>
            {menuOpen ? (
              <div
                ref={menuRef}
                className="absolute right-0 mt-3 w-full overflow-hidden rounded-3xl border border-slate-200/70 bg-white/95 shadow-card"
                role="menu"
              >
                <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden">
                  <div className="p-2">
                    {isOwner ? (
                      <>
                        <Link
                          to="/settings/routing"
                          onClick={() => setMenuOpen(false)}
                          className="group flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100"
                          role="menuitem"
                        >
                          <span className="flex items-center gap-3">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-mint/15 text-mint">
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 8.92 4.6H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .68.4 1.29 1.03 1.56.15.06.31.1.48.1H21a2 2 0 0 1 0 4h-.09c-.17 0-.33.04-.48.1-.63.27-1.03.88-1.03 1.56V15Z" />
                              </svg>
                            </span>
                            <span>
                              Routing settings
                              <span className="mt-1 block text-xs font-medium text-slate-500">
                                Manage PLM, R&amp;D, and Costing emails
                              </span>
                            </span>
                          </span>
                        </Link>
                        <Link
                          to="/users/validation"
                          onClick={() => setMenuOpen(false)}
                          className="group flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100"
                          role="menuitem"
                        >
                          <span className="flex items-center gap-3">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-tide/10 text-tide">
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M19 8v6" />
                                <path d="M22 11h-6" />
                              </svg>
                            </span>
                            <span>
                              User validation
                              <span className="mt-1 block text-xs font-medium text-slate-500">
                                Review and assign roles
                              </span>
                            </span>
                          </span>
                        </Link>
                        <div className="my-2 h-px bg-slate-200/70" />
                      </>
                    ) : null}
                    <Link
                      to="/"
                      onClick={() => {
                        handleSignOut();
                        setMenuOpen(false);
                      }}
                      className="group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-coral transition hover:bg-coral/10"
                      role="menuitem"
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-coral/10 text-coral">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                          <path d="M10 17l5-5-5-5" />
                          <path d="M15 12H3" />
                        </svg>
                      </span>
                      <span>
                        Sign out
                        <span className="mt-1 block text-xs font-medium text-slate-500">
                          End this session
                        </span>
                      </span>
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
