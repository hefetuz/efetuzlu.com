import { escapeAttr, escapeHtml } from "../utils/dom.js";

const SOCIAL_DISCLOSURE_QUERY = "(max-width: 760px)";
const MOBILE_BOTTOM_NAV_QUERY = "(max-width: 760px)";
const MOBILE_NAV_SCROLL_DELTA = 6;
const MOBILE_NAV_HIDE_OFFSET = 88;
const mobileNavLabelsByLanguage = {
  DE: { work: "Arbeiten", services: "Leistungen", contact: "Kontakt", email: "E-Mail" },
  EN: { work: "Work", services: "Services", contact: "Contact", email: "Email" },
  ES: { work: "Trabajo", services: "Servicios", contact: "Contacto", email: "Email" },
  TR: { work: "\u0130\u015fler", services: "Hizmetler", contact: "\u0130leti\u015fim", email: "E-posta" }
};

export function prepareHandwrittenQuote() {
  document.querySelectorAll("[data-handwrite]").forEach((quote) => {
    if (quote.dataset.handwriteReady !== "true") {
      const text = quote.textContent || "";
      const trimmedText = text.trim();
      let characterIndex = 0;
      quote.dataset.handwriteReady = "true";
      quote.removeAttribute("aria-label");
      quote.innerHTML = `
        <span class="sr-only">${escapeHtml(trimmedText)}</span>
        <span class="quote-line" aria-hidden="true">
          ${trimmedText.split(/\s+/u).map((word) => `
            <span class="quote-word">
              ${Array.from(word).map((character) => {
                const index = characterIndex;
                characterIndex += 1;
                return `<span class="quote-char" style="--char-index: ${index};">${escapeHtml(character)}</span>`;
              }).join("")}
            </span>
          `).join(" ")}
        </span>
      `;
      quote.style.setProperty("--quote-char-count", characterIndex);
    }

    bindHandwrittenQuoteReveal(quote);
  });
}

function bindHandwrittenQuoteReveal(quote) {
  const section = quote.closest("[data-handwrite-section]") || quote;
  if (section.dataset.handwriteRevealReady === "true") return;
  section.dataset.handwriteRevealReady = "true";

  let observer;
  let ticking = false;
  let hasRevealed = false;

  const isSectionInViewport = () => {
    const rect = section.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    return rect.bottom > 0 && rect.top < viewportHeight;
  };

  const cleanup = () => {
    observer?.disconnect();
    window.removeEventListener("scroll", scheduleCheck);
    window.removeEventListener("resize", scheduleCheck);
  };

  const reveal = () => {
    if (hasRevealed) return;
    hasRevealed = true;
    section.classList.add("is-in-view");
    section.classList.add("has-written");
    cleanup();
  };

  const checkVisibility = () => {
    ticking = false;
    if (isSectionInViewport()) reveal();
  };

  function scheduleCheck() {
    if (ticking || hasRevealed) return;
    ticking = true;
    requestAnimationFrame(checkVisibility);
  }

  if (!("IntersectionObserver" in window)) {
    scheduleCheck();
    return;
  }

  observer = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (!entry?.isIntersecting) return;
    reveal();
  }, {
    root: null,
    rootMargin: "0px",
    threshold: 0.01
  });

  observer.observe(section);
  window.addEventListener("scroll", scheduleCheck, { passive: true });
  window.addEventListener("resize", scheduleCheck);
  scheduleCheck();
}

export function wireLinks(content) {
  document.querySelectorAll("#emailLink, [data-email-link]").forEach((emailLink) => {
    emailLink.href = `mailto:${content.site.email}`;
    const label = emailLink.querySelector("[data-email-label], span");
    if (label) label.textContent = content.ui?.shell?.email || "Email";
  });
  updateMobileBottomNavLabels(content);
  renderSocialLinks(content);
  renderContactLinks(content);
  bindHoverImages();
}

function bindHoverImages(root = document) {
  root.querySelectorAll("img[data-hover-src]").forEach((image) => {
    if (image.dataset.hoverBound === "true") return;

    const loadImage = () => {
      const source = image.dataset.hoverSrc;
      if (!source) return;
      image.src = source;
      delete image.dataset.hoverSrc;
    };
    const trigger = image.closest(".site-quote-author-trigger, .profile-quote em") || image;

    image.dataset.hoverBound = "true";
    trigger.addEventListener("pointerenter", loadImage, { once: true });
    trigger.addEventListener("focusin", loadImage, { once: true });
  });
}

