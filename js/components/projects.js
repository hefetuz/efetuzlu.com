import { cardLayoutFlush, escapeAttr, escapeHtml } from "../utils/dom.js";
import { getProjectCover, mediaElementTemplate } from "../utils/media.js";

const resizeAnimations = new WeakMap();
const gridResizeObservers = new WeakMap();
const BENTO_SLOTS = [
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

function projectCardTemplate(project, visibleIndex, sourceIndex) {
  const scope = project.scope || project.summary || project.description;
  const date = project.date || project.meta;
  const cover = getProjectCover(project);

  return `
    <article class="project-card t-resize" tabindex="0" role="button" data-project-index="${sourceIndex}" data-bento-index="${visibleIndex}" style="--appear-delay:${80 + visibleIndex * 90}ms">
      ${mediaElementTemplate(cover, "", {
        loading: visibleIndex < 4 ? "eager" : "lazy",
        decoding: "async",
        fetchPriority: visibleIndex < 2 ? "high" : "auto",
        preload: visibleIndex < 2 ? "auto" : "metadata"
      })}
      <div class="project-info">
        <div class="project-line">
          <h2 class="project-name text-card-title">${escapeHtml(project.title)}</h2>
          <small class="project-date text-ui text-muted">${escapeHtml(date)}</small>
        </div>
        <div class="project-line">
          <p class="project-scope text-body text-muted">${escapeHtml(scope)}</p>
        </div>
      </div>
    </article>
  `;
}

function applyCardAspectRatio(card, width, height) {
  if (!card || !width || !height) return;

  const ratio = width / height;
  if (!Number.isFinite(ratio) || ratio <= 0) return;

  card.style.setProperty("--card-media-ratio", ratio.toFixed(4));
  card.classList.toggle("is-portrait", ratio < 0.82);
  card.classList.toggle("is-square", ratio >= 0.82 && ratio <= 1.18);
  card.classList.toggle("is-landscape", ratio > 1.18);
  layoutBentoCards(card.closest(".project-grid"));
}

function getBentoShape(index) {
  return BENTO_SLOTS[index % BENTO_SLOTS.length];
}

function getGridColumnCount(grid) {
  const columns = getComputedStyle(grid).gridTemplateColumns;
  if (!columns || columns === "none") return 1;
  return columns.split(" ").filter(Boolean).length || 1;
}

function layoutBentoCards(grid) {
  if (!grid || !grid.classList.contains("view-bento")) return;

  const columns = getGridColumnCount(grid);

  grid.querySelectorAll(".project-card").forEach((card) => {
    const index = Number.parseInt(card.dataset.bentoIndex, 10) || 0;
    const shape = getBentoShape(index);
    card.style.setProperty("--card-bento-col-span", String(columns <= 2 ? 1 : Math.min(shape.columns, columns)));
    card.style.setProperty("--card-bento-row-span", String(shape.rows));
  });
}

function bindCardAspectRatios(grid) {
  gridResizeObservers.get(grid)?.disconnect();
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => layoutBentoCards(grid));
    observer.observe(grid);
    gridResizeObservers.set(grid, observer);
  }

  grid.querySelectorAll(".project-card").forEach((card) => {
    const media = card.querySelector("img, video");
    if (!media) return;

    if (media.tagName === "IMG") {
      const updateImageRatio = () => applyCardAspectRatio(card, media.naturalWidth, media.naturalHeight);
      if (media.complete && media.naturalWidth) {
        updateImageRatio();
      } else {
        media.addEventListener("load", updateImageRatio, { once: true });
      }
      return;
    }

    const updateVideoRatio = () => applyCardAspectRatio(card, media.videoWidth, media.videoHeight);
    if (media.readyState >= 1 && media.videoWidth) {
      updateVideoRatio();
    } else {
      media.addEventListener("loadedmetadata", updateVideoRatio, { once: true });
    }
  });

  requestAnimationFrame(() => layoutBentoCards(grid));
}

