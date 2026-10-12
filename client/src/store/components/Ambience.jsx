import { ArrowUp } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";
import { useEffect, useState } from "react";

export function StitchProgress() {
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 115,
    damping: 24,
    mass: 0.22,
  });

  return (
    <div className="ch-stitch-progress" aria-hidden="true">
      <motion.span
        style={{
          scaleX: prefersReducedMotion ? scrollYProgress : smoothProgress,
        }}
      />
    </div>
  );
}

export function BackToTop() {
  const prefersReducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setVisible(window.scrollY > 900));
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          className="ch-back-to-top"
          type="button"
          aria-label="Volver al inicio"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
          onClick={() => window.scrollTo({
            top: 0,
            behavior: prefersReducedMotion ? "auto" : "smooth",
          })}
        >
          <ArrowUp size={16} aria-hidden="true" />
          <span>Inicio</span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
