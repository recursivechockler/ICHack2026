const { ipcRenderer } = require("electron");
const { Readability } = require("@mozilla/readability");

function extractArticle() {
  const url = window.location.href;

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
    return { ok: false, error: "This page doesn’t look like a full article.", url };
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