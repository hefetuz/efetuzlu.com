const CONTENT_URL = "cms/content.json";

export async function loadContent() {
  const response = await fetch(CONTENT_URL);
  if (!response.ok) throw new Error(`Could not load ${CONTENT_URL}`);
  return response.json();
}
