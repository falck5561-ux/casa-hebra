const JSON_HEADERS = { "Content-Type": "application/json" };

export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new ApiError(
      payload?.message || "No pudimos completar la solicitud.",
      response.status,
      payload?.details,
    );
  }

  return payload;
}

export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : { ...JSON_HEADERS, ...options.headers },
  });

  return parseResponse(response);
}

export const getStore = () => api("/api/store");

export const createInquiry = (inquiry) =>
  api("/api/inquiries", {
    method: "POST",
    body: JSON.stringify(inquiry),
  });

export const getAuthStatus = () => api("/api/auth/status");

export const setupAdmin = (values) =>
  api("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify(values),
  });

export const loginAdmin = (values) =>
  api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(values),
  });

export const logoutAdmin = () => api("/api/auth/logout", { method: "POST" });

export const getAdminBootstrap = () => api("/api/admin/bootstrap");

export const uploadImages = (files) => {
  const form = new FormData();
  Array.from(files).forEach((file) => form.append("images", file));
  return api("/api/admin/uploads", { method: "POST", body: form });
};

export const createProduct = (product) =>
  api("/api/admin/products", {
    method: "POST",
    body: JSON.stringify(product),
  });

export const updateProduct = (id, product) =>
  api(`/api/admin/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(product),
  });

export const deleteProduct = (id) =>
  api(`/api/admin/products/${id}`, { method: "DELETE" });

export const createCategory = (category) =>
  api("/api/admin/categories", {
    method: "POST",
    body: JSON.stringify(category),
  });

export const updateCategory = (id, category) =>
  api(`/api/admin/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(category),
  });

export const deleteCategory = (id) =>
  api(`/api/admin/categories/${id}`, { method: "DELETE" });

export const updateSettings = (settings) =>
  api("/api/admin/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });

export const updateInquiry = (id, updates) =>
  api(`/api/admin/inquiries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });

export const deleteInquiry = (id) =>
  api(`/api/admin/inquiries/${id}`, { method: "DELETE" });
