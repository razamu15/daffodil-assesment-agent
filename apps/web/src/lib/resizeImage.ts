/**
 * Client-side image resize before upload (Doc 2 §3 "Upload"): longest edge at
 * most UPLOAD_MAX_IMAGE_EDGE_PX, re-encoded as JPEG, base64 without the data-URL
 * prefix. Keeps the request under the Lambda payload limit and within model
 * image limits.
 *
 * Call site: the chat composer's "Attach screenshot".
 */
import { UPLOAD_MAX_BASE64_CHARS, UPLOAD_MAX_IMAGE_EDGE_PX } from "@helper-assistant/domain";
import type { ImageMediaType } from "@helper-assistant/domain";

const OUTPUT_MEDIA_TYPE: ImageMediaType = "image/jpeg";
const JPEG_QUALITY = 0.88;

export class ImageTooLargeError extends Error {}

export async function resizeImageForUpload(file: File): Promise<{ mediaType: ImageMediaType; base64: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, UPLOAD_MAX_IMAGE_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d")!;
  // JPEG has no transparency: screenshots with alpha get a white background, not black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL(OUTPUT_MEDIA_TYPE, JPEG_QUALITY);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  if (base64.length > UPLOAD_MAX_BASE64_CHARS) throw new ImageTooLargeError("This image is too large to upload, even after shrinking it.");
  return { mediaType: OUTPUT_MEDIA_TYPE, base64 };
}
