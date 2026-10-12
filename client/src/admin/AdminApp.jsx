import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Box,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  ImagePlus,
  Instagram,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Package,
  PackageOpen,
  Palette,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tags,
  Trash2,
  Upload,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createAccessibleAccentPalette, ThemeToggle, useTheme } from "../lib/theme";
import { adminApi, getApiErrorMessage } from "./api";
import "./admin.css";

const DEFAULT_SETTINGS = {
  storeName: "Casa Hebra",
  tagline: "Hecho a mano, punto por punto.",
  heroTitle: "Piezas tejidas para acompañar tus días",
  heroText: "Crochet hecho con calma, detalle y mucho cariño.",
  story: "",
  whatsappNumber: "",
  city: "",
  pickupLabel: "Recogida local · el punto y horario se acuerdan por WhatsApp",
  currency: "MXN",
  instagram: "",
  businessHours: "",
  announcement: "",
  accentColor: "#963D64",
};

const PRODUCT_STATUSES = {
  available: { label: "Disponible", tone: "success" },
  made_to_order: { label: "Sobre pedido", tone: "warning" },
  sold_out: { label: "Agotado", tone: "neutral" },
};

const INQUIRY_STATUSES = {
  whatsapp_opened: { label: "WhatsApp abierto", tone: "new" },
  contacted: { label: "Contactado", tone: "info" },
  confirmed: { label: "Confirmado", tone: "warning" },
  completed: { label: "Completado", tone: "success" },
  archived: { label: "Archivado", tone: "neutral" },
};

const NAV_ITEMS = [
  { id: "overview", label: "Resumen", icon: LayoutDashboard },
  { id: "products", label: "Productos", icon: Package },
  { id: "categories", label: "Categorías", icon: Tags },
  { id: "inquiries", label: "Solicitudes", icon: MessageCircle },
  { id: "content", label: "Contenido", icon: WandSparkles },
  { id: "settings", label: "Configuración", icon: Settings },
];

const VIEW_META = {
  overview: { eyebrow: "Tu taller", title: "Resumen del negocio" },
  products: { eyebrow: "Catálogo", title: "Productos" },
  categories: { eyebrow: "Organización", title: "Categorías" },
  inquiries: { eyebrow: "Atención", title: "Solicitudes" },
  content: { eyebrow: "Tu historia", title: "Contenido de la tienda" },
  settings: { eyebrow: "Preferencias", title: "Configuración del negocio" },
};

const CATEGORY_ICON_OPTIONS = [
  { value: "yarn", symbol: "🧶", label: "Ovillo" },
  { value: "sparkles", symbol: "✨", label: "Destellos" },
  { value: "shopping-bag", symbol: "👜", label: "Bolso" },
  { value: "home", symbol: "🏡", label: "Hogar" },
  { value: "heart", symbol: "🤍", label: "Corazón" },
  { value: "teddy", symbol: "🧸", label: "Muñeco" },
  { value: "flower", symbol: "🌷", label: "Flor" },
  { value: "gift", symbol: "🎁", label: "Regalo" },
];

const ACTIVE_DIALOGS = [];
const BACKGROUND_LOCKS = new Map();
let bodyScrollSnapshot = null;

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function effectiveProductStatus(product) {
  if (product?.status === "available" && Number(product.stockQuantity) <= 0) return "sold_out";
  return product?.status;
}

function whatsappDigits(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  return raw.startsWith("00") ? digits.slice(2) : digits;
}

function isValidWhatsapp(value) {
  const raw = String(value || "").trim();
  const digits = whatsappDigits(raw);
  return /^(?:\+|00)?[0-9().\s-]+$/.test(raw)
    && digits.length >= 8
    && digits.length <= 15
    && !digits.startsWith("0");
}

