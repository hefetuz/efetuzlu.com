import { escapeAttr, escapeHtml } from "../utils/dom.js";

const VIEW_TAB_SLOT = 28;
const VIEW_SHRINK_DELAY_MS = 1200;
const TOOLTIP_VIEWPORT_MARGIN = 24;
const viewShrinkTimers = new WeakMap();
let adaptiveTooltipsBound = false;

function getViewActiveIndex(tabs) {
  return Math.max(0, [...tabs.querySelectorAll(".tab")].findIndex((tab) => tab.classList.contains("active")));
}

function setViewTabsPosition(tabs, activeIndex = getViewActiveIndex(tabs)) {
  const buttons = tabs.querySelectorAll(".tab");
  const collapsedOffset = Math.max(0, buttons.length - 1 - activeIndex) * VIEW_TAB_SLOT;
  const activeX = activeIndex * VIEW_TAB_SLOT;
  tabs.style.setProperty("--view-active-index", activeIndex);
  tabs.style.setProperty("--view-active-x", `${activeX}px`);
  tabs.style.setProperty("--view-active-offset", `${collapsedOffset}px`);
  tabs.style.setProperty("--view-orb-x", tabs.dataset.open === "true" ? `${activeX}px` : "0px");
}

function setViewTabsOpen(tabs, isOpen) {
  tabs.dataset.open = isOpen ? "true" : "false";
  setViewTabsPosition(tabs);
  updateTabIndicator(tabs);
}

function clearViewShrinkTimer(tabs) {
  const timer = viewShrinkTimers.get(tabs);
  if (!timer) return;
  window.clearTimeout(timer);
  viewShrinkTimers.delete(tabs);
}

function isViewTabsHovered(tabs) {
  return tabs.dataset.pointerInside === "true" || tabs.matches(":hover");
}

