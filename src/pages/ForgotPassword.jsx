import { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { useToast } from "../components/ToastProvider.jsx";

export default function ForgotPassword() {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim()) {
      showToast("Please enter a valid email.", {
        type: "error",
        title: "Reset unavailable"
      });
      return;
    }
    showToast("Password reset is not available yet. Please contact the owner.", {
      type: "info",
      title: "Reset unavailable"
    });
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
        <button
          type="submit"
          className="gradient-button w-full rounded-xl px-4 py-3 text-sm font-semibold shadow-soft"
        >
          Send reset link
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

