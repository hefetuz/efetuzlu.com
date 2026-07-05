import { put } from "@vercel/blob";
import { extname } from "node:path";
import { jsonResponse, requireCmsSession } from "../lib/cms-auth.js";

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
const mediaExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".m4v",
  ".mov",
  ".mp4",
  ".ogg",
  ".ogv",
  ".png",
  ".svg",
  ".webm",
  ".webp"
]);
const optimizedImageExtensions = new Set([".jpeg", ".jpg", ".png", ".webp"]);
const videoExtensions = new Set([".m4v", ".mov", ".mp4", ".ogg", ".ogv", ".webm"]);

function sanitizeFilename(filename = "") {
  const extension = extname(filename).toLowerCase();
  const base = filename
    .slice(0, Math.max(0, filename.length - extension.length))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "media";

  return `${base}${extension}`;
}

function mediaTypeFor(file, extension) {
  return file.type?.startsWith("video/") || videoExtensions.has(extension) ? "video" : "image";
}

export async function POST(request) {
  const session = requireCmsSession(request);
  if (session instanceof Response) return session;

  try {
    const url = new URL(request.url);
    const folder = url.searchParams.get("folder") === "optimized" ? "optimized" : "cms";
    const form = await request.formData();
    const file = form.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      throw new Error("No file found.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error("Upload is too large.");
    }

    const extension = extname(file.name || "").toLowerCase();
    if (!mediaExtensions.has(extension)) {
      throw new Error("Unsupported media type.");
    }
    if (folder === "optimized" && !optimizedImageExtensions.has(extension)) {
      throw new Error("Optimized uploads must be JPEG, PNG or WebP images.");
    }

    const options = {
      access: "public",
      addRandomSuffix: true,
      cacheControlMaxAge: 31536000,
      multipart: file.size > 4 * 1024 * 1024
    };
    if (file.type) options.contentType = file.type;

    const blob = await put(`assets/${folder}/${sanitizeFilename(file.name)}`, file, options);

    return jsonResponse({
      ok: true,
      src: blob.url,
      pathname: blob.pathname,
      type: mediaTypeFor(file, extension)
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || "Upload failed." }, 400);
  }
}