function renderSocialLinks(content) {
  const socialTargets = [...document.querySelectorAll("#socialLinks, [data-social-links]")];
  if (!socialTargets.length) return;

  const links = getSocialLinks(content);

  socialTargets.forEach((socialLinks, targetIndex) => {
    socialLinks.style.setProperty("--social-tab-count", links.length);
    socialLinks.dataset.open = socialLinks.dataset.open || "false";
    socialLinks.setAttribute("aria-expanded", socialLinks.dataset.open === "true" ? "true" : "false");
    socialLinks.innerHTML = `
      <span class="social-label text-ui" aria-hidden="true">${escapeHtml(content.ui?.shell?.social || "Social")}</span>
      ${links.map(([label, icon, url]) => {
        const tooltipId = `tt-social-${escapeAttr(icon)}-${targetIndex}`;
        return `
      <a class="social-tab t-tt-wrap" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(label)}" aria-describedby="${tooltipId}">
        <span class="social-icon social-icon-${escapeAttr(icon)}" aria-hidden="true">
          ${socialIcon(icon)}
        </span>
        <span class="t-tt text-ui" id="${tooltipId}" role="tooltip">${escapeHtml(label)}</span>
      </a>
    `;
      }).join("")}
    `;
    bindSocialDisclosure(socialLinks);
  });
}

function getSocialLinks(content) {
  return [
    ["X", "x", content.site.xUrl],
    ["Behance", "behance", content.site.behanceUrl || content.site.dribbbleUrl],
    ["Dribbble", "dribbble", content.site.dribbbleUrl],
    ["Instagram", "instagram", content.site.instagramUrl]
  ].filter(([, , url]) => Boolean(url));
}

function getMobileNavLabels(content = {}) {
  const language = String(content.language || "EN").trim().toUpperCase();
  const labels = mobileNavLabelsByLanguage[language] || mobileNavLabelsByLanguage.EN;
  return {
    ...labels,
    email: content.ui?.shell?.email || labels.email
  };
}

function updateMobileBottomNavLabels(content) {
  const labels = getMobileNavLabels(content);
  document.querySelectorAll("[data-mobile-label='work']").forEach((label) => {
    label.textContent = labels.work;
  });
  document.querySelectorAll("[data-mobile-label='services']").forEach((label) => {
    label.textContent = labels.services;
  });
  document.querySelectorAll("[data-contact-toggle]").forEach((button) => {
    button.setAttribute("aria-label", labels.contact);
  });
  document.querySelectorAll("[data-contact-links]").forEach((group) => {
    group.setAttribute("aria-label", labels.contact);
  });
}

function renderContactLinks(content) {
  const targets = [...document.querySelectorAll("[data-contact-links]")];
  if (!targets.length) return;

  const labels = getMobileNavLabels(content);
  const links = [
    [labels.email, "mail", content.site.email ? `mailto:${content.site.email}` : ""],
    ...getSocialLinks(content)
  ].filter(([, , url]) => Boolean(url));

  targets.forEach((target, targetIndex) => {
    target.style.setProperty("--contact-link-count", links.length);
    target.innerHTML = links.map(([label, icon, url], index) => `
      <a class="mobile-contact-link t-tt-wrap" href="${escapeAttr(url)}" ${icon === "mail" ? "" : 'target="_blank" rel="noopener noreferrer"'} aria-label="${escapeAttr(label)}" aria-describedby="tt-contact-${escapeAttr(icon)}-${targetIndex}" style="--contact-index: ${index};">
        <span class="social-icon social-icon-${escapeAttr(icon)}" aria-hidden="true">
          ${socialIcon(icon)}
        </span>
        <span class="t-tt text-ui" id="tt-contact-${escapeAttr(icon)}-${targetIndex}" role="tooltip">${escapeHtml(label)}</span>
      </a>
    `).join("");
  });
}

function isSocialDisclosureMode() {
  return typeof window !== "undefined" && window.matchMedia(SOCIAL_DISCLOSURE_QUERY).matches;
}

