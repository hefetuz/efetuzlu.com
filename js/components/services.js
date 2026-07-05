import { escapeAttr, escapeHtml } from "../utils/dom.js";

const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";
const SERVICE_PANEL_DURATION = 360;
const SERVICE_EXIT_DURATION = 300;
const SERVICE_HEIGHT_TIMINGS = {
  forward: { duration: 420, delay: 0 },
  backward: { duration: 520, delay: 30 }
};
const serviceStepTimers = new WeakMap();
const serviceHeightTimers = new WeakMap();
const serviceHeightTweens = new WeakMap();

const serviceKeys = [
  ["product", "product"],
  ["web", "web"],
  ["brand", "brand"],
  ["motion", "motion"]
];

const selectedServicesTitleByLanguage = {
  DE: "Leistungen ausw\u00e4hlen:",
  EN: "Select service(s):",
  ES: "Selecciona servicios:",
  TR: "Hizmet se\u00e7:"
};

function getServiceKey(title = "") {
  const normalized = String(title).toLowerCase();
  return serviceKeys.find(([token]) => normalized.includes(token))?.[1] || "product";
}

function getSelectedServices(target) {
  return [...target.querySelectorAll("[data-service-select]:checked")].map((input) => input.value);
}

function getServiceConfig(config) {
  if (typeof config === "string") {
    return { email: config, web3FormsAccessKey: "", labels: defaultServiceLabels() };
  }

  const defaults = defaultServiceLabels();
  const labels = { ...defaults, ...(config?.labels || {}) };
  const language = String(config?.language || "EN").trim().toUpperCase();
  const localizedSelectedServicesTitle = selectedServicesTitleByLanguage[language];
  if (localizedSelectedServicesTitle && labels.selectedServicesTitle === defaults.selectedServicesTitle) {
    labels.selectedServicesTitle = localizedSelectedServicesTitle;
  }

  return {
    email: config?.email || "",
    web3FormsAccessKey: config?.web3FormsAccessKey || "",
    labels
  };
}

function defaultServiceLabels() {
  return {
    servicesTitle: "Services",
    selectedServicesTitle: "Select service(s):",
    contactTitle: "Contact Details",
    backToServices: "Back to services",
    selectService: "Select",
    next: "Next",
    name: "Name",
    company: "Company",
    email: "Email",
    phone: "Phone",
    message: "Message",
    required: "required",
    sending: "Sending...",
    sendRequest: "Send Request",
    requestSent: "Request Sent",
    requestSuccess: "Your request was sent successfully."
  };
}

