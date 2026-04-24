import {
  clearSession,
  getRefreshToken,
  getToken,
  setRefreshToken,
  setToken
} from "./utils/session.js";

const API_BASE = import.meta.env.VITE_API_URL || "https://sales-app-backend.azurewebsites.net";
const REQUEST_TIMEOUT_MS = 300000;
let refreshPromise = null;

function createHttpError(message, status) {
  const err = new Error(message || "Request failed");
  err.status = status;
  return err;
}

async function createResponseError(response) {
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
  return createHttpError(message, response.status);
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (
    window.location.pathname !== "/" ||
    window.location.search ||
    window.location.hash
  ) {
    window.location.assign("/");
  }
}

function handleRefreshFailure(error) {
  clearSession();
  redirectToLogin();
  throw error;
}

async function handleJson(response) {
  if (!response.ok) {
    throw await createResponseError(response);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function buildHeaders({ headers, auth, isForm, accessToken }) {
  const finalHeaders = { ...(headers || {}) };
  if (!isForm) {
    finalHeaders["Content-Type"] = "application/json";
  }
  if (auth && accessToken) {
    finalHeaders.Authorization = `Bearer ${accessToken}`;
  }
  return finalHeaders;
}

function serializeBody(body, isForm) {
  if (isForm) {
    return body;
  }
  return body ? JSON.stringify(body) : undefined;
}

function isAuthEndpoint(pathOrUrl) {
  const value = String(pathOrUrl || "");
  return (
    value.includes("/api/auth/login") ||
    value.includes("/api/auth/refresh")
  );
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createHttpError("Request timed out. Please try again.", 408);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    handleRefreshFailure(
      createHttpError("Session expired. Please sign in again.", 401)
    );
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetchWithTimeout(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      const data = await handleJson(response);
      if (!data?.access_token) {
        throw createHttpError("Session refresh failed.", 401);
      }
      setToken(data.access_token);
      return data.access_token;
    })()
      .catch((error) => {
        handleRefreshFailure(error);
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function performRequest(
  pathOrUrl,
  {
    method = "GET",
    body,
    headers,
    auth = true,
    isForm = false,
    retryCount = 0,
    prependApiBase = true
  } = {}
) {
  const accessToken = auth ? getToken() : "";
  const requestUrl = prependApiBase ? `${API_BASE}${pathOrUrl}` : pathOrUrl;
  const response = await fetchWithTimeout(requestUrl, {
    method,
    headers: buildHeaders({ headers, auth, isForm, accessToken }),
    body: serializeBody(body, isForm)
  });

  if (response.status === 401 && auth && retryCount === 0 && !isAuthEndpoint(pathOrUrl)) {
    await refreshAccessToken();
    return performRequest(pathOrUrl, {
      method,
      body,
      headers,
      auth,
      isForm,
      retryCount: 1,
      prependApiBase
    });
  }

  if (response.status === 401 && auth && retryCount > 0 && !isAuthEndpoint(pathOrUrl)) {
    clearSession();
    redirectToLogin();
  }

  return response;
}

async function request(
  path,
  { method = "GET", body, headers, auth = true, isForm = false } = {}
) {
  const response = await performRequest(path, {
    method,
    body,
    headers,
    auth,
    isForm
  });
  return handleJson(response);
}

function extractFilenameFromDisposition(contentDisposition) {
  if (!contentDisposition) return "";
  const utfMatch = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1]).trim();
  }
  const plainMatch = contentDisposition.match(/filename\s*=\s*"([^"]+)"/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim();
  }
  const unquotedMatch = contentDisposition.match(/filename\s*=\s*([^;]+)/i);
  return unquotedMatch?.[1]?.trim() || "";
}

async function requestBinary(path, { method = "GET", headers, auth = true } = {}) {
  const response = await performRequest(path, {
    method,
    headers,
    auth
  });

  if (!response.ok) {
    throw await createResponseError(response);
  }

  return {
    blob: await response.blob(),
    filename: extractFilenameFromDisposition(
      response.headers.get("Content-Disposition") || ""
    )
  };
}

