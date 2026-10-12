import { useCallback, useEffect, useState } from "react";

export const DEFAULT_SETTINGS = {
  storeName: "Casa Hebra",
  tagline: "Hecho a mano, punto por punto.",
  heroTitle: "Piezas con alma, tejidas para quedarse",
  heroText:
    "Crochet hecho a mano en piezas pequeñas, cuidadas y únicas. Explora el catálogo y cuéntame por WhatsApp cuál te enamoró.",
  story:
    "Casa Hebra nació del gusto por crear despacio: elegir cada tono, cuidar cada punto y convertir una idea sencilla en algo que acompañe tus días.",
  whatsappNumber: "",
  city: "",
  pickupLabel:
    "Recogida local · el punto y horario se acuerdan por WhatsApp",
  currency: "MXN",
  instagram: "",
  businessHours: "",
  announcement: "",
  accentColor: "#963D64",
};

function normalizePayload(payload) {
  const source = payload?.data ?? payload ?? {};
  const retentionDays = Number(source.privacy?.inquiryRetentionDays);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(source.settings ?? {}) },
    categories: Array.isArray(source.categories)
      ? source.categories.filter((category) => category.active !== false)
      : [],
    products: Array.isArray(source.products)
      ? source.products.filter((product) => product.active !== false)
      : [],
    retentionDays:
      Number.isInteger(retentionDays) &&
      retentionDays > 0 &&
      retentionDays <= 180
        ? retentionDays
        : 180,
  };
}

export function useStore() {
  const [store, setStore] = useState(() => normalizePayload({}));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(0);

  const retry = useCallback(() => setRequestKey((key) => key + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStore() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/store", {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("No pudimos cargar el catálogo en este momento.");
        }

        const payload = await response.json();
        setStore(normalizePayload(payload));
      } catch (requestError) {
        if (requestError.name !== "AbortError") {
          setError(
            requestError instanceof SyntaxError
              ? "El catálogo respondió de una forma inesperada. Inténtalo nuevamente."
              : requestError.message ||
                  "No pudimos cargar el catálogo en este momento.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadStore();
    return () => controller.abort();
  }, [requestKey]);

  return { ...store, loading, error, retry };
}
