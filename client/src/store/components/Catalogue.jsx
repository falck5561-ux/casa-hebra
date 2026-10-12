import {
  ArrowDownUp,
  ArrowRight,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { forwardRef } from "react";
import {
  categoryName,
  formatMoney,
  hasPricedSizes,
  productStatus,
} from "../utils";
import { ProductVisual } from "./Brand";
import "../store-motion.css";

const PRODUCT_TONES = ["#9f3f64", "#39766d", "#806819", "#705995", "#426d88"];

function productTone(product) {
  const source = String(product.categoryId || product.name || "Casa Hebra");
  const hash = [...source].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  return PRODUCT_TONES[hash % PRODUCT_TONES.length];
}

function revealTransition(index = 0) {
  return {
    duration: 0.5,
    delay: Math.min(index, 5) * 0.04,
    ease: [0.22, 1, 0.36, 1],
  };
}

function motionState(reducedMotion, index = 0) {
  if (reducedMotion) {
    return {
      initial: false,
      visible: { opacity: 1 },
      exit: { opacity: 1 },
      transition: { duration: 0 },
    };
  }

  return {
    initial: { opacity: 0, y: 22, scale: 0.985 },
    visible: { opacity: 1, y: 0, scale: 1 },
    exit: {
      opacity: 0,
      y: -10,
      scale: 0.985,
      transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
    },
    transition: revealTransition(index),
  };
}

export const ProductCard = forwardRef(function ProductCard(
  { product, categories, currency, onOpen, featured = false, index = 0 },
  ref,
) {
  const reducedMotion = useReducedMotion();
  const status = productStatus(product);
  const accent = productTone(product);
  const disabled =
    product.status === "sold_out" ||
    (product.status === "available" && Number(product.stockQuantity) <= 0);
  const cardMotion = motionState(reducedMotion, index);

  return (
    <motion.article
      ref={ref}
      className={`ch-product-card ch-motion-card ${featured ? "is-featured" : ""}`}
      layout={reducedMotion ? false : "position"}
      initial={cardMotion.initial}
      whileInView={cardMotion.visible}
      viewport={{ once: true, amount: 0.12, margin: "0px 0px -36px" }}
      exit={cardMotion.exit}
      transition={cardMotion.transition}
      style={{
        "--ch-card-accent": accent,
      }}
      data-product-transition-id={`product-${product.id}`}
    >
      <motion.button
        className="ch-product-card-visual"
        type="button"
        onClick={() => onOpen(product)}
        aria-label={`${status.label}. Ver detalles de ${product.name}`}
        whileTap={reducedMotion ? undefined : { scale: 0.99 }}
      >
        <ProductVisual className="ch-product-cutout" product={product} />
        <span className={`ch-status-pill is-${status.tone}`}>{status.label}</span>
        {featured ? (
          <span className="ch-featured-pill">
            <Sparkles size={13} /> Destacado
          </span>
        ) : null}
        <span className="ch-visual-invitation" aria-hidden="true">
          Descubrir
          <ArrowRight size={14} />
        </span>
      </motion.button>
      <div className="ch-product-card-body">
        <div className="ch-product-card-heading">
          <p className="ch-product-category">
            {categoryName(categories, product.categoryId)}
          </p>
          <h3>{product.name}</h3>
        </div>
        <p className="ch-product-short">
          {product.shortDescription || "Una pieza tejida a mano con calma y atención a cada detalle."}
        </p>
        {product.customizable ? (
          <span className="ch-customizable-label">
            <Sparkles size={13} /> Personalizable a tu gusto
          </span>
        ) : (
          <span className="ch-customizable-label is-craft">
            <Sparkles size={13} /> Tejido completamente a mano
          </span>
        )}
        <div className="ch-product-card-footer">
          <div className="ch-price-row">
            <strong>
              {hasPricedSizes(product) ? "Desde " : ""}
              {formatMoney(product.price, currency)}
            </strong>
            {Number(product.compareAtPrice) > Number(product.price) ? (
              <del>{formatMoney(product.compareAtPrice, currency)}</del>
            ) : null}
            {product.leadTime && product.status === "made_to_order" ? (
              <span>{product.leadTime}</span>
            ) : null}
          </div>
          <motion.button
            className="ch-card-action"
            type="button"
            onClick={() => onOpen(product)}
            disabled={disabled}
            whileTap={disabled || reducedMotion ? undefined : { scale: 0.985 }}
          >
            {disabled ? "No disponible" : "Ver detalles"}
            {!disabled ? <ArrowRight size={16} /> : null}
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
});

function ProductSkeleton() {
  return (
    <div className="ch-product-card ch-skeleton-card" aria-hidden="true">
      <div className="ch-skeleton ch-skeleton-image" />
      <div className="ch-product-card-body">
        <div className="ch-skeleton ch-skeleton-eyebrow" />
        <div className="ch-skeleton ch-skeleton-title" />
        <div className="ch-skeleton ch-skeleton-copy" />
        <div className="ch-skeleton ch-skeleton-price" />
      </div>
    </div>
  );
}

export function Featured({ products, categories, currency, loading, onOpen }) {
  const reducedMotion = useReducedMotion();
  const featured = products.filter((product) => product.featured).slice(0, 3);
  const featuredIds = new Set(featured.map((product) => product.id));
  const visible = [
    ...featured,
    ...products.filter((product) => !featuredIds.has(product.id)),
  ].slice(0, 3);

  if (!loading && !visible.length) return null;

  return (
    <section className="ch-section ch-featured" aria-labelledby="favoritos-title">
      <motion.div
        className="ch-section-heading ch-heading-split ch-motion-heading"
        initial={reducedMotion ? false : { opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={reducedMotion ? { duration: 0 } : revealTransition()}
      >
        <div>
          <p className="ch-eyebrow"><Sparkles size={15} /> Selección de la casa</p>
          <h2 id="favoritos-title">Piezas que roban miradas</h2>
        </div>
        <p>
          Cada una tiene pequeñas variaciones que la hacen genuinamente única. Eso también es parte de su encanto.
        </p>
      </motion.div>
      <motion.div
        className="ch-product-grid ch-featured-grid ch-motion-grid"
        layout={reducedMotion ? false : "position"}
      >
        {loading
          ? [0, 1, 2].map((key) => <ProductSkeleton key={key} />)
          : visible.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                categories={categories}
                currency={currency}
                onOpen={onOpen}
                featured
                index={index}
              />
            ))}
      </motion.div>
    </section>
  );
}

export function Catalogue({
  categories,
  products,
  currency,
  loading,
  error,
  retry,
  query,
  onQuery,
  category,
  onCategory,
  sort,
  onSort,
  onOpen,
}) {
  const reducedMotion = useReducedMotion();
  const resultMessage = loading
    ? "Buscando piezas…"
    : `${products.length} ${products.length === 1 ? "pieza" : "piezas"}`;
  const stageMotion = reducedMotion
    ? {
        initial: false,
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
      };

  function renderCategoryButton(value, label) {
    const active = category === value;

    return (
      <motion.button
        key={value}
        className={`ch-motion-filter ${active ? "is-active" : ""}`}
        type="button"
        onClick={() => onCategory(value)}
        aria-pressed={active}
        whileTap={reducedMotion ? undefined : { scale: 0.97 }}
      >
        {active ? (
          <motion.span
            className="ch-filter-active-bg"
            layoutId="ch-active-category-filter"
            transition={
              reducedMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 430, damping: 34, mass: 0.7 }
            }
            aria-hidden="true"
          />
        ) : null}
        <span className="ch-filter-label">{label}</span>
      </motion.button>
    );
  }

  return (
    <section className="ch-section ch-catalogue" id="catalogo" aria-labelledby="catalogo-title">
      <motion.div
        className="ch-section-heading ch-catalogue-heading ch-motion-heading"
        initial={reducedMotion ? false : { opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={reducedMotion ? { duration: 0 } : revealTransition()}
      >
        <div>
          <p className="ch-eyebrow"><span /> Catálogo</p>
          <h2 id="catalogo-title">Todas las piezas, en un solo lugar</h2>
        </div>
        <p className="ch-result-count" aria-live="polite">
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={resultMessage}
              initial={reducedMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
              transition={{ duration: reducedMotion ? 0 : 0.16 }}
            >
              {resultMessage}
            </motion.span>
          </AnimatePresence>
        </p>
      </motion.div>

      <motion.div
        className="ch-catalogue-toolbar ch-motion-toolbar"
        initial={reducedMotion ? false : { opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={reducedMotion ? { duration: 0 } : revealTransition(1)}
      >
        <label className="ch-search-field">
          <Search size={19} aria-hidden="true" />
          <span className="sr-only">Buscar en el catálogo</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Buscar llaveros, amigurumis, flores…"
          />
          <AnimatePresence initial={false}>
            {query ? (
              <motion.button
                type="button"
                onClick={() => onQuery("")}
                aria-label="Limpiar búsqueda"
                initial={reducedMotion ? false : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.8 }}
                transition={{ duration: reducedMotion ? 0 : 0.16 }}
              >
                ×
              </motion.button>
            ) : null}
          </AnimatePresence>
        </label>
        <label className="ch-sort-field">
          <ArrowDownUp size={17} aria-hidden="true" />
          <span className="sr-only">Ordenar catálogo</span>
          <select value={sort} onChange={(event) => onSort(event.target.value)}>
            <option value="featured">Recomendados</option>
            <option value="newest">Más recientes</option>
            <option value="price-asc">Precio: menor a mayor</option>
            <option value="price-desc">Precio: mayor a menor</option>
            <option value="name">Nombre</option>
          </select>
        </label>
      </motion.div>

      <div className="ch-category-scroll" role="group" aria-label="Filtrar por categoría">
        <SlidersHorizontal size={17} aria-hidden="true" />
        {renderCategoryButton("all", "Todo")}
        {categories.map((item) => renderCategoryButton(item.id, item.name))}
      </div>

      <div className="ch-catalogue-stage" aria-busy={loading || undefined}>
        <AnimatePresence initial={false} mode="wait">
          {error ? (
            <motion.div key="catalogue-error" className="ch-state-card" role="alert" {...stageMotion}>
              <span className="ch-state-icon">!</span>
              <h3>Se nos enredó un poquito el hilo</h3>
              <p>{error}</p>
              <button className="ch-button ch-button-primary" type="button" onClick={retry}>
                Intentar de nuevo
              </button>
            </motion.div>
          ) : loading ? (
            <motion.div key="catalogue-loading" className="ch-product-grid ch-motion-grid" {...stageMotion}>
              {[0, 1, 2, 3, 4, 5].map((key) => <ProductSkeleton key={key} />)}
            </motion.div>
          ) : products.length ? (
            <motion.div
              key="catalogue-results"
              className="ch-product-grid ch-motion-grid"
              layout={reducedMotion ? false : "position"}
              {...stageMotion}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {products.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    categories={categories}
                    currency={currency}
                    onOpen={onOpen}
                    index={index}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div key="catalogue-empty" className="ch-state-card ch-empty-state" {...stageMotion}>
              <span className="ch-state-yarn" aria-hidden="true"><Search size={23} /></span>
              <h3>No encontramos esa pieza</h3>
              <p>Prueba con otra palabra o vuelve a ver todas las categorías.</p>
              <button
                className="ch-button ch-button-secondary"
                type="button"
                onClick={() => { onQuery(""); onCategory("all"); }}
              >
                Ver todo el catálogo
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
