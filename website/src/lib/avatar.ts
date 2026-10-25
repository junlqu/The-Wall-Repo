import { apiUrl } from "@/lib/api";
import type { SessionUser } from "@/lib/session";

export const AVATAR_SIZE = 128;

// The ?v= changes whenever the user uploads a new picture, which lets the API
// tell browsers to cache each version forever.
export function avatarUrl(user: Pick<SessionUser, "userID" | "avatarUpdatedAt">): string {
  const version = user.avatarUpdatedAt ? `?v=${encodeURIComponent(user.avatarUpdatedAt)}` : "";
  return apiUrl(`/avatars/${user.userID}${version}`);
}

// Fetches the avatar into the browser cache so it's already there when the
// header renders it. Never rejects, and gives up waiting after `timeoutMs`.
export function preloadAvatar(user: Pick<SessionUser, "userID" | "avatarUpdatedAt">, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    setTimeout(resolve, timeoutMs);
    img.src = avatarUrl(user);
  });
}

// Centre-crops the picked image to a square and shrinks it to 128x128, so
// uploads stay a few KB no matter what the user picks.
export async function resizeToAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();

  // Browsers that can't encode WebP silently return PNG instead - JPEG is smaller.
  const webp = canvas.toDataURL("image/webp", 0.85);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
}
