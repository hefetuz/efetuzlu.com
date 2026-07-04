export function getPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

export function escapeAttr(value = "") {
  return escapeHtml(value);
}

export function cardLayoutFlush(node) {
  return node.offsetHeight;
}
