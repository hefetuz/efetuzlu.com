import { cardLayoutFlush, escapeAttr, escapeHtml } from "../utils/dom.js";
import { getMediaType, getProjectMedia, mediaElementTemplate, normalizeMediaItem } from "../utils/media.js";

const DETAIL_HASH_PREFIX = "#work/";
const DETAIL_PATH_SEGMENT = "work";
const visualAnimations = new WeakMap();
const visualResizeObservers = new WeakMap();
const LIGHTBOX_EXIT_MS = 320;
let lightboxCloseTimer = 0;
let lockedScrollY = 0;
let isLightboxScrollLocked = false;
const BENTO_VISUAL_SLOTS = [
  { columns: 7, rows: 34 },
  { columns: 5, rows: 16 },
  { columns: 5, rows: 18 },
  { columns: 4, rows: 22 },
  { columns: 8, rows: 22 },
  { columns: 5, rows: 20 },
  { columns: 7, rows: 20 },
  { columns: 4, rows: 16 },
  { columns: 4, rows: 32 },
  { columns: 4, rows: 16 },
  { columns: 4, rows: 16 },
  { columns: 4, rows: 16 }
];

function slugify(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function projectMetaTemplate(label, value) {
  if (!value) return "";
  return `
    <div>
      <dt class="text-ui text-muted">${escapeHtml(label)}</dt>
      <dd class="text-body">${escapeHtml(value)}</dd>
    </div>
  `;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function projectInfoColumnTemplate(label, values) {
  const items = normalizeList(values);
  if (!items.length) return "";

  return `
    <div class="project-info-column">
      <h2 class="text-heading text-muted">${escapeHtml(label)}</h2>
      <ul>
        ${items.map((item) => `<li class="text-body">${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function projectNavigationTemplate(projects = [], activeIndex = 0, labels = {}) {
  if (!Array.isArray(projects) || projects.length < 2) return "";

  const previousIndex = (activeIndex - 1 + projects.length) % projects.length;
  const nextIndex = (activeIndex + 1) % projects.length;
  const previousProject = projects[previousIndex];
  const nextProject = projects[nextIndex];

  return `
    <nav class="project-detail-nav" aria-label="Project navigation">
      <a class="project-nav-link project-nav-prev" href="${escapeAttr(`${getRouteBasePath()}${DETAIL_PATH_SEGMENT}/${encodeURIComponent(getProjectSlug(previousProject, previousIndex))}/`)}" data-project-nav="${previousIndex}">
        <span class="project-nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M19 12H5"></path>
            <path d="M11 6l-6 6 6 6"></path>
          </svg>
        </span>
        <span class="project-nav-copy">
          <strong class="text-ui">${escapeHtml(previousProject.title)}</strong>
        </span>
      </a>
      <a class="project-nav-link project-nav-next" href="${escapeAttr(`${getRouteBasePath()}${DETAIL_PATH_SEGMENT}/${encodeURIComponent(getProjectSlug(nextProject, nextIndex))}/`)}" data-project-nav="${nextIndex}">
        <span class="project-nav-copy">
          <strong class="text-ui">${escapeHtml(nextProject.title)}</strong>
        </span>
        <span class="project-nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M5 12h14"></path>
            <path d="M13 6l6 6-6 6"></path>
          </svg>
        </span>
      </a>
    </nav>
  `;
}

function visualTemplate(media, index, project, labels = {}) {
  const item = normalizeMediaItem(media, project.title);
  const source = item.src;
  const alt = item.alt || project.title;
  const ratio = getInitialAspectRatio(item);
  const style = [`--appear-delay:${120 + index * 90}ms`];
  if (ratio) style.push(`--media-ratio:${ratio}`);

  return `
    <figure class="project-visual" data-bento-index="${index}" style="${style.join(";")}">
      <button class="project-visual-zoom" type="button" data-visual-zoom="${escapeAttr(source)}" data-visual-type="${escapeAttr(item.type)}" data-visual-alt="${escapeAttr(alt)}"${item.poster ? ` data-visual-poster="${escapeAttr(item.poster)}"` : ""} aria-label="${escapeAttr(`${labels.expandVisual || "Expand"} ${alt}`)}">
        ${mediaElementTemplate(item, "", {
          loading: index < 3 ? "eager" : "lazy",
          decoding: "async",
          fetchPriority: index < 2 ? "high" : "auto",
          preload: index < 2 ? "auto" : "metadata"
        })}
      </button>
    </figure>
  `;
}

function getInitialAspectRatio(item) {
  const ratio = Number(item?.aspectRatio);
  if (Number.isFinite(ratio) && ratio > 0) return ratio.toFixed(4);

  const width = Number(item?.width);
  const height = Number(item?.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return (width / height).toFixed(4);
  }

  return "";
}

function applyVisualAspectRatio(visual, width, height) {
  if (!visual || !width || !height) return;

  const ratio = width / height;
  if (!Number.isFinite(ratio) || ratio <= 0) return;

  visual.style.setProperty("--media-ratio", ratio.toFixed(4));
  visual.classList.toggle("is-portrait", ratio < 0.82);
  visual.classList.toggle("is-square", ratio >= 0.82 && ratio <= 1.18);
  visual.classList.toggle("is-landscape", ratio > 1.18);
  layoutBentoVisuals(visual.closest(".project-showcase"));
}

function getBentoVisualShape(index) {
  return BENTO_VISUAL_SLOTS[index % BENTO_VISUAL_SLOTS.length];
}

function getGridColumnCount(showcase) {
  const columns = getComputedStyle(showcase).gridTemplateColumns;
  if (!columns || columns === "none") return 1;
  return columns.split(" ").filter(Boolean).length || 1;
}

function layoutBentoVisuals(showcase) {
  if (!showcase || !showcase.classList.contains("view-bento")) return;

  const columns = getGridColumnCount(showcase);

  showcase.querySelectorAll(".project-visual").forEach((visual) => {
    const index = Number.parseInt(visual.dataset.bentoIndex, 10) || 0;
    const shape = getBentoVisualShape(index);
    visual.style.setProperty("--bento-col-span", String(columns <= 2 ? 1 : Math.min(shape.columns, columns)));
    visual.style.setProperty("--bento-row-span", String(shape.rows));
  });
}

function bindVisualAspectRatios(showcase) {
  visualResizeObservers.get(showcase)?.disconnect();
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => layoutBentoVisuals(showcase));
    observer.observe(showcase);
    visualResizeObservers.set(showcase, observer);
  }

  showcase.querySelectorAll(".project-visual").forEach((visual) => {
    const media = visual.querySelector("img, video");
    if (!media) return;

    if (media.tagName === "IMG") {
      const updateImageRatio = () => applyVisualAspectRatio(visual, media.naturalWidth, media.naturalHeight);
      if (media.complete && media.naturalWidth) {
        updateImageRatio();
      } else {
        media.addEventListener("load", updateImageRatio, { once: true });
      }
      return;
    }

    const updateVideoRatio = () => applyVisualAspectRatio(visual, media.videoWidth, media.videoHeight);
    if (media.readyState >= 1 && media.videoWidth) {
      updateVideoRatio();
    } else {
      media.addEventListener("loadedmetadata", updateVideoRatio, { once: true });
    }
  });

  requestAnimationFrame(() => layoutBentoVisuals(showcase));
}

function bindVisualLoadState(showcase) {
  showcase.querySelectorAll(".project-visual").forEach((visual) => {
    const media = visual.querySelector("img, video");
    if (!media) return;
    const loadStart = performance.now();

    const markLoaded = () => {
      const elapsed = performance.now() - loadStart;
      const remaining = Math.max(0, 180 - elapsed);
      window.setTimeout(() => {
        visual.classList.add("is-loaded");
      }, remaining);
    };

    if (media.tagName === "IMG") {
      if (media.complete && media.naturalWidth) {
        markLoaded();
      } else {
        media.addEventListener("load", markLoaded, { once: true });
      }
      return;
    }

    if (media.readyState >= 2) {
      markLoaded();
    } else {
      media.addEventListener("loadeddata", markLoaded, { once: true });
    }
  });
}

function warmProjectMedia(media = []) {
  media.forEach((item, index) => {
    if (index >= 4) return;
    const normalized = normalizeMediaItem(item);
    if (!normalized.src) return;

    const preloadSelector = `[data-project-preload="${CSS.escape(normalized.src)}"]`;
    if (document.head.querySelector(preloadSelector)) return;

    if (normalized.type === "image") {
      const preloadLink = document.createElement("link");
      preloadLink.rel = "preload";
      preloadLink.as = "image";
      preloadLink.href = normalized.src;
      preloadLink.fetchPriority = index < 6 ? "high" : "auto";
      preloadLink.dataset.projectPreload = normalized.src;
      document.head.append(preloadLink);

      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = index < 6 ? "high" : "auto";
      image.src = normalized.src;
      return;
    }

    const preloadLink = document.createElement("link");
    preloadLink.rel = "preload";
    preloadLink.as = "video";
    preloadLink.href = normalized.src;
    preloadLink.dataset.projectPreload = normalized.src;
    document.head.append(preloadLink);
  });
}

function bindVisualZoomButtons(showcase) {
  showcase.querySelectorAll("[data-visual-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      openVisualLightbox({
        source: button.dataset.visualZoom,
        type: button.dataset.visualType,
        alt: button.dataset.visualAlt,
        poster: button.dataset.visualPoster
      });
    });
  });
}

