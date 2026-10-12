import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Heart,
  MapPin,
  MessageCircle,
  Minus,
  PackageCheck,
  Palette,
  Plus,
  Ruler,
  Sparkles,
  UserRound,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatMoney, hasValidWhatsApp, productPriceForSize } from "../utils";
import { ProductVisual } from "./Brand";
import "../customizer.css";

const STEPS = [
  { short: "Pieza", title: "Elige tu pieza base" },
  { short: "Estilo", title: "Escoge color y tamaño" },
  { short: "Detalle", title: "Hazla realmente tuya" },
  { short: "Cantidad", title: "Preparamos tu solicitud" },
  { short: "Resumen", title: "Revisa cada detalle" },
];

const OPEN_COLOR_PATTERN = /elegir|personaliz|otro tono/i;
const OPEN_SIZE_PATTERN = /otro tama(?:n|ñ)o/i;

function uniqueTextOptions(options) {
  return [...new Set((Array.isArray(options) ? options : [])
    .map((option) => String(option || "").trim())
    .filter(Boolean))];
}

function unavailable(product) {
  return product?.status === "sold_out" ||
    (product?.status === "available" && Number(product?.stockQuantity) <= 0);
}

function swatchFor(label) {
  const normalized = String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const colors = [];
  const matches = [
    ["fucsia", "#d92b72"],
    ["rosa pastel", "#efb4c7"],
    ["rosa", "#e86d9d"],
    ["rojo", "#c73f4e"],
    ["amarillo", "#efbd35"],
    ["miel", "#c68b32"],
    ["naranja", "#dc7a35"],
    ["menta", "#74b9a2"],
    ["turquesa", "#3ca9aa"],
    ["azul cielo", "#79b8df"],
    ["azul", "#4779b8"],
    ["lavanda", "#9a82c6"],
    ["violeta", "#7553a1"],
    ["morado", "#7553a1"],
    ["verde", "#659166"],
    ["crema", "#eee2ca"],
    ["blanco", "#f7f3eb"],
    ["gris", "#92908f"],
    ["negro", "#292625"],
  ];

  matches.forEach(([name, value]) => {
    if (normalized.includes(name) && !colors.includes(value)) colors.push(value);
  });

  if (OPEN_COLOR_PATTERN.test(normalized) || !colors.length) {
    return "conic-gradient(#d86e93, #e8b34f, #77a98b, #6f83be, #a675ae, #d86e93)";
  }
  if (colors.length === 1) return colors[0];
  return `linear-gradient(135deg, ${colors.slice(0, 3).join(", ")})`;
}

function resolvedOption(value, customValue, openPattern) {
  if (!openPattern.test(value)) return value;
  return customValue.trim();
}

function buildRequestDetails({
  product,
  color,
  size,
  personalization,
  specialDetails,
  quantity,
  estimatedTotal,
  currency,
}) {
  return [
    `Producto base: ${product.name}`,
    `Color: ${color}`,
    `Tamaño: ${size}`,
    personalization ? `Nombre o frase: ${personalization}` : "Nombre o frase: sin texto",
    specialDetails ? `Detalle especial: ${specialDetails}` : "Detalle especial: ninguno",
    `Cantidad: ${quantity}`,
    `Estimado base: ${formatMoney(estimatedTotal, currency)}`,
    `Tiempo estimado de elaboración: ${product.leadTime || "por confirmar"}`,
  ].join(" · ");
}

/**
 * Personalizador visual de Casa Hebra.
 *
 * Props: { settings, products, currency, retentionDays, initialProductId,
 * maxQuantity, onSubmit }.
 *
 * onSubmit recibe:
 * {
 *   customerName, kind, details, budget, privacyAccepted,
 *   productId, productName, color, size, quantity,
 *   personalization, specialDetails, estimatedTotal, estimatedLeadTime,
 *   configuration
 * }
 * Los cinco primeros campos mantienen compatibilidad con submitCustomOrder.
 */
