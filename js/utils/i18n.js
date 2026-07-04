const LANGUAGE_STORAGE_KEY = "portfolio-language";
const SUPPORTED_LANGUAGES = new Set(["EN", "TR", "DE", "ES"]);
const FALLBACK_LANGUAGES = [
  { id: "EN", label: "EN", name: "English", flag: "assets/flag-gb.webp" },
  { id: "TR", label: "TR", name: "Turkish", flag: "assets/flag-tr.webp" },
  { id: "DE", label: "DE", name: "Deutsch", flag: "assets/flag-de.png" },
  { id: "ES", label: "ES", name: "Espa\u00f1ol", flag: "assets/flag-es.png" }
];

export function normalizeLanguage(language = "") {
  const value = String(language || "").trim().toUpperCase();
  return SUPPORTED_LANGUAGES.has(value) ? value : "EN";
}

export function getInitialLanguage(content) {
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored) return normalizeLanguage(stored);

  const fallback = content?.locales?.default || "EN";
  return normalizeLanguage(fallback);
}

export function persistLanguage(language) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizeLanguage(language));
}

export function getAvailableLanguages(content) {
  return content?.locales?.available?.length
    ? content.locales.available
    : FALLBACK_LANGUAGES;
}

export function localizeContent(content, language) {
  const locale = normalizeLanguage(language);
  const translation = content?.locales?.translations?.[locale] || {};
  const localized = structuredClone(content);

  mergeObject(localized.site, translation.site);
  mergeObject(localized.hero, translation.hero);
  mergeObject(localized.ui, translation.ui);

  if (Array.isArray(translation.services)) {
    localized.services = mergeArrayByIndex(localized.services, translation.services);
  }

  if (Array.isArray(translation.projectCategories)) {
    localized.projectCategories = mergeArrayById(localized.projectCategories, translation.projectCategories);
  }

  if (translation.projects && Array.isArray(localized.projects)) {
    localized.projects = localized.projects.map((project) => {
      const projectTranslation = translation.projects[project.slug];
      return projectTranslation ? mergeProject(project, projectTranslation) : project;
    });
  }

  localized.language = locale;
  return localized;
}

function mergeObject(target, source) {
  if (!target || !source) return target;

  Object.entries(source).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeObject(target[key], value);
      return;
    }
    target[key] = value;
  });

  return target;
}

function mergeProject(project, translation) {
  const merged = { ...project };
  Object.entries(translation).forEach(([key, value]) => {
    merged[key] = Array.isArray(value) ? [...value] : value;
  });
  return merged;
}

function mergeArrayByIndex(items = [], translations = []) {
  return items.map((item, index) => ({
    ...item,
    ...(translations[index] || {})
  }));
}

function mergeArrayById(items = [], translations = []) {
  const translationMap = new Map(translations.map((item) => [item.id, item]));
  return items.map((item) => ({
    ...item,
    ...(translationMap.get(item.id) || {})
  }));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
