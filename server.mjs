import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);
const contentBlobPath = "cms/content.json";

loadLocalEnv();
normalizeBlobEnv();

const types = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8"
};

const mediaDirectory = join(root, "assets", "cms");
const optimizedMediaDirectory = join(root, "assets", "optimized");
const contentPath = join(root, "cms", "content.json");
const maxUploadBytes = 50 * 1024 * 1024;
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
const videoExtensions = new Set([".m4v", ".mov", ".mp4", ".ogg", ".ogv", ".webm"]);
const optimizedImageExtensions = new Set([".jpeg", ".jpg", ".png", ".webp"]);
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"
};

function loadLocalEnv() {
  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getBlobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN || "";
}

function normalizeBlobEnv() {
  if (process.env.BLOB_READ_WRITE_TOKEN && process.env.VERCEL_OIDC_TOKEN && !process.env.BLOB_STORE_ID) {
    delete process.env.VERCEL_OIDC_TOKEN;
  }
}

async function getBlobClient() {
  if (!getBlobToken()) return null;
  try {
    return await import("@vercel/blob");
  } catch (error) {
    const cachedModule = findCachedBlobModule();
    if (!cachedModule) throw error;
    return import(pathToFileURL(cachedModule).href);
  }
}

function findCachedBlobModule() {
  const localAppData = process.env.LOCALAPPDATA || (
    process.env.USERPROFILE ? join(process.env.USERPROFILE, "AppData", "Local") : ""
  );
  if (!localAppData) return "";

  const npxCache = join(localAppData, "npm-cache", "_npx");
  if (!existsSync(npxCache)) return "";

  for (const cacheEntry of readdirSync(npxCache, { withFileTypes: true })) {
    if (!cacheEntry.isDirectory()) continue;
    const modulePath = join(
      npxCache,
      cacheEntry.name,
      "node_modules",
      "@vercel",
      "blob",
      "dist",
      "index.js"
    );
    if (existsSync(modulePath)) return modulePath;
  }

  return "";
}

function readRequestBody(request, maxBytes = maxUploadBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Upload is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function parseMultipartFile(buffer, contentType = "") {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) throw new Error("Missing multipart boundary");

  const raw = buffer.toString("binary");
  const parts = raw.split(`--${boundary}`);

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;

    const headerText = part.slice(0, headerEnd);
    const nameMatch = headerText.match(/name="([^"]+)"/i);
    const filenameMatch = headerText.match(/filename="([^"]*)"/i);
    if (nameMatch?.[1] !== "file" || !filenameMatch?.[1]) continue;

    const mimeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);
    let body = part.slice(headerEnd + 4);
    if (body.endsWith("\r\n")) body = body.slice(0, -2);

    return {
      filename: filenameMatch[1],
      mime: mimeMatch?.[1]?.trim() || "application/octet-stream",
      buffer: Buffer.from(body, "binary")
    };
  }

  throw new Error("No file found");
}

function sanitizeFilename(filename = "", { unique = true } = {}) {
  const extension = extname(filename).toLowerCase();
  const base = filename
    .slice(0, Math.max(0, filename.length - extension.length))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "media";

  return `${base}${unique ? `-${Date.now()}` : ""}${extension}`;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function handleContentRead(response) {
  try {
    const blobContent = await readBlobContent();
    if (blobContent) {
      await cacheContentLocally(blobContent);
      sendJson(response, 200, blobContent);
      return;
    }

    sendJson(response, 200, await readLocalContent());
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message });
  }
}

async function readLocalContent() {
  return JSON.parse(await readFile(contentPath, "utf8"));
}

async function readBlobContent() {
  const client = await getBlobClient();
  if (!client) return null;

  const token = getBlobToken();
  const { blobs } = await client.list({ token, prefix: contentBlobPath, limit: 10 });
  const blob = blobs.find((item) => item.pathname === contentBlobPath);
  if (!blob) return null;

  const separator = blob.url.includes("?") ? "&" : "?";
  const blobResponse = await fetch(`${blob.url}${separator}v=${Date.now()}`, {
    cache: "no-store"
  });

  if (!blobResponse.ok) {
    throw new Error("Could not read live CMS content.");
  }

  return blobResponse.json();
}

