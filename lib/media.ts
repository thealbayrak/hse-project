const IMAGE_NAME = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i;

export function isImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_NAME.test(file.name);
}

/** Storage-safe file name: ASCII letters, digits, dot, dash and underscore only. */
export function sanitizeFileName(name: string) {
  return name.replaceAll(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 80);
}

/** File extension for a recorded audio MIME type (iOS records audio/mp4, Chrome audio/webm). */
export function audioExtension(mime: string) {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base === "audio/mp4" || base === "audio/x-m4a" || base === "audio/m4a") return "m4a";
  if (base === "audio/aac") return "aac";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/wav" || base === "audio/x-wav") return "wav";
  if (base === "audio/mpeg") return "mp3";
  return "webm";
}
