const TIMESTAMP_FORMAT_OPTIONS = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Tunis"
};

const normalizeNumericTimestamp = (value) => {
  if (!Number.isFinite(value)) return null;
  const normalizedValue = Math.abs(value) < 1e12 ? value * 1000 : value;
  const parsed = new Date(normalizedValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeTimestampInput = (dateInput) => {
  if (dateInput instanceof Date) {
    return Number.isNaN(dateInput.getTime()) ? null : dateInput;
  }

  if (typeof dateInput === "number") {
    return normalizeNumericTimestamp(dateInput);
  }

  if (dateInput === null || dateInput === undefined) {
    return null;
  }

  const text = String(dateInput).trim();
  if (!text) {
    return null;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    return normalizeNumericTimestamp(Number(text));
  }

  // If the string has no timezone info the backend stored it in UTC.
  // Append Z so the Date constructor treats it as UTC, not local time.
  const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(text);
  const normalized = hasTimezone ? text : `${text}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatStandardTimestamp = (dateInput) => {
  const parsed = normalizeTimestampInput(dateInput);
  if (!parsed) return "Not available";
  return parsed.toLocaleString("en-GB", TIMESTAMP_FORMAT_OPTIONS);
};
