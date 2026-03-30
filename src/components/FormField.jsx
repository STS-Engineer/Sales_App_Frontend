export default function FormField({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  options,
  readOnly = false,
  disabled = false
}) {
  const isLocked = readOnly || disabled;
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
