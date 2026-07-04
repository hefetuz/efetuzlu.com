import { escapeHtml, getPath } from "../utils/dom.js";

export function setTextBindings(content) {
  document.querySelectorAll("[data-text]").forEach((node) => {
    node.textContent = getPath(content, node.dataset.text) ?? "";
  });
}

export function splitIntroWords(content) {
  const headline = document.querySelector(".intro h1");
  if (!headline) return;

  const source = headline.dataset.introText ? getPath(content, headline.dataset.introText) : headline.textContent;
  const text = String(source || "").trim();
  const words = text.split(/\s+/).filter(Boolean);
  headline.setAttribute("aria-label", text);
  headline.innerHTML = words.map((word, index) => (
    `<span class="intro-word" style="--word-delay:${index * 45}ms">${escapeHtml(word)}</span>`
  )).join(" ");
}

export function syncButtonLabels() {
  document.querySelectorAll(".btn").forEach((button) => {
    button.dataset.label = button.textContent.trim();
  });
}
