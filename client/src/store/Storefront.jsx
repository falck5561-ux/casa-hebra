import { Check, MessageCircle, ShoppingBag, X } from "lucide-react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAccessibleAccentPalette, useTheme } from "../lib/theme";
import { Header } from "./components/Brand";
import { Catalogue } from "./components/Catalogue";
import { ProductCustomizer } from "./components/Customizer";
import { BackToTop, StitchProgress } from "./components/Ambience";
import { InquiryDrawer, ProductModal } from "./components/Overlays";
import {
  FAQ,
  Footer,
  Hero,
  Process,
  Story,
  TrustStrip,
} from "./components/Sections";
import { useInquiryBag } from "./hooks/useInquiryBag";
import { useStore } from "./hooks/useStore";
import {
  buildBagMessage,
  buildCustomMessage,
  hasValidWhatsApp,
  whatsappUrl,
} from "./utils";
import "./store.css";
import "./store-v4.css";
import "./store-atelier.css";
import "./store-final.css";

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim();
}

function canonicalVariant(options, requested) {
  const available = Array.isArray(options)
    ? options.map((option) => String(option || "").trim()).filter(Boolean)
    : [];
  if (!available.length) return "";
  if (available.includes(requested)) return requested;
  return available.find((option) => /elegir|personaliz|otro/i.test(option)) || available[0];
}

function safeWhatsAppUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    const hostname = parsed.hostname.toLowerCase();
    const allowedHosts = new Set(["wa.me", "www.wa.me", "api.whatsapp.com"]);
    return parsed.protocol === "https:" && allowedHosts.has(hostname)
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
}

function openWhatsAppPlaceholder(theme) {
  const popup = window.open("about:blank", "_blank");
  if (!popup) return null;

  try {
    popup.opener = null;
    popup.document.title = "Preparando WhatsApp…";
    popup.document.body.textContent = "Estamos preparando tu mensaje seguro…";
    const isDark = theme === "dark";
    popup.document.body.style.cssText = [
      "margin:0",
      "min-height:100vh",
      "display:grid",
      "place-items:center",
      "padding:24px",
      "box-sizing:border-box",
      `background:${isDark ? "#131210" : "#FBF8F3"}`,
      `color:${isDark ? "#F8F1E9" : "#2F211D"}`,
      "font:600 16px system-ui",
      "text-align:center",
    ].join(";");
  } catch {
    // The placeholder can still be navigated if the browser hides its document.
  }

  return popup;
}

function closePlaceholder(popup) {
  try {
    if (popup && !popup.closed) popup.close();
  } catch {
    // A browser extension may prevent inspecting or closing the placeholder.
  }
}

function navigateToWhatsApp(popup, url) {
  try {
    if (popup && !popup.closed) {
      popup.location.replace(url);
      return;
    }
  } catch {
    // Fall back to the current tab if the placeholder cannot be navigated.
  }
  window.location.assign(url);
}

function shouldRefreshCatalogue(error) {
  if (error.code === "WHATSAPP_NOT_CONFIGURED") return true;
  if (error.status < 400 || error.status >= 500) return false;
  const signal = `${error.code || ""} ${error.field || ""} ${error.message || ""}`;
  return /items|producto|precio|cantidad|existencia|stock|disponib|color|talla|tama(?:n|ñ)o/i.test(
    signal,
  );
}

