import {
  clearCmsSession,
  cmsConfigState,
  createCmsSession,
  getCmsSession,
  jsonResponse,
  requireSameOrigin,
  validateAdminPassword
} from "../lib/cms-auth.js";

function sessionPayload(request) {
  const config = cmsConfigState();
  if (!config.configured) {
    return jsonResponse({
      ok: true,
      configured: false,
      authenticated: false,
      error: "CMS auth is not configured."
    });
  }

  const session = getCmsSession(request);
  return jsonResponse({
    ok: true,
    configured: true,
    authenticated: session.ok,
    csrfToken: session.ok ? session.csrfToken : ""
  });
}

export function GET(request) {
  return sessionPayload(request);
}

export async function POST(request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const config = cmsConfigState();
  if (!config.configured) {
    return jsonResponse({ ok: false, error: "CMS auth is not configured." }, 503);
  }

  const body = await request.json().catch(() => ({}));
  if (!validateAdminPassword(body.password || "")) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return jsonResponse({ ok: false, error: "Invalid password." }, 401);
  }

  const session = createCmsSession(request);
  return jsonResponse({
    ok: true,
    configured: true,
    authenticated: true,
    csrfToken: session.csrfToken
  }, 200, {
    "Set-Cookie": session.cookie
  });
}

export function DELETE(request) {
  return jsonResponse({ ok: true }, 200, {
    "Set-Cookie": clearCmsSession(request)
  });
}
