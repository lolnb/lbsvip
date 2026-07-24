(() => {
  const toastEl = document.querySelector("[data-toast]");
  let toastTimer;

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("is-visible");
    }, 1800);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement("textarea");
        input.value = text;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      showToast("已复制到剪贴板");
    } catch (err) {
      showToast("复制失败，请手动长按选择");
    }
  }

  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const text = btn.getAttribute("data-copy") || "";
      if (text) copyText(text);
    });
  });

  const header = document.querySelector(".site-header");
  const nav = document.querySelector("[data-nav]");
  const toggle = document.querySelector("[data-nav-toggle]");

  if (nav && toggle) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
      toggle.innerHTML = open
        ? '<i class="fa-solid fa-xmark"></i>'
        : '<i class="fa-solid fa-bars"></i>';
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "打开导航");
        toggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
      });
    });
  }

  /* —— Step navigation: top nav + TOC highlight must match visible card —— */
  const STEP_IDS = ["step-1", "step-2", "step-3", "step-4"];
  const sections = STEP_IDS.map((id) => document.getElementById(id)).filter(
    Boolean
  );
  /** Only these get .is-active (not overview cards / CTAs). */
  const highlightLinks = document.querySelectorAll(
    '[data-nav] a[href^="#step-"], a[data-toc-link]'
  );
  const allStepLinks = document.querySelectorAll('a[href^="#step-"]');

  let activeId = "";
  let stickyOffsetPx = 0;
  let gotoToken = 0;
  /** Frozen highlight target while smooth-scrolling from a click. */
  let lockedId = null;
  let spyRaf = 0;
  let settleTimer = 0;
  let scrollEndHandler = null;

  function syncStickyOffset() {
    const headerH = header ? header.getBoundingClientRect().height : 72;
    const offset = Math.max(48, Math.round(headerH + 16));
    stickyOffsetPx = offset;
    // Always write a resolved px value so CSS sticky and JS spy share one number.
    document.documentElement.style.setProperty("--sticky-offset", `${offset}px`);
    return stickyOffsetPx;
  }

  syncStickyOffset();
  window.addEventListener("resize", syncStickyOffset, { passive: true });

  function centerTocChip(link) {
    const list = link.closest(".toc__list");
    if (!list || getComputedStyle(list).display === "grid") return;
    const linkRect = link.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const nextLeft =
      list.scrollLeft +
      (linkRect.left - listRect.left) -
      (listRect.width - linkRect.width) / 2;
    list.scrollTo({ left: Math.max(0, nextLeft), behavior: "auto" });
  }

  function setActive(id) {
    if (!id || id === activeId) return;
    activeId = id;

    highlightLinks.forEach((link) => {
      const active = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("is-active", active);
      if (active && link.hasAttribute("data-toc-link")) {
        centerTocChip(link);
      }
    });
  }

  /**
   * Section whose top has most recently crossed the sticky offset line.
   * This is the only source of truth for free-scroll highlighting.
   */
  function getSectionIdAtMarker() {
    if (!sections.length) return "";
    const marker = stickyOffsetPx + 8;
    let current = sections[0].id;
    for (let i = 0; i < sections.length; i += 1) {
      if (sections[i].getBoundingClientRect().top <= marker) {
        current = sections[i].id;
      }
    }
    return current;
  }

  function getAlignedScrollTop(el) {
    syncStickyOffset();
    return Math.max(
      0,
      Math.round(window.scrollY + el.getBoundingClientRect().top - stickyOffsetPx)
    );
  }

  function clearProgrammaticListeners() {
    if (settleTimer) {
      clearInterval(settleTimer);
      settleTimer = 0;
    }
    if (scrollEndHandler) {
      window.removeEventListener("scrollend", scrollEndHandler);
      scrollEndHandler = null;
    }
  }

  function releaseLock(token, preferId) {
    if (token !== gotoToken) return;
    clearProgrammaticListeners();
    lockedId = null;
    const id = preferId || getSectionIdAtMarker() || "step-1";
    setActive(id);
  }

  function interruptProgrammaticScroll() {
    if (!lockedId) return;
    const token = gotoToken;
    gotoToken += 1;
    releaseLock(token, getSectionIdAtMarker());
  }

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (!el || !STEP_IDS.includes(id)) return;

    clearProgrammaticListeners();
    const token = (gotoToken += 1);
    lockedId = id;
    setActive(id);

    const targetY = getAlignedScrollTop(el);
    const delta = Math.abs(window.scrollY - targetY);

    if (history.replaceState) {
      history.replaceState(null, "", `#${id}`);
    }

    // Already aligned — no animation, unlock immediately.
    if (delta < 2) {
      releaseLock(token, id);
      return;
    }

    window.scrollTo({ top: targetY, behavior: "smooth" });

    let done = false;
    const finish = (forceSnap) => {
      if (done || token !== gotoToken) return;
      done = true;

      // If smooth scroll stalled short of target, snap once (no second animation).
      if (forceSnap || Math.abs(window.scrollY - targetY) > 6) {
        const y = getAlignedScrollTop(el);
        window.scrollTo({ top: y, behavior: "auto" });
      }
      releaseLock(token, id);
    };

    scrollEndHandler = () => finish(false);
    window.addEventListener("scrollend", scrollEndHandler, { once: true });

    // Fallback for browsers without scrollend: unlock only after motion stops.
    let lastY = window.scrollY;
    let stableTicks = 0;
    const started = performance.now();
    settleTimer = window.setInterval(() => {
      if (token !== gotoToken) {
        clearProgrammaticListeners();
        return;
      }

      // Recalculate in case header/layout changed mid-scroll.
      const liveTarget = getAlignedScrollTop(el);
      const y = window.scrollY;
      const near = Math.abs(y - liveTarget) <= 4;
      const stable = Math.abs(y - lastY) < 0.5;
      lastY = y;

      if (stable) {
        stableTicks += 1;
        if (near && stableTicks >= 4) {
          finish(false);
          return;
        }
        // Scroll stopped short/long of target — hard-snap then unlock.
        if (stableTicks >= 12) {
          finish(true);
          return;
        }
      } else {
        stableTicks = 0;
      }

      // Hard ceiling: snap so highlight never unlocks mid-flight.
      if (performance.now() - started > 4500) finish(true);
    }, 32);
  }

  allStepLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const id = (link.getAttribute("href") || "").replace("#", "");
      if (!STEP_IDS.includes(id)) return;
      event.preventDefault();
      scrollToSection(id);
    });
  });

  // Manual scroll cancels the click-lock so spy can follow the real position.
  window.addEventListener("wheel", interruptProgrammaticScroll, {
    passive: true,
  });
  window.addEventListener("touchstart", interruptProgrammaticScroll, {
    passive: true,
  });
  window.addEventListener(
    "keydown",
    (event) => {
      const keys = [
        "ArrowUp",
        "ArrowDown",
        "PageUp",
        "PageDown",
        "Home",
        "End",
        " ",
      ];
      if (keys.includes(event.key)) interruptProgrammaticScroll();
    },
    { passive: true }
  );

  function updateActiveFromScroll() {
    if (lockedId) {
      if (activeId !== lockedId) setActive(lockedId);
      return;
    }
    const id = getSectionIdAtMarker();
    if (id) setActive(id);
  }

  window.addEventListener(
    "scroll",
    () => {
      if (spyRaf) return;
      spyRaf = requestAnimationFrame(() => {
        spyRaf = 0;
        updateActiveFromScroll();
      });
    },
    { passive: true }
  );

  // Initial highlight from hash or current scroll position.
  const hash = (location.hash || "").replace("#", "");
  if (STEP_IDS.includes(hash) && document.getElementById(hash)) {
    // Instant align on load (avoid double smooth scroll with browser hash jump).
    const el = document.getElementById(hash);
    syncStickyOffset();
    window.scrollTo({ top: getAlignedScrollTop(el), behavior: "auto" });
    setActive(hash);
  } else {
    syncStickyOffset();
    setActive(getSectionIdAtMarker() || "step-1");
  }
})();
