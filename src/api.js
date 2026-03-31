import { getToken, setToken } from "./utils/session.js";
 
const API_BASE = import.meta.env.VITE_API_URL;
const REQUEST_TIMEOUT_MS = 15000;
 
async function handleJson(response) {
  if (!response.ok) {
    const text = await response.text();
    let message = text || "Request failed";
    try {
      const json = JSON.parse(text);
      if (json?.detail) {
        message = json.detail;
      }
    } catch (error) {
      // ignore JSON parse errors
    }
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}
 
async function request(
  path,
  { method = "GET", body, headers, auth = true, isForm = false } = {}
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const finalHeaders = { ...(headers || {}) };
  if (!isForm) {
    finalHeaders["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = getToken();
    if (token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }
  }
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: finalHeaders,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    return await handleJson(response);
  } catch (error) {
    if (error?.name === "AbortError") {
      const err = new Error("Request timed out. Please try again.");
      err.status = 408;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
 
export async function login(payload) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: payload,
    auth: false
  });
  if (data?.access_token) {
    setToken(data.access_token);
  }
  return data;
}
 
export async function register(payload) {
  return request("/api/auth/register", {
    method: "POST",
    body: payload,
    auth: false
  });
}
 
export async function getMe() {
  return request("/api/auth/me");
}
 
export async function listRfqs() {
  return request("/api/rfq");
}
 
export async function getRfq(rfqId) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}`);
}
 
export async function createRfq(payload = {}) {
  return request("/api/rfq", { method: "POST", body: payload });
}
 
export async function submitRfq(rfqId) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/submit`, {
    method: "POST"
  });
}
 
export async function validateRfq(rfqId, payload) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/validate`, {
    method: "POST",
    body: payload
  });
}
 
export async function sendChat(rfqId, message, chatMode = "rfq") {
  return request("/api/chat", {
    method: "POST",
    body: { rfq_id: rfqId, message, chat_mode: chatMode }
  });
}
 
export async function uploadRfqFile(rfqId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/upload`, {
    method: "POST",
    body: formData,
    isForm: true
  });
}
 
export async function deleteRfqFile(rfqId, fileId, fileName) {
  if (fileId) {
    return request(
      `/api/rfq/${encodeURIComponent(rfqId)}/files/${encodeURIComponent(fileId)}`,
      { method: "DELETE" }
    );
  }
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/files`, {
    method: "DELETE",
    body: { filename: fileName }
  });
}
 
export async function listPendingUsers() {
  return request("/api/users/pending");
}
 
export async function updateUserRole(userId, role) {
  return request(`/api/users/${encodeURIComponent(userId)}/role`, {
    method: "PUT",
    body: { role }
  });
}
 
export async function listAllUsers() {
  return request("/api/owner/users");
}
 
export async function listProducts(productName = "") {
  const query = productName
    ? `?productName=${encodeURIComponent(productName)}`
    : "";
  return request(`/api/products${query}`, { auth: false });
}
 
export async function getProductLine(productLineId) {
  return request(
    `/api/product-lines?productLineId=${encodeURIComponent(productLineId)}`,
    { auth: false }
  );
}
 
 