async function cacheContentLocally(content) {
  await mkdir(dirname(contentPath), { recursive: true });
  await writeFile(contentPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
}

async function saveBlobContent(content) {
  const client = await getBlobClient();
  if (!client) return null;

  return client.put(contentBlobPath, `${JSON.stringify(content, null, 2)}\n`, {
    token: getBlobToken(),
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json"
  });
}

function handleDevSession(response) {
  sendJson(response, 200, {
    ok: true,
    configured: true,
    authenticated: true,
    csrfToken: "local-dev"
  });
}

async function handleMediaUpload(request, response, target = "cms") {
  try {
    const body = await readRequestBody(request);
    const file = parseMultipartFile(body, request.headers["content-type"]);
    const extension = extname(file.filename).toLowerCase();
    if (!mediaExtensions.has(extension)) {
      throw new Error("Unsupported media type");
    }

    const isOptimizedTarget = target === "optimized";
    if (isOptimizedTarget && !optimizedImageExtensions.has(extension)) {
      throw new Error("Optimized uploads must be JPEG, PNG or WebP images");
    }

    const directory = isOptimizedTarget ? optimizedMediaDirectory : mediaDirectory;
    const publicDirectory = isOptimizedTarget ? "assets/optimized" : "assets/cms";
    await mkdir(directory, { recursive: true });
    const filename = sanitizeFilename(file.filename, { unique: !isOptimizedTarget });
    await writeFile(join(directory, filename), file.buffer);

    sendJson(response, 200, {
      ok: true,
      src: `${publicDirectory}/${filename}`,
      type: file.mime.startsWith("video/") || videoExtensions.has(extension) ? "video" : "image"
    });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message });
  }
}

function handleContentSave(request, response) {
  let body = "";

  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 2_000_000) {
      request.destroy();
    }
  });

  request.on("end", async () => {
    try {
      const content = JSON.parse(body);
      const blob = await saveBlobContent(content);
      await cacheContentLocally(content);
      sendJson(response, 200, {
        ok: true,
        source: blob ? "blob" : "local",
        pathname: blob?.pathname || null
      });
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
    }
  });
}

function resolveStaticPath(pathname) {
  if (pathname === "/cms" || pathname === "/cms/" || pathname === "/admin" || pathname === "/admin/") {
    return join(root, "cms.html");
  }

  let requestedPath = "";
  try {
    requestedPath = decodeURIComponent(pathname).replace(/^[/\\]+/, "");
  } catch {
    return null;
  }

  let filePath = resolve(root, requestedPath);
  const rootPrefix = `${root}${sep}`;
  if (filePath !== root && !filePath.startsWith(rootPrefix)) {
    return null;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = resolve(filePath, "index.html");
  }

  if (!existsSync(filePath)) {
    const segments = pathname.split("/").filter(Boolean);
    const hasFileExtension = Boolean(extname(pathname));
    if (!hasFileExtension && segments.includes("work")) {
      filePath = join(root, "index.html");
    }
  }

  return filePath;
}

createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  const respond = (status, headers = {}, body = "") => {
    response.writeHead(status, { ...securityHeaders, ...headers });
    response.end(body);
  };

  if (!["GET", "HEAD", "POST", "DELETE"].includes(request.method)) {
    respond(405, { "Allow": "GET, HEAD, POST, DELETE" }, "Method not allowed");
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/content") {
    handleContentRead(response);
    return;
  }

  if (url.pathname === "/api/session") {
    if (request.method === "GET" || request.method === "POST" || request.method === "DELETE") {
      handleDevSession(response);
      return;
    }

    respond(405, { "Allow": "GET, POST, DELETE" }, "Method not allowed");
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/media") {
    handleMediaUpload(request, response, url.searchParams.get("folder") || "cms");
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/content") {
    handleContentSave(request, response);
    return;
  }

  if (request.method === "POST" || request.method === "DELETE") {
    respond(404, {}, "Not found");
    return;
  }

  const filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    respond(400, {}, "Bad request");
    return;
  }

  if (!existsSync(filePath)) {
    respond(404, {}, "Not found");
    return;
  }

  response.writeHead(200, {
    ...securityHeaders,
    "Content-Type": types[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Local preview: http://127.0.0.1:${port}/`);
  console.log(`CMS panel: http://127.0.0.1:${port}/cms`);
});
