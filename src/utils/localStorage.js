/**
 * Safe localStorage wrappers.
 * Prevents crashes in environments where localStorage is unavailable
 * (private browsing, storage full, SSR, etc.).
 */
export const getSafeLocalStorage = (key) => {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
};

export const setSafeLocalStorage = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* Storage unavailable */ }
};