export async function authorizedFetch(
  pathOrUrl,
  { method = "GET", body, headers, isForm = false, prependApiBase = false } = {}
) {
  return performRequest(pathOrUrl, {
    method,
    body,
    headers,
    auth: true,
    isForm,
    prependApiBase
  });
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
  setRefreshToken(data?.refresh_token || "");
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

export async function getRfqAuditLogs(rfqId) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/audit-logs`);
}

export async function getRfqDiscussion(rfqId, phase) {
  return request(
    `/api/rfq/${encodeURIComponent(rfqId)}/discussion?phase=${encodeURIComponent(phase)}`
  );
}

export async function createRfq(payload = {}) {
  return request("/api/rfq", { method: "POST", body: payload });
}

export async function updateRfqData(rfqId, rfqData) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/data`, {
    method: "PUT",
    body: { rfq_data: rfqData }
  });
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

export async function requestRevision(rfqId, payload) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/request-revision`, {
    method: "POST",
    body: payload
  });
}

export async function submitRevision(rfqId) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/submit-revision`, {
    method: "POST"
  });
}

export async function postRfqDiscussion(rfqId, payload) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/discussion`, {
    method: "POST",
    body: payload
  });
}

export async function getCostingMessages(rfqId) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/costing-messages`);
}

export async function postCostingMessage(rfqId, payload) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/costing-messages`, {
    method: "POST",
    body: payload
  });
}

export async function submitCostingReview(rfqId, payload) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/costing_review`, {
    method: "POST",
    body: payload
  });
}

export async function submitCostingValidation(rfqId, payload) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/costing_validation`, {
    method: "POST",
    body: payload
  });
}

export async function advanceRfqStatus(rfqId, payload) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/advance`, {
    method: "POST",
    body: payload
  });
}

export async function downloadCostingTemplate(rfqId) {
  return requestBinary(`/api/rfq/${encodeURIComponent(rfqId)}/costing-template`);
}

export async function sendChat(rfqId, message, chatMode = "rfq") {
  return request("/api/chat", {
    method: "POST",
    body: { rfq_id: rfqId, message, chat_mode: chatMode }
  });
}

export async function editRfqChatMessage(rfqId, payload) {
  return request("/api/chat/edit", {
    method: "POST",
    body: {
      rfq_id: rfqId,
      visible_message_index: payload.visibleMessageIndex,
      message: payload.message
    }
  });
}

export async function sendPotentialChat(rfqId, message) {
  return request("/api/chat/potential", {
    method: "POST",
    body: { rfq_id: rfqId, message }
  });
}

export async function proceedToFormalRfq(rfqId) {
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/proceed-to-rfq`, {
    method: "POST"
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

export async function uploadCostingFile(rfqId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(`/api/actions/upload-costing?rfq_id=${encodeURIComponent(rfqId)}`, {
    method: "POST",
    body: formData,
    isForm: true
  });
}

export async function submitCostingFileAction(rfqId, payload) {
  const formData = new FormData();
  formData.append("action", payload.action);
  formData.append("note", payload.note);
  formData.append("feasibility_status", payload.feasibilityStatus);
  if (payload.file) {
    formData.append("file", payload.file);
  }
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/costing-file-action`, {
    method: "POST",
    body: formData,
    isForm: true
  });
}

export async function uploadPricingBomFile(rfqId, payload) {
  const formData = new FormData();
  formData.append("note", payload.note);
  formData.append("file", payload.file);
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/pricing-bom`, {
    method: "POST",
    body: formData,
    isForm: true
  });
}

export async function uploadPricingFinalPriceFile(rfqId, payload) {
  const formData = new FormData();
  formData.append("note", payload.note);
  formData.append("file", payload.file);
  return request(`/api/rfq/${encodeURIComponent(rfqId)}/pricing-final-price`, {
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

export async function updateUserRole(userId, payload) {
  return request(`/api/owner/users/${encodeURIComponent(userId)}/role`, {
    method: "PUT",
    body: payload
  });
}

export async function listAllUsers() {
  return request("/api/owner/users");
}

export async function deleteUser(userId) {
  return request(`/api/owner/users/${encodeURIComponent(userId)}`, {
    method: "DELETE"
  });
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


