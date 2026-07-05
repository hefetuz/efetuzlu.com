import { list, put } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { jsonResponse, requireCmsSession } from "../lib/cms-auth.js";

const CONTENT_BLOB_PATH = "cms/content.json";
const STATIC_CONTENT_PATH = join(process.cwd(), "cms", "content.json");

async function readStaticContent() {
  const raw = await readFile(STATIC_CONTENT_PATH, "utf8");
  return JSON.parse(raw);
}

async function readBlobContent() {
  const { blobs } = await list({ prefix: CONTENT_BLOB_PATH, limit: 10 });
  const blob = blobs.find((item) => item.pathname === CONTENT_BLOB_PATH);
  if (!blob) return null;

  const separator = blob.url.includes("?") ? "&" : "?";
  const response = await fetch(`${blob.url}${separator}v=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Could not read live CMS content.");
  }

  return response.json();
}

function validateContent(content) {
  if (!content || typeof content !== "object") {
    throw new Error("Content must be a JSON object.");
  }
  if (!Array.isArray(content.projects)) {
    throw new Error("Content must include a projects array.");
  }
  if (!content.site || typeof content.site !== "object") {
    throw new Error("Content must include site settings.");
  }
  return content;
}

export async function GET() {
  try {
    const content = await readBlobContent();
    if (content) return jsonResponse(content);
  } catch (error) {
    console.warn("Falling back to static CMS content:", error.message);
  }

  return jsonResponse(await readStaticContent());
}

export async function POST(request) {
  const session = requireCmsSession(request);
  if (session instanceof Response) return session;

  try {
    const content = validateContent(await request.json());
    const body = `${JSON.stringify(content, null, 2)}\n`;
    const blob = await put(CONTENT_BLOB_PATH, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json"
    });

    return jsonResponse({
      ok: true,
      src: blob.url,
      pathname: blob.pathname
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || "Content save failed." }, 400);
  }
}