function openVisualLightbox({ source, type = "image", alt = "", poster = "" }) {
  const lightbox = document.getElementById("visualLightbox");
  const image = document.getElementById("visualLightboxImage");
  const video = document.getElementById("visualLightboxVideo");
  if (!lightbox || !image || !video || !source) return;

  window.clearTimeout(lightboxCloseTimer);
  lockLightboxScroll();
  const mediaType = type || getMediaType(source);
  image.hidden = mediaType === "video";
  video.hidden = mediaType !== "video";

  if (mediaType === "video") {
    video.src = source;
    video.poster = poster || "";
    video.setAttribute("aria-label", alt || "");
    image.removeAttribute("src");
    image.alt = "";
  } else {
    image.src = source;
    image.alt = alt || "";
    video.pause();
    video.removeAttribute("src");
    video.removeAttribute("poster");
  }

  lightbox.hidden = false;
  lightbox.classList.remove("is-closing");
  requestAnimationFrame(() => {
    lightbox.classList.add("is-open");
  });
}

function clearLightboxMedia() {
  const image = document.getElementById("visualLightboxImage");
  const video = document.getElementById("visualLightboxVideo");

  if (image) {
    image.removeAttribute("src");
    image.alt = "";
    image.hidden = false;
  }
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.removeAttribute("poster");
    video.hidden = true;
  }
}

