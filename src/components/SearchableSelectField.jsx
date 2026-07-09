import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";

const getOptionValue = (option) => (typeof option === "string" ? option : option.value);
const getOptionLabel = (option) => (typeof option === "string" ? option : option.label);

export default function SearchableSelectField({
  label,
  id,
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
  onBeforeOpen = null,
  // Optional overrides so the trigger button can match a different design
  // (e.g. a filter pill) while the dropdown menu/search keeps this component's
  // behavior. Defaults reproduce this component's original look exactly.
  buttonClassName = null,
  chevronClassName = null,
  valueClassName = null,
  // Minimum dropdown width in px — lets the menu be wider than the trigger
  // button (e.g. for a narrow filter pill with long option labels).
  menuMinWidth = null,
  // "content": size the dropdown to its longest option (never narrower than
  // the trigger button). Overrides menuMinWidth when set.
  menuWidth = null,
  // Override the option list's text size/weight/case classes. Defaults
  // reproduce this component's original look exactly.
  optionListClassName = null
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
      setMenuStyle(
        menuWidth === "content"
          ? {
            position: "fixed",
            top: rect.bottom + 4,
            left: rect.left,
            minWidth: rect.width,
            width: "max-content",
            zIndex: 99999
          }
          : {
            position: "fixed",
            top: rect.bottom + 4,
            left: rect.left,
            width: menuMinWidth ? Math.max(rect.width, menuMinWidth) : rect.width,
            zIndex: 99999
          }
      );
    }
  }, [open, portal, menuMinWidth, menuWidth]);

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
              className="input-field py-1.5 pl-9 text-sm normal-case tracking-normal"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
      ) : null}
      <ul className={`max-h-56 overflow-y-auto py-1 ${optionListClassName || "text-sm font-medium normal-case tracking-normal text-ink"}`}>
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => {
            const optionValue = getOptionValue(option);
            const optionLabel = getOptionLabel(option);
            return (
              <li key={optionValue}>
                <button
                  type="button"
                  className={`block w-full whitespace-nowrap px-3 py-2 text-left hover:bg-tide/10 ${optionValue === normalizedValue ? "bg-tide/10" : ""}`}
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
            id={id}
            type="button"
            className={`${buttonClassName || "input-field flex w-full items-center justify-between gap-2 text-left normal-case tracking-normal"} ${error ? "border-red-400 focus:ring-red-300" : ""}`}
            onClick={() => {
              if (!open && onBeforeOpen && onBeforeOpen() === false) return;
              setOpen((prev) => !prev);
            }}
          >
            <span className={valueClassName || "truncate text-slate-800"}>
              {displayValue || placeholder}
            </span>
            <ChevronDown
              className={`${chevronClassName || "h-4 w-4 flex-shrink-0 text-slate-500"} transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
          {open && !portal ? (
            <div
              className="absolute z-20 mt-1 w-full"
              style={
                menuWidth === "content"
                  ? { width: "max-content", minWidth: "100%" }
                  : (menuMinWidth ? { minWidth: menuMinWidth } : undefined)
              }
            >
              {menuContent}
            </div>
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