export function ProductCustomizer({
  settings = {},
  products = [],
  currency,
  retentionDays = 180,
  initialProductId = "",
  maxQuantity = 10,
  onSubmit,
}) {
  const prefersReducedMotion = useReducedMotion();
  const resolvedCurrency = currency || settings.currency || "MXN";
  const whatsappReady = hasValidWhatsApp(settings.whatsappNumber);
  const instanceId = useId();
  const headingRef = useRef(null);
  const customColorRef = useRef(null);
  const customSizeRef = useRef(null);
  const customerNameRef = useRef(null);
  const privacyRef = useRef(null);
  const successHeadingRef = useRef(null);
  const hasMounted = useRef(false);
  const submittingRef = useRef(false);

  const selectableProducts = useMemo(() => {
    return products.filter(
      (product) =>
        product &&
        product.active !== false &&
        product.customizable !== false &&
        !unavailable(product),
    );
  }, [products]);

  const [step, setStep] = useState(0);
  const [productId, setProductId] = useState(initialProductId);
  const [color, setColor] = useState("");
  const [customColor, setCustomColor] = useState("");
  const [size, setSize] = useState("");
  const [customSize, setCustomSize] = useState("");
  const [personalization, setPersonalization] = useState("");
  const [specialDetails, setSpecialDetails] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const product = selectableProducts.find((item) => item.id === productId) ||
    selectableProducts[0] || null;

  const colorOptions = useMemo(() => {
    if (!product) return [];
    const options = uniqueTextOptions(product.colors);
    if (!options.length) options.push("Tono original");
    if (product.customizable !== false && !options.some((option) => OPEN_COLOR_PATTERN.test(option))) {
      options.push("Otro tono (cotizar)");
    }
    return options;
  }, [product]);

  const sizeOptions = useMemo(() => {
    if (!product) return [];
    const options = uniqueTextOptions(product.sizes);
    if (!options.length) options.push("Tamaño de la foto");
    if (product.customizable !== false && !options.some((option) => OPEN_SIZE_PATTERN.test(option))) {
      options.push("Otro tamaño (cotizar)");
    }
    return options;
  }, [product]);

  const requestedMaximum = Number.isFinite(Number(maxQuantity))
    ? Math.max(1, Math.floor(Number(maxQuantity)))
    : 10;
  const maximum = product?.status === "available" && Number(product.stockQuantity) > 0
    ? Math.min(Math.floor(Number(product.stockQuantity)), requestedMaximum)
    : requestedMaximum;
  const unitPrice = productPriceForSize(product, size);
  const estimatedTotal = unitPrice * quantity;
  const chosenColor = resolvedOption(color, customColor, OPEN_COLOR_PATTERN);
  const chosenSize = resolvedOption(size, customSize, OPEN_SIZE_PATTERN);
  const variableEstimate = OPEN_COLOR_PATTERN.test(color) ||
    OPEN_SIZE_PATTERN.test(size) || Boolean(personalization.trim()) ||
    Boolean(specialDetails.trim());
  const errorId = `${instanceId}-error`;
  const progress = (step / (STEPS.length - 1)) * 100;

  useEffect(() => {
    if (!selectableProducts.length) {
      setProductId("");
      return;
    }
    if (!selectableProducts.some((item) => item.id === productId)) {
      const preferred = selectableProducts.find((item) => item.id === initialProductId);
      setProductId((preferred || selectableProducts[0]).id);
    }
  }, [initialProductId, productId, selectableProducts]);

  useEffect(() => {
    if (!product) return;
    const nextColors = uniqueTextOptions(product.colors);
    const nextSizes = uniqueTextOptions(product.sizes);
    setColor(nextColors[0] || "Tono original");
    setSize(nextSizes[0] || "Tamaño de la foto");
    setCustomColor("");
    setCustomSize("");
    setQuantity(1);
    setError("");
    setErrorField("");
    setCompleted(false);
  }, [product?.id, product?.updatedAt]);

  useEffect(() => {
    setQuantity((current) => Math.min(Math.max(1, current), maximum));
  }, [maximum]);

  useEffect(() => {
    if (!completed) return;
    window.requestAnimationFrame(() => successHeadingRef.current?.focus());
  }, [completed]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }, [step]);

  function clearError(field) {
    if (field && errorField && errorField !== field) return;
    setError("");
    setErrorField("");
  }

  function showError(field, message, targetRef) {
    setError(message);
    setErrorField(field);
    window.requestAnimationFrame(() => targetRef?.current?.focus());
  }

  function validate(currentStep) {
    if (currentStep === 0 && !product) {
      setError("Todavía no hay una pieza disponible para personalizar.");
      setErrorField("product");
      return false;
    }
    if (currentStep === 1 && OPEN_COLOR_PATTERN.test(color) && customColor.trim().length < 2) {
      showError("customColor", "Cuéntanos qué tono te gustaría usar.", customColorRef);
      return false;
    }
    if (currentStep === 1 && OPEN_SIZE_PATTERN.test(size) && customSize.trim().length < 2) {
      showError("customSize", "Describe brevemente el tamaño que necesitas.", customSizeRef);
      return false;
    }
    if (currentStep === 3 && customerName.trim().length < 2) {
      showError("customerName", "Escribe tu nombre para preparar el mensaje.", customerNameRef);
      return false;
    }
    clearError();
    return true;
  }

  function goToStep(nextStep) {
    if (submittingRef.current || submitting) return;
    if (nextStep < 0 || nextStep >= STEPS.length) return;
    if (nextStep > step && !validate(step)) return;
    setStep(nextStep);
    clearError();
  }

  async function submit(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (step < STEPS.length - 1) {
      goToStep(step + 1);
      return;
    }
    if (!product || !validate(3)) return;
    if (!privacyAccepted) {
      showError(
        "privacyAccepted",
        "Acepta el aviso de privacidad para abrir tu solicitud en WhatsApp.",
        privacyRef,
      );
      return;
    }
    if (!whatsappReady) {
      setError("El WhatsApp de la tienda aún no está configurado. Vuelve a intentarlo más tarde.");
      setErrorField("");
      return;
    }
    if (typeof onSubmit !== "function") {
      setError("La consulta por WhatsApp aún no está disponible.");
      setErrorField("");
      return;
    }

    const configuration = {
      productId: product.id,
      productName: product.name,
      image: product.images?.[0] || "",
      color: chosenColor,
      size: chosenSize,
      personalization: personalization.trim(),
      specialDetails: specialDetails.trim(),
      quantity,
      unitPrice,
      estimatedTotal,
      estimatedLeadTime: product.leadTime || "Por confirmar",
      estimateNeedsConfirmation: variableEstimate,
      currency: resolvedCurrency,
    };
    const details = buildRequestDetails({
      product,
      color: chosenColor,
      size: chosenSize,
      personalization: personalization.trim(),
      specialDetails: specialDetails.trim(),
      quantity,
      estimatedTotal,
      currency: resolvedCurrency,
    });

    submittingRef.current = true;
    setSubmitting(true);
    clearError();
    try {
      await onSubmit({
        customerName: customerName.trim(),
        kind: product.name,
        details,
        budget: `${formatMoney(estimatedTotal, resolvedCurrency)} estimado base`,
        privacyAccepted: true,
        productId: product.id,
        productName: product.name,
        color: chosenColor,
        size: chosenSize,
        quantity,
        personalization: personalization.trim(),
        specialDetails: specialDetails.trim(),
        estimatedTotal,
        estimatedLeadTime: product.leadTime || "Por confirmar",
        configuration,
      });
      setCompleted(true);
    } catch (submitError) {
      setError(submitError?.message || "No pudimos preparar el mensaje. Inténtalo nuevamente.");
      setErrorField("");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function restart() {
    setStep(0);
    setColor(colorOptions[0] || "Tono original");
    setCustomColor("");
    setSize(sizeOptions[0] || "Tamaño de la foto");
    setCustomSize("");
    setPersonalization("");
    setSpecialDetails("");
    setQuantity(1);
    setPrivacyAccepted(false);
    setCompleted(false);
    clearError();
  }

  const motionTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.34, ease: [0.22, 1, 0.36, 1] };

  if (!selectableProducts.length) {
    return (
      <section className="ch-customizer ch-customizer-empty" id="personalizados" aria-labelledby={`${instanceId}-title`}>
        <Sparkles size={24} aria-hidden="true" />
        <p className="ch-customizer-kicker">Diseña la tuya</p>
        <h2 id={`${instanceId}-title`}>Pronto podrás personalizar una pieza</h2>
        <p>En este momento no hay bases disponibles. Puedes volver a revisar el catálogo más tarde.</p>
        <a className="ch-cz-secondary" href="#catalogo">Volver al catálogo</a>
      </section>
    );
  }

  return (
    <section className="ch-customizer" id="personalizados" aria-labelledby={`${instanceId}-title`}>
      <header className="ch-customizer-intro">
        <div>
          <p className="ch-customizer-kicker"><Sparkles size={15} /> Diseña la tuya</p>
          <h2 id={`${instanceId}-title`}>Tu idea, tejida punto por punto</h2>
        </div>
        <p>
          Combina una pieza, su tono y tus detalles. Verás un estimado antes de enviar la idea; el precio final se confirma contigo por WhatsApp.
        </p>
      </header>

      <div className="ch-customizer-shell">
        <aside className="ch-cz-preview" aria-label="Vista de tu pieza elegida">
          <div className="ch-cz-preview-topline">
            <span><Heart size={14} /> Tu creación</span>
            <small>{String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}</small>
          </div>

          <div className="ch-cz-photo-stage">
            <AnimatePresence mode="wait">
              <motion.div
                className="ch-cz-photo-wrap"
                key={product.id}
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.94, rotate: -1.5 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.97 }}
                transition={motionTransition}
              >
                <ProductVisual product={product} className="ch-cz-photo" />
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="ch-cz-preview-info">
            <div>
              <small>Pieza base</small>
              <h3>{product.name}</h3>
            </div>
            <strong>{formatMoney(estimatedTotal, resolvedCurrency)}</strong>
          </div>
          <ul className="ch-cz-preview-tags" aria-label="Configuración actual">
            <li><span className="ch-cz-mini-swatch" style={{ "--cz-swatch": swatchFor(chosenColor || color) }} />{chosenColor || "Elige color"}</li>
            <li><Ruler size={14} />{chosenSize || "Elige tamaño"}</li>
            <li><PackageCheck size={14} />{quantity} {quantity === 1 ? "pieza" : "piezas"}</li>
          </ul>
          <p className="ch-cz-estimate-note">
            <Clock3 size={15} /> {product.leadTime || "Tiempo por confirmar"}
          </p>
        </aside>

        <form className="ch-cz-workspace" onSubmit={submit} noValidate>
          <nav className="ch-cz-progress" aria-label="Progreso del personalizador">
            <div className="ch-cz-progress-track" aria-hidden="true">
              <motion.span animate={{ width: `${progress}%` }} transition={motionTransition} />
            </div>
            <ol>
              {STEPS.map((item, index) => (
                <li key={item.short} className={index === step ? "is-current" : index < step ? "is-done" : ""}>
                  <button
                    type="button"
                    onClick={() => index < step && goToStep(index)}
                    disabled={index > step || submitting}
                    aria-current={index === step ? "step" : undefined}
                    aria-label={`${item.short}, paso ${index + 1} de ${STEPS.length}${index < step ? ", completado" : ""}`}
                  >
                    <span>{index < step ? <Check size={13} /> : index + 1}</span>
                    <small>{item.short}</small>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div className="ch-cz-step-heading">
            <p>Paso {step + 1} de {STEPS.length}</p>
            <h3 ref={headingRef} tabIndex="-1">{STEPS[step].title}</h3>
          </div>

          <div className="ch-cz-step-viewport">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                className="ch-cz-step"
                key={step}
                initial={prefersReducedMotion ? false : { opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, x: -16 }}
                transition={motionTransition}
              >
                {step === 0 ? (
                  <fieldset className="ch-cz-fieldset ch-cz-piece-fieldset">
                    <legend className="sr-only">Selecciona una pieza base</legend>
                    <p className="ch-cz-helper">Empieza con una pieza real del catálogo. Su precio sirve como base para el estimado.</p>
                    <div className="ch-cz-piece-grid">
                      {selectableProducts.map((item) => {
                        const selected = item.id === product.id;
                        return (
                          <button
                            className={`ch-cz-piece ${selected ? "is-selected" : ""}`}
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setProductId(item.id);
                              clearError("product");
                            }}
                            aria-pressed={selected}
                            aria-label={`${item.name}, ${formatMoney(item.price, resolvedCurrency)}${selected ? ", seleccionada" : ""}`}
                          >
                            <div className="ch-cz-piece-image"><ProductVisual product={item} /></div>
                            <span className="ch-cz-piece-copy">
                              <strong>{item.name}</strong>
                              <small>{formatMoney(item.price, resolvedCurrency)}</small>
                            </span>
                            <span className="ch-cz-choice-mark" aria-hidden="true"><Check size={13} /></span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : null}

                {step === 1 ? (
                  <div className="ch-cz-style-fields">
                    <fieldset className="ch-cz-fieldset">
                      <legend><Palette size={18} /> Color principal <span>{chosenColor || "Por elegir"}</span></legend>
                      <div className="ch-cz-color-grid">
                        {colorOptions.map((option) => (
                          <button
                            key={option}
                            className={color === option ? "is-selected" : ""}
                            type="button"
                            onClick={() => {
                              setColor(option);
                              clearError("customColor");
                            }}
                            aria-pressed={color === option}
                          >
                            <span className="ch-cz-swatch" style={{ "--cz-swatch": swatchFor(option) }} aria-hidden="true" />
                            <span>{option}</span>
                            {color === option ? <Check size={14} aria-hidden="true" /> : null}
                          </button>
                        ))}
                      </div>
                      {OPEN_COLOR_PATTERN.test(color) ? (
                        <label className="ch-cz-field">
                          <span>¿Qué tono imaginas? <b>*</b></span>
                          <input
                            ref={customColorRef}
                            value={customColor}
                            onChange={(event) => {
                              setCustomColor(event.target.value);
                              clearError("customColor");
                            }}
                            maxLength={80}
                            placeholder="Ej. verde olivo con detalles crema"
                            aria-invalid={errorField === "customColor"}
                            aria-describedby={errorField === "customColor" ? errorId : undefined}
                          />
                        </label>
                      ) : null}
                    </fieldset>

                    <fieldset className="ch-cz-fieldset">
                      <legend><Ruler size={18} /> Tamaño</legend>
                      <div className="ch-cz-size-grid">
                        {sizeOptions.map((option) => (
                          <button
                            key={option}
                            className={size === option ? "is-selected" : ""}
                            type="button"
                            onClick={() => {
                              setSize(option);
                              clearError("customSize");
                            }}
                            aria-pressed={size === option}
                          >
                            <span>{option}</span>
                            {size === option ? <Check size={14} aria-hidden="true" /> : null}
                          </button>
                        ))}
                      </div>
                      {OPEN_SIZE_PATTERN.test(size) ? (
                        <label className="ch-cz-field">
                          <span>¿Qué tamaño necesitas? <b>*</b></span>
                          <input
                            ref={customSizeRef}
                            value={customSize}
                            onChange={(event) => {
                              setCustomSize(event.target.value);
                              clearError("customSize");
                            }}
                            maxLength={80}
                            placeholder="Ej. aproximadamente 20 cm"
                            aria-invalid={errorField === "customSize"}
                            aria-describedby={errorField === "customSize" ? errorId : undefined}
                          />
                        </label>
                      ) : null}
                    </fieldset>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="ch-cz-detail-fields">
                    <p className="ch-cz-helper">Estos campos son opcionales. Úsalos si quieres añadir un nombre o explicar una idea especial.</p>
                    <label className="ch-cz-field">
                      <span>Nombre, iniciales o frase corta <small>Opcional</small></span>
                      <input
                        value={personalization}
                        onChange={(event) => setPersonalization(event.target.value)}
                        maxLength={40}
                        placeholder="Ej. Sofi"
                      />
                      <small className="ch-cz-counter">{personalization.length}/40</small>
                    </label>
                    <label className="ch-cz-field">
                      <span>Detalles que quieres conservar <small>Opcional</small></span>
                      <textarea
                        value={specialDetails}
                        onChange={(event) => setSpecialDetails(event.target.value)}
                        maxLength={300}
                        rows={5}
                        placeholder="Ej. una flor pequeña, ojos bordados y listón color crema…"
                      />
                      <small className="ch-cz-counter">{specialDetails.length}/300</small>
                    </label>
                    <div className="ch-cz-gentle-note"><Heart size={18} /><p><strong>Lo revisamos contigo.</strong> Nada se produce hasta confirmar que los detalles, el precio y el tiempo te funcionan.</p></div>
                  </div>
                ) : null}

                {step === 3 ? (
                  <div className="ch-cz-order-fields">
                    <div className="ch-cz-quantity-card">
                      <div><span>Cantidad</span><strong>{quantity === 1 ? "Una pieza" : `${quantity} piezas`}</strong><small>Hasta {maximum} en esta solicitud</small></div>
                      <div className="ch-cz-quantity" role="group" aria-label="Cantidad de piezas">
                        <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="Restar una pieza"><Minus size={17} /></button>
                        <output aria-label={`${quantity} piezas`}>{quantity}</output>
                        <button type="button" onClick={() => setQuantity((value) => Math.min(maximum, value + 1))} disabled={quantity >= maximum} aria-label="Agregar una pieza"><Plus size={17} /></button>
                      </div>
                    </div>
                    <label className="ch-cz-field">
                      <span><UserRound size={17} /> Tu nombre <b>*</b></span>
                      <input
                        ref={customerNameRef}
                        value={customerName}
                        onChange={(event) => {
                          setCustomerName(event.target.value);
                          clearError("customerName");
                        }}
                        minLength={2}
                        maxLength={80}
                        autoComplete="name"
                        placeholder="¿Cómo te llamas?"
                        aria-invalid={errorField === "customerName"}
                        aria-describedby={errorField === "customerName" ? errorId : undefined}
                      />
                    </label>
                    <div className="ch-cz-pickup-note">
                      <MapPin size={19} />
                      <p><strong>Recogida local y privada</strong><span>El punto y el horario se acuerdan contigo por WhatsApp. La dirección no se publica.</span></p>
                    </div>
                  </div>
                ) : null}

                {step === 4 ? (
                  completed ? (
                    <div className="ch-cz-success" role="status">
                      <span><CheckCircle2 size={30} /></span>
                      <p className="ch-customizer-kicker">Idea preparada</p>
                      <h4 ref={successHeadingRef} tabIndex="-1">Tu configuración está lista en WhatsApp</h4>
                      <p>Antes de empezar, {settings.storeName || "Casa Hebra"} confirmará contigo disponibilidad, precio final, tiempo y recogida.</p>
                      <button className="ch-cz-secondary" type="button" onClick={restart}>Diseñar otra pieza</button>
                    </div>
                  ) : (
                    <div className="ch-cz-summary">
                      <div className="ch-cz-summary-hero">
                        <div className="ch-cz-summary-image"><ProductVisual product={product} /></div>
                        <div><small>Tu diseño</small><h4>{product.name}</h4><p>{quantity} {quantity === 1 ? "pieza" : "piezas"}</p></div>
                      </div>
                      <dl>
                        <div><dt>Color</dt><dd>{chosenColor}</dd></div>
                        <div><dt>Tamaño</dt><dd>{chosenSize}</dd></div>
                        <div><dt>Nombre o frase</dt><dd>{personalization.trim() || "Sin texto"}</dd></div>
                        <div><dt>Detalle especial</dt><dd>{specialDetails.trim() || "Sin detalle adicional"}</dd></div>
                        <div><dt>Elaboración estimada</dt><dd>{product.leadTime || "Por confirmar"}</dd></div>
                      </dl>
                      <div className="ch-cz-total">
                        <div><span>{variableEstimate ? "Estimado base" : "Total estimado"}</span><small>{variableEstimate ? "Puede cambiar según los detalles elegidos" : "Sujeto a disponibilidad"}</small></div>
                        <strong>{formatMoney(estimatedTotal, resolvedCurrency)}</strong>
                      </div>
                      <label className="ch-cz-privacy">
                        <input
                          ref={privacyRef}
                          type="checkbox"
                          checked={privacyAccepted}
                          onChange={(event) => {
                            setPrivacyAccepted(event.target.checked);
                            clearError("privacyAccepted");
                          }}
                          aria-invalid={errorField === "privacyAccepted"}
                          aria-describedby={errorField === "privacyAccepted" ? errorId : undefined}
                        />
                        <span>Acepto que mis datos se usen para atender esta solicitud y se conserven hasta {retentionDays} días. <b>*</b></span>
                      </label>
                      {whatsappReady ? (
                        <p className="ch-cz-submit-note"><MessageCircle size={16} /> Esto prepara una consulta; no realiza un cobro ni confirma el pedido.</p>
                      ) : (
                        <p className="ch-cz-whatsapp-unavailable" role="status"><MessageCircle size={16} /> El WhatsApp de la tienda aún no está disponible. Puedes revisar tu diseño, pero todavía no enviarlo.</p>
                      )}
                    </div>
                  )
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>

          {error ? <p className="ch-cz-error" id={errorId} role="alert">{error}</p> : null}

          {!completed ? (
            <footer className="ch-cz-actions">
              <button className="ch-cz-back" type="button" onClick={() => goToStep(step - 1)} disabled={step === 0 || submitting}>
                <ArrowLeft size={17} /> Atrás
              </button>
              <button className="ch-cz-next" type="submit" disabled={submitting || (step === STEPS.length - 1 && !whatsappReady)} aria-busy={submitting || undefined}>
                {step === STEPS.length - 1 ? (
                  <>{submitting ? "Preparando…" : whatsappReady ? "Enviar a WhatsApp" : "WhatsApp no disponible"}<MessageCircle size={18} /></>
                ) : (
                  <>Continuar <ArrowRight size={18} /></>
                )}
              </button>
            </footer>
          ) : null}
        </form>
      </div>
    </section>
  );
}

export default ProductCustomizer;
