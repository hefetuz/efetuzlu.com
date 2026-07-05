import { loadContent } from "./cms/content.js";
import { bindAvatar } from "./components/avatar.js";
import {
  animateProjectVisualViewChange,
  bindProjectDetail,
  clearProjectDetail,
  getHomePath,
  getProjectIndexFromHash,
  renderProjectDetail,
  setProjectRoute
} from "./components/project-detail.js";
import { animateProjectViewChange, bindProjectGrid, renderProjects } from "./components/projects.js";
import { startAppearAnimations } from "./components/reveal.js";
import { renderServices } from "./components/services.js";
import { bindLanguageMenu, bindMobileBottomNav, prepareHandwrittenQuote, updateClock, wireLinks } from "./components/site-shell.js";
import { bindAdaptiveTooltips, bindTabs, renderCategoryTabs, renderViewTabs, updateAllTabIndicators } from "./components/tabs.js";
import { setTextBindings, splitIntroWords, syncButtonLabels } from "./components/text-bindings.js";
import { escapeHtml } from "./utils/dom.js";
import { getAvailableLanguages, getInitialLanguage, localizeContent, persistLanguage } from "./utils/i18n.js";

const state = {
  rawContent: null,
  content: null,
  language: "EN",
  filter: "product",
  view: "bento",
  detailView: "single",
  activeProjectIndex: -1
};
const HTML_LANGUAGE_MAP = {
  DE: "de",
  EN: "en",
  ES: "es",
  TR: "tr"
};
const MOBILE_VIEW_QUERY = "(max-width: 760px)";
const LOADER_MIN_DURATION_MS = 420;
const LOADER_EXIT_MS = 320;
const mobileViewMedia = window.matchMedia(MOBILE_VIEW_QUERY);
const loaderStartedAt = performance.now();

function isMobileView() {
  return mobileViewMedia.matches;
}

function getEffectiveProjectView(view = state.view) {
  return isMobileView() ? "single" : view;
}

function getEffectiveDetailView(view = state.detailView) {
  return isMobileView() ? "single" : view;
}

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

function hidePageLoader() {
  const html = document.documentElement;
  const loader = document.getElementById("pageLoader");
  const elapsed = performance.now() - loaderStartedAt;
  const remaining = Math.max(0, LOADER_MIN_DURATION_MS - elapsed);

  window.setTimeout(() => {
    requestAnimationFrame(() => {
      html.classList.remove("is-loading");
      if (!loader) return;
      window.setTimeout(() => loader.remove(), LOADER_EXIT_MS);
    });
  }, remaining);
}

function renderCurrentProjects() {
  renderProjects({
    projects: state.content.projects,
    filter: state.filter,
    view: getEffectiveProjectView()
  });
}

function setViewMode(view) {
  if (state.view === view) return;
  state.view = view;
  animateProjectViewChange({ view: getEffectiveProjectView() });
}

function renderActiveProjectDetail() {
  const project = state.content?.projects?.[state.activeProjectIndex];
  if (!project) return;

  renderProjectDetail({
    project,
    projects: state.content.projects,
    index: state.activeProjectIndex,
    view: getEffectiveDetailView(),
    labels: state.content.ui?.projectDetail || {}
  });
}

function setDetailViewMode(view) {
  if (state.detailView === view) return;
  state.detailView = view;
  animateProjectVisualViewChange({ view: getEffectiveDetailView() });
}

