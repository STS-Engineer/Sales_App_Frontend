import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export default function SearchableSelectField({
  label,
  name,
  value,
  onChange,
  options = [],
  placeholder = "— Select —",
  searchPlaceholder = "Search...",
  readOnly = false,
  disabled = false,
  required = false,
  optional = false,
  error = null,
  maxResults = 50
}) {
  const isLocked = readOnly || disabled;
  const normalizedValue = value ?? "";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const source = Array.isArray(options) ? options : [];
    if (!normalizedQuery) return source;
    return source
      .filter((option) => option.toLowerCase().includes(normalizedQuery))
      .slice(0, maxResults);
  }, [options, query, maxResults]);

  const emitChange = (nextValue) => {
    onChange({ target: { name, value: nextValue } });
  };

  const handleSelectOption = (option) => {
    emitChange(option);
    setOpen(false);
  };

  return (
    <label
      className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500"
      ref={containerRef}
    >
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
      {isLocked ? (
        <div className="input-field cursor-not-allowed bg-slate-100/80 text-slate-400">
          {normalizedValue || "—"}
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            className={`input-field flex w-full items-center justify-between gap-2 text-left normal-case tracking-normal ${error ? "border-red-400 focus:ring-red-300" : ""}`}
            onClick={() => setOpen((prev) => !prev)}
          >
            <span className="truncate text-slate-800">
              {normalizedValue || placeholder}
            </span>
            <ChevronDown
              className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
          {open ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
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
              <ul className="max-h-56 overflow-y-auto py-1 text-sm normal-case tracking-normal text-slate-700">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => (
                    <li key={option}>
                      <button
                        type="button"
                        className={`block w-full px-3 py-2 text-left hover:bg-slate-50 ${option === normalizedValue ? "bg-slate-50 font-semibold text-slate-900" : ""}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          handleSelectOption(option);
                        }}
                      >
                        {option}
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2 text-slate-400">No matches</li>
                )}
              </ul>
            </div>
          ) : null}
        </div>
      )}
      {error ? (
        <span className="text-xs font-normal normal-case tracking-normal text-red-500">{error}</span>
      ) : null}
    </label>
  );
}