function setSocialOpen(socialLinks, isOpen) {
  socialLinks.dataset.open = isOpen ? "true" : "false";
  socialLinks.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function bindSocialDisclosure(socialLinks) {
  if (socialLinks.dataset.socialDisclosureBound === "true") return;
  socialLinks.dataset.socialDisclosureBound = "true";

  const close = () => setSocialOpen(socialLinks, false);

  socialLinks.addEventListener("click", (event) => {
    if (!isSocialDisclosureMode()) return;

    const isOpen = socialLinks.dataset.open === "true";
    const socialLink = event.target.closest(".social-tab");

    if (!isOpen) {
      event.preventDefault();
      setSocialOpen(socialLinks, true);
      socialLinks.focus({ preventScroll: true });
      return;
    }

    if (!socialLink) {
      event.preventDefault();
      close();
    }
  });

  socialLinks.addEventListener("keydown", (event) => {
    if (!isSocialDisclosureMode()) return;
    if (event.target !== socialLinks || (event.key !== "Enter" && event.key !== " ")) return;

    event.preventDefault();
    setSocialOpen(socialLinks, socialLinks.dataset.open !== "true");
  });

  document.addEventListener("pointerdown", (event) => {
    if (!isSocialDisclosureMode() || socialLinks.dataset.open !== "true") return;
    if (!socialLinks.contains(event.target)) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || socialLinks.dataset.open !== "true") return;
    close();
    socialLinks.focus({ preventScroll: true });
  });

  const mediaQuery = window.matchMedia(SOCIAL_DISCLOSURE_QUERY);
  mediaQuery.addEventListener?.("change", close);
}

export function bindMobileBottomNav() {
  const nav = document.querySelector("[data-mobile-bottom-nav]");
  if (!nav || nav.dataset.mobileBottomNavBound === "true") return;
  nav.dataset.mobileBottomNavBound = "true";

  const mobileQuery = window.matchMedia(MOBILE_BOTTOM_NAV_QUERY);
  const contactToggle = nav.querySelector("[data-contact-toggle]");
  const contactPanel = nav.querySelector("[data-mobile-contact]");
  let lastScrollY = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
  let ticking = false;

  const setVisible = (isVisible) => {
    nav.dataset.visible = isVisible ? "true" : "false";
  };

  const setContactOpen = (isOpen) => {
    nav.dataset.contactOpen = isOpen ? "true" : "false";
    contactToggle?.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (isOpen) setVisible(true);
  };

  const closeContact = () => setContactOpen(false);

  const hasOpenControls = () => {
    return nav.dataset.contactOpen === "true" || nav.querySelector("[aria-expanded='true'], [data-open='true']");
  };

  const syncVisibility = () => {
    ticking = false;

    if (!mobileQuery.matches) {
      setVisible(true);
      lastScrollY = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
      return;
    }

    if (document.documentElement.classList.contains("is-lightbox-open")) {
      setVisible(false);
      return;
    }

    const currentScrollY = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
    const delta = currentScrollY - lastScrollY;

    if (currentScrollY <= MOBILE_NAV_HIDE_OFFSET || hasOpenControls()) {
      setVisible(true);
      lastScrollY = currentScrollY;
      return;
    }

    if (Math.abs(delta) < MOBILE_NAV_SCROLL_DELTA) return;

    setVisible(delta < 0);
    lastScrollY = currentScrollY;
  };

  const requestSync = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(syncVisibility);
  };

  const setActiveLink = (activeLink) => {
    nav.querySelectorAll("[data-mobile-section-link]").forEach((item) => {
      item.classList.toggle("is-active", item === activeLink);
    });
  };

  const scrollToSection = (section) => {
    if (section === "services") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const target = section === "work"
        ? document.querySelector(".work-toolbar")
        : document.getElementById(section);
      if (!target) return false;

      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest"
      });
    }

    if (history.pushState) {
      history.pushState(null, "", `#${section}`);
    }
    return true;
  };

  const syncActiveLinkFromHash = () => {
    const section = window.location.hash.replace(/^#/, "").split("/")[0];
    const link = nav.querySelector(`[data-mobile-section-link="${section}"]`);
    if (link) setActiveLink(link);
  };

  window.addEventListener("scroll", requestSync, { passive: true });
  window.addEventListener("resize", requestSync);
  window.addEventListener("hashchange", syncActiveLinkFromHash);
  mobileQuery.addEventListener?.("change", requestSync);
  contactToggle?.addEventListener("click", () => {
    setContactOpen(nav.dataset.contactOpen !== "true");
  });
  nav.querySelectorAll("[data-mobile-section-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const section = link.dataset.mobileSectionLink;
      if (mobileQuery.matches && scrollToSection(section)) {
        event.preventDefault();
      }
      setActiveLink(link);
      closeContact();
    });
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest(".mobile-contact-link")) closeContact();
  });
  document.addEventListener("focusin", (event) => {
    if (nav.contains(event.target)) setVisible(true);
  });
  document.addEventListener("pointerdown", (event) => {
    if (nav.contains(event.target)) setVisible(true);
    if (!mobileQuery.matches || nav.dataset.contactOpen !== "true") return;
    if (!contactPanel?.contains(event.target)) closeContact();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || nav.dataset.contactOpen !== "true") return;
    closeContact();
    contactToggle?.focus({ preventScroll: true });
  });

  setVisible(true);
  setContactOpen(false);
  syncActiveLinkFromHash();
  requestSync();
}

