/**
 * Base64 with the runtime's own atob/btoa (Node 22, Lambda and browsers all have
 * them), so the api stays runtime-agnostic.
 *
 * Call sites: auth (token encoding), document upload and download handlers.
 */

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

/** null when the text isn't valid base64. */
export function base64ToBytes(base64: string): Uint8Array | null {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return null;
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** URL- and header-safe variant (no "+", "/" or padding). */
export const toBase64Url = (bytes: Uint8Array): string => bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function fromBase64Url(text: string): Uint8Array | null {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
}
