import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/logo.png";
import { clearSession, getCurrentUserRole, getUserProfile } from "../utils/session.js";

export default function TopBar({ title, action }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const profile = getUserProfile();
  const storedEmail = profile.email;
  const storedRole = getCurrentUserRole();
  const storedName = profile.name || storedEmail;
  const displayName = storedName || "User";
  const displayEmail = storedEmail && storedEmail !== displayName ? storedEmail : "";
  const isOwner = storedRole === "OWNER";
  const roleLabel = storedRole || "User";
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
      <div className="flex w-full flex-wrap items-center justify-between gap-4 px-10 py-2">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-3 transition hover:opacity-90"
            aria-label="Go to dashboard"
          >
            <img src={logo} alt="AVO Carbon Group" className="h-9 w-auto" />
            <span className="mx-2 h-8 w-[3px] rounded-full bg-slate-300" aria-hidden="true" />
            <span className="font-semibold text-2xl tracking-tight text-ink">
              Sales Management
            </span>
          </Link>
          {title ? <h1 className="font-display text-2xl text-ink">{title}</h1> : null}
        </div>
        <div className="flex items-center gap-3">
          {action}
          <div className="relative w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              ref={triggerRef}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-3 py-1.5 shadow-sm transition hover:border-tide/40 hover:shadow-md sm:min-w-[280px] sm:w-auto"
            >
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-tide/10 text-xs font-bold text-tide">
                {initials || "U"}
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-mint" />
              </span>
              <div className="min-w-0 text-left leading-tight">
                <p className="max-w-[140px] truncate text-sm font-semibold text-ink">{displayName}</p>
                {displayEmail ? (
                  <p className="text-xs text-slate-500">{displayEmail}</p>
                ) : null}
              </div>
              <span
                className={`ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition ${
                  menuOpen ? "rotate-180 border-tide/40 text-tide" : ""
                }`}
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>
            {menuOpen ? (
              <div
                ref={menuRef}
                className="absolute right-0 mt-3 w-72 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/95 shadow-card"
                role="menu"
              >
                <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden">
                  <div className="p-2">
                    {isOwner ? (
                      <>
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