function buildServiceMailto(email, selectedServices, formData = new FormData()) {
  if (!email || !selectedServices.length) return "#";

  const name = formData.get("name") || "";
  const company = formData.get("company") || "";
  const replyEmail = formData.get("email") || "";
  const phone = formData.get("phone") || "";
  const message = formData.get("message") || "";
  const subject = "New service request";
  const body = [
    "Hi Efe,",
    "",
    "I am interested in these services:",
    ...selectedServices.map((service) => `- ${service}`),
    "",
    "Contact details:",
    `Name: ${name}`,
    `Company: ${company}`,
    `Email: ${replyEmail}`,
    `Phone: ${phone}`,
    "",
    "Message:",
    message
  ].join("\n");

  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function submitWeb3Forms({ accessKey, selectedServices, formData }) {
  const payload = new FormData();
  payload.append("access_key", accessKey);
  payload.append("subject", "New service request");
  payload.append("from_name", formData.get("name") || "Portfolio visitor");
  payload.append("Selected Services", selectedServices.join(", "));

  for (const [key, value] of formData.entries()) {
    payload.append(key, value);
  }

  const response = await fetch(WEB3FORMS_ENDPOINT, {
    method: "POST",
    body: payload,
    headers: {
      Accept: "application/json"
    }
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    throw new Error(result.message || "Could not send the request.");
  }
}

function updateServiceSelection(target) {
  const selectedServices = getSelectedServices(target);
  const next = target.querySelector("[data-service-next]");

  target.querySelectorAll(".service").forEach((service) => {
    const input = service.querySelector("[data-service-select]");
    const checked = Boolean(input?.checked);
    service.classList.toggle("is-selected", checked);
    service.setAttribute("aria-checked", String(checked));
  });

  if (!next) return;
  const hasSelection = selectedServices.length > 0;
  next.classList.toggle("is-visible", hasSelection);
  next.disabled = !hasSelection;
  next.setAttribute("aria-hidden", String(!hasSelection));
  next.setAttribute("aria-disabled", String(!hasSelection));

  if (String(target.dataset.serviceStep || "1") === "1") {
    updateServiceHeading(target, 1);
  }
}

function resetServicePicker(target) {
  target._serviceAbort?.abort();
  window.clearTimeout(target._serviceSuccessPreviewTimeout);
  delete target._serviceAbort;
  delete target._serviceSuccessPreviewTimeout;
  clearServiceStepTimers(target);
  delete target.dataset.serviceStep;
  delete target.dataset.serviceDirection;
  target.classList.remove("is-transitioning");
  target.style.removeProperty("height");
  target.style.removeProperty("overflow-x");
  target.style.removeProperty("overflow-y");
}

function getHeadingCopy(target) {
  const section = target.closest(".services");
  const heading = section?.querySelector("#services-title");
  if (!section || !heading) return null;

  let copy = section.querySelector("[data-service-heading-copy]");
  if (!copy) {
    copy = document.createElement("p");
    copy.className = "service-heading-copy text-note text-muted";
    copy.dataset.serviceHeadingCopy = "";
    copy.hidden = true;
    heading.insertAdjacentElement("afterend", copy);
  }

  return { heading, copy };
}

function updateServiceHeading(target, step) {
  const nodes = getHeadingCopy(target);
  if (!nodes) return;
  const labels = target._serviceLabels || defaultServiceLabels();

  if (String(step) === "2") {
    nodes.heading.innerHTML = `
      <button class="service-heading-back" type="button" data-service-back aria-label="${escapeAttr(labels.backToServices)}">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M10 3.5 5.5 8l4.5 4.5"></path>
        </svg>
      </button>
      <span>${escapeHtml(labels.contactTitle)}</span>
    `;
    nodes.copy.textContent = "";
    nodes.copy.hidden = true;
    return;
  }

  if (String(step) === "3") {
    nodes.heading.textContent = "";
    nodes.copy.textContent = "";
    nodes.copy.hidden = true;
    return;
  }

  nodes.heading.textContent = getSelectedServices(target).length
    ? labels.selectedServicesTitle
    : labels.servicesTitle;
  nodes.copy.textContent = "";
  nodes.copy.hidden = true;
}

function clearServiceStepTimers(target) {
  window.clearTimeout(serviceHeightTimers.get(target));
  serviceHeightTimers.delete(target);
  serviceHeightTweens.get(target)?.cancel();
  serviceHeightTweens.delete(target);
  target.classList.remove("is-transitioning");
  target.style.removeProperty("height");
  target.style.removeProperty("overflow-x");
  target.style.removeProperty("overflow-y");

  target.querySelectorAll("[data-service-step]").forEach((panel) => {
    window.clearTimeout(serviceStepTimers.get(panel));
    serviceStepTimers.delete(panel);
    panel.classList.remove("is-outgoing");
    panel.hidden = !panel.classList.contains("is-active");
  });
}

function getServiceStepTiming(direction) {
  const height = SERVICE_HEIGHT_TIMINGS[direction] || SERVICE_HEIGHT_TIMINGS.forward;
  return {
    heightDuration: height.duration,
    heightDelay: height.delay,
    settleDuration: Math.max(SERVICE_PANEL_DURATION, height.duration + height.delay) + 60
  };
}

function getServicePanelHeight(panel) {
  if (!panel) return 0;
  return Math.ceil(panel.scrollHeight || panel.getBoundingClientRect().height);
}

function easeServiceHeight(progress) {
  return 1 - Math.pow(1 - progress, 3);
}

function animateServiceHeight(target, from, to, timing, onComplete) {
  serviceHeightTweens.get(target)?.cancel();
  window.clearTimeout(serviceHeightTimers.get(target));

  let interval = 0;
  let complete = false;
  const start = performance.now() + timing.heightDelay;

  const finish = () => {
    if (complete) return;
    complete = true;
    window.clearInterval(interval);
    window.clearTimeout(serviceHeightTimers.get(target));
    serviceHeightTimers.delete(target);
    serviceHeightTweens.delete(target);
    onComplete();
  };

  const tick = () => {
    if (complete) return;

    const now = performance.now();
    const elapsed = now - start;
    const progress = Math.max(0, Math.min(1, elapsed / timing.heightDuration));
    const eased = easeServiceHeight(progress);
    target.style.height = `${from + ((to - from) * eased)}px`;

    if (progress >= 1) {
      finish();
      return;
    }
  };

  target.style.height = `${from}px`;
  interval = window.setInterval(tick, 16);
  tick();
  const fallback = window.setTimeout(finish, timing.settleDuration);
  serviceHeightTimers.set(target, fallback);
  serviceHeightTweens.set(target, {
    cancel() {
      complete = true;
      window.clearInterval(interval);
      window.clearTimeout(fallback);
    }
  });
}

function setServiceStep(target, step) {
  const previousStep = target.dataset.serviceStep;
  const isInitial = !previousStep;
  if (previousStep === String(step)) {
    updateServiceHeading(target, step);
    return;
  }

  clearServiceStepTimers(target);
  target.dataset.serviceStep = String(step);
  const direction = Number(step) < Number(previousStep || step) ? "backward" : "forward";
  const timing = getServiceStepTiming(direction);
  target.dataset.serviceDirection = direction;
  target.classList.toggle("is-transitioning", !isInitial);

  const nextPanel = target.querySelector(`[data-service-step="${step}"]`);
  const currentPanel = [...target.querySelectorAll("[data-service-step]")].find((panel) => {
    return panel.classList.contains("is-active") && panel !== nextPanel;
  });

  if (isInitial) {
    target.style.removeProperty("height");
    target.style.removeProperty("overflow-x");
    target.style.removeProperty("overflow-y");
    target.querySelectorAll("[data-service-step]").forEach((panel) => {
      const isActive = panel === nextPanel;
      panel.hidden = !isActive;
      panel.classList.toggle("is-active", isActive);
      panel.classList.remove("is-outgoing");
    });
  } else if (nextPanel) {
    const previousHeight = target.offsetHeight;
    target.style.height = `${previousHeight}px`;
    target.style.overflowX = "visible";
    target.style.overflowY = "hidden";
    nextPanel.hidden = false;
    nextPanel.classList.remove("is-outgoing");
    nextPanel.classList.add("is-active");

    if (currentPanel) {
      currentPanel.classList.remove("is-active");
      currentPanel.classList.add("is-outgoing");
      const panelTimer = window.setTimeout(() => {
        if (!currentPanel.classList.contains("is-active")) {
          currentPanel.hidden = true;
          currentPanel.classList.remove("is-outgoing");
        }
        serviceStepTimers.delete(currentPanel);
      }, SERVICE_EXIT_DURATION);
      serviceStepTimers.set(currentPanel, panelTimer);
    }

    target.getBoundingClientRect();
    const nextHeight = getServicePanelHeight(nextPanel);

    const completeTransition = () => {
      const cleanup = () => {
        target.style.removeProperty("height");
        target.style.removeProperty("overflow-x");
        target.style.removeProperty("overflow-y");
        target.classList.remove("is-transitioning");
        target.querySelectorAll("[data-service-step]").forEach((panel) => {
          if (panel !== nextPanel) {
            panel.hidden = true;
            panel.classList.remove("is-active", "is-outgoing");
          }
        });
      };

      animateServiceHeight(target, previousHeight, nextHeight, timing, cleanup);
    };

    window.requestAnimationFrame(completeTransition);
  }

  target.querySelector("[data-success-check]")?.setAttribute("data-state", String(step) === "3" ? "in" : "out");
  updateServiceHeading(target, step);
}

function bindServiceSelection(target, config) {
  const { email, web3FormsAccessKey, labels } = config;
  const section = target.closest(".services");
  const controller = new AbortController();
  const listenerOptions = { signal: controller.signal };
  let successPreviewTimeout;
  target._serviceAbort = controller;
  target._serviceLabels = labels;

  const showSuccessPreview = (duration = 1800) => {
    window.clearTimeout(successPreviewTimeout);
    window.clearTimeout(target._serviceSuccessPreviewTimeout);
    setServiceStep(target, 3);
    successPreviewTimeout = window.setTimeout(() => {
      setServiceStep(target, 1);
    }, duration);
    target._serviceSuccessPreviewTimeout = successPreviewTimeout;
  };

  section?.addEventListener("click", (event) => {
    if (!event.target.closest("[data-service-back]")) return;
    event.preventDefault();
    setServiceStep(target, 1);
  }, listenerOptions);

  target.addEventListener("change", (event) => {
    if (!event.target.matches("[data-service-select]")) return;
    updateServiceSelection(target);
    event.target.blur();
  }, listenerOptions);

  target.addEventListener("click", (event) => {
    const service = event.target.closest("[data-service-card]");
    if (!service || event.target.closest(".service-check")) return;

    const input = service.querySelector("[data-service-select]");
    if (!input) return;
    input.checked = !input.checked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, listenerOptions);

  target.addEventListener("keydown", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;

    const service = event.target.closest("[data-service-card]");
    if (!service) return;
    event.preventDefault();

    const input = service.querySelector("[data-service-select]");
    if (!input) return;
    input.checked = !input.checked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, listenerOptions);

  target.addEventListener("click", (event) => {
    if (event.target.closest("[data-service-next]")) {
      event.preventDefault();
      if (getSelectedServices(target).length) {
        setServiceStep(target, 2);
        target.querySelector("[name='name']")?.focus();
      }
      return;
    }

    if (event.target.closest("[data-service-back]")) {
      event.preventDefault();
      setServiceStep(target, 1);
    }
  }, listenerOptions);

  target.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-service-form]");
    if (!form) return;

    event.preventDefault();
    const selectedServices = getSelectedServices(target);
    if (!selectedServices.length) {
      setServiceStep(target, 1);
      return;
    }

    const formData = new FormData(form);
    if (String(formData.get("botcheck") || "").trim()) return;
    const submit = form.querySelector(".service-submit");
    const submitLabel = submit.textContent;
    const fallbackToMail = () => {
      window.location.href = buildServiceMailto(email, selectedServices, formData);
    };

    if (!web3FormsAccessKey) {
      fallbackToMail();
      return;
    }

    submit.disabled = true;
    submit.textContent = labels.sending;

    try {
      await submitWeb3Forms({
        accessKey: web3FormsAccessKey,
        selectedServices,
        formData
      });
      form.reset();
      target.querySelectorAll("[data-service-select]").forEach((input) => {
        input.checked = false;
      });
      updateServiceSelection(target);
      showSuccessPreview();
    } catch (error) {
      fallbackToMail();
    } finally {
      submit.disabled = false;
      submit.textContent = submitLabel;
    }
  }, listenerOptions);

  setServiceStep(target, 1);
  updateServiceSelection(target);
}

