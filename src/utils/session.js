const TOKEN_KEY = "rfq_token";
const REFRESH_TOKEN_KEY = "rfq_refresh_token";
const EMAIL_KEY = "rfq_user_email";
const NAME_KEY = "rfq_user_name";
const ROLE_KEY = "rfq_user_role";
const ROLES_KEY = "rfq_user_roles";

const canUseStorage = () => typeof window !== "undefined";

export const getToken = () => {
  if (!canUseStorage()) return "";
  return window.localStorage.getItem(TOKEN_KEY) || "";
};

export const setToken = (token) => {
  if (!canUseStorage()) return;
  if (!token) {
    window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = () => setToken("");

export const getRefreshToken = () => {
  if (!canUseStorage()) return "";
  return window.localStorage.getItem(REFRESH_TOKEN_KEY) || "";
};

export const setRefreshToken = (token) => {
  if (!canUseStorage()) return;
  if (!token) {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
};

export const clearRefreshToken = () => setRefreshToken("");

export const setUserProfile = ({ email, role, name, roles } = {}) => {
  if (!canUseStorage()) return;
  if (email) {
    window.localStorage.setItem(EMAIL_KEY, email);
    const fallbackName = email.split("@")[0] || email;
    window.localStorage.setItem(NAME_KEY, name || fallbackName);
  }
  if (role) {
    window.localStorage.setItem(ROLE_KEY, role);
  }
  const resolvedRoles =
    Array.isArray(roles) && roles.length > 0 ? roles : role ? [role] : [];
  if (resolvedRoles.length > 0) {
    window.localStorage.setItem(ROLES_KEY, JSON.stringify(resolvedRoles));
  }
};

export const getUserProfile = () => {
  if (!canUseStorage()) {
    return { email: "", name: "", role: "", roles: [] };
  }
  const role = window.localStorage.getItem(ROLE_KEY) || "";
  let roles = [];
  try {
    const stored = window.localStorage.getItem(ROLES_KEY);
    roles = stored ? JSON.parse(stored) : role ? [role] : [];
  } catch {
    roles = role ? [role] : [];
  }
  return {
    email: window.localStorage.getItem(EMAIL_KEY) || "",
    name: window.localStorage.getItem(NAME_KEY) || "",
    role,
    roles,
  };
};

export const clearUserProfile = () => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(EMAIL_KEY);
  window.localStorage.removeItem(NAME_KEY);
  window.localStorage.removeItem(ROLE_KEY);
  window.localStorage.removeItem(ROLES_KEY);
};

export const clearSession = () => {
  clearToken();
  clearRefreshToken();
  clearUserProfile();
};

export const getCurrentUserRole = () => getUserProfile().role;

export const setCurrentUserRole = (role) => {
  if (!canUseStorage()) return;
  if (!role) {
    window.localStorage.removeItem(ROLE_KEY);
    return;
  }
  window.localStorage.setItem(ROLE_KEY, role);
};

export const getUserRoles = () => getUserProfile().roles;

export const hasRole = (role) => {
  const roles = getUserRoles();
  return roles.some(
    (r) =>
      String(r || "").trim().toUpperCase() ===
      String(role || "").trim().toUpperCase()
  );
};

export const hasAnyRole = (rolesToCheck) =>
  (Array.isArray(rolesToCheck) ? rolesToCheck : []).some((r) => hasRole(r));
