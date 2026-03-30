const OWNER_EMAIL = "ons.ghariani@avocarbon.com";
const PENDING_KEY = "rfq_users_pending";
const APPROVED_KEY = "rfq_users_approved";
const ROLE_KEY = "rfq_user_role";

const safeParse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const readList = (key) => {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return [];
  }
  const parsed = safeParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
};

const writeList = (key, list) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(list));
};

export const getOwnerEmail = () => OWNER_EMAIL;

export const isOwnerEmail = (email) =>
  (email || "").trim().toLowerCase() === OWNER_EMAIL;

export const getPendingUsers = () => readList(PENDING_KEY);

export const getApprovedUsers = () => readList(APPROVED_KEY);

export const findApprovedUser = (email) => {
  const target = (email || "").trim().toLowerCase();
  return getApprovedUsers().find(
    (user) => (user.email || "").trim().toLowerCase() === target
  );
};

export const addPendingUser = (user) => {
  if (!user?.email) {
    return { ok: false, reason: "missing" };
  }
  const email = user.email.trim().toLowerCase();
  const approved = getApprovedUsers();
  if (approved.some((entry) => (entry.email || "").trim().toLowerCase() === email)) {
    return { ok: false, reason: "approved" };
  }
  const pending = getPendingUsers();
  if (pending.some((entry) => (entry.email || "").trim().toLowerCase() === email)) {
    return { ok: false, reason: "pending" };
  }
  const nextPending = [...pending, user];
  writeList(PENDING_KEY, nextPending);
  return { ok: true };
};

export const approveUser = (email, role) => {
  const target = (email || "").trim().toLowerCase();
  const pending = getPendingUsers();
  const user = pending.find(
    (entry) => (entry.email || "").trim().toLowerCase() === target
  );
  if (!user) {
    return { ok: false };
  }
  const nextPending = pending.filter(
    (entry) => (entry.email || "").trim().toLowerCase() !== target
  );
  writeList(PENDING_KEY, nextPending);
  const approved = getApprovedUsers();
  const nextApproved = [
    ...approved,
    { ...user, role: role || "User", approvedAt: new Date().toISOString() }
  ];
  writeList(APPROVED_KEY, nextApproved);
  return { ok: true, user: nextApproved[nextApproved.length - 1] };
};

export const getCurrentUserRole = () => {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(ROLE_KEY) || "";
};

export const setCurrentUserRole = (role) => {
  if (typeof window === "undefined") {
    return;
  }
  if (!role) {
    window.localStorage.removeItem(ROLE_KEY);
    return;
  }
  window.localStorage.setItem(ROLE_KEY, role);
};