function serviceTemplate(service, labels = defaultServiceLabels()) {
  const items = service.items || [];
  const key = getServiceKey(service.title);

  return `
    <article class="service service-${escapeAttr(key)}" role="checkbox" tabindex="0" aria-checked="false" data-service-card>
      <h3 class="service-title text-ui">${escapeHtml(service.title)}</h3>
      <div class="service-line text-note text-muted" aria-label="${escapeHtml(service.title)} capabilities">
        ${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
      <label class="service-check" aria-label="${escapeAttr(`${labels.selectService} ${service.title}`)}">
        <input type="checkbox" value="${escapeAttr(service.title)}" data-service-select>
        <span class="service-check-box" aria-hidden="true">
          <svg viewBox="0 0 12 10">
            <path d="M1.5 5.2 4.6 8.2 10.5 1.4"></path>
          </svg>
        </span>
      </label>
    </article>
  `;
}

export function renderServices(services, target = document.getElementById("servicesList"), config = {}) {
  const serviceConfig = getServiceConfig(config);
  const labels = serviceConfig.labels;

  resetServicePicker(target);
  target.className = "service-picker";
  target.innerHTML = `
    <div class="service-step service-step-services" data-service-step="1">
      <div class="service-matrix">
        ${services.map((service) => serviceTemplate(service, labels)).join("")}
      </div>
      <button class="btn btn-regular primary service-next" type="button" data-service-next disabled aria-hidden="true" aria-disabled="true">${escapeHtml(labels.next)}</button>
    </div>
    <form class="service-step service-form" data-service-step="2" data-service-form hidden>
      <input class="sr-only" type="text" name="botcheck" tabindex="-1" autocomplete="off">
      <label class="service-field">
        <span class="text-note text-muted">${escapeHtml(labels.name)} <b aria-label="${escapeAttr(labels.required)}">*</b></span>
        <input name="name" type="text" autocomplete="name" required>
      </label>
      <label class="service-field">
        <span class="text-note text-muted">${escapeHtml(labels.company)}</span>
        <input name="company" type="text" autocomplete="organization">
      </label>
      <label class="service-field">
        <span class="text-note text-muted">${escapeHtml(labels.email)} <b aria-label="${escapeAttr(labels.required)}">*</b></span>
        <input name="email" type="email" autocomplete="email" required>
      </label>
      <label class="service-field">
        <span class="text-note text-muted">${escapeHtml(labels.phone)}</span>
        <input name="phone" type="tel" autocomplete="tel">
      </label>
      <label class="service-field service-field-message">
        <span class="text-note text-muted">${escapeHtml(labels.message)} <b aria-label="${escapeAttr(labels.required)}">*</b></span>
        <textarea name="message" rows="4" required></textarea>
      </label>
      <button class="btn btn-regular primary service-submit" type="submit">${escapeHtml(labels.sendRequest)}</button>
    </form>
    <div class="service-step service-success" data-service-step="3" hidden>
      <span class="t-success-check" data-success-check data-state="out" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <path d="M12.5 24.7 20.7 32.9 36.5 15.8"></path>
        </svg>
      </span>
      <div>
        <h3 class="text-ui">${escapeHtml(labels.requestSent)}</h3>
        <p class="text-note text-muted">${escapeHtml(labels.requestSuccess)}</p>
      </div>
    </div>
  `;
  bindServiceSelection(target, serviceConfig);
}