function setProjectDetail(index) {
  const project = state.content?.projects?.[index];
  if (!project) return;

  state.activeProjectIndex = index;
  document.querySelector(".app-shell")?.classList.add("is-project-detail");
  document.getElementById("projectVisualToolbar").hidden = false;
  renderActiveProjectDetail();
  document.title = `${project.title} | ${state.content.site.brandName}`;
  requestAnimationFrame(updateAllTabIndicators);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function setDocumentMeta(content) {
  document.documentElement.lang = HTML_LANGUAGE_MAP[content.language] || "en";
  document.title = state.activeProjectIndex >= 0
    ? `${content.projects[state.activeProjectIndex]?.title || content.site.brandName} | ${content.site.brandName}`
    : content.site.title;

  const description = document.querySelector("meta[name='description']");
  if (description) {
    description.content = content.site.description;
  }
}

function clearProjectRoute() {
  const homePath = getHomePath();
  if (window.location.pathname === homePath && (!window.location.hash || window.location.hash === "#top")) {
    handleRoute();
    return;
  }
  window.history.pushState({}, "", homePath);
  handleRoute();
}

function clearProjectView() {
  state.activeProjectIndex = -1;
  document.querySelector(".app-shell")?.classList.remove("is-project-detail");
  const visualToolbar = document.getElementById("projectVisualToolbar");
  if (visualToolbar) {
    visualToolbar.hidden = true;
  }
  clearProjectDetail();

  if (state.content) {
    document.title = state.content.site.title;
  }

  window.scrollTo({ top: 0, behavior: "auto" });
  requestAnimationFrame(updateAllTabIndicators);
}

function renderLocalizedSite({ initial = false } = {}) {
  if (!state.rawContent) return;

  const previousFilter = state.filter;
  state.content = localizeContent(state.rawContent, state.language);
  setDocumentMeta(state.content);

  const hasFilter = state.content.projectCategories?.some((category) => category.id === previousFilter);
  state.filter = initial || !hasFilter ? (state.content.projectCategories?.[0]?.id ?? state.filter) : previousFilter;
  state.view = initial ? (state.content.projectViewModes?.[0]?.id ?? state.view) : state.view;
  state.detailView = initial ? state.view : state.detailView;

  setTextBindings(state.content);
  prepareHandwrittenQuote();
  splitIntroWords(state.content);
  renderCategoryTabs(state.content.projectCategories, state.filter);
  renderViewTabs(state.content.projectViewModes, state.view);
  renderViewTabs(state.content.projectViewModes, state.detailView, document.querySelector(".detail-view-tabs"));
  renderServices(state.content.services, undefined, {
    email: state.content.site.email,
    web3FormsAccessKey: state.content.site.web3FormsAccessKey,
    language: state.language,
    labels: state.content.ui?.serviceForm || {}
  });
  renderCurrentProjects();
  wireLinks(state.content);
  syncButtonLabels();
  updateClock(state.language);

  if (initial) {
    bindAvatar(state.content.site.avatarMotion || state.content.site.avatar);
  }

  handleRoute();
  updateAllTabIndicators();
}

function handleRoute() {
  if (!state.content) return;

  const projectIndex = getProjectIndexFromHash(state.content.projects);
  if (projectIndex >= 0) {
    setProjectDetail(projectIndex);
    return;
  }

  clearProjectView();
}

function handleResponsiveViewChange() {
  if (!state.content) return;

  if (state.activeProjectIndex >= 0) {
    renderActiveProjectDetail();
    requestAnimationFrame(updateAllTabIndicators);
    return;
  }

  renderCurrentProjects();
  requestAnimationFrame(updateAllTabIndicators);
}

function bindInteractions() {
  bindAdaptiveTooltips();
  bindMobileBottomNav();

  bindTabs(".filter-tabs", (button) => {
    state.filter = button.dataset.filter;
    renderCurrentProjects();
  });

  bindTabs(".view-tabs", (button) => {
    setViewMode(button.dataset.view);
  });

  bindTabs(".detail-view-tabs", (button) => {
    setDetailViewMode(button.dataset.view);
  });

  bindProjectGrid({
    getProject: (index) => state.content.projects[index],
    onOpen: (project, index) => {
      if (!project) return;
      setProjectRoute(project, index);
      handleRoute();
    }
  });

  bindProjectDetail({
    onBack: clearProjectRoute,
    onNavigate: (index) => {
      const project = state.content.projects[index];
      if (!project) return;
      setProjectRoute(project, index);
      handleRoute();
    }
  });
  window.addEventListener("hashchange", handleRoute);
  window.addEventListener("popstate", handleRoute);
  window.addEventListener("resize", updateAllTabIndicators);
  window.addEventListener("load", updateAllTabIndicators);
  if (typeof mobileViewMedia.addEventListener === "function") {
    mobileViewMedia.addEventListener("change", handleResponsiveViewChange);
  } else {
    mobileViewMedia.addListener(handleResponsiveViewChange);
  }
}

function revealWorkToolbar() {
  const toolbar = document.querySelector(".work-toolbar");
  if (!toolbar) return;

  updateAllTabIndicators();
  requestAnimationFrame(() => {
    toolbar.classList.add("is-ready");
  });
}

function hydrateSite(content) {
  state.rawContent = content;
  state.language = getInitialLanguage(content);
  renderLocalizedSite({ initial: true });

  bindLanguageMenu({
    languages: getAvailableLanguages(content),
    currentLanguage: state.language,
    onChange: (language) => {
      state.language = language;
      persistLanguage(language);
      renderLocalizedSite();
    }
  });

  updateAllTabIndicators();
  (document.fonts?.ready ?? Promise.resolve()).then(revealWorkToolbar);
  startAppearAnimations();
  window.setInterval(() => updateClock(state.language), 1000);
  hidePageLoader();
}

bindInteractions();

loadContent()
  .then(hydrateSite)
  .catch((error) => {
    document.body.insertAdjacentHTML("afterbegin", `<p style="padding:24px;color:oklch(0.767 0.138 20.782)">${escapeHtml(error.message)}</p>`);
    hidePageLoader();
  });
