import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Search } from "lucide-react";

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
  optionListClassName = null,
  // Option values that stay in the filtered list regardless of the search
  // query — e.g. an "Other" escape hatch that must stay reachable even when
  // the typed search doesn't match its label.
  alwaysVisibleValues = null,
  // When set, renders a "+" button next to the trigger that calls this
  // directly instead of opening the dropdown — a one-click shortcut to add
  // a new value instead of hunting for an "Other" row inside the list.
  onAddNew = null
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
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxWidth = Math.max(160, viewportWidth - margin * 2);
      const desiredWidth =
        menuWidth === "content"
          ? rect.width
          : menuMinWidth
            ? Math.max(rect.width, menuMinWidth)
            : rect.width;
      const width = Math.min(desiredWidth, maxWidth);
      const left = Math.min(Math.max(rect.left, margin), viewportWidth - width - margin);
      const maxHeight = Math.max(160, viewportHeight - rect.bottom - margin - 4);
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left,
        width: menuWidth === "content" ? "max-content" : width,
        minWidth: menuWidth === "content" ? Math.min(rect.width, maxWidth) : undefined,
        maxWidth,
        maxHeight,
        zIndex: 99999
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
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
    const matched = source
      .filter((option) => getOptionLabel(option).toLowerCase().includes(normalizedQuery))
      .slice(0, maxResults);
    if (!alwaysVisibleValues || alwaysVisibleValues.length === 0) return matched;
    const pinned = source.filter(
      (option) =>
        alwaysVisibleValues.includes(getOptionValue(option)) &&
        !matched.some((m) => getOptionValue(m) === getOptionValue(option))
    );
    return [...matched, ...pinned];
  }, [source, query, maxResults, alwaysVisibleValues]);

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
      className="flex max-w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
      style={portal ? menuStyle || { visibility: "hidden" } : undefined}
    >
      {searchable ? (
        <div className="flex-shrink-0 border-b border-slate-100 p-1.5 sm:p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 sm:left-3 sm:h-4 sm:w-4" />
            <input
              ref={searchInputRef}
              type="text"
              className="input-field py-1 pl-8 text-xs normal-case tracking-normal sm:py-1.5 sm:pl-9 sm:text-sm"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
      ) : null}
      <ul className={`max-h-48 min-h-0 flex-1 overflow-y-auto py-1 sm:max-h-56 ${optionListClassName || "text-xs sm:text-sm font-medium normal-case tracking-normal text-ink"}`}>
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => {
            const optionValue = getOptionValue(option);
            const optionLabel = getOptionLabel(option);
            return (
              <li key={optionValue}>
                <button
                  type="button"
                  className={`block w-full truncate px-2.5 py-1.5 text-left hover:bg-tide/10 sm:px-3 sm:py-2 ${optionValue === normalizedValue ? "bg-tide/10" : ""}`}
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
          <li className="px-2.5 py-1.5 text-xs text-slate-400 sm:px-3 sm:py-2 sm:text-sm">No matches</li>
        )}
      </ul>
    </div>
  );

  return (
    <label
      className="flex flex-col gap-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500 sm:text-xs"
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
        <div className="input-field cursor-not-allowed bg-slate-100/80 text-xs text-slate-400 sm:text-sm">
          {displayValue || "—"}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <button
              ref={buttonRef}
              id={id}
              type="button"
              className={`${buttonClassName || "input-field flex w-full items-center justify-between gap-2 text-left normal-case tracking-normal text-xs sm:text-sm"} ${error ? "border-red-400 focus:ring-red-300" : ""}`}
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
          {onAddNew ? (
            <button
              type="button"
              onClick={onAddNew}
              className="flex h-[2.6rem] w-[2.6rem] flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-tide/40 hover:text-tide hover:shadow-md sm:h-11 sm:w-11"
              aria-label="Add new"
              title="Add new"
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      )}
      {error ? (
        <span className="text-xs font-normal normal-case tracking-normal text-red-500">{error}</span>
      ) : null}
    </label>
  );
}
