import { useEffect, useState } from "react";

import { getEurFxRate } from "../api.js";

const FX_CACHE_TTL_MS = 30 * 60 * 1000;
const fxRateCache = new Map();
const pendingRequests = new Map();

const sanitizeCurrencyCode = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);

const readCachedRate = (currencyCode) => {
  const entry = fxRateCache.get(currencyCode);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > FX_CACHE_TTL_MS) {
    fxRateCache.delete(currencyCode);
    return null;
  }
  return entry;
};

const fetchFxRate = async (currencyCode) => {
  const cached = readCachedRate(currencyCode);
  if (cached) return cached;

  const pending = pendingRequests.get(currencyCode);
  if (pending) return pending;

  const requestPromise = getEurFxRate(currencyCode)
    .then((payload) => {
      const nextEntry = {
        eurRate: Number(payload?.eur_rate) || 1,
        fallbackUsed: Boolean(payload?.fallback_used),
        cachedAt: Date.now()
      };
      fxRateCache.set(currencyCode, nextEntry);
      return nextEntry;
    })
    .finally(() => {
      pendingRequests.delete(currencyCode);
    });

  pendingRequests.set(currencyCode, requestPromise);
  return requestPromise;
};

export function useEurFxRates(currencies = []) {
  const [ratesByCurrency, setRatesByCurrency] = useState({});
  const [loadingByCurrency, setLoadingByCurrency] = useState({});
  const [fallbackByCurrency, setFallbackByCurrency] = useState({});

  useEffect(() => {
    const normalizedCurrencies = Array.from(
      new Set(
        (Array.isArray(currencies) ? currencies : [])
          .map(sanitizeCurrencyCode)
          .filter(Boolean)
          .filter((currencyCode) => currencyCode !== "EUR")
      )
    );

    if (!normalizedCurrencies.length) {
      return;
    }

    let cancelled = false;

    normalizedCurrencies.forEach((currencyCode) => {
      const cached = readCachedRate(currencyCode);
      if (cached) {
        setRatesByCurrency((prev) => ({
          ...prev,
          [currencyCode]: cached.eurRate
        }));
        setFallbackByCurrency((prev) => ({
          ...prev,
          [currencyCode]: cached.fallbackUsed
        }));
        setLoadingByCurrency((prev) => ({
          ...prev,
          [currencyCode]: false
        }));
        return;
      }

      setLoadingByCurrency((prev) => ({
        ...prev,
        [currencyCode]: true
      }));

      fetchFxRate(currencyCode)
        .then((entry) => {
          if (cancelled) return;
          setRatesByCurrency((prev) => ({
            ...prev,
            [currencyCode]: entry.eurRate
          }));
          setFallbackByCurrency((prev) => ({
            ...prev,
            [currencyCode]: entry.fallbackUsed
          }));
        })
        .catch(() => {
          if (cancelled) return;
          setRatesByCurrency((prev) => ({
            ...prev,
            [currencyCode]: 1
          }));
          setFallbackByCurrency((prev) => ({
            ...prev,
            [currencyCode]: true
          }));
        })
        .finally(() => {
          if (cancelled) return;
          setLoadingByCurrency((prev) => ({
            ...prev,
            [currencyCode]: false
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [JSON.stringify((Array.isArray(currencies) ? currencies : []).map(sanitizeCurrencyCode).sort())]);

  return {
    ratesByCurrency,
    loadingByCurrency,
    fallbackByCurrency
  };
}