function closeViewTabs(tabs, { blurFocus = false } = {}) {
  clearViewShrinkTimer(tabs);
  tabs.dataset.pendingShrink = "false";
  if (blurFocus && tabs.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  setViewTabsOpen(tabs, false);
}

function scheduleViewTabsClose(tabs) {
  clearViewShrinkTimer(tabs);
  const timer = window.setTimeout(() => {
    viewShrinkTimers.delete(tabs);
    if (!isViewTabsHovered(tabs)) {
      closeViewTabs(tabs, { blurFocus: true });
    }
  }, VIEW_SHRINK_DELAY_MS);
  viewShrinkTimers.set(tabs, timer);
}

function handleViewTabsEnter(tabs) {
  tabs.dataset.pointerInside = "true";
  tabs.dataset.pendingShrink = "false";
  clearViewShrinkTimer(tabs);
  setViewTabsOpen(tabs, true);
}

function handleViewTabsLeave(tabs) {
  tabs.dataset.pointerInside = "false";
  if (tabs.dataset.pendingShrink === "true") {
    scheduleViewTabsClose(tabs);
    return;
  }
  closeViewTabs(tabs, { blurFocus: true });
}

function positionTooltip(tooltip) {
  tooltip.style.setProperty("--tt-shift", "0px");

  const rect = tooltip.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  let shift = 0;

  if (rect.left < TOOLTIP_VIEWPORT_MARGIN) {
    shift = TOOLTIP_VIEWPORT_MARGIN - rect.left;
  } else if (rect.right > viewportWidth - TOOLTIP_VIEWPORT_MARGIN) {
    shift = viewportWidth - TOOLTIP_VIEWPORT_MARGIN - rect.right;
  }

  tooltip.style.setProperty("--tt-shift", `${Math.round(shift)}px`);
}

function queueTooltipPosition(target) {
  const wrap = target.closest?.(".t-tt-wrap");
  const tooltip = wrap?.querySelector(".t-tt");
  if (!tooltip) return;

  window.requestAnimationFrame(() => positionTooltip(tooltip));
}

export function bindAdaptiveTooltips() {
  if (adaptiveTooltipsBound) return;
  adaptiveTooltipsBound = true;

  document.addEventListener("pointerover", (event) => queueTooltipPosition(event.target), true);
  document.addEventListener("focusin", (event) => queueTooltipPosition(event.target), true);
  window.addEventListener("resize", () => {
    document.querySelectorAll(".t-tt-wrap:hover .t-tt, .t-tt-wrap:focus-within .t-tt").forEach(positionTooltip);
  });
}

function categoryTabTemplate(category, isActive) {
  return `
    <button class="tab text-ui${isActive ? " active" : ""}" type="button" data-filter="${escapeAttr(category.id)}">
      <span class="tab-text">${escapeHtml(category.label)}</span>
    </button>
  `;
}

function viewTabTemplate(viewMode, isActive) {
  return `
    <button class="tab text-ui icon-tab${isActive ? " active" : ""}" type="button" data-view="${escapeAttr(viewMode.id)}" data-tooltip="${escapeAttr(viewMode.label)}" aria-label="${escapeAttr(viewMode.label)}">
      <span class="view-icon view-icon-${escapeAttr(viewMode.icon || viewMode.id)}" aria-hidden="true"></span>
    </button>
  `;
}

export function renderCategoryTabs(categories, activeId, target = document.querySelector(".filter-tabs")) {
  const indicator = target.querySelector(".tab-indicator")?.outerHTML ?? '<span class="tab-indicator" aria-hidden="true"></span>';
  target.classList.remove("is-ready");
  target.classList.add("is-hydrating");
  target.innerHTML = `${indicator}${categories.map((category) => categoryTabTemplate(category, category.id === activeId)).join("")}`;
  requestAnimationFrame(() => {
    updateTabIndicator(target, { instant: true });
    target.classList.add("is-ready");
    target.classList.remove("is-hydrating");
  });
}

export function renderViewTabs(viewModes, activeId, target = document.querySelector(".view-tabs")) {
  const indicator = target.querySelector(".tab-indicator")?.outerHTML ?? '<span class="tab-indicator" aria-hidden="true"></span>';
  const activeOrb = target.querySelector(".view-active-orb")?.outerHTML ?? '<span class="view-active-orb" aria-hidden="true"></span>';
  const activeIndex = Math.max(0, viewModes.findIndex((viewMode) => viewMode.id === activeId));
  const collapsedOffset = Math.max(0, viewModes.length - 1 - activeIndex) * VIEW_TAB_SLOT;
  target.classList.remove("is-ready");
  target.dataset.open = "false";
  target.style.setProperty("--view-tab-count", viewModes.length);
  target.style.setProperty("--view-active-index", activeIndex);
  target.style.setProperty("--view-active-x", `${activeIndex * VIEW_TAB_SLOT}px`);
  target.style.setProperty("--view-active-offset", `${collapsedOffset}px`);
  target.style.setProperty("--view-orb-x", "0px");
  target.classList.add("is-hydrating");
  target.innerHTML = `${indicator}${activeOrb}${viewModes.map((viewMode) => viewTabTemplate(viewMode, viewMode.id === activeId)).join("")}`;
  requestAnimationFrame(() => {
    updateTabIndicator(target, { instant: true });
    target.classList.add("is-ready");
    target.classList.remove("is-hydrating");
  });
}

export function updateTabIndicator(tabs = document.querySelector(".filter-tabs"), options = {}) {
  if (!tabs) return;
  const active = tabs.querySelector(".tab.active");
  const indicator = tabs.querySelector(".tab-indicator");
  if (!active || !indicator) return;

  const segmentPadding = Number.parseFloat(getComputedStyle(tabs).getPropertyValue("--segment-padding")) || 2;
  const isViewTabs = tabs.classList.contains("view-tabs");
  const isCollapsedView = isViewTabs && tabs.dataset.open !== "true";
  const activeBox = active.getBoundingClientRect();
  let indicatorWidth = activeBox.width;
  let indicatorHeight = activeBox.height;
  let offsetX;
  let offsetY;

  if (isViewTabs) {
    const activeIndex = [...tabs.querySelectorAll(".tab")].indexOf(active);
    const slot = Number.parseFloat(getComputedStyle(tabs).getPropertyValue("--view-tab-slot")) || VIEW_TAB_SLOT;
    indicatorWidth = slot;
    indicatorHeight = Number.parseFloat(getComputedStyle(tabs).getPropertyValue("--segment-tab-height")) || activeBox.height;
    offsetX = isCollapsedView ? segmentPadding : segmentPadding + Math.max(0, activeIndex) * slot;
    offsetY = segmentPadding;
  } else {
    const tabsBox = tabs.getBoundingClientRect();
    offsetX = activeBox.left - tabsBox.left;
    offsetY = activeBox.top - tabsBox.top;
  }

  if (options.instant) {
    tabs.classList.add("is-hydrating");
  }
  indicator.style.width = `${indicatorWidth}px`;
  indicator.style.height = `${indicatorHeight}px`;
  indicator.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
  if (options.instant) {
    requestAnimationFrame(() => tabs.classList.remove("is-hydrating"));
  }
}

export function updateAllTabIndicators() {
  document.querySelectorAll(".segmented-control").forEach((tabs) => updateTabIndicator(tabs));
}

export function bindTabs(selector, callback) {
  const tabs = document.querySelector(selector);
  if (!tabs) return;

  if (tabs.classList.contains("view-tabs")) {
    tabs.addEventListener("pointerenter", () => handleViewTabsEnter(tabs));
    tabs.addEventListener("pointerleave", () => handleViewTabsLeave(tabs));
    tabs.addEventListener("mouseenter", () => handleViewTabsEnter(tabs));
    tabs.addEventListener("mouseleave", () => handleViewTabsLeave(tabs));
    tabs.addEventListener("focusin", () => setViewTabsOpen(tabs, true));
    tabs.addEventListener("focusout", () => {
      if (!tabs.matches(":focus-within")) {
        closeViewTabs(tabs);
      }
    });
  }

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest(".tab");
    if (!button) return;

    const isViewTabs = tabs.classList.contains("view-tabs");
    const isCollapsedViewTabs = isViewTabs && tabs.dataset.open !== "true";
    const wasActiveViewTab = isViewTabs && button.classList.contains("active");

    if (isCollapsedViewTabs && wasActiveViewTab) {
      handleViewTabsEnter(tabs);
      return;
    }

    if (isViewTabs) {
      clearViewShrinkTimer(tabs);
      setViewTabsOpen(tabs, true);
    }

    tabs.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab === button);
    });

    if (isViewTabs) {
      const buttons = [...tabs.querySelectorAll(".tab")];
      const index = buttons.indexOf(button);
      const activeIndex = Math.max(0, index);
      tabs.dataset.pendingShrink = "true";
      setViewTabsPosition(tabs, activeIndex);
      scheduleViewTabsClose(tabs);
    }

    callback(button);
    updateAllTabIndicators();
  });
}
