import { useCallback, useEffect, useMemo, useState } from "react";
import { productPriceForSize } from "../utils";

const STORAGE_KEY = "casa-hebra-inquiry-bag-v1";
export const MAX_INQUIRY_LINES = 20;

function makeKey(productId, color, size) {
  return [productId, color || "sin-color", size || "sin-talla"].join("::");
}

function readBag() {
  if (typeof window === "undefined") return [];

  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value)
      ? value
          .filter((item) => item && item.productId && Number(item.quantity) > 0)
          .slice(0, MAX_INQUIRY_LINES)
          .map((item) => ({
            ...item,
            key: item.key || makeKey(item.productId, item.color, item.size),
            price: Math.max(0, Number(item.price) || 0),
            quantity: Math.max(1, Math.min(20, Math.floor(Number(item.quantity)))),
          }))
      : [];
  } catch {
    return [];
  }
}

export function useInquiryBag(products = [], storeReady = false) {
  const [items, setItems] = useState(readBag);

  useEffect(() => {
    if (!storeReady) return;
    const productsById = new Map(products.map((product) => [product.id, product]));
    setItems((current) => {
      const quantitiesByProduct = new Map();
      return current.flatMap((item) => {
        const product = productsById.get(item.productId);
        const unavailable =
          !product ||
          product.status === "sold_out" ||
          (product.status === "available" && Number(product.stockQuantity) <= 0);
        if (unavailable) return [];

        const colors = Array.isArray(product.colors) ? product.colors : [];
        const sizes = Array.isArray(product.sizes) ? product.sizes : [];
        const removedVariant =
          (colors.length > 0 && !colors.includes(item.color)) ||
          (sizes.length > 0 && !sizes.includes(item.size));
        if (removedVariant) return [];

        const maxQuantity =
          product.status === "available" && Number(product.stockQuantity) > 0
            ? Number(product.stockQuantity)
            : 20;
        const usedQuantity = quantitiesByProduct.get(product.id) || 0;
        const quantity = Math.min(item.quantity, maxQuantity - usedQuantity);
        if (quantity <= 0) return [];
        quantitiesByProduct.set(product.id, usedQuantity + quantity);
        return [{
          ...item,
          name: product.name,
          price: productPriceForSize(product, item.size),
          image: product.images?.[0] || "",
          status: product.status,
          stockQuantity: product.stockQuantity,
          color: colors.length ? item.color : "",
          size: sizes.length ? item.size : "",
          quantity,
        }];
      });
    });
  }, [products, storeReady]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // The bag remains usable when storage is blocked or full.
    }
  }, [items]);

  const addItem = useCallback((product, selection) => {
    const maxQuantity =
      product.status === "available" && Number(product.stockQuantity) > 0
        ? Number(product.stockQuantity)
        : 20;
    const quantity = Math.min(maxQuantity, Math.max(1, Number(selection.quantity) || 1));
    const key = makeKey(product.id, selection.color, selection.size);
    const alreadySelected = items.some((item) => item.key === key);
    const usedQuantity = items
      .filter((item) => item.productId === product.id)
      .reduce((sum, item) => sum + item.quantity, 0);

    if (!alreadySelected && items.length >= MAX_INQUIRY_LINES) {
      return { added: false, reason: "line_limit" };
    }
    if (usedQuantity >= maxQuantity) {
      return { added: false, reason: "stock_limit" };
    }

    setItems((current) => {
      const existing = current.find((item) => item.key === key);
      if (!existing && current.length >= MAX_INQUIRY_LINES) return current;
      const otherQuantity = current
        .filter((item) => item.productId === product.id && item.key !== key)
        .reduce((sum, item) => sum + item.quantity, 0);
      const maximumForSelection = Math.max(0, maxQuantity - otherQuantity);
      if (existing) {
        return current.map((item) =>
          item.key === key
            ? {
                ...item,
                quantity: Math.min(
                  Math.max(1, maximumForSelection),
                  item.quantity + quantity,
                ),
              }
            : item,
        );
      }

      if (maximumForSelection <= 0) return current;

      return [
        ...current,
        {
          key,
          productId: product.id,
          name: product.name,
          price: productPriceForSize(product, selection.size),
          image: product.images?.[0] || "",
          status: product.status,
          stockQuantity: product.stockQuantity,
          color: selection.color || "",
          size: selection.size || "",
          quantity: Math.min(quantity, maximumForSelection),
        },
      ];
    });
    return { added: true, quantity: Math.min(quantity, maxQuantity - usedQuantity) };
  }, [items]);

  const updateQuantity = useCallback((key, quantity) => {
    const safeQuantity = Number(quantity);
    if (safeQuantity <= 0) {
      setItems((current) => current.filter((item) => item.key !== key));
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, quantity: safeQuantity } : item,
      ),
    );
  }, []);

  const removeItem = useCallback((key) => {
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );
  const estimatedTotal = useMemo(
    () =>
      items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items],
  );

  return {
    items,
    count,
    estimatedTotal,
    lineLimitReached: items.length >= MAX_INQUIRY_LINES,
    maximumLines: MAX_INQUIRY_LINES,
    addItem,
    updateQuantity,
    removeItem,
    clear,
  };
}
