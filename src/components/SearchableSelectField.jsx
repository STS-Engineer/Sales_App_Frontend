import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";

const getOptionValue = (option) => (typeof option === "string" ? option : option.value);
const getOptionLabel = (option) => (typeof option === "string" ? option : option.label);

export default function SearchableSelectField({
  label,
  name,
  value,
  onChange,
  options = [],
  placeholder = "— Select —",
  searchPlaceholder = "Search...",
  searchable = false,
  // When true, the open menu is rendered in a portal (document.body) instead
  // of inline — needed when the field sits inside a container with
  // overflow-x-auto/hidden (e.g. a scrollable table), which would otherwise
  // clip the dropdown to the container's bounds.
  portal = false,
  readOnly = false,
  disabled = false,
  required = false,
  optional = false,
  error = null,
  maxResults = 50,
  // Called right before the menu opens; return false to cancel opening
  // (e.g. to redirect into an "Other: type your own value" input instead).
  onBeforeOpen = null
}) {
  const isLocked = readOnly || disabled;
  const normalizedValue = value ?? "";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState(null);
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    if (!searchable) return;
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, searchable]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const insideTrigger = containerRef.current && containerRef.current.contains(event.target);
      const insideMenu = menuRef.current && menuRef.current.contains(event.target);
      if (!insideTrigger && !insideMenu) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open || !portal) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 60
      });
    }
  }, [open, portal]);

  useEffect(() => {
    if (!open) return;
    // Close on scroll (page or an ancestor container, e.g. a scrollable table)
    // instead of trying to follow it — a fixed-position portal menu can't
    // track page scroll on its own, and closing matches how native/other
    // dropdowns behave. Scrolling inside the menu's own option list doesn't
    // count, so picking an option after scrolling the list still works.
    const handleScroll = (event) => {
      if (menuRef.current && menuRef.current.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  const source = Array.isArray(options) ? options : [];
  const selectedOption = source.find((option) => getOptionValue(option) === normalizedValue);
  const displayValue = selectedOption ? getOptionLabel(selectedOption) : normalizedValue;

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return source;
    return source
      .filter((option) => getOptionLabel(option).toLowerCase().includes(normalizedQuery))
      .slice(0, maxResults);
  }, [source, query, maxResults]);

  const emitChange = (nextValue) => {
    onChange({ target: { name, value: nextValue } });
  };

  const handleSelectOption = (option) => {
    emitChange(getOptionValue(option));
    setOpen(false);
  };

  const menuContent = (
    <div
      ref={menuRef}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
      style={portal ? menuStyle || { visibility: "hidden" } : undefined}
    >
      {searchable ? (
        <div className="border-b border-slate-100 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              className="input-field pl-9 text-sm normal-case tracking-normal"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
      ) : null}
      <ul className="max-h-56 overflow-y-auto py-1 text-sm font-medium normal-case tracking-normal text-ink">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => {
            const optionValue = getOptionValue(option);
            const optionLabel = getOptionLabel(option);
            return (
              <li key={optionValue}>
                <button
                  type="button"
                  className={`block w-full px-3 py-2 text-left hover:bg-slate-50 ${optionValue === normalizedValue ? "bg-slate-50" : ""}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelectOption(option);
                  }}
                >
                  {optionLabel}
                </button>
              </li>
            );
          })
        ) : (
          <li className="px-3 py-2 text-slate-400">No matches</li>
        )}
      </ul>
    </div>
  );

  return (
    <label
      className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500"
      ref={containerRef}
    >
      {label ? (
        <span className="flex flex-wrap items-center gap-1">
          <span>{label}</span>
          {required ? (
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          ) : null}
          {optional ? (
            <span className="normal-case tracking-normal text-slate-400">
              (Optional)
            </span>
          ) : null}
        </span>
      ) : null}
      {isLocked ? (
        <div className="input-field cursor-not-allowed bg-slate-100/80 text-slate-400">
          {displayValue || "—"}
        </div>
      ) : (
        <div className="relative">
          <button
            ref={buttonRef}
            type="button"
            className={`input-field flex w-full items-center justify-between gap-2 text-left normal-case tracking-normal ${error ? "border-red-400 focus:ring-red-300" : ""}`}
            onClick={() => {
              if (!open && onBeforeOpen && onBeforeOpen() === false) return;
              setOpen((prev) => !prev);
            }}
          >
            <span className="truncate text-slate-800">
              {displayValue || placeholder}
            </span>
            <ChevronDown
              className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
          {open && !portal ? (
            <div className="absolute z-20 mt-1 w-full">{menuContent}</div>
          ) : null}
          {open && portal ? createPortal(menuContent, document.body) : null}
        </div>
      )}
      {error ? (
        <span className="text-xs font-normal normal-case tracking-normal text-red-500">{error}</span>
      ) : null}
    </label>
  );
}