function socialIcon(icon) {
  const icons = {
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.75 6.75A2.25 2.25 0 0 1 7 4.5h10a2.25 2.25 0 0 1 2.25 2.25v10.5A2.25 2.25 0 0 1 17 19.5H7a2.25 2.25 0 0 1-2.25-2.25V6.75Zm1.75.8 5.5 4.03 5.5-4.03"></path></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 3H21l-6.94 7.93L22 21h-6.2l-4.86-6.35L5.38 21H3.27l7.42-8.48L3 3h6.36l4.39 5.79L18.9 3Zm-1.08 16.2h1.16L8.73 4.74H7.49L17.82 19.2Z"/></svg>',
    behance: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.64 10.27c1.64 0 2.67-.93 2.67-2.42C12.31 5.97 11 5 9.05 5H3v14h6.3c2.78 0 4.34-1.32 4.34-3.72 0-1.91-1.2-3.1-3.35-3.34v-.07Zm-3.58-3h2.36c1.08 0 1.73.5 1.73 1.38 0 .93-.72 1.47-1.94 1.47H6.06V7.27Zm2.6 9.46H6.06v-3.36h2.68c1.45 0 2.24.57 2.24 1.64 0 1.1-.8 1.72-2.32 1.72ZM20.74 7.08H15.3v1.35h5.44V7.08Zm-2.67 2.37c-2.76 0-4.72 1.95-4.72 4.86 0 2.88 1.91 4.79 4.79 4.79 2.33 0 4.03-1.16 4.48-3.05h-2.26c-.33.69-1.13 1.11-2.13 1.11-1.42 0-2.39-.89-2.46-2.31H23v-.79c0-2.82-1.82-4.61-4.93-4.61Zm-2.24 3.78c.14-1.3 1-2.08 2.2-2.08 1.23 0 2 .74 2.06 2.08h-4.26Z"/></svg>',
    dribbble: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5A9.5 9.5 0 1 0 21.5 12 9.5 9.5 0 0 0 12 2.5Zm6.25 4.38a8 8 0 0 1 1.57 4.54 17.4 17.4 0 0 0-5.02-.08 25.6 25.6 0 0 0-1.14-2.28 11.9 11.9 0 0 0 4.59-2.18ZM12 4.18a8 8 0 0 1 4.95 1.72 10.5 10.5 0 0 1-4.08 1.87 33.5 33.5 0 0 0-2.6-3.35A8.1 8.1 0 0 1 12 4.18ZM8.4 5.02a31.5 31.5 0 0 1 2.68 3.4 33 33 0 0 1-6.63.84A8.03 8.03 0 0 1 8.4 5.02Zm-4.08 6.66h.18a34.7 34.7 0 0 0 7.48-1 22.7 22.7 0 0 1 .96 1.94l-.46.13c-4.05 1.23-6.2 4.6-6.56 5.18a8 8 0 0 1-1.6-6.25Zm2.82 7.35c.8-1.33 2.72-3.63 5.9-4.72.11-.04.23-.08.35-.11a20.4 20.4 0 0 1 1.09 4.8A8 8 0 0 1 7.14 19.03Zm9.02-.86a22.2 22.2 0 0 0-.99-4.33 15.7 15.7 0 0 1 4.63.13 8.03 8.03 0 0 1-3.64 4.2Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm8.37 1.73H7.88a4.15 4.15 0 0 0-4.15 4.15v8.24a4.15 4.15 0 0 0 4.15 4.15h8.24a4.15 4.15 0 0 0 4.15-4.15V7.88a4.15 4.15 0 0 0-4.15-4.15ZM12 7.85A4.15 4.15 0 1 1 7.85 12 4.16 4.16 0 0 1 12 7.85Zm0 1.63A2.52 2.52 0 1 0 14.52 12 2.52 2.52 0 0 0 12 9.48Zm4.67-2.9a1 1 0 1 1-1 1 1 1 0 0 1 1-1Z"/></svg>'
  };
  return icons[icon] ?? icons.x;
}