function closeVisualLightbox() {
  const lightbox = document.getElementById("visualLightbox");
  if (!lightbox || lightbox.hidden) return;

  lightbox.classList.remove("is-open");
  lightbox.classList.add("is-closing");
  window.clearTimeout(lightboxCloseTimer);
  lightboxCloseTimer = window.setTimeout(() => {
    lightbox.hidden = true;
    lightbox.classList.remove("is-closing");
    clearLightboxMedia();
    unlockLightboxScroll();
  }, LIGHTBOX_EXIT_MS);
}

function lockLightboxScroll() {
  if (isLightboxScrollLocked) return;

  lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.documentElement.classList.add("is-lightbox-open");
  document.body.style.setProperty("--locked-scroll-y", `-${lockedScrollY}px`);
  document.body.classList.add("is-scroll-locked");
  isLightboxScrollLocked = true;
}

function unlockLightboxScroll() {
  if (!isLightboxScrollLocked) return;

  document.documentElement.classList.remove("is-lightbox-open");
  document.body.classList.remove("is-scroll-locked");
  document.body.style.removeProperty("--locked-scroll-y");
  window.scrollTo({ top: lockedScrollY, behavior: "auto" });
  lockedScrollY = 0;
  isLightboxScrollLocked = false;
}

export function getProjectSlug(project, index = 0) {
  return project.slug || slugify(project.title) || `project-${index + 1}`;
}

export function getRouteBasePath() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const workIndex = segments.indexOf(DETAIL_PATH_SEGMENT);
  const baseSegments = workIndex >= 0
    ? segments.slice(0, workIndex)
    : segments.at(-1)?.includes(".")
      ? segments.slice(0, -1)
      : segments;

  return baseSegments.length ? `/${baseSegments.join("/")}/` : "/";
}

export function getHomePath() {
  return getRouteBasePath();
}

function getProjectSlugFromPath() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const workIndex = segments.indexOf(DETAIL_PATH_SEGMENT);
  if (workIndex < 0) return "";
  return decodeURIComponent(segments[workIndex + 1] || "");
}

export function getProjectIndexFromHash(projects = []) {
  const hash = decodeURIComponent(window.location.hash || "");
  const activeSlug = hash.startsWith(DETAIL_HASH_PREFIX)
    ? hash.slice(DETAIL_HASH_PREFIX.length)
    : getProjectSlugFromPath();

  if (!activeSlug) return -1;
  return projects.findIndex((project, index) => getProjectSlug(project, index) === activeSlug);
}

export function setProjectRoute(project, index) {
  const slug = encodeURIComponent(getProjectSlug(project, index));
  const nextPath = `${getRouteBasePath()}${DETAIL_PATH_SEGMENT}/${slug}/`;
  if (window.location.pathname === nextPath && !window.location.hash) return false;
  window.history.pushState({ projectSlug: slug }, "", nextPath);
  return true;
}

