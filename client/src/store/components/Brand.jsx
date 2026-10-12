import { Instagram, Menu, MessageCircle, ShoppingBag, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "../../lib/theme";
import { instagramUrl } from "../utils";
import "../store-brand.css";

const NAV_LINKS = [
  ["Catálogo", "#catalogo"],
  ["Personalizados", "#personalizados"],
  ["Nuestra historia", "#historia"],
  ["Preguntas", "#preguntas"],
];

export function YarnMark({ compact = false }) {
  return (
    <span className={`ch-brand-mark ${compact ? "is-compact" : ""}`} aria-hidden="true">
      <svg className="ch-brand-symbol" viewBox="0 0 72 72" focusable="false">
        <path
          className="ch-mark-hook"
          d="M49.5 60.5 63.8 19c1.1-3.3 5.7-2.5 5.2.9-.3 2.5-2.9 4.2-5.3 3.5"
        />
        <path
          className="ch-mark-ball"
          d="M9.8 37.2c0-15.6 10.9-26.5 25.5-26.5 13.9 0 24.7 9.9 24.7 23.9 0 8.4-3.9 15.8-10.7 20.6-4.2 3-9.4 4.6-15.1 4.6-14.1 0-24.4-9.2-24.4-22.6Z"
        />
        <path
          className="ch-mark-weave ch-mark-weave-a"
          d="M15.6 25.9c14.1 2.5 28.4 12.1 38.1 26.8"
        />
        <path
          className="ch-mark-weave ch-mark-weave-b"
          d="M17.1 50.9c4.5-15.8 14.1-29.1 29.8-37"
        />
        <path
          className="ch-mark-weave ch-mark-weave-c"
          d="M11.8 39.9c13.8-6.4 29.7-7.3 46.1-2.5"
        />
        <path
          className="ch-mark-monogram"
          d="M25.2 21.4c4.1 9.4 4.3 20.4.2 30.7M46.6 20.7c-4.4 9.9-4.3 21.3.1 31.7M26.9 36.8c6.3-3.3 12.4-3.5 18.3-.4"
        />
        <path className="ch-mark-thread-tail" d="M43.8 55.4c7.6 5.3 13.9 7.2 21 5.3" />
        <circle className="ch-mark-stitch" cx="16.1" cy="18.6" r="1.7" />
      </svg>
    </span>
  );
}

export function Header({
  settings,
  bagCount,
  onOpenBag,
  navigationReady = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const [navigatingTo, setNavigatingTo] = useState("");

  const menuButtonRef = useRef(null);
  const navigationTimerRef = useRef(null);

  const prefersReducedMotion = useReducedMotion();
  const instagram = instagramUrl(settings.instagram);

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const getHeaderOffset = () => {
    const header = document.querySelector(".ch-header");

    if (!header) {
      return 16;
    }

    return header.getBoundingClientRect().height + 16;
  };

  const scrollToSection = (href) => {
    const sectionId = href.replace("#", "");
    const section = document.getElementById(sectionId);

    if (!section) {
      console.warn(`No se encontró la sección #${sectionId}`);
      setNavigatingTo("");
      return;
    }

    const headerOffset = getHeaderOffset();
    const sectionTop =
      section.getBoundingClientRect().top +
      window.scrollY -
      headerOffset;

    window.scrollTo({
      top: Math.max(0, sectionTop),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });

    setActiveSection(sectionId);
    setNavigatingTo("");

    if (window.location.hash !== href) {
      window.history.replaceState(null, "", href);
    }
  };

  const navigateToSection = (event, href) => {
    event.preventDefault();

    const sectionId = href.replace("#", "");
    const section = document.getElementById(sectionId);

    if (!section) {
      console.warn(`No se encontró la sección #${sectionId}`);
      return;
    }

    setActiveSection(sectionId);
    setNavigatingTo(sectionId);

    if (navigationTimerRef.current) {
      window.clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = null;
    }

    /*
     * En móvil cerramos primero el menú.
     * Después hacemos el desplazamiento para que la animación
     * del menú y el scroll no compitan entre sí.
     */
    if (menuOpen) {
      closeMenu();

      navigationTimerRef.current = window.setTimeout(
        () => {
          scrollToSection(href);
        },
        prefersReducedMotion ? 0 : 230,
      );

      return;
    }

    scrollToSection(href);
  };

  const navigateHome = (event) => {
    event.preventDefault();

    if (navigationTimerRef.current) {
      window.clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = null;
    }

    closeMenu();
    setActiveSection("");
    setNavigatingTo("");

    if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }

    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  const openBag = () => {
    if (navigationTimerRef.current) {
      window.clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = null;
    }

    closeMenu();
    setNavigatingTo("");
    onOpenBag();
  };

  /*
   * Escape cierra el menú móvil.
   */
  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const closeOnEscape = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      setMenuOpen(false);

      window.requestAnimationFrame(() => {
        menuButtonRef.current?.focus();
      });
    };

    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  /*
   * Limpieza del temporizador utilizado al navegar desde móvil.
   */
  useEffect(() => {
    return () => {
      if (navigationTimerRef.current) {
        window.clearTimeout(navigationTimerRef.current);
      }
    };
  }, []);

  /*
   * Detecta automáticamente qué sección está viendo el usuario.
   */
  useEffect(() => {
    const sections = NAV_LINKS.map(([, href]) =>
      document.querySelector(href),
    ).filter(Boolean);

    if (
      !sections.length ||
      typeof IntersectionObserver === "undefined"
    ) {
      return undefined;
    }

    const hashSection = window.location.hash.slice(1);

    if (sections.some((section) => section.id === hashSection)) {
      setActiveSection(hashSection);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        /*
         * Mientras estamos desplazándonos por un clic del menú,
         * dejamos que esa sección permanezca activa.
         */
        if (navigatingTo) {
          return;
        }

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              b.intersectionRatio - a.intersectionRatio ||
              a.boundingClientRect.top -
                b.boundingClientRect.top,
          );

        if (visible[0]?.target?.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        rootMargin: "-22% 0px -62% 0px",
        threshold: [0, 0.12, 0.3, 0.5],
      },
    );

    sections.forEach((section) => {
      observer.observe(section);
    });

    return () => {
      observer.disconnect();
    };
  }, [navigationReady, navigatingTo]);

  return (
    <>
      {settings.announcement ? (
        <div className="ch-announcement" role="status">
          <span className="ch-announcement-dot" />
          <span>{settings.announcement}</span>
        </div>
      ) : null}

      <header className="ch-header">
        <a
          className="ch-logo"
          href="#inicio"
          aria-label={`${settings.storeName}, inicio`}
          onClick={navigateHome}
        >
          <span className="ch-brand-image-wrap" aria-hidden="true">
          <img
           className="ch-brand-image"
           src="/casa-hebra-icon.png"
           alt=""
           width="56"
           height="56"
          />
          </span>

          <span className="ch-logo-copy">
            <span className="ch-logo-name-row">
              <strong>{settings.storeName}</strong>

              <span
                className="ch-logo-stitches"
                aria-hidden="true"
              >
                <i />
                <i />
                <i />
              </span>
            </span>

            <small>{settings.tagline}</small>
          </span>
        </a>

        {/* Navegación de escritorio */}
        <nav
          className="ch-desktop-nav"
          aria-label="Navegación principal"
        >
          {NAV_LINKS.map(([label, href], index) => {
            const sectionId = href.slice(1);
            const active = activeSection === sectionId;

            return (
              <a
                key={href}
                href={href}
                className={active ? "is-active" : undefined}
                aria-current={active ? "location" : undefined}
                onClick={(event) =>
                  navigateToSection(event, href)
                }
              >
                <span
                  className="ch-nav-index"
                  aria-hidden="true"
                >
                  0{index + 1}
                </span>

                <span className="ch-nav-label">
                  {label}
                </span>
              </a>
            );
          })}
        </nav>

        {/* Acciones */}
        <div className="ch-header-actions">
          <ThemeToggle className="ch-theme-toggle" />

          {instagram ? (
            <a
              className="ch-icon-button ch-desktop-social"
              href={instagram}
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram de Casa Hebra"
            >
              <Instagram size={19} />
            </a>
          ) : null}

          <button
            className="ch-bag-button"
            type="button"
            onClick={openBag}
          >
            <ShoppingBag size={19} />

            <span className="ch-bag-label">
              Mi selección
            </span>

            <span
              className="ch-bag-count"
              aria-label={`${bagCount} piezas seleccionadas`}
            >
              {bagCount}
            </span>
          </button>

          <button
            className="ch-icon-button ch-menu-button"
            ref={menuButtonRef}
            type="button"
            onClick={() =>
              setMenuOpen((current) => !current)
            }
            aria-label={
              menuOpen ? "Cerrar menú" : "Abrir menú"
            }
            aria-expanded={menuOpen}
            aria-controls="casa-hebra-mobile-nav"
          >
            <AnimatePresence
              initial={false}
              mode="wait"
            >
              <motion.span
                key={menuOpen ? "close" : "menu"}
                initial={
                  prefersReducedMotion
                    ? false
                    : {
                        opacity: 0,
                        rotate: -20,
                        scale: 0.82,
                      }
                }
                animate={{
                  opacity: 1,
                  rotate: 0,
                  scale: 1,
                }}
                exit={
                  prefersReducedMotion
                    ? undefined
                    : {
                        opacity: 0,
                        rotate: 20,
                        scale: 0.82,
                      }
                }
                transition={{
                  duration: prefersReducedMotion
                    ? 0
                    : 0.16,
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {menuOpen ? (
                  <X size={21} />
                ) : (
                  <Menu size={21} />
                )}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>

        {/* Menú móvil */}
        <AnimatePresence>
          {menuOpen ? (
            <motion.nav
              id="casa-hebra-mobile-nav"
              className="ch-mobile-nav"
              aria-label="Navegación móvil"
              initial={
                prefersReducedMotion
                  ? false
                  : {
                      opacity: 0,
                      height: 0,
                      y: -8,
                    }
              }
              animate={{
                opacity: 1,
                height: "auto",
                y: 0,
              }}
              exit={{
                opacity: 0,
                height: 0,
                y: -6,
              }}
              transition={
                prefersReducedMotion
                  ? {
                      duration: 0,
                    }
                  : {
                      duration: 0.26,
                      ease: [0.22, 1, 0.36, 1],
                    }
              }
            >
              <motion.p
                className="ch-mobile-nav-heading"
                initial={
                  prefersReducedMotion
                    ? false
                    : {
                        opacity: 0,
                        y: -4,
                      }
                }
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  duration: prefersReducedMotion
                    ? 0
                    : 0.2,
                }}
              >
                Explora Casa Hebra
                <span aria-hidden="true" />
              </motion.p>

              {NAV_LINKS.map(
                ([label, href], index) => {
                  const sectionId = href.slice(1);
                  const active =
                    activeSection === sectionId;

                  return (
                    <motion.a
                      key={href}
                      href={href}
                      className={
                        active ? "is-active" : undefined
                      }
                      aria-current={
                        active ? "location" : undefined
                      }
                      onClick={(event) =>
                        navigateToSection(event, href)
                      }
                      initial={
                        prefersReducedMotion
                          ? false
                          : {
                              opacity: 0,
                              x: -16,
                            }
                      }
                      animate={{
                        opacity: 1,
                        x: 0,
                      }}
                      transition={
                        prefersReducedMotion
                          ? {
                              duration: 0,
                            }
                          : {
                              duration: 0.22,
                              delay: 0.045 + index * 0.045,
                              ease: [0.22, 1, 0.36, 1],
                            }
                      }
                      whileTap={
                        prefersReducedMotion
                          ? undefined
                          : {
                              scale: 0.985,
                            }
                      }
                    >
                      <span
                        className="ch-mobile-nav-index"
                        aria-hidden="true"
                      >
                        0{index + 1}
                      </span>

                      <span className="ch-mobile-nav-label">
                        {label}
                      </span>

                      <motion.span
                        className="ch-mobile-nav-stitch"
                        aria-hidden="true"
                        animate={{
                          scaleX: active ? 1 : 0.55,
                          opacity: active ? 1 : 0.55,
                        }}
                        transition={{
                          duration: 0.2,
                        }}
                      />
                    </motion.a>
                  );
                },
              )}

              <motion.div
                className="ch-mobile-theme-row"
                initial={
                  prefersReducedMotion
                    ? false
                    : {
                        opacity: 0,
                        y: 8,
                      }
                }
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  duration: prefersReducedMotion
                    ? 0
                    : 0.22,
                  delay: prefersReducedMotion
                    ? 0
                    : 0.18,
                }}
              >
                <span>Apariencia</span>

                <div className="ch-mobile-utilities">
                  {instagram ? (
                    <a
                      className="ch-mobile-instagram"
                      href={instagram}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Abrir Instagram de Casa Hebra"
                    >
                      <Instagram size={17} />
                      <span>Instagram</span>
                    </a>
                  ) : null}

                  <ThemeToggle className="ch-mobile-theme-toggle" />
                </div>
              </motion.div>

              <motion.button
                type="button"
                onClick={openBag}
                initial={
                  prefersReducedMotion
                    ? false
                    : {
                        opacity: 0,
                        y: 10,
                      }
                }
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  duration: prefersReducedMotion
                    ? 0
                    : 0.22,
                  delay: prefersReducedMotion
                    ? 0
                    : 0.21,
                }}
                whileTap={
                  prefersReducedMotion
                    ? undefined
                    : {
                        scale: 0.985,
                      }
                }
              >
                <MessageCircle size={18} />
                Consultar mi selección
              </motion.button>
            </motion.nav>
          ) : null}
        </AnimatePresence>
      </header>
    </>
  );
}

