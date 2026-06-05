import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import { resetPassword, validatePasswordResetToken } from "../api";

const EyeIcon = ({ open }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
    <circle cx="12" cy="12" r="3" />
    {!open ? <path d="M4 4l16 16" /> : null}
  </svg>
);

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const token = String(searchParams.get("token") || "").trim();
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenError, setTokenError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenError("This password reset link is missing or invalid.");
      setValidating(false);
      return;
    }

    let active = true;
    setValidating(true);
    setTokenError("");

    validatePasswordResetToken(token)
      .then(() => {
        if (!active) return;
        setTokenError("");
      })
      .catch((error) => {
        if (!active) return;
        setTokenError(
          error?.message || "This password reset link is invalid or has expired."
        );
      })
      .finally(() => {
        if (!active) return;
        setValidating(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!token || tokenError) {
      showToast("This password reset link is invalid or has expired.", {
        type: "error",
        title: "Reset failed"
      });
      return;
    }
    if (form.password.length < 8) {
      showToast("Your new password must be at least 8 characters long.", {
        type: "error",
        title: "Reset failed"
      });
      return;
    }
    if (form.password !== form.confirmPassword) {
      showToast("Passwords do not match. Please confirm again.", {
        type: "error",
        title: "Reset failed"
      });
      return;
    }

    setLoading(true);
    try {
      const response = await resetPassword({
        token,
        password: form.password
      });
      navigate("/", {
        replace: true,
        state: {
          flashToast: {
            message:
              response?.message ||
              "Your password has been reset. You can now sign in with your new password.",
            title: "Password updated",
            type: "success"
          }
        }
      });
    } catch (error) {
      showToast(
        error?.message || "Unable to reset the password. Please request a new link.",
        {
          type: "error",
          title: "Reset failed"
        }
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Reset password">
      <form className="space-y-4" onSubmit={handleSubmit}>
        {validating ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Checking your reset link...
          </div>
        ) : tokenError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {tokenError}
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Choose a new password for your account.
          </div>
        )}

        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          <span>New password</span>
          <div className="relative">
            <input
              className="input-field w-full pr-12"
              type={showPassword ? "text" : "password"}
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Minimum 8 characters"
              required
              disabled={validating || Boolean(tokenError) || loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:text-tide focus:outline-none"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              disabled={validating || Boolean(tokenError)}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          <span>Confirm password</span>
          <div className="relative">
            <input
              className="input-field w-full pr-12"
              type={showConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm your new password"
              required
              disabled={validating || Boolean(tokenError) || loading}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:text-tide focus:outline-none"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              title={showConfirmPassword ? "Hide password" : "Show password"}
              disabled={validating || Boolean(tokenError)}
            >
              <EyeIcon open={showConfirmPassword} />
            </button>
          </div>
        </label>

        <button
          type="submit"
          className="gradient-button w-full rounded-xl px-4 py-3 text-sm font-semibold shadow-soft"
          disabled={validating || Boolean(tokenError) || loading}
        >
          {loading ? "Updating password..." : "Update password"}
        </button>

        <div className="text-center text-xs text-slate-500">
          <Link className="font-semibold text-tide" to="/">
            Back to sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
