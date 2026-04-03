import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import { getMe, login } from "../api";
import { setUserProfile, setCurrentUserRole } from "../utils/session.js";

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

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const registrationToastRef = useRef("");

  useEffect(() => {
    const registrationMessage = location.state?.registrationMessage;
    if (!registrationMessage) return;
    if (registrationToastRef.current === registrationMessage) return;
    registrationToastRef.current = registrationMessage;
    showToast(registrationMessage, {
      type: "success",
      title: "Account created"
    });
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate, showToast]);

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await login(form);
      const profile = await getMe();
      setUserProfile({
        email: profile.email,
        role: profile.role,
        name: profile.email?.split("@")[0]
      });
      setCurrentUserRole(profile.role);
      navigate("/dashboard");
    } catch (err) {
      let message = "Login failed. Please try again.";
      let title = "Sign in failed";
      let type = "error";
      if (err?.status === 403) {
        message = "Your account is pending owner approval.";
        title = "Approval pending";
        type = "info";
      } else if (err?.status === 401) {
        message = "Login failed. Please check your credentials and try again.";
      } else if (err?.status === 408) {
        message = "Login timed out. Please try again.";
      }
      showToast(message, { type, title });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Sign in">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          <span>Email</span>
          <input
            className="input-field"
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="name@avocarbon.com"
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          <span>Password</span>
          <div className="relative">
            <input
              className="input-field w-full pr-12"
              type={showPassword ? "text" : "password"}
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="********"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:text-tide focus:outline-none"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </label>
        <button
          type="submit"
          className="gradient-button w-full rounded-xl px-4 py-3 text-sm font-semibold shadow-soft"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <Link className="font-semibold text-tide" to="/register">
            Create account
          </Link>
          <Link className="font-semibold text-tide" to="/forgot">
            Forgot password
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
