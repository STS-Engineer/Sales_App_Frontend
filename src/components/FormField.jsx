import { useLayoutEffect, useRef } from "react";

export default function FormField({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  options,
  autoExpand = false,
  readOnly = false,
  disabled = false,
  required = false,
  optional = false,
  error = null
}) {
  const isLocked = readOnly || disabled;
  const textareaRef = useRef(null);
  const canAutoExpand = autoExpand && !options && type === "text";
  const normalizedValue = value ?? "";

  useLayoutEffect(() => {
    if (!canAutoExpand || !textareaRef.current) return;
    const element = textareaRef.current;
    const hasValue = String(normalizedValue).trim().length > 0;
    const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches;
    const minHeight = isDesktop ? 50 : 40;
    element.style.height = "0px";
    element.style.height = hasValue ? `${Math.max(element.scrollHeight, minHeight)}px` : "";
  }, [canAutoExpand, normalizedValue]);

  return (
    <label className="flex flex-col gap-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500 sm:text-xs">
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
      {options ? (
        <select
          className={`input-field appearance-none text-xs sm:text-sm ${isLocked ? "cursor-not-allowed bg-slate-100/80 text-slate-400" : ""}`}
          name={name}
          value={normalizedValue}
          onChange={onChange}
          disabled={disabled || readOnly}
          aria-readonly={readOnly}
        >
          {options.map((option) => {
            const optionValue = typeof option === "string" ? option : option.value;
            const optionLabel = typeof option === "string" ? option : option.label;
            return (
              <option key={optionValue} value={optionValue}>
                {optionLabel}
              </option>
            );
          })}
        </select>
      ) : canAutoExpand ? (
        <textarea
          ref={textareaRef}
          rows={1}
          className={`textarea-field min-h-[40px] resize-none overflow-hidden text-xs sm:min-h-[50px] sm:text-sm ${isLocked ? "cursor-not-allowed bg-slate-100/80 text-slate-400" : ""}`}
          name={name}
          value={normalizedValue}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
          aria-readonly={readOnly}
        />
      ) : (
        <input
          className={`input-field text-xs sm:text-sm ${isLocked ? "cursor-not-allowed bg-slate-100/80 text-slate-400" : ""} ${error ? "border-red-400 focus:ring-red-300" : ""}`}
          name={name}
          type={type}
          value={normalizedValue}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
          aria-readonly={readOnly}
        />
      )}
      {error ? (
        <span className="text-xs font-normal normal-case tracking-normal text-red-500">{error}</span>
      ) : null}
    </label>
  );
}
