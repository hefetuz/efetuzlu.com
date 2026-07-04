import { escapeAttr, escapeHtml } from "../utils/dom.js";
import { getMediaType, normalizeMediaItem } from "../utils/media.js";

const CONTENT_URL = "cms/content.json";
const SAVE_URL = "/api/content";
const MEDIA_URL = "/api/media";
const MEDIA_ACCEPT = "image/*,.gif,video/*";

const state = {
  content: null,
  activeIndex: 0,
  dirty: false
};

const elements = {
  stats: document.getElementById("cmsStats"),
  list: document.getElementById("cmsProjectList"),
  form: document.getElementById("cmsProjectForm"),
  status: document.getElementById("cmsStatus"),
  save: document.getElementById("cmsSave"),
  export: document.getElementById("cmsExport"),
  add: document.getElementById("cmsAddProject")
};

const projectFields = [
  { key: "title", label: "Project Name", type: "text" },
  { key: "slug", label: "Slug", type: "text" },
  { key: "summary", label: "Project Type", type: "text", hint: "Shown under project cards, e.g. AI Travel App." },
  { key: "date", label: "Year / Date", type: "text" },
  { key: "description", label: "Description", type: "textarea", rows: 5, wide: true, hint: "Shown under the project title on the detail page." }
];

const projectInfoFields = [
  { key: "services", label: "Services", hint: "One service per line. Shown in the project detail info grid." },
  { key: "techStack", label: "Tech Stack", hint: "One tool or platform per line." },
  { key: "industry", label: "Industry", hint: "One industry tag per line." }
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

function getProjectCategories(project) {
  return project.categories?.length ? project.categories : [project.category].filter(Boolean);
}

function getProjectMedia(project) {
  return project.media?.length ? project.media : [];
}

function normalizeTextList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToTextareaValue(value) {
  return normalizeTextList(value).join("\n");
}

function setStatus(message, tone = "muted") {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function markDirty() {
  state.dirty = true;
  setStatus("Unsaved changes", "warning");
}

function getContentCategories() {
  return state.content.projectCategories.filter((category) => category.id !== "all");
}

function normalizeProject(project) {
  const fallbackMedia = project.image
    ? [{ src: project.image, type: getMediaType(project.image), alt: project.title, caption: project.summary || "" }]
    : [];

  const sourceMedia = project.media?.length
    ? project.media
    : project.images?.length
      ? project.images
      : fallbackMedia;

  project.media = sourceMedia.map((item) => normalizeMediaItem(item, project.title));
  project.categories = getProjectCategories(project);
  project.category = project.category || project.categories[0] || "product";
  project.scope = project.scope || project.summary || "";
  project.summary = project.summary || project.scope || "";
  project.description = project.description || "";
  project.services = normalizeTextList(project.services || project.service || project.meta);
  project.techStack = normalizeTextList(project.techStack || project.stack);
  project.industry = normalizeTextList(project.industry || project.scope || project.summary);

  if (!project.image && project.media[0]) {
    project.image = project.media[0].poster || project.media[0].src;
  }

  return project;
}

function normalizeContent(content) {
  content.projects = content.projects.map(normalizeProject);
  return content;
}

function renderStats() {
  const categories = state.content.projectCategories;
  elements.stats.innerHTML = categories.map((category) => {
    const count = category.id === "all"
      ? state.content.projects.length
      : state.content.projects.filter((project) => getProjectCategories(project).includes(category.id)).length;

    return `
      <div class="cms-stat">
        <span class="text-ui">${escapeHtml(category.label)}</span>
        <strong class="text-mono">${count}</strong>
      </div>
    `;
  }).join("");
}

function renderProjectList() {
  elements.list.innerHTML = state.content.projects.map((project, index) => {
    const categories = getProjectCategories(project)
      .map((category) => state.content.projectCategories.find((item) => item.id === category)?.label || category)
      .join(", ");

    return `
      <button class="cms-project-row${index === state.activeIndex ? " active" : ""}" type="button" data-project-index="${index}">
        <span>
          <strong class="text-ui">${escapeHtml(project.title)}</strong>
          <small class="text-ui text-muted">${escapeHtml(project.summary || project.scope || "No project type")}</small>
        </span>
        <em class="text-ui text-muted">${escapeHtml(categories)}</em>
      </button>
    `;
  }).join("");
}

function fieldTemplate(project, field) {
  const { key, label, type = "text", rows = 4, wide = false, hint = "" } = field;
  const value = project[key] || "";
  const control = type === "textarea"
    ? `<textarea name="${escapeAttr(key)}" rows="${escapeAttr(rows)}">${escapeHtml(value)}</textarea>`
    : `<input name="${escapeAttr(key)}" type="${escapeAttr(type)}" value="${escapeAttr(value)}">`;

  return `
    <label class="cms-field${wide ? " cms-field-wide" : ""}">
      <span class="text-ui text-muted">${escapeHtml(label)}</span>
      ${control}
      ${hint ? `<small class="text-ui text-muted">${escapeHtml(hint)}</small>` : ""}
    </label>
  `;
}

function listFieldTemplate(project, field) {
  const { key, label, hint = "" } = field;

  return `
    <label class="cms-field">
      <span class="text-ui text-muted">${escapeHtml(label)}</span>
      <textarea data-list-field="${escapeAttr(key)}" rows="5">${escapeHtml(listToTextareaValue(project[key]))}</textarea>
      ${hint ? `<small class="text-ui text-muted">${escapeHtml(hint)}</small>` : ""}
    </label>
  `;
}

function mediaPreviewTemplate(media, label = "Media preview") {
  const item = normalizeMediaItem(media);
  if (!item.src && !item.poster) {
    return `<div class="cms-media-empty text-ui text-muted">${escapeHtml(label)}</div>`;
  }

  if (item.type === "video") {
    return `
      <video src="${escapeAttr(item.src)}"${item.poster ? ` poster="${escapeAttr(item.poster)}"` : ""} muted playsinline preload="metadata" aria-label="${escapeAttr(item.alt || label)}"></video>
    `;
  }

  return `<img src="${escapeAttr(item.src || item.poster)}" alt="${escapeAttr(item.alt || label)}">`;
}

function renderCoverField(project) {
  const cover = {
    src: project.image || "",
    type: getMediaType(project.image || ""),
    alt: project.title
  };

  return `
    <section class="cms-cover-panel">
      <div class="cms-section-head">
        <div>
          <p class="text-ui text-muted">Card Cover</p>
          <h3 class="text-body">Homepage card media</h3>
        </div>
        <label class="btn btn-regular secondary cms-file-button">
          <span>Upload Cover</span>
          <input class="cms-file-input" type="file" accept="${MEDIA_ACCEPT}" data-upload-target="cover">
        </label>
      </div>
      <div class="cms-cover-grid">
        <div class="cms-media-preview">
          ${mediaPreviewTemplate(cover, "Cover preview")}
        </div>
        <label class="cms-field">
          <span class="text-ui text-muted">Cover Path</span>
          <input name="image" type="text" value="${escapeAttr(project.image || "")}">
        </label>
      </div>
    </section>
  `;
}

function renderMediaManager(project) {
  const media = getProjectMedia(project);

  return `
    <section class="cms-media-manager" data-media-manager>
      <div class="cms-section-head">
        <div>
          <p class="text-ui text-muted">Project Media</p>
          <h3 class="text-body">Detail page visuals</h3>
        </div>
        <button class="btn btn-regular secondary" type="button" data-add-media>Add Media</button>
        <input class="cms-file-input" type="file" accept="${MEDIA_ACCEPT}" multiple data-add-media-picker>
      </div>
      <div class="cms-media-list">
        ${media.length ? media.map((item, index) => mediaItemTemplate(item, index)).join("") : `
          <div class="cms-media-empty text-ui text-muted">No media yet. Add an image or video for the project detail page.</div>
        `}
      </div>
    </section>
  `;
}

function mediaItemTemplate(media, index) {
  const item = normalizeMediaItem(media);

  return `
    <article class="cms-media-item" data-media-index="${index}">
      <div class="cms-media-preview">
        ${mediaPreviewTemplate(item, `Media ${index + 1}`)}
      </div>
      <div class="cms-media-fields">
        <label class="cms-field">
          <span class="text-ui text-muted">Type</span>
          <select data-media-field="type">
            <option value="image"${item.type === "image" ? " selected" : ""}>Image / GIF</option>
            <option value="video"${item.type === "video" ? " selected" : ""}>Video</option>
          </select>
        </label>
        <label class="cms-field">
          <span class="text-ui text-muted">Source</span>
          <input data-media-field="src" type="text" value="${escapeAttr(item.src || "")}">
        </label>
        <label class="cms-field">
          <span class="text-ui text-muted">Poster</span>
          <input data-media-field="poster" type="text" value="${escapeAttr(item.poster || "")}">
        </label>
        <label class="cms-field">
          <span class="text-ui text-muted">Alt</span>
          <input data-media-field="alt" type="text" value="${escapeAttr(item.alt || "")}">
        </label>
        <label class="cms-field cms-field-wide">
          <span class="text-ui text-muted">Caption</span>
          <input data-media-field="caption" type="text" value="${escapeAttr(item.caption || "")}">
        </label>
      </div>
      <div class="cms-media-actions">
        <label class="btn btn-small secondary cms-file-button">
          <span>Upload</span>
          <input class="cms-file-input" type="file" accept="${MEDIA_ACCEPT}" data-upload-target="media" data-media-index="${index}">
        </label>
        <button class="btn btn-small secondary" type="button" data-set-cover="${index}">Set Cover</button>
        <button class="btn btn-small secondary" type="button" data-move-media="${index}" data-direction="-1">Up</button>
        <button class="btn btn-small secondary" type="button" data-move-media="${index}" data-direction="1">Down</button>
        <button class="btn btn-small secondary" type="button" data-delete-media="${index}">Delete</button>
      </div>
    </article>
  `;
}

function renderCategoryFields(project) {
  const activeCategories = new Set(getProjectCategories(project));

  return `
    <fieldset class="cms-fieldset">
      <legend class="text-ui text-muted">Categories</legend>
      <div class="cms-category-grid">
        ${getContentCategories().map((category) => `
          <label class="cms-check">
            <input type="checkbox" name="categories" value="${escapeAttr(category.id)}"${activeCategories.has(category.id) ? " checked" : ""}>
            <span>${escapeHtml(category.label)}</span>
          </label>
        `).join("")}
      </div>
    </fieldset>
  `;
}

function renderPrimaryCategory(project) {
  const categoryIds = getProjectCategories(project);

  return `
    <label class="cms-field">
      <span class="text-ui text-muted">Primary Category</span>
      <select name="category">
        ${getContentCategories().map((category) => `
          <option value="${escapeAttr(category.id)}"${(project.category || categoryIds[0]) === category.id ? " selected" : ""}>
            ${escapeHtml(category.label)}
          </option>
        `).join("")}
      </select>
    </label>
  `;
}

function renderEditor() {
  const project = state.content.projects[state.activeIndex];
  if (!project) {
    elements.form.innerHTML = `<p class="text-body text-muted">No project selected.</p>`;
    return;
  }

  elements.form.innerHTML = `
    <div class="cms-editor-head">
      <div>
        <p class="text-ui text-muted">Editing</p>
        <h2 class="text-heading">${escapeHtml(project.title)}</h2>
      </div>
      <button class="btn btn-regular secondary" type="button" data-delete-project>Delete</button>
    </div>
    <section class="cms-editor-section">
      <div class="cms-section-head">
        <div>
          <p class="text-ui text-muted">Project Page</p>
          <h3 class="text-body">Title, description and date</h3>
        </div>
      </div>
      <div class="cms-field-grid">
        ${projectFields.map((field) => fieldTemplate(project, field)).join("")}
      </div>
    </section>
    <section class="cms-editor-section">
      <div class="cms-section-head">
        <div>
          <p class="text-ui text-muted">Project Detail Info</p>
          <h3 class="text-body">Services, stack, industry</h3>
        </div>
      </div>
      <div class="cms-field-grid">
        ${projectInfoFields.map((field) => listFieldTemplate(project, field)).join("")}
      </div>
    </section>
    <section class="cms-editor-section">
      <div class="cms-section-head">
        <div>
          <p class="text-ui text-muted">Portfolio Filters</p>
          <h3 class="text-body">Category placement</h3>
        </div>
      </div>
      <div class="cms-field-grid">
        ${renderPrimaryCategory(project)}
        ${renderCategoryFields(project)}
      </div>
    </section>
    ${renderCoverField(project)}
    ${renderMediaManager(project)}
  `;
}

function render() {
  renderStats();
  renderProjectList();
  renderEditor();
}

function updateMediaField(input) {
  const project = state.content.projects[state.activeIndex];
  const row = input.closest("[data-media-index]");
  if (!project || !row) return;

  const index = Number(row.dataset.mediaIndex);
  const field = input.dataset.mediaField;
  project.media[index][field] = input.value;

  if (field === "src") {
    project.media[index].type = getMediaType(input.value, project.media[index].type || "image");
  }

  markDirty();
}

function updateProjectFromInput(input) {
  const project = state.content.projects[state.activeIndex];
  if (!project) return;

  if (input.dataset.mediaField) {
    updateMediaField(input);
    return;
  }

  if (input.dataset.listField) {
    const field = input.dataset.listField;
    project[field] = normalizeTextList(input.value);
    if (field === "services") {
      project.service = project.services.join(", ");
      project.meta = project.services[0] || project.meta || "";
    }
    markDirty();
    renderProjectList();
    return;
  }

  if (input.name === "categories") {
    const selected = [...elements.form.querySelectorAll('input[name="categories"]:checked')].map((item) => item.value);
    project.categories = selected.length ? selected : [project.category || "product"];
    if (!project.categories.includes(project.category)) {
      project.category = project.categories[0];
    }
  } else if (input.name === "category") {
    project.category = input.value;
    project.categories = Array.from(new Set([input.value, ...getProjectCategories(project)]));
  } else {
    project[input.name] = input.value;
    if (input.name === "summary") {
      project.scope = input.value;
      project.media.forEach((item) => {
        if (!item.caption) item.caption = input.value;
      });
    }
    if (input.name === "title" && !project.slug) {
      project.slug = slugify(input.value);
    }
  }

  markDirty();
  renderStats();
  renderProjectList();
}

function addProject() {
  const nextNumber = state.content.projects.length + 1;
  const project = normalizeProject({
    title: `New Project ${nextNumber}`,
    slug: `new-project-${nextNumber}`,
    category: "product",
    categories: ["product"],
    meta: "Product Design",
    date: "2026",
    summary: "Project Type",
    scope: "Project Type",
    service: "Product Design",
    goal: "",
    description: "Describe the work, the product context and what changed.",
    image: "assets/project-1-hant-ai.webp",
    media: [],
    services: ["Product Design"],
    techStack: ["Figma"],
    industry: ["Digital Product"]
  });

  state.content.projects.push(project);
  state.activeIndex = state.content.projects.length - 1;
  markDirty();
  render();
}

function deleteProject() {
  if (state.content.projects.length <= 1) {
    setStatus("At least one project is required.", "error");
    return;
  }

  const project = state.content.projects[state.activeIndex];
  const label = project?.title ? `Delete project \"${project.title}\"?` : "Delete this project?";
  if (!window.confirm(`${label}\nThis cannot be undone.`)) {
    return;
  }

  state.content.projects.splice(state.activeIndex, 1);
  state.activeIndex = Math.max(0, state.activeIndex - 1);
  markDirty();
  render();
}

function addMedia() {
  const project = state.content.projects[state.activeIndex];
  if (!project) return;

  project.media.push({
    type: "image",
    src: project.image || "",
    poster: "",
    alt: project.title,
    caption: project.summary || ""
  });
  markDirty();
  renderEditor();
}

async function addMediaFiles(files) {
  const project = state.content.projects[state.activeIndex];
  if (!project || !files?.length) return;

  const fileList = [...files].filter(Boolean);
  if (!fileList.length) return;

  try {
    setStatus(`Uploading ${fileList.length} media file${fileList.length === 1 ? "" : "s"}...`, "warning");

    for (const file of fileList) {
      const payload = await uploadMediaFile(file);
      project.media.push({
        type: payload.type,
        src: payload.src,
        poster: "",
        alt: project.title,
        caption: project.summary || ""
      });
    }

    if (!project.image && project.media[0]) {
      project.image = project.media[0].poster || project.media[0].src;
    }

    markDirty();
    setStatus("Media uploaded. Save content to persist JSON.", "success");
    renderProjectList();
    renderEditor();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function deleteMedia(index) {
  const project = state.content.projects[state.activeIndex];
  if (!project) return;

  const item = project.media[index];
  const label = item?.alt || item?.caption || `Media ${index + 1}`;
  if (!window.confirm(`Delete ${label}?\nThis cannot be undone.`)) {
    return;
  }

  project.media.splice(index, 1);
  markDirty();
  renderEditor();
}

function moveMedia(index, direction) {
  const project = state.content.projects[state.activeIndex];
  const nextIndex = index + direction;
  if (!project || nextIndex < 0 || nextIndex >= project.media.length) return;

  const [item] = project.media.splice(index, 1);
  project.media.splice(nextIndex, 0, item);
  markDirty();
  renderEditor();
}

function setCoverFromMedia(index) {
  const project = state.content.projects[state.activeIndex];
  const item = project?.media[index];
  if (!item) return;

  project.image = item.poster || item.src;
  markDirty();
  renderProjectList();
  renderEditor();
}

async function uploadMediaFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(MEDIA_URL, {
    method: "POST",
    body: formData
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Upload failed");
  }

  return payload;
}

async function handleUpload(input) {
  const project = state.content.projects[state.activeIndex];
  const file = input.files?.[0];
  if (!project || !file) return;

  try {
    setStatus("Uploading media...", "warning");
    const payload = await uploadMediaFile(file);

    if (input.dataset.uploadTarget === "cover") {
      project.image = payload.src;
      if (!project.media.length) {
        project.media.push({
          type: payload.type,
          src: payload.src,
          alt: project.title,
          caption: project.summary || ""
        });
      }
    } else {
      const index = Number(input.dataset.mediaIndex);
      project.media[index] = {
        ...project.media[index],
        type: payload.type,
        src: payload.src,
        alt: project.media[index]?.alt || project.title,
        caption: project.media[index]?.caption || project.summary || ""
      };
    }

    markDirty();
    setStatus("Media uploaded. Save content to persist JSON.", "success");
    renderProjectList();
    renderEditor();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    input.value = "";
  }
}

function downloadContent() {
  const blob = new Blob([`${JSON.stringify(state.content, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "content.json";
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus("Exported content.json", "success");
}

async function saveContent() {
  try {
    const response = await fetch(SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.content)
    });

    if (!response.ok) throw new Error("Local save endpoint unavailable");

    state.dirty = false;
    setStatus("Saved to cms/content.json", "success");
  } catch (error) {
    setStatus("Save failed. Use Export JSON on static hosting.", "error");
  }
}

async function load() {
  const response = await fetch(CONTENT_URL);
  if (!response.ok) throw new Error(`Could not load ${CONTENT_URL}`);
  state.content = normalizeContent(await response.json());
  state.activeIndex = 0;
  state.dirty = false;
  setStatus("Ready", "success");
  render();
}

elements.list.addEventListener("click", (event) => {
  const row = event.target.closest("[data-project-index]");
  if (!row) return;
  state.activeIndex = Number(row.dataset.projectIndex);
  render();
});

elements.form.addEventListener("input", (event) => {
  if (!event.target.matches("input, textarea, select")) return;
  if (event.target.type === "file") return;
  updateProjectFromInput(event.target);
});

elements.form.addEventListener("change", (event) => {
  if (event.target.matches('input[type="file"][data-add-media-picker]')) {
    addMediaFiles(event.target.files);
    event.target.value = "";
    return;
  }

  if (event.target.matches('input[type="file"][data-upload-target]')) {
    handleUpload(event.target);
    return;
  }

  if (!event.target.matches("input, textarea, select")) return;
  updateProjectFromInput(event.target);
});

elements.form.addEventListener("click", (event) => {
  if (event.target.closest("[data-delete-project]")) {
    deleteProject();
    return;
  }

  if (event.target.closest("[data-add-media]")) {
    elements.form.querySelector("[data-add-media-picker]")?.click();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-media]");
  if (deleteButton) {
    deleteMedia(Number(deleteButton.dataset.deleteMedia));
    return;
  }

  const moveButton = event.target.closest("[data-move-media]");
  if (moveButton) {
    moveMedia(Number(moveButton.dataset.moveMedia), Number(moveButton.dataset.direction));
    return;
  }

  const coverButton = event.target.closest("[data-set-cover]");
  if (coverButton) {
    setCoverFromMedia(Number(coverButton.dataset.setCover));
  }
});

elements.add.addEventListener("click", addProject);
elements.export.addEventListener("click", downloadContent);
elements.save.addEventListener("click", saveContent);

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

load().catch((error) => {
  setStatus(error.message, "error");
});
