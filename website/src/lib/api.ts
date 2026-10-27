// On Azure Static Web Apps, a linked Functions API is proxied under the same
// origin at "/api/*". Locally the Next.js dev server and the Functions host
// run on separate ports, so NEXT_PUBLIC_API_BASE_URL points at the Functions
// host directly (see website/.env.local.example).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

// Admin-only requests that change climbs or announcements. Errors carry the
// API's message, which is written for the admin to read.
export async function adminRequest(path: string, init: RequestInit) {
  const res = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  }).catch(() => {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong. Try again.");
  return body;
}