export function ProductVisual({ product, className = "", eager = false, imageIndex = 0 }) {
  const [failed, setFailed] = useState(false);
  const source = product?.images?.[imageIndex];

  useEffect(() => {
    setFailed(false);
  }, [source, product?.id, product?.name, imageIndex]);

  if (source && !failed) {
    return (
      <img
        className={`ch-product-image ${className}`}
        src={source}
        alt={product.name}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "auto"}
        draggable="false"
        onError={() => setFailed(true)}
      />
    );
  }

  const productHash = String(product?.name || "Casa Hebra")
    .split("")
    .reduce((sum, character) => sum + character.charCodeAt(0), 0) % 4;

  return (
    <div className={`ch-product-placeholder ch-placeholder-${productHash} ${className}`} role="img" aria-label={`Vista ilustrada de ${product?.name || "pieza de crochet"}`}>
      <svg viewBox="0 0 460 520" aria-hidden="true">
        <path className="ch-placeholder-thread" d="M-20 395C55 331 119 454 190 393c62-54 99-29 136 8 45 46 94 11 145-13" />
        <ellipse className="ch-placeholder-shadow" cx="230" cy="388" rx="120" ry="27" />
        <path className="ch-placeholder-piece" d="M146 168c11-54 48-88 84-88s73 34 84 88l37 174c5 22-12 42-35 42H144c-23 0-40-20-35-42l37-174Z" />
        <path className="ch-placeholder-knit" d="M143 205c57 21 117 21 174 0M132 258c66 24 130 24 196 0M121 313c75 25 143 25 218 0" />
        <path className="ch-placeholder-handle" d="M180 174c0-73 100-73 100 0" />
      </svg>
      <span>Fotografía próximamente</span>
    </div>
  );
}
