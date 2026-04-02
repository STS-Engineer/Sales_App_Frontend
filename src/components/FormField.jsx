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
  disabled = false
}) {
  const isLocked = readOnly || disabled;
  const textareaRef = useRef(null);
  const canAutoExpand = autoExpand && !options && type === "text";

  useLayoutEffect(() => {
    if (!canAutoExpand || !textareaRef.current) return;
    const element = textareaRef.current;
    const hasValue = String(value ?? "").trim().length > 0;
    element.style.height = "0px";
    element.style.height = hasValue ? `${Math.max(element.scrollHeight, 50)}px` : "";
  }, [canAutoExpand, value]);

  return (
    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
      <span>{label}</span>
      {options ? (
        <select
          className={`input-field ${isLocked ? "cursor-not-allowed bg-slate-100/80 text-slate-400" : ""}`}
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
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
          className={`textarea-field min-h-[50px] resize-none overflow-hidden ${isLocked ? "cursor-not-allowed bg-slate-100/80 text-slate-400" : ""}`}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
          aria-readonly={readOnly}
        />
      ) : (
        <input
          className={`input-field ${isLocked ? "cursor-not-allowed bg-slate-100/80 text-slate-400" : ""}`}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
          aria-readonly={readOnly}
        />
      )}
    </label>
  );
}