export function renderProjectDetail({
  project,
  projects,
  index,
  view = "single",
  labels = {},
  panel = document.getElementById("projectDetailPanel"),
  showcase = document.getElementById("projectShowcase")
}) {
  const media = getProjectMedia(project, projects);
  const role = project.role || project.meta;
  const year = project.date || project.meta;
  const services = project.services || project.service || role;
  const techStack = project.techStack || project.stack;
  const industry = project.industry || project.scope || project.summary || "";

  panel.hidden = false;
  showcase.hidden = false;
  showcase.className = `project-showcase view-${view}`;
  warmProjectMedia(media);

  panel.innerHTML = `
    <div class="project-detail-header">
      <a class="btn btn-small secondary project-back" href="${escapeAttr(getHomePath())}" data-project-back aria-label="${escapeAttr(labels.backToWork || "Back to work")}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 6l-6 6 6 6"></path>
        </svg>
      </a>
      <div class="project-detail-copy">
        <h1>${escapeHtml(project.title)}</h1>
        <p class="project-detail-description text-body text-muted">${escapeHtml(project.description)}</p>
      </div>
    </div>
    <div class="project-detail-divider" aria-hidden="true"></div>
    <div class="project-detail-info">
      ${projectInfoColumnTemplate(labels.services || "Services", services)}
      ${projectInfoColumnTemplate(labels.techStack || "Tech Stack", techStack)}
      ${projectInfoColumnTemplate(labels.industry || "Industry", industry)}
      ${projectInfoColumnTemplate(labels.year || "Year", year)}
    </div>
    ${projectNavigationTemplate(projects, index, labels)}
  `;

  showcase.innerHTML = `
    ${media.map((item, mediaIndex) => visualTemplate(item, mediaIndex, project, labels)).join("")}
  `;

  showcase.querySelectorAll(".project-visual").forEach((visual, visualIndex) => {
    visual.classList.add("framer-reveal");
    visual.style.setProperty("--appear-delay", `${Math.min(visualIndex * 40, 220)}ms`);
  });
  bindVisualLoadState(showcase);
  bindVisualZoomButtons(showcase);
  bindVisualAspectRatios(showcase);
}

export function animateProjectVisualViewChange({ view, target = document.getElementById("projectShowcase") }) {
  if (!target) return;
  const visuals = [...target.querySelectorAll(".project-visual")];

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !visuals.length) {
    target.className = `project-showcase view-${view}`;
    layoutBentoVisuals(target);
    return;
  }

  const previousRects = new Map(visuals.map((visual) => [visual, visual.getBoundingClientRect()]));
  visuals.forEach((visual) => visualAnimations.get(visual)?.cancel());

  target.className = `project-showcase view-${view} is-flipping`;
  layoutBentoVisuals(target);
  cardLayoutFlush(target);

  const nextRects = new Map(visuals.map((visual) => [visual, visual.getBoundingClientRect()]));

  visuals.forEach((visual) => {
    const previous = previousRects.get(visual);
    const next = nextRects.get(visual);
    if (!previous || !next) return;

    const deltaX = previous.left - next.left;
    const deltaY = previous.top - next.top;
    const scaleX = previous.width / Math.max(next.width, 1);
    const scaleY = previous.height / Math.max(next.height, 1);

    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5 && Math.abs(scaleX - 1) < 0.005 && Math.abs(scaleY - 1) < 0.005) {
      return;
    }

    const animation = visual.animate([
      {
        transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`,
        filter: "blur(.2px)"
      },
      {
        transform: "translate3d(0, 0, 0) scale(1)",
        filter: "blur(0)"
      }
    ], {
      duration: 420,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both"
    });

    visualAnimations.set(visual, animation);
    animation.addEventListener("finish", () => {
      if (visualAnimations.get(visual) === animation) {
        animation.cancel();
        visualAnimations.delete(visual);
      }
    });
  });

  window.setTimeout(() => {
    target.classList.remove("is-flipping");
  }, 440);
}

export function clearProjectDetail({
  panel = document.getElementById("projectDetailPanel"),
  showcase = document.getElementById("projectShowcase")
} = {}) {
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = "";
  }

  if (showcase) {
    visualResizeObservers.get(showcase)?.disconnect();
    visualResizeObservers.delete(showcase);
    showcase.hidden = true;
    showcase.innerHTML = "";
  }
}

export function bindProjectDetail({ onBack, onNavigate }) {
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-project-back]");
    if (trigger) {
      event.preventDefault();
      onBack?.();
      return;
    }

    const navTrigger = event.target.closest("[data-project-nav]");
    if (navTrigger) {
      event.preventDefault();
      const index = Number(navTrigger.dataset.projectNav);
      if (Number.isFinite(index)) {
        onNavigate?.(index);
      }
      return;
    }

    if (event.target.closest("[data-visual-lightbox-close]")) {
      closeVisualLightbox();
      return;
    }

    const lightbox = event.target.closest("#visualLightbox");
    if (lightbox && event.target === lightbox) {
      closeVisualLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeVisualLightbox();
    }
  });
}
