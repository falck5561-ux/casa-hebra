import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Minus,
  PackageCheck,
  Plus,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  categoryName,
  formatMoney,
  hasValidWhatsApp,
  productPriceForSize,
  productStatus,
} from "../utils";
import { ProductVisual } from "./Brand";

function maximumForBagItem(item, items) {
  const productMaximum =
    item.status === "available" && Number(item.stockQuantity) > 0
      ? Number(item.stockQuantity)
      : 20;
  const usedByOtherVariants = items
    .filter((candidate) => candidate.productId === item.productId && candidate.key !== item.key)
    .reduce((sum, candidate) => sum + candidate.quantity, 0);
  return Math.max(1, productMaximum - usedByOtherVariants);
}

function useOverlay(open, onClose) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    const overlay = panelRef.current.closest(".ch-overlay");
    const backgroundElements = Array.from(
      overlay?.parentElement?.children || [],
    ).filter(
      (element) =>
        element !== overlay && !element.classList.contains("ch-toast"),
    );
    const backgroundState = backgroundElements.map((element) => ({
      element,
      inert: element.hasAttribute("inert"),
      ariaHidden: element.getAttribute("aria-hidden"),
    }));

    backgroundElements.forEach((element) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";

    const timer = window.setTimeout(() => {
      const firstFocusable = panelRef.current?.querySelector(
        "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]",
      );
      firstFocusable?.focus();
    }, 30);

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll(
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]",
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panelRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown, true);
      backgroundState.forEach(({ element, inert, ariaHidden }) => {
        if (inert) element.setAttribute("inert", "");
        else element.removeAttribute("inert");
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      if (previousFocus?.isConnected && !previousFocus.closest?.("[inert]")) {
        previousFocus.focus?.();
      }
    };
  }, [open, onClose]);

  return panelRef;
}

