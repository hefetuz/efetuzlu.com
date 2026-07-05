import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "cms_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function getSessionSecret() {
  const secret = process.env.CMS_SESSION_SECRET || "";
  return secret.length >= 32 ? secret : "";
}

function getAdminPassword() {
  const password = process.env.CMS_ADMIN_PASSWORD || "";
  return password.length >= 12 ? password : "";
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a = "", b = "") {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));
  return first.length === second.length && timingSafeEqual(first, second);
}

function constantTimeMatch(input, expected, secret) {
  return safeEqual(sign(String(input), secret), sign(String(expected), secret));
}

function parseCookies(header = "") {
  const cookies = new Map();
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies.set(key, decodeURIComponent(value));
    } catch {
      cookies.set(key, value);
    }
  }
  return cookies;
}

function isSecureRequest(request) {
  const url = new URL(request.url);
  return !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

function cookieHeader(name, value, request, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict"
  ];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (isSecureRequest(request)) parts.push("Secure");

  return parts.join("; ");
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowedOrigin = process.env.CMS_ALLOWED_ORIGIN || new URL(request.url).origin;
  return origin === allowedOrigin;
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function csrfForSession(sessionValue, secret) {
  return sign(`${sessionValue}:csrf`, secret);
}

export function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

export function cmsConfigState() {
  return {
    configured: Boolean(getSessionSecret() && getAdminPassword()),
    hasSecret: Boolean(getSessionSecret()),
    hasPassword: Boolean(getAdminPassword())
  };
}

export function validateAdminPassword(password) {
  const secret = getSessionSecret();
  const expected = getAdminPassword();
  if (!secret || !expected) return false;
  return constantTimeMatch(password, expected, secret);
}

export function createCmsSession(request) {
  const secret = getSessionSecret();
  const now = Date.now();
  const payload = encodePayload({
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS * 1000
  });
  const signature = sign(payload, secret);
  const value = `${payload}.${signature}`;

  return {
    value,
    csrfToken: csrfForSession(value, secret),
    cookie: cookieHeader(SESSION_COOKIE, value, request, { maxAge: SESSION_MAX_AGE_SECONDS })
  };
}

export function clearCmsSession(request) {
  return cookieHeader(SESSION_COOKIE, "", request, { maxAge: 0 });
}

export function getCmsSession(request) {
  const secret = getSessionSecret();
  if (!secret) {
    return { ok: false, status: 503, error: "CMS auth is not configured." };
  }

  const cookies = parseCookies(request.headers.get("cookie") || "");
  const value = cookies.get(SESSION_COOKIE);
  if (!value) {
    return { ok: false, status: 401, error: "Login required." };
  }

  const [payload, signature] = value.split(".");
  if (!payload || !signature || !safeEqual(sign(payload, secret), signature)) {
    return { ok: false, status: 401, error: "Login required." };
  }

  try {
    const data = decodePayload(payload);
    if (!data.exp || data.exp < Date.now()) {
      return { ok: false, status: 401, error: "Session expired." };
    }

    return {
      ok: true,
      value,
      data,
      csrfToken: csrfForSession(value, secret)
    };
  } catch {
    return { ok: false, status: 401, error: "Login required." };
  }
}

export function requireCmsSession(request, { csrf = true } = {}) {
  if (!sameOrigin(request)) {
    return jsonResponse({ ok: false, error: "Forbidden." }, 403);
  }

  const session = getCmsSession(request);
  if (!session.ok) {
    return jsonResponse({ ok: false, error: session.error }, session.status || 401);
  }

  if (csrf) {
    const provided = request.headers.get("x-cms-csrf") || "";
    if (!safeEqual(provided, session.csrfToken)) {
      return jsonResponse({ ok: false, error: "Session check failed." }, 403);
    }
  }

  return session;
}

export function requireSameOrigin(request) {
  return sameOrigin(request) ? null : jsonResponse({ ok: false, error: "Forbidden." }, 403);
}