export function bindLanguageMenu({
  languages = [],
  currentLanguage = "EN",
  onChange
} = {}) {
  const menus = [...document.querySelectorAll("[data-language-menu]")];
  if (!menus.length) return;

  const availableLanguages = languages.length ? languages : [
    { id: "EN", label: "EN", name: "English", flag: "assets/flag-gb.webp" },
    { id: "TR", label: "TR", name: "Turkish", flag: "assets/flag-tr.webp" },
    { id: "DE", label: "DE", name: "Deutsch", flag: "assets/flag-de.png" },
    { id: "ES", label: "ES", name: "Espa\u00f1ol", flag: "assets/flag-es.png" }
  ];

  const renderOptions = (menu, selectedLanguage) => {
    const dropdown = menu.querySelector(".language-dropdown");
    if (!dropdown) return;

    dropdown.innerHTML = availableLanguages.map((language) => `
      <button type="button" role="menuitemradio" aria-checked="${String(language.id === selectedLanguage)}" data-language="${escapeAttr(language.id)}" aria-label="${escapeAttr(language.name || language.label || language.id)}">
        <span>${escapeHtml(language.label || language.id)}</span>
        ${language.flag ? `<img class="language-flag" src="${escapeAttr(language.flag)}" alt="" aria-hidden="true">` : ""}
      </button>
    `).join("");
  };

  const setMenuLanguage = (menu, language) => {
    const triggerLabel = menu.querySelector("[data-language-current]");
    if (triggerLabel) {
      triggerLabel.textContent = language;
    }

    menu.querySelectorAll("[data-language]").forEach((option) => {
      option.setAttribute("aria-checked", String(option.dataset.language === language));
    });
  };

  const setAllLanguages = (language) => {
    menus.forEach((menu) => setMenuLanguage(menu, language));
  };

  const closeMenu = (menu) => {
    const trigger = menu.querySelector(".language-trigger");
    const dropdown = menu.querySelector(".language-dropdown");
    if (!trigger || !dropdown || !dropdown.classList.contains("is-open")) return;

    window.clearTimeout(Number(menu.dataset.closeTimer || 0));
    menu.classList.remove("is-open");
    menu.classList.add("is-closing");
    dropdown.classList.remove("is-open");
    dropdown.classList.add("is-closing");
    trigger.setAttribute("aria-expanded", "false");
    const closeTimer = window.setTimeout(() => {
      menu.classList.remove("is-closing");
      dropdown.classList.remove("is-closing");
      delete menu.dataset.closeTimer;
    }, 150);
    menu.dataset.closeTimer = String(closeTimer);
  };

  const closeOtherMenus = (activeMenu) => {
    menus.forEach((menu) => {
      if (menu !== activeMenu) closeMenu(menu);
    });
  };

  const openMenu = (menu) => {
    const trigger = menu.querySelector(".language-trigger");
    const dropdown = menu.querySelector(".language-dropdown");
    if (!trigger || !dropdown) return;

    window.clearTimeout(Number(menu.dataset.closeTimer || 0));
    closeOtherMenus(menu);
    menu.classList.remove("is-closing");
    menu.classList.add("is-open");
    dropdown.classList.remove("is-closing");
    dropdown.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
  };

  menus.forEach((menu) => {
    const trigger = menu.querySelector(".language-trigger");
    const dropdown = menu.querySelector(".language-dropdown");
    if (!trigger || !dropdown) return;

    renderOptions(menu, currentLanguage);
    setMenuLanguage(menu, currentLanguage);

    if (menu.dataset.languageBound === "true") return;
    menu.dataset.languageBound = "true";

    trigger.addEventListener("click", () => {
      if (dropdown.classList.contains("is-open")) {
        closeMenu(menu);
        return;
      }
      openMenu(menu);
    });

    dropdown.addEventListener("click", (event) => {
      const item = event.target.closest("[data-language]");
      if (!item) return;
      const language = item.dataset.language;
      setAllLanguages(language);
      closeMenu(menu);
      onChange?.(language);
    });
  });

  if (document.documentElement.dataset.languageGlobalBound !== "true") {
    document.documentElement.dataset.languageGlobalBound = "true";

    document.addEventListener("pointerdown", (event) => {
      menus.forEach((menu) => {
        if (!menu.contains(event.target)) closeMenu(menu);
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      menus.forEach((menu) => {
        const wasOpen = menu.querySelector(".language-dropdown")?.classList.contains("is-open");
        closeMenu(menu);
        if (wasOpen) {
          menu.querySelector(".language-trigger")?.focus();
        }
      });
    });
  }
}
export function updateClock(language = document.documentElement.lang) {
  const now = new Date();
  const localeMap = {
    DE: "de-DE",
    EN: "en-US",
    ES: "es-ES",
    TR: "tr-TR"
  };
  const locale = localeMap[String(language || "").trim().toUpperCase()] || localeMap.EN;
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  document.querySelectorAll("[data-clock], #clock").forEach((clock) => {
    const formatter = clock.dataset.clockFormat === "date-time" ? dateTimeFormatter : timeFormatter;
    clock.textContent = formatter.format(now);
    clock.dateTime = now.toISOString();
  });
}