export function ProductModal({ product, categories, currency, onClose, onAdd }) {
  const open = Boolean(product);
  const panelRef = useOverlay(open, onClose);
  const [imageIndex, setImageIndex] = useState(0);
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [addError, setAddError] = useState("");

  useEffect(() => {
    setImageIndex(0);
    setColor(product?.colors?.[0] || "");
    setSize(product?.sizes?.[0] || "");
    setQuantity(1);
    setAddError("");
  }, [product]);

  const status = product ? productStatus(product) : { label: "", tone: "light" };
  const soldOut =
    product?.status === "sold_out" ||
    (product?.status === "available" && Number(product?.stockQuantity) <= 0);
  const maxQuantity =
    soldOut
      ? 1
      : product?.status === "available" && Number(product?.stockQuantity) > 0
        ? Number(product?.stockQuantity)
        : 20;
  const images = Array.isArray(product?.images) ? product.images : [];
  const selectedUnitPrice = productPriceForSize(product, size);

  function previousImage() {
    setImageIndex((current) => (current - 1 + images.length) % images.length);
  }

  function nextImage() {
    setImageIndex((current) => (current + 1) % images.length);
  }

  function addSelection() {
    const result = onAdd(product, { color, size, quantity });
    if (result === false || result?.added === false) {
      setAddError(result?.message || "No pudimos agregar esta pieza a tu selección.");
      return;
    }
    setAddError("");
    onClose();
  }

  return (
    <AnimatePresence>
      {product ? (
        <motion.div
          className="ch-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
          className="ch-product-modal"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-modal-title"
          initial={{ opacity: 0, y: 28, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.99 }}
          transition={{ type: "spring", damping: 28, stiffness: 330 }}
        >
          <button className="ch-modal-close" type="button" onClick={onClose} aria-label="Cerrar detalles">
            <X size={21} />
          </button>

          <div className="ch-modal-gallery">
            <ProductVisual product={product} imageIndex={imageIndex} eager />
            <span className={`ch-status-pill is-${status.tone}`}>{status.label}</span>
            {images.length > 1 ? (
              <>
                <button className="ch-gallery-arrow is-left" type="button" onClick={previousImage} aria-label="Imagen anterior">
                  <ChevronLeft size={21} />
                </button>
                <button className="ch-gallery-arrow is-right" type="button" onClick={nextImage} aria-label="Imagen siguiente">
                  <ChevronRight size={21} />
                </button>
                <div className="ch-gallery-dots" role="group" aria-label={`Imagen ${imageIndex + 1} de ${images.length}`}>
                  {images.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      className={index === imageIndex ? "is-active" : ""}
                      onClick={() => setImageIndex(index)}
                      aria-label={`Ver imagen ${index + 1}`}
                      aria-current={index === imageIndex}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div className="ch-modal-content">
            <p className="ch-product-category">{categoryName(categories, product.categoryId)}</p>
            <h2 id="product-modal-title">{product.name}</h2>
            <div className="ch-modal-price">
              <strong>{formatMoney(selectedUnitPrice, currency)}</strong>
              {Number(product.compareAtPrice) > Number(product.price) ? (
                <del>{formatMoney(product.compareAtPrice, currency)}</del>
              ) : null}
            </div>
            <p className="ch-modal-description">
              {product.description || product.shortDescription || "Tejida a mano con materiales seleccionados y un acabado hecho con mucha paciencia."}
            </p>

            <div className="ch-product-facts">
              {product.customizable ? (
                <span><Sparkles size={17} /> Colores y detalles personalizables</span>
              ) : null}
              {product.materials ? (
                <span><PackageCheck size={17} /> {product.materials}</span>
              ) : null}
              {product.leadTime && product.status === "made_to_order" ? (
                <span><Clock3 size={17} /> {product.leadTime}</span>
              ) : null}
            </div>

            {product.colors?.length ? (
              <fieldset className="ch-options">
                <legend>Color <span>{color}</span></legend>
                <div className="ch-option-row">
                  {product.colors.map((option) => (
                    <button
                      key={option}
                      className={color === option ? "is-active" : ""}
                      type="button"
                      onClick={() => setColor(option)}
                      aria-pressed={color === option}
                    >
                      {color === option ? <Check size={13} /> : null}
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {product.sizes?.length ? (
              <fieldset className="ch-options">
                <legend>Tamaño o talla</legend>
                <div className="ch-option-row">
                  {product.sizes.map((option) => (
                    <button
                      key={option}
                      className={size === option ? "is-active" : ""}
                      type="button"
                      onClick={() => setSize(option)}
                      aria-pressed={size === option}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {addError ? <p className="ch-modal-error" role="alert">{addError}</p> : null}
            <div className="ch-add-row">
              <div className="ch-quantity-control" role="group" aria-label="Cantidad">
                <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={soldOut || quantity <= 1} aria-label="Restar una pieza">
                  <Minus size={16} />
                </button>
                <output aria-label={`${quantity} piezas`}>{quantity}</output>
                <button type="button" onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))} disabled={soldOut || quantity >= maxQuantity} aria-label="Agregar una pieza">
                  <Plus size={16} />
                </button>
              </div>
              <button className="ch-button ch-button-primary ch-add-button" type="button" onClick={addSelection} disabled={soldOut}>
                <ShoppingBag size={18} />
                {soldOut ? "Agotado" : `Agregar · ${formatMoney(selectedUnitPrice * quantity, currency)}`}
              </button>
            </div>
            {!soldOut ? (
              <p className="ch-dialog-note">No es una compra todavía. Confirmaremos disponibilidad, detalles y recogida por WhatsApp.</p>
            ) : null}
          </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function InquiryDrawer({
  open,
  onClose,
  items,
  count,
  total,
  lineLimitReached,
  maximumLines,
  currency,
  settings,
  retentionDays = 180,
  updateQuantity,
  removeItem,
  onSubmit,
  onBrowse,
}) {
  const panelRef = useOverlay(open, onClose);
  const customerNameRef = useRef(null);
  const privacyRef = useRef(null);
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [errorField, setErrorField] = useState("");
  const whatsappReady = hasValidWhatsApp(settings.whatsappNumber);
  const errorId = "bag-inquiry-error";

  function clearSubmitError(field) {
    if (field && errorField && errorField !== field) return;
    setSubmitError("");
    setErrorField("");
  }

  function showFieldError(field, message, fieldRef) {
    setSubmitError(message);
    setErrorField(field);
    window.requestAnimationFrame(() => fieldRef.current?.focus());
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (customerName.trim().length < 2) {
      showFieldError(
        "customerName",
        "Escribe tu nombre para preparar el mensaje.",
        customerNameRef,
      );
      return;
    }
    if (!privacyAccepted) {
      showFieldError(
        "privacyAccepted",
        "Acepta el aviso de privacidad para continuar.",
        privacyRef,
      );
      return;
    }
    if (!items.length || !whatsappReady) return;
    setSubmitting(true);
    clearSubmitError();
    try {
      await onSubmit({
        customerName: customerName.trim(),
        note: note.trim(),
        privacyAccepted,
      });
      onClose();
    } catch (error) {
      setSubmitError(error.message || "No pudimos preparar tu consulta.");
      setErrorField("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="ch-overlay ch-drawer-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.aside
            className="ch-inquiry-drawer"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bag-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <header className="ch-drawer-header">
              <div>
                <p className="ch-eyebrow"><ShoppingBag size={14} /> Tu selección</p>
                <h2 id="bag-title">Piezas que te gustaron</h2>
              </div>
              <button className="ch-modal-close is-static" type="button" onClick={onClose} aria-label="Cerrar selección">
                <X size={21} />
              </button>
            </header>

            {!items.length ? (
              <div className="ch-empty-bag">
                <div className="ch-empty-bag-icon"><ShoppingBag size={28} /></div>
                <h3>Tu selección está vacía</h3>
                <p>Guarda aquí las piezas que quieras consultar. No tendrás que pagar nada en la página.</p>
                <button className="ch-button ch-button-primary" type="button" onClick={() => { onClose(); onBrowse(); }}>
                  Explorar catálogo
                </button>
              </div>
            ) : (
              <form className="ch-inquiry-form" onSubmit={handleSubmit} noValidate>
                <div className="ch-bag-items">
                  {items.map((item) => (
                    <article className="ch-bag-item" key={item.key}>
                      <div className="ch-bag-thumb">
                        <ProductVisual product={{ name: item.name, images: item.image ? [item.image] : [] }} />
                      </div>
                      <div className="ch-bag-item-copy">
                        <h3>{item.name}</h3>
                        {[item.color, item.size].filter(Boolean).length ? (
                          <p>{[item.color, item.size].filter(Boolean).join(" · ")}</p>
                        ) : null}
                        <strong>{formatMoney(item.price * item.quantity, currency)}</strong>
                        <div className="ch-bag-item-actions">
                          <div className="ch-quantity-control is-small" role="group" aria-label={`Cantidad de ${item.name}`}>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.key, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                              aria-label={`Restar ${item.name}`}
                            >
                              <Minus size={14} />
                            </button>
                            <output>{item.quantity}</output>
                            <button
                              type="button"
                              onClick={() => updateQuantity(
                                item.key,
                                Math.min(maximumForBagItem(item, items), item.quantity + 1),
                              )}
                              disabled={item.quantity >= maximumForBagItem(item, items)}
                              aria-label={`Agregar ${item.name}`}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <button className="ch-remove-button" type="button" onClick={() => removeItem(item.key)} aria-label={`Quitar ${item.name}`}>
                            <Trash2 size={15} /> Quitar
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="ch-drawer-summary">
                  <div><span>{count} {count === 1 ? "pieza" : "piezas"}</span><strong>{formatMoney(total, currency)}</strong></div>
                  <p>Total estimado. La disponibilidad y el precio final se confirman personalmente.</p>
                </div>

                {lineLimitReached ? (
                  <p className="ch-limit-notice" role="status">
                    Llegaste al máximo de {maximumLines} variantes. Quita una para elegir otra distinta.
                  </p>
                ) : null}

                <div className="ch-customer-fields">
                  <label>
                    <span>Tu nombre <b>*</b></span>
                    <input
                      ref={customerNameRef}
                      required
                      minLength={2}
                      maxLength={80}
                      autoComplete="name"
                      value={customerName}
                      onChange={(event) => {
                        setCustomerName(event.target.value);
                        clearSubmitError("customerName");
                      }}
                      placeholder="¿Cómo te llamas?"
                      aria-invalid={errorField === "customerName"}
                      aria-describedby={errorField === "customerName" ? errorId : undefined}
                    />
                  </label>
                  <label>
                    <span>Nota para tu pedido <small>Opcional</small></span>
                    <textarea
                      maxLength={600}
                      rows={3}
                      value={note}
                      onChange={(event) => {
                        setNote(event.target.value);
                        clearSubmitError("note");
                      }}
                      placeholder="Cuéntame si lo necesitas para una fecha o tienes alguna duda…"
                    />
                  </label>
                </div>

                <label className="ch-privacy-consent">
                  <input
                    ref={privacyRef}
                    type="checkbox"
                    required
                    checked={privacyAccepted}
                    onChange={(event) => {
                      setPrivacyAccepted(event.target.checked);
                      clearSubmitError("privacyAccepted");
                    }}
                    aria-invalid={errorField === "privacyAccepted"}
                    aria-describedby={errorField === "privacyAccepted" ? errorId : undefined}
                  />
                  <span>
                    Acepto que mi nombre, selección y nota se guarden hasta {retentionDays} días para atender y organizar esta solicitud.
                  </span>
                </label>

                {!whatsappReady ? (
                  <div className="ch-config-warning" role="status">
                    El contacto por WhatsApp aún no está configurado. La dueña puede agregar el número desde el panel administrativo.
                  </div>
                ) : null}
                {submitError ? <p className="ch-form-error" id={errorId} role="alert">{submitError}</p> : null}

                <button className="ch-button ch-whatsapp-button" type="submit" disabled={!whatsappReady || submitting}>
                  <Send size={18} />
                  {submitting ? "Preparando mensaje…" : "Continuar por WhatsApp"}
                </button>
                <p className="ch-whatsapp-caption">Se abrirá un mensaje listo para revisar y enviar. Tu solicitud aún no confirma el pedido.</p>
              </form>
            )}
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
