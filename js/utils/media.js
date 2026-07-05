import { escapeAttr } from "./dom.js";

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".m4v", ".mov", ".mp4", ".ogg", ".ogv", ".webm"]);
const COVER_OPTIMIZED_EXTENSIONS = new Set([".jpeg", ".jpg", ".png"]);
const TRANSPARENT_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const OPTIMIZED_IMAGE_SOURCES = new Map([
  ["assets/cms/hant-product-01.png", "assets/optimized/hant-product-01-900.jpg"],
  ["assets/cms/bd01ea66-0697-4143-afef-f527ec020ec4-1782806326668.png", "assets/optimized/saglik-gelsin-product-design-900.jpg"]
]);
let deferredMediaObserver;

function getExtension(source = "") {
  const cleanSource = String(source).split(/[?#]/)[0];
  const dotIndex = cleanSource.lastIndexOf(".");
  return dotIndex >= 0 ? cleanSource.slice(dotIndex).toLowerCase() : "";
}

function getPathWithoutExtension(source = "") {
  const cleanSource = String(source).split(/[?#]/)[0].replace(/^\.\//, "");
  const slashIndex = cleanSource.lastIndexOf("/");
  const dotIndex = cleanSource.lastIndexOf(".");
  const filename = cleanSource.slice(slashIndex + 1, dotIndex >= 0 ? dotIndex : undefined);
  return filename || "";
}

export function getMediaType(source = "", fallback = "image") {
  const extension = getExtension(source);
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return fallback;
}

export function getCoverOptimizedPath(source = "") {
  const normalizedSource = String(source).split(/[?#]/)[0].replace(/^\.\//, "");
  const extension = getExtension(normalizedSource);
  if (!normalizedSource.startsWith("assets/cms/") || !COVER_OPTIMIZED_EXTENSIONS.has(extension)) {
    return "";
  }

  const base = getPathWithoutExtension(normalizedSource);
  return base ? `assets/optimized/${base}-cover.jpg` : "";
}

export function getOptimizedImageSource(source = "", optimizedSource = "") {
  if (optimizedSource) return optimizedSource;

  const normalizedSource = String(source).replace(/^\.\//, "");
  return OPTIMIZED_IMAGE_SOURCES.get(normalizedSource) || getCoverOptimizedPath(normalizedSource) || source;
}

export function normalizeMediaItem(item, fallbackAlt = "") {
  if (typeof item === "string") {
    return {
      type: getMediaType(item),
      src: item,
      optimizedSrc: getCoverOptimizedPath(item),
      alt: fallbackAlt,
      caption: ""
    };
  }

  const source = item?.src || item?.image || "";
  const poster = item?.poster || "";
  const inferredType = getMediaType(source || poster, "");
  return {
    type: inferredType || item?.type || "image",
    src: source,
    poster,
    optimizedSrc: item?.optimizedSrc || item?.optimized || item?.coverOptimized || item?.thumbnail || "",
    alt: item?.alt || fallbackAlt,
    caption: item?.caption || item?.title || "",
    width: item?.width || item?.w || "",
    height: item?.height || item?.h || "",
    aspectRatio: item?.aspectRatio || item?.ratio || ""
  };
}

export function getProjectMedia(project = {}) {
  const sourceItems = project.media?.length
    ? project.media
    : project.visuals?.length
      ? project.visuals
      : project.images?.length
        ? project.images
        : project.image
          ? [{ src: project.image, alt: project.title, caption: project.summary || project.title }]
          : [];

  const seen = new Set();
  return sourceItems
    .map((item) => normalizeMediaItem(item, project.title))
    .filter((item) => {
      const key = item.src || item.poster;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function getProjectCover(project = {}) {
  const media = getProjectMedia(project);
  const coverSource = project.image || project.cover || media[0]?.poster || media[0]?.src || "";
  return normalizeMediaItem({
    type: getMediaType(coverSource, media[0]?.type || "image"),
    src: coverSource,
    poster: media[0]?.poster || "",
    optimizedSrc: project.coverOptimized || project.imageOptimized || project.thumbnail || media[0]?.optimizedSrc || "",
    alt: project.title
  }, project.title);
}

export function mediaElementTemplate(media, className = "", options = {}) {
  const item = normalizeMediaItem(media);
  const source = item.type === "image" && options.optimize !== false
    ? getOptimizedImageSource(item.src, item.optimizedSrc)
    : item.src;
  const classes = className ? ` class="${escapeAttr(className)}"` : "";
  const loading = options.loading ? ` loading="${escapeAttr(options.loading)}"` : "";
  const decoding = options.decoding ? ` decoding="${escapeAttr(options.decoding)}"` : "";
  const fetchPriority = options.fetchPriority ? ` fetchpriority="${escapeAttr(options.fetchPriority)}"` : "";
  const isDeferred = options.defer === true;
  const preloadValue = isDeferred ? "none" : (options.preload || "metadata");
  const preload = ` preload="${escapeAttr(preloadValue)}"`;
  const width = item.width ? ` width="${escapeAttr(item.width)}"` : "";
  const height = item.height ? ` height="${escapeAttr(item.height)}"` : "";
  const deferredAttrs = isDeferred ? ` data-defer-media="true" data-src="${escapeAttr(source)}"` : "";
  const fallbackAttrs = source !== item.src ? ` data-fallback-src="${escapeAttr(item.src)}"` : "";

  if (item.type === "video") {
    const poster = item.poster
      ? isDeferred
        ? ` data-poster="${escapeAttr(item.poster)}"`
        : ` poster="${escapeAttr(item.poster)}"`
      : "";
    const src = isDeferred ? "" : ` src="${escapeAttr(source)}"`;
    return `
      <video${classes}${src}${poster}${width}${height}${deferredAttrs} muted playsinline${preload}></video>
    `;
  }

  const src = isDeferred ? TRANSPARENT_IMAGE : source;
  return `<img${classes} src="${escapeAttr(src)}" alt="${escapeAttr(item.alt)}"${width}${height}${loading}${decoding}${fetchPriority}${deferredAttrs}${fallbackAttrs}>`;
}

function bindImageFallbacks(target = document) {
  target.querySelectorAll("img[data-fallback-src]").forEach((image) => {
    if (image.dataset.fallbackBound === "true") return;
    image.dataset.fallbackBound = "true";
    image.addEventListener("error", () => {
      const fallbackSource = image.dataset.fallbackSrc;
      if (!fallbackSource || image.src.endsWith(fallbackSource)) return;
      image.src = fallbackSource;
      delete image.dataset.src;
      delete image.dataset.deferMedia;
    });
  });
}

function loadDeferredMedia(media) {
  if (!media || media.dataset.deferMedia !== "true") return;

  const source = media.dataset.src;
  if (!source) return;

  if (media.tagName === "VIDEO") {
    if (media.dataset.poster) {
      media.poster = media.dataset.poster;
    }
    media.src = source;
    media.preload = "metadata";
    media.load();
  } else {
    media.src = source;
  }

  delete media.dataset.deferMedia;
  delete media.dataset.src;
  delete media.dataset.poster;
}

export function bindDeferredMedia(target = document) {
  bindImageFallbacks(target);

  const mediaItems = [...target.querySelectorAll("[data-defer-media='true']")];
  if (!mediaItems.length) return;

  if (!("IntersectionObserver" in window)) {
    mediaItems.forEach(loadDeferredMedia);
    return;
  }

  deferredMediaObserver ??= new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      deferredMediaObserver.unobserve(entry.target);
      loadDeferredMedia(entry.target);
    });
  }, {
    root: null,
    rootMargin: "120px 0px",
    threshold: 0.01
  });

  mediaItems.forEach((media) => deferredMediaObserver.observe(media));
}
