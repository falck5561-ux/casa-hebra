import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  HeartHandshake,
  MapPin,
  MessageCircle,
  Palette,
  Scissors,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";
import { useRef, useState } from "react";
import { hasValidWhatsApp, instagramUrl } from "../utils";
import { ProductVisual, YarnMark } from "./Brand";
import "../store-experience.css";

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
};

export function Hero({ settings, products, onOpenProduct }) {
  const prefersReducedMotion = useReducedMotion();
  const visual = products.find((product) => product.featured) || products[0];
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const smoothTiltX = useSpring(tiltX, { stiffness: 180, damping: 22, mass: 0.45 });
  const smoothTiltY = useSpring(tiltY, { stiffness: 180, damping: 22, mass: 0.45 });

  function moveFeaturedPiece(event) {
    if (prefersReducedMotion || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
    tiltX.set(vertical * -3.2);
    tiltY.set(horizontal * 3.2);
  }

  function resetFeaturedPiece() {
    tiltX.set(0);
    tiltY.set(0);
  }

  return (
    <section className="ch-hero" id="inicio" aria-labelledby="hero-title">
      <svg className="ch-hero-thread" viewBox="0 0 900 180" preserveAspectRatio="none" aria-hidden="true">
        <motion.path
          d="M-20 116c120-95 230 74 367-9 129-78 245 54 365 8 73-28 120-71 208-36"
          initial={prefersReducedMotion ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.45 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 1.6, delay: 0.15, ease: "easeInOut" }}
        />
      </svg>
      <div className="ch-hero-copy">
        <motion.p className="ch-eyebrow" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <span /> Crochet local · hecho a mano
        </motion.p>
        <motion.h1 id="hero-title" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.62, ease: [0.22, 1, 0.36, 1] }}>
          {settings.heroTitle}
        </motion.h1>
        <motion.p className="ch-hero-text" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.55 }}>
          {settings.heroText}
        </motion.p>
        <motion.div className="ch-hero-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
          <a className="ch-button ch-button-primary" href="#catalogo">
            Explorar la colección <ArrowDown size={17} />
          </a>
          <a className="ch-text-link" href="#personalizados">
            Quiero algo especial <ArrowRight size={16} />
          </a>
        </motion.div>
        <motion.ul className="ch-hero-reassurance" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} aria-label="Detalles de compra">
          <li><Sparkles size={16} aria-hidden="true" /><span>Piezas únicas y personalizables</span></li>
          <li><MapPin size={16} aria-hidden="true" /><span>Recogida local · punto por WhatsApp</span></li>
        </motion.ul>
      </div>

      <motion.div className="ch-hero-showcase" role="group" initial={{ opacity: 0, scale: 0.97, x: 20 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ duration: 0.75, delay: 0.12, ease: [0.22, 1, 0.36, 1] }} aria-label="Piezas destacadas de Casa Hebra">
        <div className="ch-hero-wash" aria-hidden="true" />
        <motion.button
          className="ch-hero-feature"
          type="button"
          onClick={() => visual && onOpenProduct(visual)}
          onPointerMove={moveFeaturedPiece}
          onPointerLeave={resetFeaturedPiece}
          onBlur={resetFeaturedPiece}
          disabled={!visual}
          aria-haspopup="dialog"
          aria-label={visual ? `Ver ${visual.name}` : "Vista de una pieza artesanal"}
          style={prefersReducedMotion ? undefined : {
            rotateX: smoothTiltX,
            rotateY: smoothTiltY,
            transformPerspective: 1200,
          }}
        >
          <ProductVisual className="ch-hero-product-photo" product={visual || { name: "Pieza artesanal", images: [] }} eager />
          <span className="ch-hero-light-sweep" aria-hidden="true" />
          {visual ? (
            <span className="ch-hero-feature-caption">
              <small>Pieza destacada</small>
              <strong>{visual.name}</strong>
              <ArrowRight size={16} aria-hidden="true" />
            </span>
          ) : null}
        </motion.button>
        <div className="ch-handmade-stamp">
          <Scissors size={18} />
          <span>Tejido a mano</span>
        </div>
      </motion.div>
    </section>
  );
}

