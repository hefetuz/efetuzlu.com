import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);

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
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"
};

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

function sanitizeFilename(filename = "") {
  const extension = extname(filename).toLowerCase();
  const base = filename
    .slice(0, Math.max(0, filename.length - extension.length))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "media";

  return `${base}-${Date.now()}${extension}`;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function handleMediaUpload(request, response) {
  try {
    const body = await readRequestBody(request);
    const file = parseMultipartFile(body, request.headers["content-type"]);
    const extension = extname(file.filename).toLowerCase();
    if (!mediaExtensions.has(extension)) {
      throw new Error("Unsupported media type");
    }

    await mkdir(mediaDirectory, { recursive: true });
    const filename = sanitizeFilename(file.filename);
    await writeFile(join(mediaDirectory, filename), file.buffer);

    sendJson(response, 200, {
      ok: true,
      src: `assets/cms/${filename}`,
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
      await mkdir(dirname(contentPath), { recursive: true });
      await writeFile(contentPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
      sendJson(response, 200, { ok: true });
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

  if (!["GET", "HEAD", "POST"].includes(request.method)) {
    respond(405, { "Allow": "GET, HEAD, POST" }, "Method not allowed");
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/media") {
    handleMediaUpload(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/content") {
    handleContentSave(request, response);
    return;
  }

  if (request.method === "POST") {
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
