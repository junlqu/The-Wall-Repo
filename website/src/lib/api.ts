// On Azure Static Web Apps, a linked Functions API is proxied under the same
// origin at "/api/*". Locally the Next.js dev server and the Functions host
// run on separate ports, so NEXT_PUBLIC_API_BASE_URL points at the Functions
// host directly (see website/.env.local.example).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
