import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

const ToastContext = createContext(null);
const DEFAULT_DURATION_MS = 4500;
const DEFAULT_TITLES = {
  success: "Success",
  error: "Error",
  info: "Notice"
};

let toastCounter = 0;

const renderToastIcon = (type) => {
  if (type === "success") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }

  if (type === "error") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <path d="M12 7h.01" />
    </svg>
  );
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());
  const recentToastRef = useRef({ signature: "", at: 0 });

  const dismissToast = useCallback((id) => {
    const timeoutId = timersRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message, { type = "info", title, duration = DEFAULT_DURATION_MS } = {}) => {
      const normalizedMessage = String(message || "").trim();
      if (!normalizedMessage) return null;

      const normalizedTitle = title || DEFAULT_TITLES[type] || DEFAULT_TITLES.info;
      const signature = `${type}|${normalizedTitle}|${normalizedMessage}`;
      const now = Date.now();

      if (
        recentToastRef.current.signature === signature &&
        now - recentToastRef.current.at < 1000
      ) {
        return null;
      }

      recentToastRef.current = { signature, at: now };

      const id = `toast-${now}-${toastCounter += 1}`;
      setToasts((prev) => [
        { id, type, title: normalizedTitle, message: normalizedMessage, duration },
        ...prev.slice(0, 3)
      ]);

      if (duration > 0) {
        const timeoutId = window.setTimeout(() => {
          dismissToast(id);
        }, duration);
        timersRef.current.set(id, timeoutId);
      }

      return id;
    },
    [dismissToast]
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      timersRef.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.type}`}
            role={toast.type === "error" ? "alert" : "status"}
          >
            <span className="toast-accent" aria-hidden="true" />
            <div className="toast-icon-wrap" aria-hidden="true">
              <span className="toast-icon">{renderToastIcon(toast.type)}</span>
            </div>
            <div className="toast-body">
              <p className="toast-title">{toast.title}</p>
              <p className="toast-message">{toast.message}</p>
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 6l12 12" />
                <path d="M18 6l-12 12" />
              </svg>
            </button>
            {toast.duration > 0 ? (
              <span
                className="toast-progress"
                style={{ animationDuration: `${toast.duration}ms` }}
                aria-hidden="true"
              />
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return context;
}
