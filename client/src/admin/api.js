const API_ROOT = "/api";

export class AdminApiError extends Error {
  constructor(message, status, details, code) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

async function readResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : {};
}

export async function adminRequest(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_ROOT}${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      Accept: "application/json",
      ...(isFormData ? {} : options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const payload = await readResponse(response);

  if (!response.ok) {
    throw new AdminApiError(
      payload.error || payload.message || "No pudimos completar la solicitud.",
      response.status,
      payload.details,
      payload.code,
    );
  }

  return payload;
}

export const adminApi = {
  authStatus: () => adminRequest("/auth/status"),
  setup: (credentials) =>
    adminRequest("/auth/setup", {
      method: "POST",
      body: JSON.stringify(credentials),
    }),
  login: (credentials) =>
    adminRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    }),
  logout: () => adminRequest("/auth/logout", { method: "POST" }),
  bootstrap: () => adminRequest("/admin/bootstrap"),
  uploadImages: (files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("images", file));
    return adminRequest("/admin/uploads", { method: "POST", body: formData });
  },
  createProduct: (product) =>
    adminRequest("/admin/products", {
      method: "POST",
      body: JSON.stringify(product),
    }),
  updateProduct: (id, product) =>
    adminRequest(`/admin/products/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(product),
    }),
  deleteProduct: (id) =>
    adminRequest(`/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createCategory: (category) =>
    adminRequest("/admin/categories", {
      method: "POST",
      body: JSON.stringify(category),
    }),
  updateCategory: (id, category) =>
    adminRequest(`/admin/categories/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(category),
    }),
  deleteCategory: (id) =>
    adminRequest(`/admin/categories/${encodeURIComponent(id)}`, { method: "DELETE" }),
  updateSettings: (settings) =>
    adminRequest("/admin/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  updateInquiry: (id, status) =>
    adminRequest(`/admin/inquiries/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  deleteInquiry: (id) =>
    adminRequest(`/admin/inquiries/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export function getApiErrorMessage(error) {
  if (error?.status === 401) return "Tu sesión terminó. Vuelve a iniciar sesión.";
  if (error?.status === 413) return "Los archivos son demasiado grandes.";
  if (error?.status === 429) return "Demasiados intentos. Espera un momento y vuelve a intentar.";
  return error?.message || "Ocurrió un problema inesperado.";
}
