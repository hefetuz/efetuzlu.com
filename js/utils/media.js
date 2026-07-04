import { escapeAttr } from "./dom.js";

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".m4v", ".mov", ".mp4", ".ogg", ".ogv", ".webm"]);

function getExtension(source = "") {
  const cleanSource = String(source).split(/[?#]/)[0];
  const dotIndex = cleanSource.lastIndexOf(".");
  return dotIndex >= 0 ? cleanSource.slice(dotIndex).toLowerCase() : "";
}

export function getMediaType(source = "", fallback = "image") {
  const extension = getExtension(source);
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return fallback;
}

export function normalizeMediaItem(item, fallbackAlt = "") {
  if (typeof item === "string") {
    return {
      type: getMediaType(item),
      src: item,
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
    alt: project.title
  }, project.title);
}

export function mediaElementTemplate(media, className = "", options = {}) {
  const item = normalizeMediaItem(media);
  const classes = className ? ` class="${escapeAttr(className)}"` : "";
  const loading = options.loading ? ` loading="${escapeAttr(options.loading)}"` : "";
  const decoding = options.decoding ? ` decoding="${escapeAttr(options.decoding)}"` : "";
  const fetchPriority = options.fetchPriority ? ` fetchpriority="${escapeAttr(options.fetchPriority)}"` : "";
  const preload = options.preload ? ` preload="${escapeAttr(options.preload)}"` : ` preload="metadata"`;
  const width = item.width ? ` width="${escapeAttr(item.width)}"` : "";
  const height = item.height ? ` height="${escapeAttr(item.height)}"` : "";

  if (item.type === "video") {
    return `
      <video${classes} src="${escapeAttr(item.src)}"${item.poster ? ` poster="${escapeAttr(item.poster)}"` : ""}${width}${height} muted playsinline${preload}></video>
    `;
  }

  return `<img${classes} src="${escapeAttr(item.src)}" alt="${escapeAttr(item.alt)}"${width}${height}${loading}${decoding}${fetchPriority}>`;
}
