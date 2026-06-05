import { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import { requestPasswordReset } from "../api";

export default function ForgotPassword() {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim()) {
      showToast("Please enter a valid email.", {
        type: "error",
        title: "Reset unavailable"
      });
      return;
    }
    setLoading(true);
    try {
      const response = await requestPasswordReset({ email: email.trim() });
      setSent(true);
      showToast(
        response?.message ||
          "If an account exists for that email, a password reset link has been sent.",
        {
          type: "success",
          title: "Reset email sent"
        }
      );
    } catch (error) {
      showToast(
        error?.message || "Unable to send the password reset email. Please try again.",
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
    <AuthLayout title="Forgot password">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          <span>Email</span>
          <input
            className="input-field"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@avocarbon.com"
            required
          />
        </label>
        {sent ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            If an account exists for that email, a reset link has been sent.
          </div>
        ) : null}
        <button
          type="submit"
          className="gradient-button w-full rounded-xl px-4 py-3 text-sm font-semibold shadow-soft"
          disabled={loading}
        >
          {loading ? "Sending reset link..." : "Send reset link"}
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

