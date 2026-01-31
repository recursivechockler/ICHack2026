const { contextBridge, ipcRenderer } = require("electron");

console.log("[boring] preload loaded");

function notifyOverlayReady() {
  try {
    console.log("[boring] overlay-ready", window.location.href);
    ipcRenderer.send("boring:overlay-ready", window.location.href);
  } catch {
    // ignore
  }
}

contextBridge.exposeInMainWorld("boringAPI", {
  overlayReady: () => notifyOverlayReady()
});

function observeOverlay() {
  const check = () => {
    if (document.querySelector(".boring-overlay")) {
      notifyOverlayReady();
      return true;
    }
    return false;
  };

  if (check()) return;

  const observer = new MutationObserver(() => {
    if (check()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function scheduleOverlayFallback() {
  setTimeout(() => {
    if (document.querySelector(".boring-overlay")) {
      console.log("[boring] overlay-ready fallback", window.location.href);
      notifyOverlayReady();
    }
  }, 500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    observeOverlay();
    scheduleOverlayFallback();
  });
} else {
  observeOverlay();
  scheduleOverlayFallback();
}

function notifyPreNavigate(targetUrl) {
  if (!targetUrl || typeof targetUrl !== "string") return;
  try {
    ipcRenderer.send("boring:pre-navigate", targetUrl);
  } catch {
    // ignore
  }
}

function hookNavigationSignals() {
  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest && event.target.closest("a[href]");
      if (!link) return;
      if (link.target && link.target !== "_self") return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      try {
        const targetUrl = new URL(href, window.location.href).href;
        notifyPreNavigate(targetUrl);
      } catch {
        // ignore
      }
    },
    true
  );

  const originalPushState = history.pushState;
  history.pushState = function(state, title, url) {
    if (url) {
      try {
        const targetUrl = new URL(url, window.location.href).href;
        notifyPreNavigate(targetUrl);
      } catch {
        // ignore
      }
    }
    return originalPushState.apply(this, arguments);
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function(state, title, url) {
    if (url) {
      try {
        const targetUrl = new URL(url, window.location.href).href;
        notifyPreNavigate(targetUrl);
      } catch {
        // ignore
      }
    }
    return originalReplaceState.apply(this, arguments);
  };

  window.addEventListener("popstate", () => {
    notifyPreNavigate(window.location.href);
  });
}

hookNavigationSignals();

function extractArticle() {
  const url = window.location.href;

  let Readability;
  try {
    ({ Readability } = require("@mozilla/readability"));
  } catch (err) {
    return {
      ok: false,
      error: `Readability not available: ${String(err?.message || err)}`,
      url
    };
  }

  // Readability mutates the document; clone it.
  const clone = document.cloneNode(true);

  const reader = new Readability(clone, {
    // tune for news pages
    charThreshold: 500
  });

  const article = reader.parse();

  // Basic sanity checks
  if (!article || !article.content) {
    return { ok: false, error: "No readable article content found.", url };
  }
  const textLen = (article.textContent || "").trim().length;
  if (textLen < 400) {
    return { ok: false, error: "This page doesn't look like a full article.", url };
  }

  return { ok: true, article, url };
}

ipcRenderer.on("extract-article", () => {
  try {
    const payload = extractArticle();
    ipcRenderer.send("article-extracted", payload);
  } catch (e) {
    ipcRenderer.send("article-extracted", {
      ok: false,
      error: String(e?.stack || e),
      url: window.location.href
    });
  }
});