function focusFirstInvalid(formElement) {
  window.requestAnimationFrame(() => {
    const firstInvalid = formElement?.querySelector(
      "[aria-invalid='true'], .admin-field.has-error input, .admin-field.has-error textarea, .admin-field.has-error select, .admin-privacy-confirm.has-error input",
    );
    if (!firstInvalid) return;
    firstInvalid.focus({ preventScroll: true });
    firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function useUnsavedChangesWarning(dirty) {
  useEffect(() => {
    if (!dirty) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);
}

function normalizeImage(image) {
  if (typeof image === "string") return image;
  return image?.url || image?.src || "";
}

function categoryIconSymbol(value) {
  return CATEGORY_ICON_OPTIONS.find((option) => option.value === value)?.symbol || value || "🧶";
}

function sanitizeSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function getFocusableElements(container) {
  if (!container) return [];
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  return Array.from(container.querySelectorAll(selector)).filter((element) => (
    element.getAttribute("aria-hidden") !== "true"
    && !element.closest("[inert]")
    && element.getClientRects().length > 0
  ));
}

function lockBodyScroll() {
  if (bodyScrollSnapshot) return;
  const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  bodyScrollSnapshot = {
    overflow: document.body.style.overflow,
    paddingRight: document.body.style.paddingRight,
  };
  document.body.style.overflow = "hidden";
  if (scrollbarWidth) document.body.style.paddingRight = `${scrollbarWidth}px`;
}

function unlockBodyScroll() {
  if (!bodyScrollSnapshot) return;
  document.body.style.overflow = bodyScrollSnapshot.overflow;
  document.body.style.paddingRight = bodyScrollSnapshot.paddingRight;
  bodyScrollSnapshot = null;
}

function lockBackgroundElement(element) {
  const current = BACKGROUND_LOCKS.get(element);
  if (current) {
    current.count += 1;
    return;
  }
  BACKGROUND_LOCKS.set(element, {
    count: 1,
    inert: element.hasAttribute("inert"),
    ariaHidden: element.getAttribute("aria-hidden"),
  });
  element.setAttribute("inert", "");
  element.setAttribute("aria-hidden", "true");
}

function unlockBackgroundElement(element) {
  const current = BACKGROUND_LOCKS.get(element);
  if (!current) return;
  current.count -= 1;
  if (current.count > 0) return;

  if (current.inert) element.setAttribute("inert", "");
  else element.removeAttribute("inert");
  if (current.ariaHidden === null) element.removeAttribute("aria-hidden");
  else element.setAttribute("aria-hidden", current.ariaHidden);
  BACKGROUND_LOCKS.delete(element);
}

function useAccessibleDialog({ active = true, onClose, canClose = true, fallbackFocusRef } = {}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const canCloseRef = useRef(canClose);
  const fallbackFocusRefRef = useRef(fallbackFocusRef);

  closeRef.current = onClose;
  canCloseRef.current = canClose;
  fallbackFocusRefRef.current = fallbackFocusRef;

  useEffect(() => {
    if (!active || !dialogRef.current) return undefined;

    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const layer = dialog.closest(".admin-modal-layer, .admin-confirm-layer") || dialog;
    const backgroundElements = Array.from(layer.parentElement?.children || [])
      .filter((element) => (
        element !== layer
        && !element.classList.contains("admin-sidebar-backdrop")
        && !element.classList.contains("admin-toast-stack")
      ));
    backgroundElements.forEach(lockBackgroundElement);

    const entry = { dialog };
    ACTIVE_DIALOGS.push(entry);
    if (ACTIVE_DIALOGS.length === 1) lockBodyScroll();

    const focusFrame = window.requestAnimationFrame(() => {
      const preferred = dialog.querySelector("[data-dialog-initial-focus]");
      const firstFocusable = getFocusableElements(dialog)[0];
      (preferred || firstFocusable || dialog).focus({ preventScroll: true });
    });

    const handleKeyDown = (event) => {
      if (ACTIVE_DIALOGS[ACTIVE_DIALOGS.length - 1] !== entry) return;

      if (event.key === "Escape") {
        event.preventDefault();
        if (canCloseRef.current) closeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (!dialog.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      const index = ACTIVE_DIALOGS.indexOf(entry);
      if (index >= 0) ACTIVE_DIALOGS.splice(index, 1);
      backgroundElements.forEach(unlockBackgroundElement);

      const restoreTarget = previousFocus instanceof HTMLElement
        && previousFocus.isConnected
        && !previousFocus.closest("[inert]")
        ? previousFocus
        : null;

      if (!ACTIVE_DIALOGS.length) {
        unlockBodyScroll();
        const fallbackTarget = fallbackFocusRefRef.current?.current;
        const nextFocus = restoreTarget || (
          fallbackTarget instanceof HTMLElement
          && fallbackTarget.isConnected
          && !fallbackTarget.closest("[inert]")
            ? fallbackTarget
            : null
        );
        if (nextFocus) {
          window.requestAnimationFrame(() => nextFocus.focus({ preventScroll: true }));
        }
      } else {
        const topDialog = ACTIVE_DIALOGS[ACTIVE_DIALOGS.length - 1].dialog;
        window.requestAnimationFrame(() => {
          const target = restoreTarget && topDialog.contains(restoreTarget)
            ? restoreTarget
            : getFocusableElements(topDialog)[0] || topDialog;
          target.focus({ preventScroll: true });
        });
      }
    };
  }, [active]);

  return dialogRef;
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

function getEntity(payload, key) {
  return payload?.[key] || payload;
}

function formatCurrency(value, currency = "MXN") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "$0";

  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency || "MXN",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatDate(value, includeTime = false) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function safeAccent(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#963D64";
}

function replaceEntity(items, entity) {
  const exists = items.some((item) => item.id === entity.id);
  return exists ? items.map((item) => (item.id === entity.id ? entity : item)) : [entity, ...items];
}

function productCopyPayload(product, products) {
  const originalName = String(product?.name || "Pieza").replace(/^(?:Copia de\s+)+/i, "").trim() || "Pieza";
  const existingNames = new Set(products.map((item) => String(item.name || "").trim().toLocaleLowerCase("es")));
  let copyNumber = 1;
  let name = "";

  do {
    const suffix = copyNumber > 1 ? ` (${copyNumber})` : "";
    const prefix = "Copia de ";
    name = `${prefix}${originalName.slice(0, Math.max(1, 100 - prefix.length - suffix.length))}${suffix}`;
    copyNumber += 1;
  } while (existingNames.has(name.toLocaleLowerCase("es")));

  const existingSlugs = new Set(products.map((item) => String(item.slug || "").trim().toLowerCase()));
  const slugBase = sanitizeSlug(name) || "copia-pieza";
  let slug = slugBase;
  let slugNumber = 2;
  while (existingSlugs.has(slug)) {
    const suffix = `-${slugNumber}`;
    slug = `${slugBase.slice(0, 100 - suffix.length)}${suffix}`;
    slugNumber += 1;
  }

  return {
    name,
    slug,
    shortDescription: product.shortDescription || "",
    description: product.description || "",
    price: Number(product.price) || 0,
    compareAtPrice: product.compareAtPrice == null ? null : Number(product.compareAtPrice),
    categoryId: product.categoryId,
    status: product.status || "made_to_order",
    stockQuantity: Math.max(0, Number(product.stockQuantity) || 0),
    leadTime: product.leadTime || "",
    featured: false,
    active: false,
    customizable: Boolean(product.customizable),
    colors: Array.isArray(product.colors) ? [...product.colors] : [],
    sizes: Array.isArray(product.sizes) ? [...product.sizes] : [],
    materials: product.materials || "",
    images: Array.isArray(product.images) ? product.images.map(normalizeImage).filter(Boolean) : [],
  };
}

function YarnMark({ small = false }) {
  return (
    <span className={classNames("admin-yarn-mark", small && "is-small")} aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <path d="M13.2 30.7c-4.6-6.5-1.6-15.6 5.8-18.5 7.9-3.1 17 2.4 17.7 10.8.5 6.5-4.5 12.1-11 12.3-7.2.2-12.8-6.7-10.6-13.6 1.8-5.6 8.6-8.1 13.4-4.7 4.2 3 5.1 9.1 1.8 13.1-3.1 3.8-9.3 4.1-12.9.8-3-2.8-3.2-7.8-.5-10.9 2.2-2.6 6.2-3 8.9-1.1 2.4 1.7 3.1 5.2 1.5 7.7-1.5 2.3-4.8 3-7.1 1.6-2-1.2-2.8-3.8-1.8-5.9" />
        <path d="M27.2 34.8c4.9 1 8.9 3.9 12.1 8" />
      </svg>
    </span>
  );
}

function Spinner({ label = "Cargando" }) {
  return <LoaderCircle className="admin-spinner" aria-label={label} />;
}

function Button({ children, variant = "primary", size = "md", loading, disabled, icon: Icon, className, ...props }) {
  return (
    <button
      className={classNames("admin-button", `is-${variant}`, `is-${size}`, className)}
      disabled={loading || disabled}
      {...props}
    >
      {loading ? <Spinner /> : Icon ? <Icon aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

const IconButton = forwardRef(function IconButton({ label, children, variant = "ghost", className, ...props }, ref) {
  return (
    <button ref={ref} className={classNames("admin-icon-button", `is-${variant}`, className)} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
});

function StatusBadge({ type, map }) {
  const status = map[type] || { label: type || "Sin estado", tone: "neutral" };
  return <span className={classNames("admin-status", `is-${status.tone}`)}>{status.label}</span>;
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="admin-toggle-row">
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      <span className="admin-toggle" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

function Field({ label, hint, error, required, className, children }) {
  const fieldRef = useRef(null);
  const messageId = useId();

  useEffect(() => {
    const control = fieldRef.current?.querySelector("input, textarea, select");
    if (!control) return undefined;

    const describedBy = new Set((control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    describedBy.delete(messageId);
    if (error || hint) describedBy.add(messageId);
    if (describedBy.size) control.setAttribute("aria-describedby", [...describedBy].join(" "));
    else control.removeAttribute("aria-describedby");

    if (required) control.setAttribute("aria-required", "true");
    else control.removeAttribute("aria-required");
    if (error) control.setAttribute("aria-invalid", "true");
    else control.removeAttribute("aria-invalid");

    return () => {
      const currentDescriptions = new Set((control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
      currentDescriptions.delete(messageId);
      if (currentDescriptions.size) control.setAttribute("aria-describedby", [...currentDescriptions].join(" "));
      else control.removeAttribute("aria-describedby");
      control.removeAttribute("aria-required");
      control.removeAttribute("aria-invalid");
    };
  }, [error, hint, messageId, required]);

  return (
    <label ref={fieldRef} className={classNames("admin-field", className, error && "has-error")}>
      <span className="admin-field-label">
        {label}
        {required ? <em>*</em> : null}
      </span>
      {children}
      {error ? <small id={messageId} className="admin-field-error" role="alert">{error}</small> : hint ? <small id={messageId}>{hint}</small> : null}
    </label>
  );
}

function FieldGroup({ label, className, children }) {
  const labelId = useId();
  return (
    <div className={classNames("admin-field", className)} role="group" aria-labelledby={labelId}>
      <span id={labelId} className="admin-field-label">{label}</span>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon = PackageOpen, title, text, action }) {
  return (
    <motion.div className="admin-empty-state" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <span className="admin-empty-icon">
        <Icon aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </motion.div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="admin-error-state" role="alert">
      <span><AlertCircle aria-hidden="true" /></span>
      <div>
        <h3>No pudimos cargar el panel</h3>
        <p>{message}</p>
      </div>
      <Button variant="secondary" icon={RefreshCw} onClick={onRetry}>Reintentar</Button>
    </div>
  );
}

function FullscreenLoading() {
  return (
    <div className="casa-admin admin-fullscreen-loading">
      <YarnMark />
      <Spinner label="Preparando Casa Hebra" />
      <p>Preparando tu taller…</p>
    </div>
  );
}

function ToastStack({ toasts, dismiss, interactionDisabled = false }) {
  return (
    <div className={classNames("admin-toast-stack", interactionDisabled && "is-passive")} aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className={classNames("admin-toast", `is-${toast.type}`)}
            role={toast.type === "error" ? "alert" : "status"}
            aria-atomic="true"
            initial={{ opacity: 0, x: 28, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 18, scale: 0.96 }}
          >
            {toast.type === "error" ? <AlertCircle /> : <CheckCircle2 />}
            <div>
              <strong>{toast.type === "error" ? "Algo salió mal" : "Listo"}</strong>
              <p>{toast.message}</p>
            </div>
            {toast.type === "error" ? (
              <IconButton label="Cerrar aviso" disabled={interactionDisabled} onClick={() => dismiss(toast.id)}><X /></IconButton>
            ) : null}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function AdminApp() {
  const [auth, setAuth] = useState({ loading: true, authenticated: false, needsSetup: false, setupRequiresToken: false, error: "" });

  const checkAuth = useCallback(async () => {
    setAuth((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await adminApi.authStatus();
      setAuth({
        loading: false,
        authenticated: Boolean(response.authenticated),
        needsSetup: Boolean(response.needsSetup),
        setupRequiresToken: Boolean(response.setupRequiresToken),
        error: "",
      });
    } catch (error) {
      setAuth({ loading: false, authenticated: false, needsSetup: false, setupRequiresToken: false, error: getApiErrorMessage(error) });
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  let content;
  if (auth.loading) {
    content = <FullscreenLoading />;
  } else if (!auth.authenticated) {
    content = (
      <AuthScreen
        needsSetup={auth.needsSetup}
        setupRequiresToken={auth.setupRequiresToken}
        initialError={auth.error}
        onAuthenticated={() => setAuth({ loading: false, authenticated: true, needsSetup: false, setupRequiresToken: false, error: "" })}
        onRetry={checkAuth}
      />
    );
  } else {
    content = <AdminWorkspace onSessionExpired={checkAuth} />;
  }

  return <MotionConfig reducedMotion="user">{content}</MotionConfig>;
}

function AuthScreen({ needsSetup, setupRequiresToken, initialError, onAuthenticated, onRetry }) {
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
  const setupTokenRef = useRef(null);
  const [form, setForm] = useState({ email: "", password: "", confirmPassword: "", setupToken: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState("");

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errorField === field) {
      setError("");
      setErrorField("");
    }
  };

  const showFieldError = (field, message, fieldRef) => {
    setError(message);
    setErrorField(field);
    window.requestAnimationFrame(() => fieldRef.current?.focus());
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setErrorField("");

    if (!form.email.trim() || !form.email.includes("@")) {
      showFieldError("email", "Escribe un correo válido.", emailRef);
      return;
    }
    if (needsSetup && setupRequiresToken && !form.setupToken.trim()) {
      showFieldError("setupToken", "Escribe el código privado de instalación.", setupTokenRef);
      return;
    }
    if (form.password.length < 10 || form.password.length > 128 || !/\p{L}/u.test(form.password) || !/\d/.test(form.password)) {
      showFieldError("password", "La contraseña debe tener entre 10 y 128 caracteres, una letra y un número.", passwordRef);
      return;
    }
    if (needsSetup && form.password !== form.confirmPassword) {
      showFieldError("confirmPassword", "Las contraseñas no coinciden.", confirmPasswordRef);
      return;
    }

    setSubmitting(true);
    try {
      const credentials = {
        email: form.email.trim().toLowerCase(),
        password: form.password,
        ...(needsSetup && setupRequiresToken ? { setupToken: form.setupToken.trim() } : {}),
      };
      if (needsSetup) await adminApi.setup(credentials);
      else await adminApi.login(credentials);
      onAuthenticated();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
      setErrorField("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="casa-admin admin-auth-page">
      <section className="admin-auth-story" aria-hidden="true">
        <div className="admin-auth-glow" />
        <div className="admin-auth-brand"><YarnMark /><span>Casa Hebra</span></div>
        <div className="admin-auth-copy">
          <span className="admin-kicker"><Sparkles /> Tu taller digital</span>
          <h1>Cada pieza tiene una historia. Aquí empieza la tuya.</h1>
          <p>Publica tus tejidos, organiza solicitudes y mantén tu catálogo siempre bonito y actualizado.</p>
        </div>
        <div className="admin-stitch-card is-one"><span /><span /><span /></div>
        <div className="admin-stitch-card is-two"><span /><span /><span /></div>
        <svg className="admin-auth-thread" viewBox="0 0 700 700">
          <path d="M-20 520c121-18 128-142 254-124 137 20 105 178 248 180 89 1 125-53 234-19" />
        </svg>
      </section>

      <section className="admin-auth-form-wrap">
        <ThemeToggle className="admin-auth-theme-toggle" />
        <div className="admin-auth-mobile-brand"><YarnMark small /><span>Casa Hebra</span></div>
        <motion.div className="admin-auth-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <span className="admin-auth-icon">{needsSetup ? <WandSparkles /> : <LockKeyhole />}</span>
          <p className="admin-eyebrow">{needsSetup ? "Primera configuración" : "Panel administrativo"}</p>
          <h2>{needsSetup ? "Crea tu acceso privado" : "Qué gusto tenerte de vuelta"}</h2>
          <p className="admin-auth-intro">
            {needsSetup
              ? "Este será el único acceso para administrar tu tienda. Guárdalo en un lugar seguro."
              : "Inicia sesión para gestionar productos y solicitudes."}
          </p>

          {initialError && !needsSetup ? (
            <div className="admin-inline-alert is-error" role="alert">
              <AlertCircle />
              <span>{initialError}</span>
              <button type="button" onClick={onRetry}>Reintentar</button>
            </div>
          ) : null}

          <form onSubmit={submit} className="admin-auth-form" noValidate>
            {needsSetup && setupRequiresToken ? (
              <Field label="Código privado de instalación" hint="Te lo proporciona la persona que instaló la tienda." error={errorField === "setupToken" ? error : ""} required>
                <span className="admin-input-with-icon">
                  <ShieldCheck />
                  <input
                    ref={setupTokenRef}
                    type="password"
                    autoComplete="one-time-code"
                    placeholder="Código de instalación"
                    maxLength={512}
                    value={form.setupToken}
                    onChange={(event) => update("setupToken", event.target.value)}
                  />
                </span>
              </Field>
            ) : null}
            <Field label="Correo electrónico" error={errorField === "email" ? error : ""} required>
              <span className="admin-input-with-icon">
                <Mail />
                <input
                  ref={emailRef}
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  value={form.email}
                  onChange={(event) => update("email", event.target.value)}
                />
              </span>
            </Field>
            <Field label="Contraseña" hint={needsSetup ? "Mínimo 10 caracteres, con al menos una letra y un número" : ""} error={errorField === "password" ? error : ""} required>
              <span className="admin-input-with-icon">
                <KeyRound />
                <input
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  autoComplete={needsSetup ? "new-password" : "current-password"}
                  placeholder="••••••••"
                  maxLength={128}
                  value={form.password}
                  onChange={(event) => update("password", event.target.value)}
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </span>
            </Field>
            {needsSetup ? (
              <Field label="Confirmar contraseña" error={errorField === "confirmPassword" ? error : ""} required>
                <span className="admin-input-with-icon">
                  <ShieldCheck />
                  <input
                    ref={confirmPasswordRef}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Repite tu contraseña"
                    maxLength={128}
                    value={form.confirmPassword}
                    onChange={(event) => update("confirmPassword", event.target.value)}
                  />
                </span>
              </Field>
            ) : null}

            {error && !errorField ? <div className="admin-inline-alert is-error" role="alert"><AlertCircle /><span>{error}</span></div> : null}

            <Button type="submit" loading={submitting} className="admin-auth-submit">
              {needsSetup ? "Crear acceso y continuar" : "Entrar al panel"}
            </Button>
          </form>

          <p className="admin-auth-security"><LockKeyhole /> Acceso protegido y exclusivo para la persona administradora.</p>
          <a href="/" className="admin-back-store"><ArrowLeft /> Volver a la tienda</a>
        </motion.div>
      </section>
    </main>
  );
}

function AdminWorkspace({ onSessionExpired }) {
  const { theme } = useTheme();
  const [data, setData] = useState({
    settings: DEFAULT_SETTINGS,
    categories: [],
    products: [],
    inquiries: [],
    priceHistory: [],
    insights: null,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeView, setActiveView] = useState("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [productModal, setProductModal] = useState(null);
  const [categoryModal, setCategoryModal] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const mobileMenuButtonRef = useRef(null);
  const contentHeadingRef = useRef(null);

  const notify = useCallback((message, type = "success") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message, type }]);
    if (type !== "error") {
      window.setTimeout(
        () => setToasts((current) => current.filter((toast) => toast.id !== id)),
        4400,
      );
    }
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const handleRequestError = useCallback((error) => {
    if (error?.status === 401) {
      onSessionExpired();
      return;
    }
    notify(getApiErrorMessage(error), "error");
  }, [notify, onSessionExpired]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await adminApi.bootstrap();
      setData({
        settings: { ...DEFAULT_SETTINGS, ...(response.settings || {}) },
        categories: Array.isArray(response.categories) ? response.categories : [],
        products: Array.isArray(response.products) ? response.products : [],
        inquiries: Array.isArray(response.inquiries) ? response.inquiries : [],
        priceHistory: Array.isArray(response.priceHistory) ? response.priceHistory : [],
        insights: response.insights && typeof response.insights === "object"
          ? response.insights
          : null,
      });
    } catch (error) {
      if (error?.status === 401) onSessionExpired();
      else setLoadError(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!settingsDirty) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [settingsDirty]);

  const navigate = (view) => {
    const completeNavigation = () => {
      setActiveView(view);
      setMobileNavOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    if (view !== activeView && settingsDirty && ["content", "settings"].includes(activeView)) {
      setMobileNavOpen(false);
      setConfirmDialog({
        title: "¿Salir sin guardar?",
        description: "Los cambios que hiciste en esta sección se perderán.",
        confirmLabel: "Salir sin guardar",
        onConfirm: async () => {
          setSettingsDirty(false);
          completeNavigation();
        },
      });
      return;
    }

    completeNavigation();
  };

  const saveProduct = async (product, id) => {
    const previous = id ? data.products.find((item) => item.id === id) : null;
    const response = id ? await adminApi.updateProduct(id, product) : await adminApi.createProduct(product);
    const saved = getEntity(response, "product");
    setData((current) => {
      const changedPrice = previous && Number(previous.price) !== Number(saved.price);
      const nextHistory = changedPrice
        ? [{
            id: `local-${Date.now()}`,
            productId: saved.id,
            productName: saved.name,
            previousPrice: Number(previous.price),
            newPrice: Number(saved.price),
            currency: current.settings.currency || "MXN",
            changedAt: saved.updatedAt || new Date().toISOString(),
          }, ...current.priceHistory].slice(0, 200)
        : current.priceHistory;
      return {
        ...current,
        products: replaceEntity(current.products, saved),
        priceHistory: nextHistory,
      };
    });
    setProductModal(null);
    notify(id ? "Producto actualizado." : "Producto publicado en tu catálogo.");
  };

  const deleteProduct = (product) => {
    setConfirmDialog({
      title: `¿Eliminar “${product.name}”?`,
      description: "Esta pieza desaparecerá del catálogo. Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar producto",
      fallbackFocusRef: contentHeadingRef,
      onConfirm: async () => {
        await adminApi.deleteProduct(product.id);
        setData((current) => ({
          ...current,
          products: current.products.filter((item) => item.id !== product.id),
          priceHistory: current.priceHistory.filter((entry) => entry.productId !== product.id),
        }));
        setProductModal(null);
        notify("Producto eliminado.");
      },
    });
  };

  const duplicateProduct = (product) => {
    const payload = productCopyPayload(product, data.products);
    setConfirmDialog({
      title: `¿Crear “${payload.name}”?`,
      description: "Se copiarán sus fotos, precio y detalles. La nueva pieza quedará como borrador para que puedas revisarla antes de publicarla.",
      confirmLabel: "Crear copia",
      tone: "normal",
      icon: Copy,
      fallbackFocusRef: contentHeadingRef,
      onConfirm: async () => {
        const response = await adminApi.createProduct(payload);
        const saved = getEntity(response, "product");
        setData((current) => ({ ...current, products: replaceEntity(current.products, saved) }));
        setProductModal({ product: saved });
        notify("Copia creada como borrador. Revísala y publícala cuando esté lista.");
      },
    });
  };

  const saveCategory = async (category, id) => {
    const response = id ? await adminApi.updateCategory(id, category) : await adminApi.createCategory(category);
    const saved = getEntity(response, "category");
    setData((current) => ({ ...current, categories: replaceEntity(current.categories, saved) }));
    setCategoryModal(null);
    notify(id ? "Categoría actualizada." : "Categoría creada.");
  };

  const deleteCategory = (category) => {
    const productCount = data.products.filter((product) => product.categoryId === category.id).length;
    setConfirmDialog({
      title: `¿Eliminar “${category.name}”?`,
      description: productCount
        ? `Hay ${productCount} ${productCount === 1 ? "producto vinculado" : "productos vinculados"}. Reasígnalos antes de eliminar esta categoría.`
        : "La categoría dejará de aparecer en la tienda. Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar categoría",
      disabled: productCount > 0,
      fallbackFocusRef: contentHeadingRef,
      onConfirm: async () => {
        await adminApi.deleteCategory(category.id);
        setData((current) => ({ ...current, categories: current.categories.filter((item) => item.id !== category.id) }));
        setCategoryModal(null);
        notify("Categoría eliminada.");
      },
    });
  };

  const updateInquiryStatus = async (inquiry, status) => {
    try {
      const response = await adminApi.updateInquiry(inquiry.id, status);
      const saved = getEntity(response, "inquiry");
      setData((current) => ({ ...current, inquiries: replaceEntity(current.inquiries, saved) }));
      notify(`Solicitud marcada como “${INQUIRY_STATUSES[status]?.label || status}”.`);
    } catch (error) {
      handleRequestError(error);
    }
  };

  const deleteInquiry = (inquiry) => {
    setConfirmDialog({
      title: "¿Eliminar esta solicitud?",
      description: `Se borrará la solicitud de ${inquiry.customerName || "este cliente"} y ya no podrás consultarla.`,
      confirmLabel: "Eliminar solicitud",
      fallbackFocusRef: contentHeadingRef,
      onConfirm: async () => {
        await adminApi.deleteInquiry(inquiry.id);
        setData((current) => ({ ...current, inquiries: current.inquiries.filter((item) => item.id !== inquiry.id) }));
        notify("Solicitud eliminada.");
      },
    });
  };

  const saveSettings = async (settings) => {
    const response = await adminApi.updateSettings(settings);
    const saved = getEntity(response, "settings");
    setData((current) => ({ ...current, settings: { ...DEFAULT_SETTINGS, ...saved } }));
    notify("Cambios guardados y publicados.");
    return saved;
  };

  const logout = () => {
    setConfirmDialog({
      title: "¿Cerrar sesión?",
      description: settingsDirty
        ? "Tienes cambios sin guardar que se perderán. Tu catálogo seguirá visible y podrás volver a entrar después."
        : "Tu catálogo seguirá visible. Para volver a editarlo necesitarás iniciar sesión.",
      confirmLabel: "Cerrar sesión",
      tone: "normal",
      onConfirm: async () => {
        await adminApi.logout();
        onSessionExpired();
      },
    });
  };

  const meta = VIEW_META[activeView];
  const accentTheme = createAccessibleAccentPalette(data.settings.accentColor, theme);

  return (
    <div className="casa-admin admin-app-shell" style={{ "--admin-accent": accentTheme.accent, "--admin-on-accent": accentTheme.onAccent }}>
      <Sidebar
        activeView={activeView}
        open={mobileNavOpen}
        settings={data.settings}
        onNavigate={navigate}
        onClose={() => setMobileNavOpen(false)}
        onLogout={logout}
      />

      <div className="admin-main-column">
        <header className="admin-topbar">
          <div className="admin-topbar-heading">
            <IconButton ref={mobileMenuButtonRef} label="Abrir menú" className="admin-mobile-menu" aria-expanded={mobileNavOpen} aria-controls="admin-sidebar" onClick={() => setMobileNavOpen(true)}><Menu /></IconButton>
            <div>
              <p>{meta.eyebrow}</p>
              <h1 ref={contentHeadingRef} tabIndex={-1}>{meta.title}</h1>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <ThemeToggle compact className="admin-topbar-theme-toggle" />
            <a className="admin-button is-secondary is-md" href="/" target="_blank" rel="noreferrer" aria-label="Ver tienda en una pestaña nueva">
              <Eye /><span>Ver tienda</span><ExternalLink className="admin-button-tail" />
            </a>
            {activeView === "products" ? <Button icon={Plus} onClick={() => setProductModal({ product: null })}>Nueva pieza</Button> : null}
          </div>
        </header>

        <main className="admin-main-content">
          {loading ? <DashboardSkeleton /> : loadError ? <ErrorState message={loadError} onRetry={loadData} /> : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.section
                key={activeView}
                className="admin-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                {activeView === "overview" ? (
                  <OverviewPanel
                    data={data}
                    onNavigate={navigate}
                    onNewProduct={() => setProductModal({ product: null })}
                  />
                ) : null}
                {activeView === "products" ? (
                  <ProductsPanel
                    products={data.products}
                    categories={data.categories}
                    currency={data.settings.currency}
                    onCreate={() => setProductModal({ product: null })}
                    onEdit={(product) => setProductModal({ product })}
                    onDuplicate={duplicateProduct}
                    onDelete={deleteProduct}
                  />
                ) : null}
                {activeView === "categories" ? (
                  <CategoriesPanel
                    categories={data.categories}
                    products={data.products}
                    onCreate={() => setCategoryModal({ category: null })}
                    onEdit={(category) => setCategoryModal({ category })}
                    onDelete={deleteCategory}
                  />
                ) : null}
                {activeView === "inquiries" ? (
                  <InquiriesPanel
                    inquiries={data.inquiries}
                    currency={data.settings.currency}
                    onStatusChange={updateInquiryStatus}
                    onDelete={deleteInquiry}
                  />
                ) : null}
                {activeView === "content" ? (
                  <SettingsPanel mode="content" settings={data.settings} productCount={data.products.length} onSave={saveSettings} onError={handleRequestError} onDirtyChange={setSettingsDirty} />
                ) : null}
                {activeView === "settings" ? (
                  <SettingsPanel mode="business" settings={data.settings} productCount={data.products.length} onSave={saveSettings} onError={handleRequestError} onDirtyChange={setSettingsDirty} />
                ) : null}
              </motion.section>
            </AnimatePresence>
          )}
        </main>
      </div>

      <AnimatePresence>
        {productModal ? (
          <ProductModal
            key={productModal.product?.id || "new-product"}
            product={productModal.product}
            categories={data.categories}
            currency={data.settings.currency}
            priceHistory={data.priceHistory.filter((entry) => entry.productId === productModal.product?.id)}
            onClose={() => setProductModal(null)}
            onSave={saveProduct}
            onDelete={deleteProduct}
            onError={handleRequestError}
            fallbackFocusRef={contentHeadingRef}
          />
        ) : null}
        {categoryModal ? (
          <CategoryModal
            key={categoryModal.category?.id || "new-category"}
            category={categoryModal.category}
            productCount={categoryModal.category ? data.products.filter((item) => item.categoryId === categoryModal.category.id).length : 0}
            onClose={() => setCategoryModal(null)}
            onSave={saveCategory}
            onDelete={deleteCategory}
            onError={handleRequestError}
            fallbackFocusRef={contentHeadingRef}
          />
        ) : null}
        {confirmDialog ? (
          <ConfirmDialog
            {...confirmDialog}
            onClose={() => setConfirmDialog(null)}
            onError={handleRequestError}
          />
        ) : null}
      </AnimatePresence>

      <ToastStack
        toasts={toasts}
        dismiss={dismissToast}
        interactionDisabled={Boolean(
          productModal || categoryModal || confirmDialog || mobileNavOpen,
        )}
      />
    </div>
  );
}

function Sidebar({ activeView, open, settings, onNavigate, onClose, onLogout }) {
  const isMobile = useMediaQuery("(max-width: 1060px)");
  const isHidden = isMobile && !open;
  const dialogRef = useAccessibleDialog({ active: isMobile && open, onClose });

  return (
    <>
      <AnimatePresence>
        {isMobile && open ? <motion.button type="button" className="admin-sidebar-backdrop" aria-hidden="true" tabIndex={-1} onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /> : null}
      </AnimatePresence>
      <aside
        ref={dialogRef}
        id="admin-sidebar"
        className={classNames("admin-sidebar", open && "is-open")}
        role={isMobile ? "dialog" : undefined}
        aria-modal={isMobile && open ? "true" : undefined}
        aria-label={isMobile ? "Menú de administración" : undefined}
        aria-hidden={isHidden ? "true" : undefined}
        inert={isHidden ? true : undefined}
        tabIndex={isMobile ? -1 : undefined}
      >
        <div className="admin-sidebar-brand">
          <YarnMark />
          <div><strong>{settings.storeName || "Casa Hebra"}</strong><span>Administración</span></div>
          <IconButton label="Cerrar menú" data-dialog-initial-focus onClick={onClose}><X /></IconButton>
        </div>

        <nav className="admin-nav" aria-label="Navegación del panel">
          <p>MENÚ</p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={classNames(activeView === item.id && "is-active")}
                aria-current={activeView === item.id ? "page" : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon aria-hidden="true" /><span>{item.label}</span>
                {item.id === "inquiries" ? null : <ChevronRight className="admin-nav-chevron" />}
              </button>
            );
          })}
        </nav>

        <div className="admin-sidebar-bottom">
          <div className="admin-sidebar-tip">
            <span><Sparkles /></span>
            <div><strong>Tu vitrina está activa</strong><p>Los cambios se publican al guardar.</p></div>
          </div>
          <button className="admin-logout" onClick={onLogout}><LogOut /><span>Cerrar sesión</span></button>
        </div>
      </aside>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="admin-skeleton-wrap" aria-label="Cargando información">
      <div className="admin-skeleton is-banner" />
      <div className="admin-skeleton-grid">
        {[1, 2, 3, 4].map((item) => <div className="admin-skeleton is-card" key={item} />)}
      </div>
      <div className="admin-skeleton is-table" />
    </div>
  );
}

function OverviewPanel({ data, onNavigate, onNewProduct }) {
  const activeCategoryIds = new Set(data.categories.filter((category) => category.active).map((category) => category.id));
  const visibleProducts = data.products.filter((product) => product.active && activeCategoryIds.has(product.categoryId));
  const activeProducts = visibleProducts.length;
  const featuredProducts = visibleProducts.filter((product) => product.featured).length;
  const openInquiryItems = data.inquiries.filter((inquiry) => !["completed", "archived"].includes(inquiry.status));
  const openInquiries = openInquiryItems.length;
  const totalsByCurrency = openInquiryItems.reduce((totals, inquiry) => {
    const inquiryCurrency = inquiry.currency || data.settings.currency || "MXN";
    totals.set(inquiryCurrency, (totals.get(inquiryCurrency) || 0) + (Number(inquiry.estimatedTotal) || 0));
    return totals;
  }, new Map());
  const currencyTotals = Array.from(totalsByCurrency.entries());
  const estimatedValue = currencyTotals.length <= 1
    ? formatCurrency(currencyTotals[0]?.[1] || 0, currencyTotals[0]?.[0] || data.settings.currency)
    : `${currencyTotals.length} monedas`;
  const estimatedNote = currencyTotals.length <= 1
    ? "No es una venta confirmada"
    : currencyTotals.map(([currency, total]) => formatCurrency(total, currency)).join(" · ");
  const recentInquiries = [...data.inquiries]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5);
  const productConsultations = Array.isArray(data.insights?.productConsultations)
    ? data.insights.productConsultations
        .filter((item) => Number(item.inquiryCount) > 0)
        .slice(0, 5)
    : [];
  const highestConsultationCount = Math.max(
    1,
    ...productConsultations.map((item) => Number(item.inquiryCount) || 0),
  );
  const needsWhatsApp = !String(data.settings.whatsappNumber || "").replace(/\D/g, "");

  const stats = [
    { label: "Piezas publicadas", value: activeProducts, note: `${data.products.length - activeProducts} no visibles`, icon: Package, tone: "clay" },
    { label: "Piezas destacadas", value: featuredProducts, note: "Aparecen primero", icon: Sparkles, tone: "sage" },
    { label: "Solicitudes abiertas", value: openInquiries, note: `${data.inquiries.length} en total`, icon: MessageCircle, tone: "cocoa" },
    { label: "Valor estimado", value: estimatedValue, note: estimatedNote, icon: CircleDollarSign, tone: "ivory" },
  ];

  return (
    <div className="admin-dashboard">
      <section className="admin-welcome-card">
        <div className="admin-welcome-copy">
          <span className="admin-kicker"><Sparkles /> Todo en orden</span>
          <h2>Hola, qué gusto verte por aquí.</h2>
          <p>Tu catálogo tiene <strong>{activeProducts} {activeProducts === 1 ? "pieza visible" : "piezas visibles"}</strong>. Puedes publicar algo nuevo o revisar las solicitudes recientes.</p>
          <div className="admin-welcome-actions">
            <Button icon={Plus} onClick={onNewProduct}>Agregar una pieza</Button>
            <Button variant="soft" icon={MessageCircle} onClick={() => onNavigate("inquiries")}>Ver solicitudes</Button>
          </div>
        </div>
        <div className="admin-welcome-visual" aria-hidden="true">
          <span className="admin-yarn-ball"><i /><i /><i /></span>
          <svg viewBox="0 0 320 180"><path d="M-10 142c71-6 64-82 139-76 69 6 46 89 116 88 43 0 58-35 92-28" /></svg>
        </div>
      </section>

      {needsWhatsApp ? (
        <button className="admin-setup-notice" onClick={() => onNavigate("settings")}>
          <span><Phone /></span>
          <div><strong>Conecta tu WhatsApp para recibir solicitudes</strong><p>La tienda mostrará el botón de contacto cuando agregues un número válido.</p></div>
          <span className="admin-setup-link">Configurar <ArrowUpRight /></span>
        </button>
      ) : null}

      <section className="admin-stat-grid" aria-label="Estadísticas del negocio">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.article className="admin-stat-card" key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
              <div className={classNames("admin-stat-icon", `is-${stat.tone}`)}><Icon /></div>
              <div className="admin-stat-value">{stat.value}</div>
              <h3>{stat.label}</h3>
              <p>{stat.note}</p>
            </motion.article>
          );
        })}
      </section>

      <section className="admin-panel admin-interest-panel" aria-labelledby="admin-interest-title">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-eyebrow">Interés real</p>
            <h2 id="admin-interest-title">Piezas más consultadas</h2>
          </div>
          <div className="admin-interest-summary" aria-label="Resumen de consultas">
            <span><strong>{Number(data.insights?.catalogueInquiries) || 0}</strong> de catálogo</span>
            <span><strong>{Number(data.insights?.customInquiries) || 0}</strong> personalizadas</span>
          </div>
        </div>
        {productConsultations.length ? (
          <div className="admin-interest-list">
            {productConsultations.map((item, index) => (
              <div className="admin-interest-row" key={item.productId}>
                <span className="admin-interest-rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="admin-interest-name">
                  <strong>{item.productName}</strong>
                  <small>{item.unitsRequested} {Number(item.unitsRequested) === 1 ? "pieza solicitada" : "piezas solicitadas"}</small>
                </span>
                <span className="admin-interest-meter" aria-hidden="true">
                  <i style={{ width: `${Math.max(8, (Number(item.inquiryCount) / highestConsultationCount) * 100)}%` }} />
                </span>
                <span className="admin-interest-count">
                  <strong>{item.inquiryCount}</strong>
                  <small>{Number(item.inquiryCount) === 1 ? "consulta" : "consultas"}</small>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-interest-empty">
            <span><MessageCircle /></span>
            <div>
              <strong>Aquí aparecerán las piezas que despiertan más interés</strong>
              <p>Se calcula solo con las solicitudes guardadas; no rastreamos visitas ni personas.</p>
            </div>
          </div>
        )}
      </section>

      <div className="admin-dashboard-columns">
        <section className="admin-panel admin-recent-panel">
          <div className="admin-panel-heading">
            <div><p className="admin-eyebrow">Actividad reciente</p><h2>Últimas solicitudes</h2></div>
            <button className="admin-text-link" onClick={() => onNavigate("inquiries")}>Ver todas <ArrowUpRight /></button>
          </div>
          {recentInquiries.length ? (
            <div className="admin-recent-list">
              {recentInquiries.map((inquiry) => (
                <button key={inquiry.id} onClick={() => onNavigate("inquiries")}>
                  <span className="admin-customer-avatar">{(inquiry.customerName || "C").slice(0, 1).toUpperCase()}</span>
                  <span className="admin-recent-main">
                    <strong>{inquiry.customerName || "Cliente sin nombre"}</strong>
                    <small>{inquiry.items?.length || 0} {(inquiry.items?.length || 0) === 1 ? "pieza" : "piezas"} · {formatDate(inquiry.createdAt, true)}</small>
                  </span>
                  <span className="admin-recent-end">
                    <StatusBadge type={inquiry.status} map={INQUIRY_STATUSES} />
                    <strong>{formatCurrency(inquiry.estimatedTotal, inquiry.currency || data.settings.currency)}</strong>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={MessageCircle} title="Aún no hay solicitudes" text="Cuando alguien prepare un mensaje desde la tienda, aparecerá aquí." />
          )}
        </section>

        <section className="admin-panel admin-health-panel">
          <div className="admin-panel-heading"><div><p className="admin-eyebrow">Estado de la tienda</p><h2>Lista para recibir visitas</h2></div></div>
          <div className="admin-health-list">
            <button onClick={() => onNavigate("products")}>
              <span className={classNames("admin-health-check", data.products.length && "is-done")}>{data.products.length ? <Check /> : <Plus />}</span>
              <span><strong>Catálogo</strong><small>{data.products.length ? `${data.products.length} productos creados` : "Agrega tu primera pieza"}</small></span>
              <ChevronRight />
            </button>
            <button onClick={() => onNavigate("categories")}>
              <span className={classNames("admin-health-check", data.categories.length && "is-done")}>{data.categories.length ? <Check /> : <Plus />}</span>
              <span><strong>Categorías</strong><small>{data.categories.length ? `${data.categories.length} categorías organizadas` : "Organiza tu catálogo"}</small></span>
              <ChevronRight />
            </button>
            <button onClick={() => onNavigate("settings")}>
              <span className={classNames("admin-health-check", !needsWhatsApp && "is-done")}>{!needsWhatsApp ? <Check /> : <Plus />}</span>
              <span><strong>WhatsApp</strong><small>{needsWhatsApp ? "Falta agregar el número" : "Canal de contacto activo"}</small></span>
              <ChevronRight />
            </button>
          </div>
          <a className="admin-store-preview" href="/" target="_blank" rel="noreferrer">
            <span><Eye /></span><span><strong>Revisa tu tienda</strong><small>Mírala como la verán tus clientes</small></span><ExternalLink />
          </a>
        </section>
      </div>
    </div>
  );
}

function ProductsPanel({ products, categories, currency, onCreate, onEdit, onDuplicate, onDelete }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((item) => [item.id, item])),
    [categories],
  );

  const isPubliclyVisible = useCallback(
    (product) => Boolean(product.active && categoryMap[product.categoryId]?.active),
    [categoryMap],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return [...products]
      .filter((product) => {
        const matchesQuery = !query || [product.name, product.shortDescription, product.slug]
          .some((value) => String(value || "").toLocaleLowerCase("es").includes(query));
        const matchesStatus = status === "all" || (
          status === "draft"
            ? !product.active
            : status === "hidden"
              ? !isPubliclyVisible(product)
              : effectiveProductStatus(product) === status
        );
        const matchesCategory = category === "all" || product.categoryId === category;
        return matchesQuery && matchesStatus && matchesCategory;
      })
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || String(a.name).localeCompare(String(b.name), "es"));
  }, [products, search, status, category, isPubliclyVisible]);

  const hasFilters = search || status !== "all" || category !== "all";

  return (
    <div className="admin-catalog-page">
      <section className="admin-page-intro">
        <div>
          <p>Administra las piezas que tus clientes pueden descubrir. Los cambios se reflejan al guardar.</p>
          <span>{products.length} {products.length === 1 ? "producto" : "productos"} · {products.filter(isPubliclyVisible).length} visibles · {products.filter((product) => !product.active).length} borradores</span>
        </div>
        <Button icon={Plus} aria-label="Agregar producto" onClick={onCreate}>Agregar producto</Button>
      </section>

      <section className="admin-toolbar">
        <div className="admin-searchbox">
          <Search />
          <input aria-label="Buscar productos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o descripción…" />
          {search ? <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch("")}><X /></button> : null}
        </div>
        <div className="admin-filter-group">
          <label className="admin-select-wrap">
            <span className="admin-sr-only">Filtrar por estado</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">Todos los estados</option>
              <option value="available">Disponibles</option>
              <option value="made_to_order">Sobre pedido</option>
              <option value="sold_out">Agotados</option>
              <option value="draft">Borradores</option>
              <option value="hidden">Todos los no visibles</option>
            </select>
            <ChevronDown />
          </label>
          <label className="admin-select-wrap">
            <span className="admin-sr-only">Filtrar por categoría</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">Todas las categorías</option>
              {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <ChevronDown />
          </label>
        </div>
      </section>

      {!products.length ? (
        <section className="admin-panel">
          <EmptyState icon={PackageOpen} title="Tu catálogo está listo para crecer" text="Agrega tu primera pieza con fotos, precio, colores y tiempo de elaboración." action={<Button icon={Plus} onClick={onCreate}>Crear primer producto</Button>} />
        </section>
      ) : !filtered.length ? (
        <section className="admin-panel">
          <EmptyState
            icon={Search}
            title="No encontramos coincidencias"
            text="Prueba con otra palabra o limpia los filtros."
            action={hasFilters ? <Button variant="secondary" onClick={() => { setSearch(""); setStatus("all"); setCategory("all"); }}>Limpiar filtros</Button> : null}
          />
        </section>
      ) : (
        <section className="admin-product-table-card">
          <div className="admin-product-table admin-product-table-head">
            <span>Producto</span><span>Categoría</span><span>Estado</span><span>Inventario</span><span>Precio</span><span aria-hidden="true" />
          </div>
          <div className="admin-product-rows">
            {filtered.map((product, index) => {
              const cover = normalizeImage(product.images?.[0]);
              const visible = isPubliclyVisible(product);
              const effectiveStatus = effectiveProductStatus(product);
              const hiddenReason = !product.active ? "Borrador" : !categoryMap[product.categoryId]?.active ? "Categoría oculta" : "";
              return (
                <motion.article
                  className={classNames("admin-product-row", !visible && "is-hidden")}
                  key={product.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(index, 8) * 0.025 }}
                >
                  <button type="button" className="admin-product-identity" onClick={() => onEdit(product)}>
                    <span className="admin-product-thumb">
                      {cover ? <img src={cover} alt="" /> : <ImagePlus />}
                      {product.featured ? <i title="Producto destacado"><Sparkles /></i> : null}
                    </span>
                    <span><strong>{product.name}</strong><small>{product.shortDescription || "Sin descripción breve"}</small>{hiddenReason ? <em>{hiddenReason}</em> : null}</span>
                  </button>
                  <span className="admin-table-category">{categoryMap[product.categoryId]?.name || "Sin categoría"}</span>
                  <span><StatusBadge type={effectiveStatus} map={PRODUCT_STATUSES} /></span>
                  <span className="admin-stock-cell">
                    {effectiveStatus === "made_to_order" ? <><Clock3 />{product.leadTime || "Por acordar"}</> : effectiveStatus === "sold_out" ? <><Box />Agotado</> : <><Box />{Number(product.stockQuantity) || 0} disponibles</>}
                  </span>
                  <span className="admin-price-cell">
                    <strong>{formatCurrency(product.price, currency)}</strong>
                    {Number(product.compareAtPrice) > Number(product.price) ? <small>{formatCurrency(product.compareAtPrice, currency)}</small> : null}
                  </span>
                  <span className="admin-row-actions" role="group" aria-label={`Acciones para ${product.name}`}>
                    <IconButton type="button" label={`Editar ${product.name}`} onClick={() => onEdit(product)}><Pencil /></IconButton>
                    <IconButton type="button" label={`Duplicar ${product.name} como borrador`} onClick={() => onDuplicate(product)}><Copy /></IconButton>
                    <IconButton type="button" label={`Eliminar ${product.name}`} variant="danger" onClick={() => onDelete(product)}><Trash2 /></IconButton>
                  </span>
                </motion.article>
              );
            })}
          </div>
          <footer className="admin-table-footer">Mostrando {filtered.length} de {products.length} productos</footer>
        </section>
      )}
    </div>
  );
}

function createProductForm(product, categories) {
  return {
    name: product?.name || "",
    slug: product?.slug || "",
    shortDescription: product?.shortDescription || "",
    description: product?.description || "",
    price: product?.price ?? "",
    compareAtPrice: product?.compareAtPrice ?? "",
    categoryId: product?.categoryId || categories.find((item) => item.active)?.id || categories[0]?.id || "",
    status: product?.status || "available",
    stockQuantity: product?.stockQuantity ?? 1,
    leadTime: product?.leadTime || "",
    featured: Boolean(product?.featured),
    active: product ? Boolean(product.active) : true,
    customizable: Boolean(product?.customizable),
    colors: Array.isArray(product?.colors) ? product.colors.join(", ") : "",
    sizes: Array.isArray(product?.sizes) ? product.sizes.join(", ") : "",
    materials: product?.materials || "",
    images: Array.isArray(product?.images) ? product.images.map(normalizeImage).filter(Boolean) : [],
  };
}

function productFormSnapshot(form) {
  return JSON.stringify({
    ...form,
    price: String(form.price),
    compareAtPrice: String(form.compareAtPrice),
    stockQuantity: String(form.stockQuantity),
  });
}

function ProductEditorPreview({ form, categories, currency }) {
  const category = categories.find((item) => item.id === form.categoryId);
  const cover = normalizeImage(form.images?.[0]);
  const effectiveStatus = effectiveProductStatus(form);
  const isVisible = Boolean(form.active && category?.active);
  const visibilityLabel = !form.active
    ? "Borrador privado"
    : !form.categoryId
      ? "Falta categoría"
      : !category?.active
        ? "Categoría oculta"
        : "Visible al publicar";
  const stockLabel = effectiveStatus === "made_to_order"
    ? form.leadTime || "Tiempo por acordar"
    : effectiveStatus === "sold_out"
      ? "Agotado temporalmente"
      : `${Math.max(0, Number(form.stockQuantity) || 0)} disponibles`;

  return (
    <motion.aside className="admin-product-editor-preview" layout aria-label="Vista previa del producto en el catálogo">
      <div className="admin-product-editor-preview-media">
        <AnimatePresence mode="wait" initial={false}>
          {cover ? (
            <motion.img
              key={cover}
              src={cover}
              alt=""
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.18 }}
            />
          ) : (
            <motion.span key="empty-product-preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <ImagePlus aria-hidden="true" />
              <small>Agrega una foto de portada</small>
            </motion.span>
          )}
        </AnimatePresence>
        <span className={classNames("admin-product-editor-visibility", isVisible ? "is-visible" : "is-draft")}>
          {isVisible ? <CheckCircle2 aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          {visibilityLabel}
        </span>
      </div>
      <div className="admin-product-editor-preview-copy">
        <div className="admin-product-editor-preview-heading">
          <span><Eye aria-hidden="true" /> Vista previa en catálogo</span>
          <StatusBadge type={effectiveStatus} map={PRODUCT_STATUSES} />
        </div>
        <p className="admin-product-editor-preview-category">{category?.name || "Sin categoría"}</p>
        <h3>{form.name.trim() || "Nombre de tu pieza"}</h3>
        <p className="admin-product-editor-preview-description">{form.shortDescription.trim() || "Aquí aparecerá la descripción breve que verá tu cliente."}</p>
        <div className="admin-product-editor-preview-meta">
          <strong>{form.price === "" ? "Precio pendiente" : formatCurrency(form.price, currency)}</strong>
          {form.compareAtPrice !== "" && Number(form.compareAtPrice) > Number(form.price) ? <del>{formatCurrency(form.compareAtPrice, currency)}</del> : null}
          <span><Clock3 aria-hidden="true" /> {stockLabel}</span>
        </div>
        <small className="admin-product-editor-preview-note">Se actualiza mientras editas. Guarda para reflejar los cambios en la tienda.</small>
      </div>
    </motion.aside>
  );
}

function ProductModal({ product, categories, currency, priceHistory = [], onClose, onSave, onDelete, onError, fallbackFocusRef }) {
  const initialFormRef = useRef(createProductForm(product, categories));
  const [form, setForm] = useState(initialFormRef.current);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const fileInputRef = useRef(null);
  const dirty = productFormSnapshot(form) !== productFormSnapshot(initialFormRef.current);
  useUnsavedChangesWarning(dirty);

  const requestClose = useCallback(() => {
    if (saving || uploading) return;
    if (dirty) setDiscardDialogOpen(true);
    else onClose();
  }, [dirty, onClose, saving, uploading]);

  const dialogRef = useAccessibleDialog({ onClose: requestClose, canClose: !saving && !uploading, fallbackFocusRef });

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    setUploadError("");
    if (!files.length) return;

    const room = 5 - form.images.length;
    if (room <= 0) {
      setUploadError("Ya tienes el máximo de 5 fotos.");
      return;
    }
    if (files.length > room) {
      setUploadError(`Solo puedes agregar ${room} ${room === 1 ? "foto más" : "fotos más"}.`);
      return;
    }

    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    const invalidType = files.find((file) => !allowed.has(file.type));
    if (invalidType) {
      setUploadError("Usa únicamente imágenes JPG, PNG o WebP.");
      return;
    }
    const oversized = files.find((file) => file.size > 6 * 1024 * 1024);
    if (oversized) {
      setUploadError(`“${oversized.name}” supera el límite de 6 MB.`);
      return;
    }

    setUploading(true);
    try {
      const response = await adminApi.uploadImages(files);
      const uploaded = (response.images || []).map(normalizeImage).filter(Boolean);
      if (!uploaded.length) throw new Error("El servidor no devolvió las fotos cargadas.");
      setForm((current) => ({ ...current, images: [...current.images, ...uploaded].slice(0, 5) }));
    } catch (error) {
      setUploadError(getApiErrorMessage(error));
      if (error?.status === 401) onError(error);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (index) => {
    setForm((current) => ({ ...current, images: current.images.filter((_, imageIndex) => imageIndex !== index) }));
  };

  const makeCover = (index) => {
    setForm((current) => {
      const images = [...current.images];
      const [selected] = images.splice(index, 1);
      return { ...current, images: [selected, ...images] };
    });
  };

  const validate = () => {
    const nextErrors = {};
    const colorOptions = form.colors.split(",").map((item) => item.trim()).filter(Boolean);
    const sizeOptions = form.sizes.split(",").map((item) => item.trim()).filter(Boolean);
    if (form.name.trim().length < 2) nextErrors.name = "Escribe un nombre de al menos 2 caracteres.";
    if (!form.shortDescription.trim()) nextErrors.shortDescription = "Agrega una descripción breve.";
    if (!form.categoryId) nextErrors.categoryId = "Crea o selecciona una categoría antes de guardar.";
    if (form.price === "" || !Number.isFinite(Number(form.price)) || Number(form.price) < 0 || Number(form.price) > 10_000_000) {
      nextErrors.price = "Escribe un precio válido.";
    }
    if (form.compareAtPrice !== "" && (
      !Number.isFinite(Number(form.compareAtPrice))
      || Number(form.compareAtPrice) < 0
      || Number(form.compareAtPrice) > 10_000_000
      || Number(form.compareAtPrice) <= Number(form.price)
    )) {
      nextErrors.compareAtPrice = "El precio anterior debe ser mayor al precio actual.";
    }
    if (form.status === "available" && (!Number.isInteger(Number(form.stockQuantity)) || Number(form.stockQuantity) < 1 || Number(form.stockQuantity) > 1_000_000)) {
      nextErrors.stockQuantity = "Para marcarla disponible, usa un número entero igual o mayor a uno.";
    }
    if (colorOptions.length > 20 || colorOptions.some((item) => item.length > 60)) {
      nextErrors.colors = "Agrega máximo 20 colores, de hasta 60 caracteres cada uno.";
    }
    if (sizeOptions.length > 20 || sizeOptions.some((item) => item.length > 60)) {
      nextErrors.sizes = "Agrega máximo 20 tamaños, de hasta 60 caracteres cada uno.";
    }
    setErrors(nextErrors);
    return nextErrors;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving || uploading) return;
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) {
      focusFirstInvalid(event.currentTarget);
      return;
    }

    const payload = {
      name: form.name.trim(),
      ...(sanitizeSlug(form.slug) ? { slug: sanitizeSlug(form.slug) } : {}),
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      compareAtPrice: form.compareAtPrice === "" ? null : Number(form.compareAtPrice),
      categoryId: form.categoryId,
      status: form.status,
      stockQuantity: Math.max(0, Number(form.stockQuantity) || 0),
      leadTime: form.leadTime.trim(),
      featured: form.featured,
      active: form.active,
      customizable: form.customizable,
      colors: form.colors.split(",").map((item) => item.trim()).filter(Boolean),
      sizes: form.sizes.split(",").map((item) => item.trim()).filter(Boolean),
      materials: form.materials.trim(),
      images: form.images,
    };

    setSaving(true);
    try {
      await onSave(payload, product?.id);
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div className="admin-modal-layer" role="presentation">
      <motion.button type="button" className="admin-modal-backdrop" aria-hidden="true" tabIndex={-1} onClick={requestClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        ref={dialogRef}
        className="admin-product-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        aria-describedby="product-modal-description"
        tabIndex={-1}
        initial={{ opacity: 0, x: 36 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 36 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
      >
        <form onSubmit={submit}>
          <header className="admin-modal-header">
            <div>
              <p className="admin-eyebrow">{product ? "Editar pieza" : "Nueva pieza"}</p>
              <h2 id="product-modal-title">{product ? product.name : "Agrega algo especial"}</h2>
              <p id="product-modal-description">{product ? "Actualiza los detalles que verán tus clientes." : "Completa la información para sumarla al catálogo."}</p>
            </div>
            <IconButton type="button" label="Cerrar" disabled={saving || uploading} onClick={requestClose}><X /></IconButton>
          </header>

          <fieldset className="admin-modal-body admin-modal-fields" disabled={saving || uploading} aria-busy={saving || uploading}>
            <ProductEditorPreview form={form} categories={categories} currency={currency} />

            <section className="admin-form-section">
              <div className="admin-form-section-heading"><span>01</span><div><h3>Información principal</h3><p>Lo primero que conocerán tus clientes.</p></div></div>
              <div className="admin-form-grid">
                <Field label="Nombre de la pieza" error={errors.name} required className="is-wide">
                  <input data-dialog-initial-focus value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Ej. Osito tejido Canela" maxLength={100} />
                </Field>
                <Field label="Categoría" error={errors.categoryId} hint={!categories.length ? "Cierra este editor y crea una categoría primero." : ""} required>
                  <span className="admin-select-wrap is-full">
                    <select value={form.categoryId} onChange={(event) => update("categoryId", event.target.value)}>
                      <option value="">Sin categoría</option>
                      {categories.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (oculta)"}</option>)}
                    </select>
                    <ChevronDown />
                  </span>
                </Field>
                <Field label="Identificador interno" hint="Opcional. Sirve para organizar el catálogo y se genera automáticamente si queda vacío.">
                  <span className="admin-slug-input"><span>ID</span><input value={form.slug} onChange={(event) => update("slug", event.target.value.toLowerCase().replace(/[^a-z0-9áéíóúüñ-]/gi, "-"))} placeholder="osito-canela" maxLength={100} /></span>
                </Field>
                <Field label="Descripción breve" error={errors.shortDescription} hint={`${form.shortDescription.length}/180 caracteres`} required className="is-wide">
                  <input value={form.shortDescription} onChange={(event) => update("shortDescription", event.target.value)} placeholder="Una frase cálida que describa esta pieza" maxLength={180} />
                </Field>
                <Field label="Descripción completa" hint={`${form.description.length}/4000 caracteres`} className="is-wide">
                  <textarea value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Cuenta cómo está hecha, qué la hace especial y para quién sería ideal…" rows={5} maxLength={4000} />
                </Field>
              </div>
              {!categories.length ? <div className="admin-inline-alert is-warm"><AlertCircle /><span>Necesitas al menos una categoría para guardar el producto.</span></div> : null}
            </section>

            <section className="admin-form-section">
              <div className="admin-form-section-heading"><span>02</span><div><h3>Fotos</h3><p>La primera será la portada. Puedes subir hasta cinco.</p></div></div>
              <div className="admin-image-editor">
                {form.images.length ? (
                  <div className="admin-image-grid">
                    {form.images.map((image, index) => (
                      <div className={classNames("admin-image-tile", index === 0 && "is-cover")} key={`${image}-${index}`}>
                        <img src={image} alt={`Vista ${index + 1} de ${form.name || "la pieza"}`} />
                        {index === 0 ? <span><Sparkles /> Portada</span> : <button type="button" onClick={() => makeCover(index)}>Usar de portada</button>}
                        <IconButton type="button" label="Quitar foto" variant="danger" onClick={() => removeImage(index)}><X /></IconButton>
                      </div>
                    ))}
                  </div>
                ) : null}
                {form.images.length < 5 ? (
                  <button
                    className={classNames("admin-upload-zone", dragging && "is-dragging")}
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => { event.preventDefault(); setDragging(false); uploadFiles(event.dataTransfer.files); }}
                    disabled={uploading}
                  >
                    <span>{uploading ? <Spinner /> : <Upload />}</span>
                    <strong>{uploading ? "Subiendo fotos…" : form.images.length ? "Agregar más fotos" : "Arrastra fotos o selecciónalas"}</strong>
                    <small>JPG, PNG o WebP · máximo 6 MB; ideal menos de 2 MB para que la tienda cargue rápido · {5 - form.images.length} espacios disponibles</small>
                  </button>
                ) : null}
                <input ref={fileInputRef} className="admin-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => uploadFiles(event.target.files)} />
                {uploadError ? <div className="admin-inline-alert is-error" role="alert"><AlertCircle /><span>{uploadError}</span></div> : null}
              </div>
            </section>

            <section className="admin-form-section">
              <div className="admin-form-section-heading"><span>03</span><div><h3>Precio y disponibilidad</h3><p>Indica cómo puede solicitarse esta pieza.</p></div></div>
              <div className="admin-form-grid">
                <Field label={`Precio (${currency || "MXN"})`} error={errors.price} required>
                  <span className="admin-money-input"><span>$</span><input type="number" min="0" max="10000000" step="0.01" inputMode="decimal" value={form.price} onChange={(event) => update("price", event.target.value)} placeholder="0.00" /></span>
                </Field>
                <Field label="Precio anterior" error={errors.compareAtPrice} hint="Opcional, para mostrar una rebaja.">
                  <span className="admin-money-input"><span>$</span><input type="number" min="0" max="10000000" step="0.01" inputMode="decimal" value={form.compareAtPrice} onChange={(event) => update("compareAtPrice", event.target.value)} placeholder="0.00" /></span>
                </Field>
                <Field label="Disponibilidad" required>
                  <span className="admin-select-wrap is-full">
                    <select value={form.status} onChange={(event) => update("status", event.target.value)}>
                      <option value="available">Disponible ahora</option>
                      <option value="made_to_order">Se elabora sobre pedido</option>
                      <option value="sold_out">Agotado temporalmente</option>
                    </select>
                    <ChevronDown />
                  </span>
                </Field>
                {form.status === "available" ? (
                  <Field label="Cantidad disponible" error={errors.stockQuantity}>
                    <input type="number" min="1" max="1000000" step="1" inputMode="numeric" value={form.stockQuantity} onChange={(event) => update("stockQuantity", event.target.value)} />
                  </Field>
                ) : form.status === "made_to_order" ? (
                  <Field label="Tiempo de elaboración" hint="Ej. 5 a 7 días">
                    <input value={form.leadTime} onChange={(event) => update("leadTime", event.target.value)} placeholder="Ej. 7 a 10 días" maxLength={100} />
                  </Field>
                ) : <div className="admin-inline-alert is-warm"><AlertCircle /><span>La pieza seguirá guardada, pero se mostrará como agotada y no podrá agregarse a una solicitud.</span></div>}
              </div>
              {product && priceHistory.length ? (
                <details className="admin-price-history">
                  <summary>
                    <span><Clock3 /> Historial de precio</span>
                    <small>{priceHistory.length} {priceHistory.length === 1 ? "cambio guardado" : "cambios guardados"}</small>
                    <ChevronDown aria-hidden="true" />
                  </summary>
                  <ol>
                    {priceHistory.slice(0, 6).map((entry) => (
                      <li key={entry.id}>
                        <span>{formatDate(entry.changedAt, true)}</span>
                        <span>
                          <del>{formatCurrency(entry.previousPrice, entry.currency || currency)}</del>
                          <ArrowUpRight aria-hidden="true" />
                          <strong>{formatCurrency(entry.newPrice, entry.currency || currency)}</strong>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p>Solo tú puedes ver este historial. Se guarda al cambiar realmente el precio.</p>
                </details>
              ) : null}
            </section>

            <section className="admin-form-section">
              <div className="admin-form-section-heading"><span>04</span><div><h3>Opciones y materiales</h3><p>Ayuda al cliente a pedir justo lo que imagina.</p></div></div>
              <div className="admin-form-grid">
                <Field label="Colores" error={errors.colors} hint="Sepáralos con comas. Ej. Terracota, crema, verde salvia">
                  <input value={form.colors} onChange={(event) => update("colors", event.target.value)} placeholder="Terracota, crema, verde" maxLength={300} />
                </Field>
                <Field label="Tamaños" error={errors.sizes} hint="Sepáralos con comas. Ej. Chico, mediano, grande">
                  <input value={form.sizes} onChange={(event) => update("sizes", event.target.value)} placeholder="Chico, mediano, grande" maxLength={300} />
                </Field>
                <Field label="Materiales" hint="Ej. Hilo de algodón y relleno hipoalergénico" className="is-wide">
                  <input value={form.materials} onChange={(event) => update("materials", event.target.value)} placeholder="Describe los materiales principales" maxLength={500} />
                </Field>
              </div>
              <div className="admin-toggle-stack">
                <Toggle checked={form.customizable} onChange={(value) => update("customizable", value)} label="Esta pieza se puede personalizar" description="La tienda invitará a consultar colores, tamaños u otros detalles por WhatsApp." />
                <Toggle checked={form.featured} onChange={(value) => update("featured", value)} label="Destacar en la portada" description="Aparecerá entre las piezas recomendadas de la tienda." />
                <Toggle checked={form.active} onChange={(value) => update("active", value)} label={form.active ? "Visible en la tienda" : "Guardado como borrador"} description={form.active ? "Al guardar, tus clientes podrán encontrar esta pieza si su categoría también está visible." : "Solo tú podrás verla en el administrador hasta que decidas publicarla."} />
              </div>
            </section>
          </fieldset>

          <footer className="admin-modal-footer">
            {product ? <Button type="button" variant="danger-ghost" icon={Trash2} aria-label={`Eliminar ${product.name}`} disabled={saving || uploading} onClick={() => onDelete(product)}>Eliminar</Button> : <span />}
            <div>
              <Button type="button" variant="secondary" disabled={saving || uploading} onClick={requestClose}>Cancelar</Button>
              <Button type="submit" icon={Save} loading={saving} disabled={uploading || !form.categoryId}>{product ? (form.active ? "Guardar cambios" : "Guardar borrador") : form.active ? "Publicar pieza" : "Guardar borrador"}</Button>
            </div>
          </footer>
        </form>
      </motion.div>
    </div>
    <AnimatePresence>
      {discardDialogOpen ? (
        <ConfirmDialog
          title="¿Descartar los cambios de la pieza?"
          description="Los cambios que hiciste en este formulario se perderán."
          confirmLabel="Descartar cambios"
          tone="normal"
          onConfirm={async () => onClose()}
          onClose={() => setDiscardDialogOpen(false)}
          onError={onError}
        />
      ) : null}
    </AnimatePresence>
    </>
  );
}

function CategoriesPanel({ categories, products, onCreate, onEdit, onDelete }) {
  const sorted = [...categories].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name).localeCompare(String(b.name), "es"));

  return (
    <div className="admin-category-page">
      <section className="admin-page-intro">
        <div>
          <p>Agrupa tus piezas para que sea más sencillo descubrirlas en la tienda.</p>
          <span>{categories.filter((item) => item.active).length} visibles · {categories.length} en total</span>
        </div>
        <Button icon={Plus} aria-label="Nueva categoría" onClick={onCreate}>Nueva categoría</Button>
      </section>

      {!sorted.length ? (
        <section className="admin-panel">
          <EmptyState icon={Tags} title="Ordena tu mundo tejido" text="Crea categorías como Amigurumis, Hogar, Accesorios o Regalos." action={<Button icon={Plus} onClick={onCreate}>Crear categoría</Button>} />
        </section>
      ) : (
        <div className="admin-category-grid">
          {sorted.map((category, index) => {
            const count = products.filter((product) => product.categoryId === category.id).length;
            return (
              <motion.article
                className={classNames("admin-category-card", !category.active && "is-hidden")}
                key={category.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <header>
                  <span className="admin-category-icon">{categoryIconSymbol(category.icon)}</span>
                  <span className={classNames("admin-visibility-dot", category.active && "is-visible")}>{category.active ? "Visible" : "Oculta"}</span>
                </header>
                <div>
                  <p>Posición {index + 1}</p>
                  <h2>{category.name}</h2>
                  <span className="admin-category-slug">ID interno: {category.slug || "categoria"}</span>
                  <p className="admin-category-description">{category.description || "Sin descripción todavía."}</p>
                </div>
                <footer>
                  <span><Package /> {count} {count === 1 ? "producto" : "productos"}</span>
                  <div>
                    <IconButton label={`Editar ${category.name}`} onClick={() => onEdit(category)}><Pencil /></IconButton>
                    <IconButton label={`Eliminar ${category.name}`} variant="danger" onClick={() => onDelete(category)}><Trash2 /></IconButton>
                  </div>
                </footer>
              </motion.article>
            );
          })}
          <button className="admin-add-category-card" onClick={onCreate}>
            <span><Plus /></span><strong>Crear categoría</strong><small>Agrega una nueva forma de explorar</small>
          </button>
        </div>
      )}

      <section className="admin-tip-card">
        <span><Sparkles /></span>
        <div><strong>Un catálogo simple vende mejor</strong><p>Usa pocas categorías claras. Entre 3 y 6 suele ser suficiente para que tus clientes encuentren lo que buscan.</p></div>
      </section>
    </div>
  );
}

function CategoryModal({ category, productCount, onClose, onSave, onDelete, onError, fallbackFocusRef }) {
  const initialFormRef = useRef({
    name: category?.name || "",
    slug: category?.slug || "",
    description: category?.description || "",
    icon: category?.icon || "yarn",
    active: category ? Boolean(category.active) : true,
    order: category?.order ?? 0,
  });
  const [form, setForm] = useState(initialFormRef.current);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const categorySnapshot = (value) => JSON.stringify({ ...value, order: String(value.order) });
  const dirty = categorySnapshot(form) !== categorySnapshot(initialFormRef.current);
  useUnsavedChangesWarning(dirty);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty) setDiscardDialogOpen(true);
    else onClose();
  }, [dirty, onClose, saving]);

  const dialogRef = useAccessibleDialog({ onClose: requestClose, canClose: !saving, fallbackFocusRef });

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const nextErrors = {};
    if (form.name.trim().length < 2) nextErrors.name = "Escribe un nombre de al menos 2 caracteres.";
    if (!Number.isInteger(Number(form.order)) || Number(form.order) < 0 || Number(form.order) > 10_000) nextErrors.order = "Usa un número entero entre 0 y 10,000.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      focusFirstInvalid(event.currentTarget);
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        ...(sanitizeSlug(form.slug) ? { slug: sanitizeSlug(form.slug) } : {}),
        description: form.description.trim(),
        icon: form.icon,
        active: form.active,
        order: Number(form.order),
      }, category?.id);
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div className="admin-modal-layer" role="presentation">
      <motion.button type="button" className="admin-modal-backdrop" aria-hidden="true" tabIndex={-1} onClick={requestClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div ref={dialogRef} className="admin-small-modal" role="dialog" aria-modal="true" aria-labelledby="category-modal-title" aria-describedby="category-modal-description" tabIndex={-1} initial={{ opacity: 0, y: 22, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}>
        <form onSubmit={submit}>
          <header className="admin-modal-header">
            <div><p className="admin-eyebrow">{category ? "Editar categoría" : "Nueva categoría"}</p><h2 id="category-modal-title">{category ? category.name : "Organiza tus piezas"}</h2><p id="category-modal-description">Define cómo se agrupan las piezas del catálogo.</p></div>
            <IconButton type="button" label="Cerrar" disabled={saving} onClick={requestClose}><X /></IconButton>
          </header>
          <fieldset className="admin-small-modal-body admin-modal-fields" disabled={saving} aria-busy={saving}>
            <FieldGroup label="Ícono">
              <div className="admin-icon-picker">
                {CATEGORY_ICON_OPTIONS.map((icon) => <button type="button" key={icon.value} className={form.icon === icon.value ? "is-selected" : ""} onClick={() => update("icon", icon.value)} aria-label={icon.label} aria-pressed={form.icon === icon.value} title={icon.label}>{icon.symbol}</button>)}
              </div>
            </FieldGroup>
            <Field label="Nombre" error={errors.name} required>
              <input data-dialog-initial-focus value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Ej. Amigurumis" maxLength={80} />
            </Field>
            <Field label="Identificador interno" hint="Opcional; ayuda a organizar los datos y se genera con el nombre si queda vacío.">
              <span className="admin-slug-input"><span>ID</span><input value={form.slug} onChange={(event) => update("slug", event.target.value.toLowerCase().replace(/[^a-z0-9áéíóúüñ-]/gi, "-"))} placeholder="amigurumis" maxLength={100} /></span>
            </Field>
            <Field label="Descripción" hint={`${form.description.length}/300 caracteres`}>
              <textarea rows={3} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Una breve guía de lo que encontrará el cliente…" maxLength={300} />
            </Field>
            <Field label="Prioridad" error={errors.order} hint="Las categorías con el número más bajo aparecen primero.">
              <input type="number" min="0" max="10000" step="1" value={form.order} onChange={(event) => update("order", event.target.value)} />
            </Field>
            <Toggle checked={form.active} onChange={(value) => update("active", value)} label="Visible en la tienda" description={productCount ? (productCount === 1 ? "Si la ocultas, su producto dejará de verse en la tienda." : `Si la ocultas, sus ${productCount} productos dejarán de verse en la tienda.`) : "Puedes ocultarla sin eliminarla."} />
            {category?.active && !form.active && productCount ? <div className="admin-inline-alert is-warm" role="alert"><AlertCircle /><span>Esta categoría contiene {productCount} {productCount === 1 ? "producto vinculado" : "productos vinculados"}. Ninguno será visible mientras la categoría permanezca oculta.</span></div> : null}
          </fieldset>
          <footer className="admin-modal-footer">
            {category ? <Button type="button" variant="danger-ghost" icon={Trash2} aria-label={`Eliminar ${category.name}`} disabled={saving} onClick={() => onDelete(category)}>Eliminar</Button> : <span />}
            <div><Button type="button" variant="secondary" disabled={saving} onClick={requestClose}>Cancelar</Button><Button type="submit" icon={Save} loading={saving}>Guardar</Button></div>
          </footer>
        </form>
      </motion.div>
    </div>
    <AnimatePresence>
      {discardDialogOpen ? (
        <ConfirmDialog
          title="¿Descartar los cambios de la categoría?"
          description="Los cambios que hiciste en este formulario se perderán."
          confirmLabel="Descartar cambios"
          tone="normal"
          onConfirm={async () => onClose()}
          onClose={() => setDiscardDialogOpen(false)}
          onError={onError}
        />
      ) : null}
    </AnimatePresence>
    </>
  );
}

function InquiriesPanel({ inquiries, currency, onStatusChange, onDelete }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [expanded, setExpanded] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return [...inquiries]
      .filter((inquiry) => {
        const matchesSearch = !query || [inquiry.customerName, inquiry.note, inquiry.id]
          .some((value) => String(value || "").toLocaleLowerCase("es").includes(query));
        const matchesStatus = status === "all"
          || (status === "open" && !["completed", "archived"].includes(inquiry.status))
          || inquiry.status === status;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [inquiries, search, status]);

  const changeStatus = async (inquiry, nextStatus) => {
    if (nextStatus === inquiry.status) return;
    setUpdatingId(inquiry.id);
    try {
      await onStatusChange(inquiry, nextStatus);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="admin-inquiries-page">
      <section className="admin-page-intro">
        <div>
          <p>Aquí se guardan las intenciones de compra iniciadas desde la tienda.</p>
          <span>Una solicitud no se considera confirmada hasta que tú cambies su estado.</span>
        </div>
      </section>

      <section className="admin-inquiry-summary">
        {Object.entries(INQUIRY_STATUSES).slice(0, 4).map(([key, item]) => (
          <button key={key} className={status === key ? "is-active" : ""} aria-pressed={status === key} onClick={() => setStatus(status === key ? "all" : key)}>
            <span className={classNames("admin-summary-dot", `is-${item.tone}`)} />
            <strong>{inquiries.filter((inquiry) => inquiry.status === key).length}</strong>
            <small>{item.label}</small>
          </button>
        ))}
      </section>

      <section className="admin-toolbar">
        <div className="admin-searchbox">
          <Search />
          <input aria-label="Buscar solicitudes" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, nota o folio…" />
          {search ? <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch("")}><X /></button> : null}
        </div>
        <label className="admin-select-wrap">
          <span className="admin-sr-only">Filtrar solicitudes</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="open">Abiertas</option>
            <option value="all">Todas las solicitudes</option>
            {Object.entries(INQUIRY_STATUSES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select>
          <ChevronDown />
        </label>
      </section>

      {!inquiries.length ? (
        <section className="admin-panel">
          <EmptyState icon={MessageCircle} title="Las nuevas solicitudes aparecerán aquí" text="Cuando un cliente arme su lista y abra WhatsApp desde la tienda, podrás darle seguimiento desde este panel." />
        </section>
      ) : !filtered.length ? (
        <section className="admin-panel">
          <EmptyState icon={Search} title="No hay solicitudes con este filtro" text="Cambia el estado o limpia la búsqueda para ver otros resultados." action={<Button variant="secondary" onClick={() => { setSearch(""); setStatus("all"); }}>Ver todas</Button>} />
        </section>
      ) : (
        <section className="admin-inquiry-list">
          {filtered.map((inquiry, index) => {
            const isExpanded = expanded === inquiry.id;
            const itemCount = (inquiry.items || []).reduce((total, item) => total + (Number(item.quantity ?? item.qty) || 1), 0);
            return (
              <motion.article className={classNames("admin-inquiry-card", isExpanded && "is-expanded")} key={inquiry.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.03 }}>
                <div className="admin-inquiry-row">
                  <button className="admin-inquiry-customer" onClick={() => setExpanded(isExpanded ? null : inquiry.id)} aria-expanded={isExpanded}>
                    <span className="admin-customer-avatar">{(inquiry.customerName || "C").slice(0, 1).toUpperCase()}</span>
                    <span>
                      <strong>{inquiry.customerName || "Cliente sin nombre"}</strong>
                      <small><CalendarDays /> {formatDate(inquiry.createdAt, true)} · Folio {String(inquiry.id).slice(-6).toUpperCase()}</small>
                    </span>
                  </button>
                  <span className="admin-inquiry-items"><ShoppingBag /> <strong>{itemCount}</strong> {itemCount === 1 ? "pieza" : "piezas"}</span>
                  <span className="admin-inquiry-total"><small>Total estimado</small><strong>{formatCurrency(inquiry.estimatedTotal, inquiry.currency || currency)}</strong></span>
                  <label className="admin-status-select">
                    {updatingId === inquiry.id ? <Spinner /> : <span className={classNames("admin-summary-dot", `is-${INQUIRY_STATUSES[inquiry.status]?.tone || "neutral"}`)} />}
                    <select value={inquiry.status || "whatsapp_opened"} disabled={updatingId === inquiry.id} onChange={(event) => changeStatus(inquiry, event.target.value)} aria-label={`Estado de la solicitud de ${inquiry.customerName || "cliente"}`}>
                      {Object.entries(INQUIRY_STATUSES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
                    </select>
                    <ChevronDown />
                  </label>
                  <IconButton label={isExpanded ? "Ocultar detalle" : "Ver detalle"} onClick={() => setExpanded(isExpanded ? null : inquiry.id)}><ChevronDown className={isExpanded ? "is-rotated" : ""} /></IconButton>
                </div>

                <AnimatePresence initial={false}>
                  {isExpanded ? (
                    <motion.div className="admin-inquiry-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                      <div className="admin-inquiry-detail-inner">
                        <div className="admin-inquiry-products">
                          <h3>Piezas consultadas</h3>
                          {(inquiry.items || []).length ? inquiry.items.map((item, itemIndex) => {
                            const quantity = Number(item.quantity ?? item.qty) || 1;
                            const image = normalizeImage(item.image || item.images?.[0]);
                            const options = [item.color, item.size, ...(Array.isArray(item.options) ? item.options : [])].filter(Boolean);
                            return (
                              <div className="admin-inquiry-product" key={`${item.productId || item.id || "item"}-${itemIndex}`}>
                                <span className="admin-inquiry-product-image">{image ? <img src={image} alt="" /> : <Package />}</span>
                                <span><strong>{item.name || item.productName || "Pieza personalizada"}</strong><small>{options.length ? options.join(" · ") : "Sin variantes seleccionadas"}</small></span>
                                <span><small>Cantidad</small><strong>{quantity}</strong></span>
                                <span><small>Subtotal</small><strong>{formatCurrency(Number(item.lineTotal) || ((Number(item.price ?? item.unitPrice) || 0) * quantity), inquiry.currency || currency)}</strong></span>
                              </div>
                            );
                          }) : <p className="admin-muted-copy">Esta solicitud no incluye un detalle de piezas.</p>}
                        </div>
                        <aside className="admin-inquiry-note">
                          <h3>Nota del cliente</h3>
                          <p>{inquiry.note || "No agregó una nota."}</p>
                          <div className="admin-inquiry-meta"><span><UserRound /> Cliente</span><strong>{inquiry.customerName || "Sin nombre"}</strong></div>
                          <div className="admin-inquiry-meta"><Clock3 /><span>El botón de WhatsApp fue abierto; esto no garantiza que el mensaje haya sido enviado.</span></div>
                          <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={() => onDelete(inquiry)}>Eliminar solicitud</Button>
                        </aside>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function SettingsPanel({ mode, settings, productCount = 0, onSave, onError, onDirtyChange }) {
  const { theme } = useTheme();
  const [form, setForm] = useState(() => ({ ...DEFAULT_SETTINGS, ...settings }));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [currencyConfirmed, setCurrencyConfirmed] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }));

  useEffect(() => {
    const next = { ...DEFAULT_SETTINGS, ...settings };
    setForm(next);
    setSavedSnapshot(JSON.stringify(next));
    setPrivacyConfirmed(false);
    setCurrencyConfirmed(false);
  }, [settings]);

  const dirty = JSON.stringify(form) !== savedSnapshot;
  const savedCurrency = JSON.parse(savedSnapshot).currency || "MXN";
  const currencyChanged = form.currency !== savedCurrency;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    if (field === "city" || field === "pickupLabel") {
      setPrivacyConfirmed(false);
      setErrors((current) => ({ ...current, privacyConfirm: "" }));
    }
    if (field === "currency") {
      setCurrencyConfirmed(false);
      setErrors((current) => ({ ...current, currencyConfirm: "" }));
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const nextErrors = {};

    if (form.storeName.trim().length < 2) nextErrors.storeName = "Escribe un nombre de al menos 2 caracteres.";
    if (form.heroTitle.trim().length < 2) nextErrors.heroTitle = "Agrega un título de al menos 2 caracteres.";
    if (form.pickupLabel.trim().length < 2) nextErrors.pickupLabel = "Explica brevemente cómo se acuerda la recogida.";
    if (form.whatsappNumber.trim() && !isValidWhatsapp(form.whatsappNumber)) {
      nextErrors.whatsappNumber = "Usa entre 8 y 15 dígitos e incluye el código de país.";
    }
    if (!/^#[0-9a-f]{6}$/i.test(form.accentColor)) nextErrors.accentColor = "Usa un color hexadecimal válido.";
    if (mode === "business" && !privacyConfirmed) {
      nextErrors.privacyConfirm = "Confirma que no incluiste una ubicación exacta antes de guardar.";
    }
    if (mode === "business" && productCount > 0 && currencyChanged && !currencyConfirmed) {
      nextErrors.currencyConfirm = "Confirma que revisaste los precios antes de cambiar la moneda.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      focusFirstInvalid(event.currentTarget);
      return;
    }

    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.keys(DEFAULT_SETTINGS).map((key) => [key, typeof form[key] === "string" ? form[key].trim() : form[key]]),
      );
      const saved = await onSave(payload);
      const next = { ...DEFAULT_SETTINGS, ...saved };
      setForm(next);
      setSavedSnapshot(JSON.stringify(next));
      setPrivacyConfirmed(false);
      setCurrencyConfirmed(false);
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm(JSON.parse(savedSnapshot));
    setPrivacyConfirmed(false);
    setCurrencyConfirmed(false);
    setErrors({});
  };
  const normalizedWhatsappDigits = whatsappDigits(form.whatsappNumber);
  const whatsappReady = isValidWhatsapp(form.whatsappNumber);
  const previewAccent = createAccessibleAccentPalette(form.accentColor, theme);

  return (
    <form className="admin-settings-page" onSubmit={submit} aria-busy={saving}>
      <fieldset className="admin-settings-fieldset" disabled={saving}>
      <section className="admin-page-intro">
        <div>
          <p>{mode === "content" ? "Dale voz a tu marca y cuenta qué hace especiales tus tejidos." : "Define cómo pueden contactarte y dónde entregas, sin publicar tu domicilio."}</p>
          <span>{mode === "content" ? "Todo este contenido será público en la tienda." : "La ubicación exacta se acuerda siempre de forma privada."}</span>
        </div>
        <div className="admin-settings-actions">
          {dirty ? <span className="admin-unsaved-pill" role="status">Cambios sin guardar</span> : null}
          {dirty ? <Button type="button" variant="ghost" onClick={reset}>Descartar</Button> : null}
          <Button type="submit" icon={Save} loading={saving} disabled={!dirty}>Guardar cambios</Button>
        </div>
      </section>

      {mode === "content" ? (
        <div className="admin-settings-layout">
          <div className="admin-settings-stack">
            <section className="admin-settings-card">
              <div className="admin-settings-card-title"><span><Store /></span><div><h2>Identidad de tu marca</h2><p>El nombre y la frase que acompañan a Casa Hebra.</p></div></div>
              <div className="admin-form-grid">
                <Field label="Nombre de la tienda" error={errors.storeName} required>
                  <input value={form.storeName} onChange={(event) => update("storeName", event.target.value)} maxLength={80} />
                </Field>
                <Field label="Frase de marca" hint={`${form.tagline.length}/140`}>
                  <input value={form.tagline} onChange={(event) => update("tagline", event.target.value)} placeholder="Hecho a mano, punto por punto." maxLength={140} />
                </Field>
                <Field label="Anuncio superior" hint="Déjalo vacío si no quieres mostrar un aviso." className="is-wide">
                  <input value={form.announcement} onChange={(event) => update("announcement", event.target.value)} placeholder="Ej. Agenda abierta para regalos de octubre" maxLength={180} />
                </Field>
              </div>
            </section>

            <section className="admin-settings-card">
              <div className="admin-settings-card-title"><span><Sparkles /></span><div><h2>Portada de la tienda</h2><p>Tu bienvenida: breve, cálida y fácil de recordar.</p></div></div>
              <div className="admin-form-grid">
                <Field label="Título principal" error={errors.heroTitle} required className="is-wide">
                  <input value={form.heroTitle} onChange={(event) => update("heroTitle", event.target.value)} maxLength={140} />
                </Field>
                <Field label="Texto de introducción" hint={`${form.heroText.length}/360 caracteres`} className="is-wide">
                  <textarea value={form.heroText} onChange={(event) => update("heroText", event.target.value)} rows={4} maxLength={360} />
                </Field>
              </div>
            </section>

            <section className="admin-settings-card">
              <div className="admin-settings-card-title"><span><WandSparkles /></span><div><h2>Tu historia</h2><p>Comparte quién teje y qué inspira cada creación.</p></div></div>
              <Field label="Historia de la marca" hint={`${form.story.length}/2000 caracteres`}>
                <textarea value={form.story} onChange={(event) => update("story", event.target.value)} rows={8} placeholder="Todo comenzó con un ovillo, una idea y muchas ganas de crear…" maxLength={2000} />
              </Field>
            </section>

            <section className="admin-settings-card">
              <div className="admin-settings-card-title"><span><Palette /></span><div><h2>Color de acento</h2><p>El detalle de color que identifica a tu tienda.</p></div></div>
              <div className="admin-color-setting">
                <input type="color" value={safeAccent(form.accentColor)} onChange={(event) => update("accentColor", event.target.value.toUpperCase())} aria-label="Elegir color" />
                <Field label="Código de color" error={errors.accentColor}>
                  <input value={form.accentColor} onChange={(event) => update("accentColor", event.target.value)} maxLength={7} />
                </Field>
                <div className="admin-color-swatches">
                  {["#963D64", "#39766D", "#705995", "#A4774D", "#426D88"].map((color) => <button type="button" key={color} style={{ background: color }} className={form.accentColor.toUpperCase() === color ? "is-selected" : ""} onClick={() => update("accentColor", color)} aria-label={`Usar color ${color}`} aria-pressed={form.accentColor.toUpperCase() === color} />)}
                </div>
              </div>
              {previewAccent.adjusted ? <p className="admin-contrast-note"><ShieldCheck /> El tono de los botones se ajusta ligeramente para mantener el texto legible.</p> : null}
            </section>
          </div>

          <aside className="admin-live-preview-wrap">
            <div className="admin-live-preview-label"><Eye /> Vista previa aproximada</div>
            <div className="admin-live-preview" style={{ "--preview-accent": previewAccent.accent, "--preview-on-accent": previewAccent.onAccent }}>
              {form.announcement ? <div className="admin-preview-announcement">{form.announcement}</div> : null}
              <div className="admin-preview-nav"><YarnMark small /><strong>{form.storeName || "Tu tienda"}</strong><span>Catálogo</span><i /></div>
              <div className="admin-preview-hero">
                <span>HECHO CON CALMA</span>
                <h3>{form.heroTitle || "El título de tu portada"}</h3>
                <p>{form.heroText || "Aquí aparecerá el texto de bienvenida para tus clientes."}</p>
                <button type="button">Explorar piezas <ArrowUpRight /></button>
              </div>
              <svg viewBox="0 0 360 90"><path d="M-10 65c78-4 63-55 141-48 79 8 70 66 151 51 43-8 50-37 91-34" /></svg>
            </div>
            <a href="/" target="_blank" rel="noreferrer">Abrir la tienda completa <ExternalLink /></a>
          </aside>
        </div>
      ) : (
        <div className="admin-settings-layout">
          <div className="admin-settings-stack">
            <section className="admin-settings-card is-whatsapp">
              <div className="admin-settings-card-title"><span><MessageCircle /></span><div><h2>WhatsApp para solicitudes</h2><p>Los mensajes preparados por la tienda llegarán a este número.</p></div></div>
              <Field label="Número de WhatsApp" error={errors.whatsappNumber} hint="Incluye código de país. Para México: 52 + 10 dígitos.">
                <span className="admin-phone-input"><Phone /><input type="tel" inputMode="tel" value={form.whatsappNumber} onChange={(event) => update("whatsappNumber", event.target.value)} placeholder="+5219811681460" maxLength={24} /></span>
              </Field>
              {whatsappReady ? (
                <div className="admin-whatsapp-ready"><CheckCircle2 /><div><strong>Canal listo</strong><span>Las solicitudes se dirigirán a +{normalizedWhatsappDigits}</span></div><a href={`https://wa.me/${normalizedWhatsappDigits}`} target="_blank" rel="noreferrer">Probar <ExternalLink /></a></div>
              ) : (
                <div className="admin-inline-alert is-warm"><AlertCircle /><span>Hasta que agregues un número válido, el botón de WhatsApp estará desactivado en la tienda.</span></div>
              )}
            </section>

            <section className="admin-settings-card">
              <div className="admin-settings-card-title"><span><MapPin /></span><div><h2>Recogida local</h2><p>Solo publica la zona general. El punto exacto se acuerda por privado.</p></div></div>
              <div className="admin-privacy-notice"><ShieldCheck /><div><strong>Tu domicilio no se publica</strong><p>Casa Hebra nunca solicita una dirección particular. Comparte ubicación y horario únicamente por WhatsApp cuando la solicitud esté confirmada.</p></div></div>
              <div className="admin-form-grid">
                <Field label="Ciudad o zona general">
                  <input value={form.city} onChange={(event) => update("city", event.target.value)} placeholder="Ej. Campeche, Campeche" maxLength={120} />
                </Field>
                <Field label="Moneda">
                  <span className="admin-select-wrap is-full"><select value={form.currency} onChange={(event) => update("currency", event.target.value)}><option value="MXN">MXN — Peso mexicano</option><option value="USD">USD — Dólar estadounidense</option></select><ChevronDown /></span>
                </Field>
                <Field label="Mensaje de recogida" error={errors.pickupLabel} hint={`${form.pickupLabel.length}/240 caracteres`} className="is-wide" required>
                  <textarea value={form.pickupLabel} onChange={(event) => update("pickupLabel", event.target.value)} rows={3} maxLength={240} />
                </Field>
              </div>
              {currencyChanged && productCount > 0 ? (
                <>
                  <div className="admin-inline-alert is-warm admin-currency-warning" role="alert"><AlertCircle /><span>Cambiar de {savedCurrency} a {form.currency} no convierte importes. Revisa los precios de tus {productCount} {productCount === 1 ? "producto" : "productos"} antes de publicar el cambio.</span></div>
                  <label className={classNames("admin-privacy-confirm", errors.currencyConfirm && "has-error")}>
                    <input
                      type="checkbox"
                      checked={currencyConfirmed}
                      aria-required="true"
                      aria-invalid={Boolean(errors.currencyConfirm)}
                      aria-describedby={errors.currencyConfirm ? "admin-currency-confirm-error" : undefined}
                      onChange={(event) => {
                        setCurrencyConfirmed(event.target.checked);
                        setErrors((current) => ({ ...current, currencyConfirm: "" }));
                      }}
                    />
                    <span aria-hidden="true">{currencyConfirmed ? <Check /> : null}</span>
                    <strong>Confirmo que revisaré los precios: solo cambiará la moneda mostrada, no los valores.</strong>
                  </label>
                  {errors.currencyConfirm ? <small id="admin-currency-confirm-error" className="admin-privacy-confirm-error" role="alert">{errors.currencyConfirm}</small> : null}
                </>
              ) : null}
              <label className={classNames("admin-privacy-confirm", errors.privacyConfirm && "has-error")}>
                <input
                  type="checkbox"
                  checked={privacyConfirmed}
                  aria-required="true"
                  aria-invalid={Boolean(errors.privacyConfirm)}
                  aria-describedby={errors.privacyConfirm ? "admin-privacy-confirm-error" : undefined}
                  onChange={(event) => {
                    setPrivacyConfirmed(event.target.checked);
                    setErrors((current) => ({ ...current, privacyConfirm: "" }));
                  }}
                />
                <span aria-hidden="true">{privacyConfirmed ? <Check /> : null}</span>
                <strong>Confirmo que aquí no incluí mi domicilio, referencias ni ubicación exacta.</strong>
              </label>
              {errors.privacyConfirm ? <small id="admin-privacy-confirm-error" className="admin-privacy-confirm-error" role="alert">{errors.privacyConfirm}</small> : null}
            </section>

            <section className="admin-settings-card">
              <div className="admin-settings-card-title"><span><Clock3 /></span><div><h2>Contacto y horario</h2><p>Información útil para establecer expectativas claras.</p></div></div>
              <div className="admin-form-grid">
                <Field label="Instagram" hint="Usuario o enlace completo">
                  <span className="admin-input-with-icon"><Instagram /><input value={form.instagram} onChange={(event) => update("instagram", event.target.value)} placeholder="@casahebra" maxLength={160} /></span>
                </Field>
                <Field label="Horario de atención">
                  <span className="admin-input-with-icon"><Clock3 /><input value={form.businessHours} onChange={(event) => update("businessHours", event.target.value)} placeholder="Lun a sáb · 10:00 a 18:00" maxLength={180} /></span>
                </Field>
              </div>
            </section>
          </div>

          <aside className="admin-business-aside">
            <section className="admin-settings-summary-card">
              <span className="admin-kicker"><Store /> Información pública</span>
              <h3>Así aparecerá tu entrega</h3>
              <div><MapPin /><span><small>Zona de recogida</small><strong>{form.city || "Aún sin configurar"}</strong></span></div>
              <div><Clock3 /><span><small>Horario</small><strong>{form.businessHours || "Se acuerda por WhatsApp"}</strong></span></div>
              <p>{form.pickupLabel || DEFAULT_SETTINGS.pickupLabel}</p>
            </section>
            <section className="admin-help-card"><span><ShieldCheck /></span><h3>Una entrega segura</h3><p>Confirma la solicitud antes de compartir el punto. Acuerda un horario y evita mostrar tu domicilio en textos o fotografías del catálogo.</p></section>
          </aside>
        </div>
      )}

      <AnimatePresence>
        {dirty ? (
          <motion.div className="admin-mobile-savebar" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}>
            <span>Tienes cambios sin guardar</span>
            <Button type="submit" size="sm" icon={Save} loading={saving}>Guardar</Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      </fieldset>
    </form>
  );
}

function ConfirmDialog({ title, description, confirmLabel, tone = "danger", icon: DialogIcon, disabled, fallbackFocusRef, onConfirm, onClose, onError }) {
  const [loading, setLoading] = useState(false);
  const dialogRef = useAccessibleDialog({ onClose, canClose: !loading, fallbackFocusRef });

  const confirm = async () => {
    if (loading || disabled) return;
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-confirm-layer">
      <motion.button type="button" className="admin-modal-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => !loading && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div ref={dialogRef} className="admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" tabIndex={-1} initial={{ opacity: 0, scale: 0.94, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}>
        <span className={classNames("admin-confirm-icon", tone === "normal" && "is-normal")}>{DialogIcon ? <DialogIcon /> : tone === "normal" ? <LogOut /> : <AlertCircle />}</span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description">{description}</p>
        {disabled ? <div className="admin-inline-alert is-warm"><AlertCircle /><span>Primero desvincula los productos para continuar.</span></div> : null}
        <div><Button variant="secondary" data-dialog-initial-focus disabled={loading} onClick={onClose}>Cancelar</Button><Button variant={tone === "normal" ? "primary" : "danger"} loading={loading} disabled={disabled} onClick={confirm}>{confirmLabel}</Button></div>
      </motion.div>
    </div>
  );
}

export default AdminApp;
