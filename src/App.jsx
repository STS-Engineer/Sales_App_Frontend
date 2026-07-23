import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import KpiDashboard from "./pages/KpiDashboard.jsx";
import Logger from "./pages/Logger.jsx";
import NotificationLogs from "./pages/NotificationLogs.jsx";
import NewRfq from "./pages/NewRfq.jsx";
import RoutingSettings from "./pages/RoutingSettings.jsx";
import UserValidation from "./pages/UserValidation.jsx";
import { ToastProvider } from "./components/ToastProvider.jsx";
import { getToken } from "./utils/session.js";

function LegacyRfqRedirect() {
  const { id } = useParams();

  return (
    <Navigate
      to={`/rfqs/new?id=${encodeURIComponent(id || "")}`}
      replace
    />
  );
}

// Blocks rendering of authenticated pages when there's no session token,
// so signing out and pasting a page URL directly redirects immediately
// instead of flashing the page while its data fetches fail with 401.
function RequireAuth({ children }) {
  if (!getToken()) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/kpis"
            element={
              <RequireAuth>
                <KpiDashboard />
              </RequireAuth>
            }
          />
          <Route path="/rfq/:id" element={<LegacyRfqRedirect />} />
          <Route
            path="/rfqs/new"
            element={
              <RequireAuth>
                <NewRfq />
              </RequireAuth>
            }
          />
          <Route
            path="/users/validation"
            element={
              <RequireAuth>
                <UserValidation />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/routing"
            element={
              <RequireAuth>
                <RoutingSettings />
              </RequireAuth>
            }
          />
          <Route path="/logger" element={<Logger />} />
          <Route path="/notification-logs" element={<NotificationLogs />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