function bindCardLoadState(grid) {
  grid.querySelectorAll(".project-card").forEach((card) => {
    const media = card.querySelector("img, video");
    if (!media) return;
    const loadStart = performance.now();

    const markLoaded = () => {
      const elapsed = performance.now() - loadStart;
      const remaining = Math.max(0, 180 - elapsed);
      window.setTimeout(() => {
        card.classList.add("is-loaded");
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

function warmProjectCovers(projects) {
  projects.forEach(({ project }, visibleIndex) => {
    if (visibleIndex >= 4) return;
    const cover = getProjectCover(project);
    if (!cover?.src) return;

    const preloadSelector = `[data-project-cover-preload="${CSS.escape(cover.src)}"]`;
    if (document.head.querySelector(preloadSelector)) return;

    if (cover.type === "image") {
      const preloadLink = document.createElement("link");
      preloadLink.rel = "preload";
      preloadLink.as = "image";
      preloadLink.href = cover.src;
      preloadLink.fetchPriority = visibleIndex < 6 ? "high" : "auto";
      preloadLink.dataset.projectCoverPreload = cover.src;
      document.head.append(preloadLink);

      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = visibleIndex < 6 ? "high" : "auto";
      image.src = cover.src;
      return;
    }

    const preloadLink = document.createElement("link");
    preloadLink.rel = "preload";
    preloadLink.as = "video";
    preloadLink.href = cover.src;
    preloadLink.dataset.projectCoverPreload = cover.src;
    document.head.append(preloadLink);
  });
}

export function getProjectsByCategory(projects, category) {
  if (category === "all") {
    return projects.map((project, index) => ({ project, index }));
  }

  return projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => {
      const categories = project.categories || [project.category];
      return categories.includes(category);
    });
}

export function renderProjects({ projects, filter, view, target = document.getElementById("work") }) {
  const filtered = getProjectsByCategory(projects, filter);
  target.className = `project-grid view-${view}`;
  target.innerHTML = filtered.map(({ project, index }, visibleIndex) => (
    projectCardTemplate(project, visibleIndex, index)
  )).join("");
  warmProjectCovers(filtered);
  target.querySelectorAll(".project-card").forEach((card, cardIndex) => {
    card.classList.add("framer-reveal");
    card.style.setProperty("--appear-delay", `${Math.min(60 + cardIndex * 36, 240)}ms`);
  });
  bindCardLoadState(target);
  bindCardAspectRatios(target);
}

export function animateProjectViewChange({ view, target = document.getElementById("work") }) {
  const cards = [...target.querySelectorAll(".project-card")];

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !cards.length) {
    target.className = `project-grid view-${view}`;
    layoutBentoCards(target);
    return;
  }

  const previousRects = new Map(cards.map((card) => [card, card.getBoundingClientRect()]));
  cards.forEach((card) => resizeAnimations.get(card)?.cancel());

  target.className = `project-grid view-${view} is-flipping`;
  layoutBentoCards(target);
  cardLayoutFlush(target);

  const nextRects = new Map(cards.map((card) => [card, card.getBoundingClientRect()]));

  cards.forEach((card) => {
    const previous = previousRects.get(card);
    const next = nextRects.get(card);
    if (!previous || !next) return;

    const deltaX = previous.left - next.left;
    const deltaY = previous.top - next.top;
    const scaleX = previous.width / Math.max(next.width, 1);
    const scaleY = previous.height / Math.max(next.height, 1);

    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5 && Math.abs(scaleX - 1) < 0.005 && Math.abs(scaleY - 1) < 0.005) {
      return;
    }

    const animation = card.animate([
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

    resizeAnimations.set(card, animation);
    animation.addEventListener("finish", () => {
      if (resizeAnimations.get(card) === animation) {
        animation.cancel();
        resizeAnimations.delete(card);
      }
    });
  });

  window.setTimeout(() => {
    target.classList.remove("is-flipping");
  }, 440);
}

export function bindProjectGrid({ target = document.getElementById("work"), getProject, onOpen }) {
  target.addEventListener("click", (event) => {
    const card = event.target.closest(".project-card");
    if (!card) return;
    const projectIndex = Number(card.dataset.projectIndex);
    onOpen(getProject(projectIndex), projectIndex);
  });

  target.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    const card = event.target.closest(".project-card");
    if (!card) return;
    event.preventDefault();
    const projectIndex = Number(card.dataset.projectIndex);
    onOpen(getProject(projectIndex), projectIndex);
  });
}
