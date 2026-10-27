import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Index = sum of the digits in a user's ID, mod 10. Each colour's image lives
// at assets/starter-avatars/<index>-<colour>.<png|webp|jpg|jpeg>.
export const STARTER_AVATAR_COLOURS = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
  "black",
  "white",
] as const;

// Compiled output runs from dist/src, so step back up to the api folder.
const STARTER_AVATAR_DIR = path.join(__dirname, "..", "..", "assets", "starter-avatars");

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const MAX_UPLOAD_BYTES = 64 * 1024;

const IMAGE_SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  "image/png": (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/webp": (bytes) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
};

const starterAvatarCache = new Map<number, string>();

export function starterAvatarIndex(userID: string): number {
  let sum = 0;
  for (const char of userID) {
    if (char >= "0" && char <= "9") sum += Number(char);
  }
  return sum % STARTER_AVATAR_COLOURS.length;
}

// The user's starter image as a data URL, ready to store in an Avatar document.
export function getStarterAvatar(userID: string): string {
  const index = starterAvatarIndex(userID);
  const cached = starterAvatarCache.get(index);
  if (cached) return cached;

  const baseName = `${index}-${STARTER_AVATAR_COLOURS[index]}`;
  const fileName = readdirSync(STARTER_AVATAR_DIR).find(
    (name) => path.parse(name).name === baseName && path.extname(name).toLowerCase() in CONTENT_TYPE_BY_EXTENSION,
  );
  if (!fileName) {
    throw new Error(`Missing starter avatar ${baseName}.png/.webp/.jpg in ${STARTER_AVATAR_DIR}.`);
  }

  const contentType = CONTENT_TYPE_BY_EXTENSION[path.extname(fileName).toLowerCase()];
  const dataUrl = `data:${contentType};base64,${readFileSync(path.join(STARTER_AVATAR_DIR, fileName)).toString("base64")}`;
  starterAvatarCache.set(index, dataUrl);
  return dataUrl;
}

// Splits a stored data URL back into bytes for serving. Stored avatars were
// validated on the way in (or are our own starter images).
export function decodeDataUrl(dataUrl: string): { contentType: string; bytes: Buffer } {
  const [header, base64] = dataUrl.split(",", 2);
  return { contentType: header.slice("data:".length, header.indexOf(";")), bytes: Buffer.from(base64, "base64") };
}

// Accepts only small PNG/JPEG/WebP uploads whose bytes match their declared
// type, so nothing else (SVG, HTML, ...) can be served back as an avatar.
export function isValidAvatarUpload(dataUrl: unknown): dataUrl is string {
  if (typeof dataUrl !== "string") return false;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return false;

  const [, contentType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  return bytes.length > 0 && bytes.length <= MAX_UPLOAD_BYTES && IMAGE_SIGNATURES[contentType](bytes);
}
