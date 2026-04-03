import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import NewRfq from "./pages/NewRfq.jsx";
import UserValidation from "./pages/UserValidation.jsx";
import { ToastProvider } from "./components/ToastProvider.jsx";
 
function LegacyRfqRedirect() {
  const { id } = useParams();
 
  return (
    <Navigate
      to={`/rfqs/new?id=${encodeURIComponent(id || "")}`}
      replace
    />
  );
}
 
export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/rfq/:id" element={<LegacyRfqRedirect />} />
          <Route path="/rfqs/new" element={<NewRfq />} />
          <Route path="/users/validation" element={<UserValidation />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