export function TrustStrip({ settings }) {
  const items = [
    { icon: HeartHandshake, title: "Hecho a mano", text: "Una pieza a la vez" },
    { icon: Palette, title: "Detalles a tu gusto", text: "Colores y opciones" },
    { icon: MapPin, title: "Recogida local", text: settings.city || "Acordamos el punto" },
    { icon: MessageCircle, title: "Trato directo", text: "Atención por WhatsApp" },
  ];

  return (
    <section className="ch-trust-strip" aria-label="Ventajas de Casa Hebra">
      {items.map(({ icon: Icon, title, text }, index) => (
        <motion.div key={title} {...reveal} transition={{ ...reveal.transition, delay: index * 0.05 }}>
          <span><Icon size={20} /></span>
          <p><strong>{title}</strong><small>{text}</small></p>
        </motion.div>
      ))}
    </section>
  );
}

export function CustomOrder({ settings, retentionDays = 180, onSubmit }) {
  const customerNameRef = useRef(null);
  const detailsRef = useRef(null);
  const privacyRef = useRef(null);
  const [form, setForm] = useState({
    customerName: "",
    kind: "Amigurumi",
    details: "",
    budget: "",
    privacyAccepted: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState("");
  const whatsappReady = hasValidWhatsApp(settings.whatsappNumber);
  const errorId = "custom-order-error";

  function clearError(field) {
    if (field && errorField && errorField !== field) return;
    setError("");
    setErrorField("");
  }

  const change = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    clearError(key);
  };

  function showFieldError(field, message, fieldRef) {
    setError(message);
    setErrorField(field);
    window.requestAnimationFrame(() => fieldRef.current?.focus());
  }

  async function submit(event) {
    event.preventDefault();
    if (!whatsappReady) return;
    if (form.customerName.trim().length < 2) {
      showFieldError(
        "customerName",
        "Escribe tu nombre para preparar el mensaje.",
        customerNameRef,
      );
      return;
    }
    if (form.details.trim().length < 10) {
      showFieldError(
        "details",
        "Cuéntame un poco más sobre la pieza que imaginas.",
        detailsRef,
      );
      return;
    }
    if (!form.privacyAccepted) {
      showFieldError(
        "privacyAccepted",
        "Acepta el aviso de privacidad para continuar.",
        privacyRef,
      );
      return;
    }
    setSubmitting(true);
    clearError();
    try {
      await onSubmit({
        customerName: form.customerName.trim(),
        kind: form.kind,
        details: form.details.trim(),
        budget: form.budget.trim(),
        privacyAccepted: form.privacyAccepted,
      });
    } catch (submitError) {
      setError(submitError.message || "No pudimos preparar tu mensaje.");
      setErrorField("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="ch-custom-section" id="personalizados" aria-labelledby="custom-title">
      <motion.div className="ch-custom-copy" {...reveal}>
        <p className="ch-eyebrow"><Sparkles size={15} /> Hecho para ti</p>
        <h2 id="custom-title">¿Tienes una idea dando vueltas?</h2>
        <p>
          Cuéntamela. Podemos explorar colores, tamaño y detalles para crear una pieza que se sienta realmente tuya.
        </p>
        <ul>
          <li><CheckCircle2 size={18} /> Revisamos contigo la idea y las referencias.</li>
          <li><CheckCircle2 size={18} /> Te confirmo precio y tiempo antes de empezar.</li>
          <li><CheckCircle2 size={18} /> Acordamos la recogida de forma privada.</li>
        </ul>
        <div className="ch-custom-quote">“Los mejores regalos empiezan con una historia.”</div>
      </motion.div>

      <motion.form className="ch-custom-form" onSubmit={submit} noValidate {...reveal} transition={{ ...reveal.transition, delay: 0.08 }}>
        <div className="ch-form-heading">
          <span>01</span>
          <div><h3>Cuéntame qué imaginas</h3><p>Esto abrirá un mensaje listo en WhatsApp.</p></div>
        </div>
        <div className="ch-form-grid">
          <label className="ch-field-full">
            <span>Tu nombre <b>*</b></span>
            <input
              ref={customerNameRef}
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              value={form.customerName}
              onChange={change("customerName")}
              placeholder="¿Cómo te llamas?"
              aria-invalid={errorField === "customerName"}
              aria-describedby={errorField === "customerName" ? errorId : undefined}
            />
          </label>
          <label>
            <span>¿Qué te gustaría? <b>*</b></span>
            <select required value={form.kind} onChange={change("kind")}>
              <option>Amigurumi</option>
              <option>Llavero o accesorio</option>
              <option>Flores tejidas</option>
              <option>Prenda</option>
              <option>Decoración</option>
              <option>Otro</option>
            </select>
          </label>
          <label>
            <span>Presupuesto <small>Opcional</small></span>
            <input maxLength={80} value={form.budget} onChange={change("budget")} placeholder="Ej. hasta $600" />
          </label>
          <label className="ch-field-full">
            <span>Describe tu idea <b>*</b></span>
            <textarea
              ref={detailsRef}
              required
              minLength={10}
              maxLength={700}
              rows={5}
              value={form.details}
              onChange={change("details")}
              placeholder="Colores, tamaño, para quién es, fecha especial…"
              aria-invalid={errorField === "details"}
              aria-describedby={errorField === "details" ? errorId : undefined}
            />
            <small className="ch-char-count">{form.details.length}/700</small>
          </label>
        </div>
        <label className="ch-privacy-consent">
          <input
            ref={privacyRef}
            type="checkbox"
            required
            checked={form.privacyAccepted}
            onChange={(event) => {
              setForm((current) => ({
                ...current,
                privacyAccepted: event.target.checked,
              }));
              clearError("privacyAccepted");
            }}
            aria-invalid={errorField === "privacyAccepted"}
            aria-describedby={errorField === "privacyAccepted" ? errorId : undefined}
          />
          <span>
             Acepto compartir estos datos para que Casa Hebra pueda atender mi solicitud.
          </span>
        </label>
        {!whatsappReady ? (
          <div className="ch-config-warning" role="status">
            El contacto por WhatsApp aún no está configurado. La dueña puede agregarlo desde el panel administrativo.
          </div>
        ) : null}
        {error ? <p className="ch-form-error" id={errorId} role="alert">{error}</p> : null}
        <button className="ch-button ch-button-dark" type="submit" disabled={!whatsappReady || submitting}>
          <MessageCircle size={18} /> {submitting ? "Preparando…" : "Platicar sobre mi idea"}
        </button>
        <p className="ch-form-privacy"><ShieldCheck size={14} /> No pedimos teléfono ni domicilio. Los detalles se acuerdan en privado.</p>
      </motion.form>
    </section>
  );
}

export function Process() {
  const steps = [
    { number: "01", icon: HeartHandshake, title: "Elige o imagina", text: "Explora el catálogo o cuéntame la pieza especial que tienes en mente." },
    { number: "02", icon: MessageCircle, title: "Platicamos", text: "Confirmamos disponibilidad, detalles, precio y tiempo directamente por WhatsApp." },
    { number: "03", icon: Clock3, title: "Tejo tu historia", text: "Preparo cada punto con cuidado y te aviso cuando tu pieza esté lista." },
    { number: "04", icon: MapPin, title: "Nos coordinamos", text: "Acordamos en privado un punto y horario cómodo para la recogida local." },
  ];

  return (
    <section className="ch-section ch-process" aria-labelledby="process-title">
      <div className="ch-section-heading ch-process-heading">
        <p className="ch-eyebrow"><span /> Así funciona</p>
        <h2 id="process-title">De una idea a tus manos</h2>
        <p>Un proceso cercano, claro y sin pagos sorpresa.</p>
      </div>
      <div className="ch-process-grid">
        {steps.map(({ number, icon: Icon, title, text }, index) => (
          <motion.article key={number} {...reveal} transition={{ ...reveal.transition, delay: index * 0.06 }}>
            <span className="ch-step-number">{number}</span>
            <div className="ch-step-icon"><Icon size={22} /></div>
            <h3>{title}</h3>
            <p>{text}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

function selectEditorialProducts(products, limit = 4) {
  const photographed = products.filter(
    (product) => Array.isArray(product.images) && product.images.length > 0,
  );
  const customizable = photographed.filter(
    (product) => product.customizable && !product.featured,
  );
  const pool = customizable.length >= limit ? customizable : photographed;

  if (pool.length <= limit) return pool;

  const chosen = [];
  const usedIds = new Set();
  const lastIndex = pool.length - 1;
  const positions = [
    Math.round(lastIndex * 0.2),
    Math.round(lastIndex * 0.46),
    Math.round(lastIndex * 0.72),
    lastIndex,
  ];

  positions.forEach((position) => {
    const product = pool[position];
    if (product && !usedIds.has(product.id)) {
      chosen.push(product);
      usedIds.add(product.id);
    }
  });

  for (const product of pool) {
    if (chosen.length >= limit) break;
    if (!usedIds.has(product.id)) {
      chosen.push(product);
      usedIds.add(product.id);
    }
  }

  return chosen.slice(0, limit);
}

export function MadeForYou({ products, onOpenProduct }) {
  const sectionRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const galleryProducts = selectEditorialProducts(products);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 82%", "end 24%"],
  });
  const threadProgress = useSpring(scrollYProgress, {
    stiffness: 82,
    damping: 24,
    mass: 0.35,
  });

  if (!galleryProducts.length) return null;

  return (
    <section
      className="ch-made-for-you"
      ref={sectionRef}
      aria-labelledby="made-for-you-title"
    >
      <svg
        className="ch-journey-thread"
        viewBox="0 0 1440 760"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="ch-journey-thread-ghost"
          d="M-30 138C154 40 252 224 404 146S646 75 734 220s223 179 337 58 219-25 410 5"
        />
        <motion.path
          className="ch-journey-thread-progress"
          d="M-30 138C154 40 252 224 404 146S646 75 734 220s223 179 337 58 219-25 410 5"
          style={{ pathLength: prefersReducedMotion ? 1 : threadProgress }}
        />
      </svg>

      <motion.div className="ch-made-for-you-copy" {...reveal}>
        <p className="ch-eyebrow"><Sparkles size={15} /> Hecho para ti</p>
        <h2 id="made-for-you-title">Tu idea también puede tomar forma en hilo.</h2>
        <p>
          Estas fotografías pertenecen a piezas reales del catálogo. Puedes usarlas
          como punto de partida y preguntar por colores, tamaño o detalles antes de
          que comience el tejido.
        </p>
        <ol className="ch-made-for-you-steps" aria-label="Cómo personalizar una pieza">
          <li><span aria-hidden="true">01</span><strong>Elige una referencia</strong></li>
          <li><span aria-hidden="true">02</span><strong>Platicamos los detalles</strong></li>
          <li><span aria-hidden="true">03</span><strong>Confirmamos tiempo y precio</strong></li>
        </ol>
        <a className="ch-made-for-you-link" href="#personalizados">
          Empezar mi idea <ArrowRight size={17} aria-hidden="true" />
        </a>
      </motion.div>

      <div className="ch-made-for-you-gallery" role="group" aria-label="Piezas reales para inspirarte">
        {galleryProducts.map((product, index) => (
          <motion.button
            className={`ch-inspiration-card is-card-${index + 1}`}
            key={product.id}
            type="button"
            onClick={() => onOpenProduct(product)}
            aria-haspopup="dialog"
            aria-label={`Ver detalles de ${product.name}`}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 28, rotate: index % 2 ? 1.5 : -1.5 }}
            whileInView={{ opacity: 1, y: 0, rotate: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="ch-inspiration-photo">
              <ProductVisual product={product} />
              <small>{String(index + 1).padStart(2, "0")}</small>
            </span>
            <span className="ch-inspiration-copy">
              <span className="ch-inspiration-meta">
                {product.customizable ? "Personalizable" : "Pieza del catálogo"}
              </span>
              <strong>{product.name}</strong>
              <span className="ch-inspiration-note">
                {product.leadTime ? `Tiempo estimado: ${product.leadTime}` : "Detalles por acordar"}
              </span>
            </span>
            <ArrowRight className="ch-inspiration-arrow" size={17} aria-hidden="true" />
          </motion.button>
        ))}
      </div>

      <p className="ch-made-for-you-footnote">
        <ShieldCheck size={15} aria-hidden="true" />
        La personalización se confirma por WhatsApp antes de comenzar; no se cobra desde esta página.
      </p>
    </section>
  );
}

export function Story({ settings, products, onOpenProduct }) {
  const notFeatured = products.filter((product) => !product.featured);
  const galleryProducts = (notFeatured.length >= 3 ? notFeatured : products).slice(0, 3);

  return (
      <section className={`ch-story ${galleryProducts.length ? "" : "is-copy-only"}`} id="historia" aria-labelledby="story-title">
        <motion.div className="ch-story-copy" {...reveal}>
          <p className="ch-eyebrow"><span /> Nuestra historia</p>
          <h2 id="story-title">Cada punto lleva tiempo, intención y cariño.</h2>
          <p className="ch-story-lead">{settings.story}</p>
          <p>
            Cada pieza se teje una por una. Sus pequeñas diferencias guardan las manos, el tiempo y el cuidado que hacen especial al trabajo artesanal.
          </p>
          <div className="ch-signature"><YarnMark compact /><span><strong>{settings.storeName}</strong><small>{settings.tagline}</small></span></div>
        </motion.div>
        {galleryProducts.length ? <motion.div className="ch-story-gallery" {...reveal} transition={{ ...reveal.transition, delay: 0.08 }} role="group" aria-label="Piezas hechas por Casa Hebra">
          {galleryProducts.map((product, index) => (
            <button
              className={`ch-story-photo ${index === 0 ? "is-main" : index === 1 ? "is-secondary" : "is-tertiary"}`}
              key={product.id}
              type="button"
              onClick={() => onOpenProduct(product)}
              aria-haspopup="dialog"
              aria-label={`Ver ${product.name}`}
            >
              <ProductVisual product={product} />
              <span>{product.name}</span>
            </button>
          ))}
        </motion.div> : null}
      </section>
  );
}

export function FAQ() {
  const questions = [
    ["¿La solicitud por WhatsApp ya es una compra?", "No. Es una forma sencilla de decirnos qué piezas te interesan. Por WhatsApp confirmamos disponibilidad, precio final, tiempo y recogida antes de cerrar cualquier pedido."],
    ["¿Dónde se recogen las piezas?", "La recogida es local. Por seguridad, el punto exacto y el horario se acuerdan únicamente en la conversación privada de WhatsApp; nunca publicamos un domicilio en la página."],
    ["¿Puedo pedir otros colores o tamaños?", "Si la pieza aparece como personalizable o sobre pedido, sí. Cuéntanos lo que imaginas y revisaremos los tonos, medidas y materiales disponibles."],
    ["¿Cuánto tarda una pieza personalizada?", "Depende del tamaño, la complejidad y los pedidos en curso. Antes de comenzar recibirás un tiempo estimado claro para que decidas con tranquilidad."],
    ["¿Por qué puede variar un poco mi pieza?", "Cada artículo se teje a mano. Puede haber variaciones mínimas en puntos o medidas, y esa singularidad es parte natural de una pieza artesanal."],
  ];

  return (
    <section className="ch-section ch-faq" id="preguntas" aria-labelledby="faq-title">
      <div className="ch-faq-intro">
        <p className="ch-eyebrow"><span /> Antes de elegir</p>
        <h2 id="faq-title">Preguntas con respuesta</h2>
        <p>Si te queda alguna duda, puedes agregarla como nota al preparar tu mensaje.</p>
      </div>
      <div className="ch-faq-list">
        {questions.map(([question, answer], index) => (
          <details key={question} open={index === 0}>
            <summary><span>{String(index + 1).padStart(2, "0")}</span><strong>{question}</strong><ChevronDown size={19} /></summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Footer({ settings }) {
  const instagram = instagramUrl(settings.instagram);

  return (
    <footer className="ch-footer">
      <div className="ch-footer-top">
        <div className="ch-footer-brand"><YarnMark /><h2>{settings.storeName}</h2><p>{settings.tagline}</p></div>
        <div><h3>Explora</h3><a href="#catalogo">Catálogo</a><a href="#personalizados">Pedidos personalizados</a><a href="#historia">Nuestra historia</a></div>
        <div><h3>Información</h3><a href="#preguntas">Preguntas frecuentes</a><span>{settings.businessHours || "Atención por WhatsApp"}</span><span>{settings.city || "Recogida local"}</span></div>
        <div className="ch-footer-note"><h3>Hecho cerca de ti</h3><p>{settings.pickupLabel}</p>{instagram ? <a href={instagram} target="_blank" rel="noreferrer">Ver Instagram <ArrowRight size={15} /></a> : null}</div>
      </div>
      <div className="ch-footer-bottom">
        <span>© {new Date().getFullYear()} {settings.storeName}</span>
        <span>Hecho despacio, para durar.</span>
        <a href="/admin">Administrar catálogo</a>
      </div>
    </footer>
  );
}
