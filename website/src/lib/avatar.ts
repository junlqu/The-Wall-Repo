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

// A square of the source image, in its own pixels.
export type AvatarCrop = { x: number; y: number; size: number };

// Shrinks the chosen square of the image to 128x128, so uploads stay a few KB
// no matter what the user picks.
export function renderAvatar(image: CanvasImageSource, crop: AvatarCrop): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  // Browsers that can't encode WebP silently return PNG instead - JPEG is smaller.
  const webp = canvas.toDataURL("image/webp", 0.85);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
}
