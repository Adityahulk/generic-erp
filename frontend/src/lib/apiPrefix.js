/** API origin or path prefix (no trailing slash). Empty uses same-origin `/api` via Vite proxy. */
export function getApiBase() {
  const v = import.meta.env.VITE_API_URL;
  if (v) return String(v).replace(/\/$/, '');
  return '';
}

/** Full URL/path for fetch() — matches axios `baseURL` + relative path (e.g. `/invoices/...`). */
export function apiPath(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const b = getApiBase();
  if (!b) return `/api${p}`;
  if (b === '/api' || b.endsWith('/api')) return `${b}${p}`;
  return `${b}/api${p}`;
}
