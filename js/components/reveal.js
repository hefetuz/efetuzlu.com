export function observeReveal(nodes) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    nodes.forEach((node) => node.classList.add("framer-reveal"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("framer-reveal");
      observer.unobserve(entry.target);
    });
  }, {
    threshold: 0.18,
    rootMargin: "0px 0px -8% 0px"
  });

  nodes.forEach((node) => observer.observe(node));
}

export function startAppearAnimations() {
  const blocks = [
    [document.querySelector(".profile"), 0],
    [document.querySelector(".services"), 600],
    [document.querySelector(".footer"), 800]
  ];

  blocks.forEach(([node, delay]) => {
    if (!node) return;
    node.style.setProperty("--appear-delay", `${delay}ms`);
    node.classList.add("framer-reveal");
  });
}