async function saveInquiry(body) {
  let response;
  try {
    response = await fetch("/api/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (cause) {
    const error = new Error(
      "No pudimos conectar con la tienda. Abriremos un mensaje estimado para que puedas continuar.",
      { cause },
    );
    error.status = 0;
    error.allowLocalFallback = true;
    throw error;
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // The status below determines whether a local WhatsApp fallback is safe.
  }

  if (!response.ok) {
    const error = new Error(
      payload.message ||
        payload.error ||
        (response.status >= 500
          ? "La tienda no pudo registrar la solicitud en este momento."
          : "No pudimos validar tu solicitud."),
    );
    error.status = response.status;
    error.code = payload.code || "";
    error.field = payload.details?.field || "";
    error.allowLocalFallback =
      response.status >= 500 &&
      (!error.code || error.code === "INTERNAL_ERROR");
    throw error;
  }

  return payload;
}

export function Storefront() {
  const { theme } = useTheme();
  const prefersReducedMotion = useReducedMotion();
  const {
    settings,
    categories,
    products,
    retentionDays,
    loading,
    error,
    retry,
  } = useStore();
  const bag = useInquiryBag(products, !loading && !error);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const dialogOpen = Boolean(selectedProduct) || bagOpen;

  useEffect(
    () => () => window.clearTimeout(toastTimer.current),
    [],
  );

  useEffect(() => {
    const storeName = settings.storeName || "Casa Hebra";
    document.title = `${storeName} · Crochet hecho a mano`;
    const description = document.querySelector('meta[name="description"]');
    if (description && settings.heroText) {
      description.setAttribute("content", settings.heroText.slice(0, 155));
    }
  }, [settings.heroText, settings.storeName]);

  const accentColor = /^#[\da-f]{6}$/i.test(settings.accentColor || "")
    ? settings.accentColor
    : "#963D64";
  const accentPalette = createAccessibleAccentPalette(accentColor, theme);

  const filteredProducts = useMemo(() => {
    const needle = normalizeSearch(query);
    const result = products.filter((product) => {
      const inCategory = category === "all" || String(product.categoryId) === String(category);
      if (!inCategory) return false;
      if (!needle) return true;
      const haystack = normalizeSearch(
        [
          product.name,
          product.shortDescription,
          product.description,
          product.materials,
          ...(product.colors || []),
          ...(product.sizes || []),
        ].join(" "),
      );
      return haystack.includes(needle);
    });

    return result.sort((left, right) => {
      if (sort === "price-asc") return Number(left.price) - Number(right.price);
      if (sort === "price-desc") return Number(right.price) - Number(left.price);
      if (sort === "name") return left.name.localeCompare(right.name, "es");
      if (sort === "newest") return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
      return Number(Boolean(right.featured)) - Number(Boolean(left.featured));
    });
  }, [category, products, query, sort]);

  const closeProduct = useCallback(() => setSelectedProduct(null), []);
  const closeBag = useCallback(() => setBagOpen(false), []);

  function dismissToast() {
    window.clearTimeout(toastTimer.current);
    setToast("");
  }

  function scheduleToastDismiss(delay = 7000) {
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), delay);
  }

  function showToast(message) {
    setToast(message);
    scheduleToastDismiss();
  }

  function openProduct(product) {
    dismissToast();
    setSelectedProduct(product);
  }

  function openBag() {
    dismissToast();
    setBagOpen(true);
  }

  function addToBag(product, selection) {
    const result = bag.addItem(product, selection);
    if (!result.added && result.reason === "line_limit") {
      return {
        added: false,
        message: "Tu selección admite hasta 20 variantes. Quita una para agregar otra.",
      };
    }
    if (!result.added && result.reason === "stock_limit") {
      return {
        added: false,
        message: `Ya seleccionaste el máximo disponible de ${product.name}.`,
      };
    }
    showToast(`${product.name} se agregó a tu selección`);
    return { added: true };
  }

  async function openCanonicalInquiry({
    body,
    fallbackUrl,
    fallbackNotice,
    successNotice,
  }) {
    const popup = openWhatsAppPlaceholder(theme);

    try {
      const payload = await saveInquiry(body);
      const canonicalUrl = safeWhatsAppUrl(payload.whatsappUrl);
      if (!canonicalUrl) {
        const contractError = new Error(
          "La tienda respondió sin un enlace válido de WhatsApp. Inténtalo nuevamente.",
        );
        contractError.status = 200;
        throw contractError;
      }
      navigateToWhatsApp(popup, canonicalUrl);
      showToast(successNotice(payload));
      return payload;
    } catch (error) {
      if (error.allowLocalFallback) {
        navigateToWhatsApp(popup, fallbackUrl);
        showToast(fallbackNotice);
        return { usedLocalFallback: true };
      }

      closePlaceholder(popup);
      if (shouldRefreshCatalogue(error)) retry();
      throw error;
    }
  }

  async function submitBag({ customerName, note, privacyAccepted }) {
    if (!hasValidWhatsApp(settings.whatsappNumber)) {
      throw new Error("El WhatsApp de la tienda aún no está configurado.");
    }
    if (!privacyAccepted) {
      throw new Error("Acepta el aviso de privacidad para continuar.");
    }

    const message = buildBagMessage({
      settings,
      customerName,
      note,
      items: bag.items,
      total: bag.estimatedTotal,
    });
    const localTotal = bag.estimatedTotal;

    return openCanonicalInquiry({
      body: {
        customerName,
        note,
        privacyAccepted: true,
        items: bag.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          color: item.color,
          size: item.size,
        })),
      },
      fallbackUrl: whatsappUrl(settings.whatsappNumber, message),
      fallbackNotice:
        "No pudimos registrar la solicitud. Abrimos un mensaje estimado: revisa precio y disponibilidad en WhatsApp.",
      successNotice: (payload) => {
        const currentTotal = Number(payload.inquiry?.estimatedTotal);
        return Number.isFinite(currentTotal) &&
          Math.abs(currentTotal - localTotal) >= 0.01
          ? "El precio cambió; el mensaje de WhatsApp ya lleva el total actualizado."
          : "Tu mensaje, con precios y disponibilidad actuales, está listo en WhatsApp.";
      },
    });
  }

  async function submitCustomOrder(form) {
    if (!hasValidWhatsApp(settings.whatsappNumber)) {
      throw new Error("El WhatsApp de la tienda aún no está configurado.");
    }
    if (!form.privacyAccepted) {
      throw new Error("Acepta el aviso de privacidad para continuar.");
    }

    const selectedProduct = products.find((product) => product.id === form.productId);
    const quantity = Math.max(1, Math.min(20, Number(form.quantity) || 1));
    const items = selectedProduct
      ? [{
          productId: selectedProduct.id,
          quantity,
          color: canonicalVariant(selectedProduct.colors, form.color),
          size: canonicalVariant(selectedProduct.sizes, form.size),
        }]
      : [];
    const guidedDetails = [
      "Personalización guiada",
      form.color ? `Color solicitado: ${form.color}` : "",
      form.size ? `Tamaño solicitado: ${form.size}` : "",
      form.personalization ? `Nombre o frase: ${form.personalization}` : "",
      form.specialDetails ? `Detalle especial: ${form.specialDetails}` : "",
      form.estimatedLeadTime ? `Tiempo estimado: ${form.estimatedLeadTime}` : "",
    ].filter(Boolean);
    const note = form.productId
      ? guidedDetails.join(" · ")
      : `${form.kind}: ${form.details}${form.budget ? ` · Presupuesto: ${form.budget}` : ""}`;
    const message = buildCustomMessage({ settings, ...form });

    return openCanonicalInquiry({
      body: {
        customerName: form.customerName,
        note,
        privacyAccepted: true,
        items,
      },
      fallbackUrl: whatsappUrl(settings.whatsappNumber, message),
      fallbackNotice:
        "No pudimos registrar la idea. Abrimos un mensaje estimado para revisarla directamente en WhatsApp.",
      successNotice: () =>
        "Tu idea validada por la tienda está lista para enviarse por WhatsApp.",
    });
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="ch-store ch-store-v4"
        style={{
          "--ch-accent": accentPalette.accentText,
          "--ch-accent-surface": accentPalette.accentSurface,
          "--ch-on-accent": accentPalette.onAccent,
        }}
      >
      <StitchProgress />
      <a className="ch-skip-link" href="#contenido">Saltar al contenido</a>
      <Header
        settings={settings}
        bagCount={bag.count}
        onOpenBag={openBag}
        navigationReady={!loading && !error}
      />

      <main id="contenido" tabIndex="-1">
        <Hero settings={settings} products={products} onOpenProduct={openProduct} />
        <TrustStrip settings={settings} />
        <Catalogue
          categories={categories}
          products={filteredProducts}
          currency={settings.currency}
          loading={loading}
          error={error}
          retry={retry}
          query={query}
          onQuery={setQuery}
          category={category}
          onCategory={setCategory}
          sort={sort}
          onSort={setSort}
          onOpen={openProduct}
        />
        {!loading && !error ? (
          <ProductCustomizer
            settings={settings}
            products={products}
            currency={settings.currency}
            retentionDays={retentionDays}
            onSubmit={submitCustomOrder}
          />
        ) : null}
        <Process />
        <Story settings={settings} products={products} onOpenProduct={openProduct} />
        <FAQ />
      </main>

      <Footer settings={settings} />

      <button
        className="ch-floating-bag"
        type="button"
        onClick={openBag}
        aria-label={`Abrir selección, ${bag.count} piezas`}
      >
        {bag.count ? <ShoppingBag size={20} /> : <MessageCircle size={21} />}
        <span>{bag.count ? `${bag.count} en mi selección` : "Consultar"}</span>
      </button>
      <BackToTop />

      <ProductModal
        product={selectedProduct}
        categories={categories}
        currency={settings.currency}
        onClose={closeProduct}
        onAdd={addToBag}
      />
      <InquiryDrawer
        open={bagOpen}
        onClose={closeBag}
        items={bag.items}
        count={bag.count}
        total={bag.estimatedTotal}
        lineLimitReached={bag.lineLimitReached}
        maximumLines={bag.maximumLines}
        currency={settings.currency}
        settings={settings}
        retentionDays={retentionDays}
        updateQuantity={bag.updateQuantity}
        removeItem={bag.removeItem}
        onSubmit={submitBag}
        onBrowse={() => document.querySelector("#catalogo")?.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        })}
      />

      <AnimatePresence>
        {toast && !dialogOpen ? (
          <motion.div
            className="ch-toast"
            role="status"
            aria-live="polite"
            onPointerEnter={() => window.clearTimeout(toastTimer.current)}
            onPointerLeave={() => scheduleToastDismiss(5000)}
            onFocusCapture={() => window.clearTimeout(toastTimer.current)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                scheduleToastDismiss(5000);
              }
            }}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
          >
            <span><Check size={16} /></span>
            <p>{toast}</p>
            {bag.count ? <button type="button" onClick={openBag}>Ver selección</button> : null}
            <button className="ch-toast-close" type="button" onClick={dismissToast} aria-label="Cerrar aviso"><X size={15} /></button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

export default Storefront;
