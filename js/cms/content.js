const CONTENT_URLS = ["/api/content", "/cms/content.json"];

export async function loadContent() {
  let lastError = null;

  for (const url of CONTENT_URLS) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load ${url}`);
      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Could not load CMS content");
}
