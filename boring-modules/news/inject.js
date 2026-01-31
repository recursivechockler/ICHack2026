/**
 * News Sites Boring Mode Injection
 * Generic extractor + optional site adapters for better accuracy.
 */

(function() {
  'use strict';

  console.log('[Boring Mode] News module loaded');

  // -------------------------
  // Helpers
  // -------------------------
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function truncate(text, maxLength) {
    if (!text) return '';
    return text.length <= maxLength ? text : text.substring(0, maxLength) + '...';
  }

  function getSiteName() {
    const og = document.querySelector('meta[property="og:site_name"]');
    if (og?.content) return og.content.trim();
    const appName = document.querySelector('meta[name="application-name"]');
    if (appName?.content) return appName.content.trim();
    return window.location.hostname.replace(/^www\./, '');
  }

  function normalizeArticle(article, siteName) {
    if (!article) return null;
    const content = Array.isArray(article.content) ? article.content.filter(Boolean) : [];
    return {
      title: (article.title || '').trim(),
      author: (article.author || '').trim(),
      source: (article.source || siteName || '').trim(),
      date: (article.date || '').trim(),
      content
    };
  }

  function isValidArticle(article) {
    if (!article) return false;
    if (!article.title || !Array.isArray(article.content)) return false;
    const totalLen = article.content.join(' ').trim().length;
    return article.content.length >= 3 && totalLen >= 400;
  }

  function isValidList(list) {
    return Array.isArray(list) && list.length > 0;
  }

  // -------------------------
  // Site Adapters (override)
  // -------------------------
  function bbcIsArticlePage() {
    const pathname = window.location.pathname;
    return pathname.includes('/article/') ||
      (pathname.includes('/news/') && pathname.split('/').length > 3);
  }

  function extractBBCArticle() {
    const article = {
      title: '',
      author: '',
      source: 'BBC News',
      date: '',
      content: []
    };

    const titleEl = document.querySelector('h1, [id*="main-heading"], [data-component="headline"]');
    if (titleEl) article.title = titleEl.textContent.trim();

    const authorEl = document.querySelector('[data-component="byline"], [class*="byline"], [class*="author"]');
    if (authorEl) article.author = authorEl.textContent.trim();

    const dateEl = document.querySelector('time, [data-component="timestamp"], [class*="date"]');
    if (dateEl) article.date = dateEl.textContent.trim() || dateEl.getAttribute('datetime') || '';

    const bodySelectors = [
      'article p',
      '[data-component="text-block"]',
      '[class*="article"] p',
      'main p',
      '[role="main"] p'
    ];

    for (const selector of bodySelectors) {
      const paragraphs = document.querySelectorAll(selector);
      if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
          const text = p.textContent.trim();
          if (text.length > 50 && !text.startsWith('Related Topics') && !text.startsWith('Share')) {
            article.content.push(text);
          }
        });
        if (article.content.length > 0) break;
      }
    }

    return article;
  }

  function extractBBCList() {
    const articles = [];
    const articleEls = document.querySelectorAll('[data-component="article-item"], [data-testid*="card"], [class*="promo"]');

    articleEls.forEach((el, index) => {
      if (index >= 24) return;
      const titleEl = el.querySelector('h2, h3, [class*="headline"], [class*="title"]');
      const linkEl = el.querySelector('a[href*="/news/"], a[href*="/article/"]');
      const descEl = el.querySelector('p, [class*="summary"], [class*="description"]');
      if (titleEl && linkEl) {
        articles.push({
          title: titleEl.textContent.trim(),
          url: linkEl.href,
          description: descEl ? descEl.textContent.trim() : '',
          source: 'BBC News'
        });
      }
    });

    return articles;
  }

  function guardianIsArticlePage() {
    const pathname = window.location.pathname;
    return pathname.split('/').filter(Boolean).length >= 3;
  }

  function extractGuardianArticle() {
    const article = {
      title: '',
      author: '',
      source: 'The Guardian',
      date: '',
      content: []
    };

    const titleEl = document.querySelector('h1, [class*="headline"]');
    if (titleEl) article.title = titleEl.textContent.trim();

    const authorEl = document.querySelector('[rel="author"], [class*="byline"], [class*="contributor"]');
    if (authorEl) article.author = authorEl.textContent.trim();

    const dateEl = document.querySelector('time');
    if (dateEl) article.date = dateEl.textContent.trim() || dateEl.getAttribute('datetime') || '';

    const contentEl = document.querySelector('[class*="article-body"], [class*="content__article-body"]');
    if (contentEl) {
      const paragraphs = contentEl.querySelectorAll('p');
      paragraphs.forEach(p => {
        const text = p.textContent.trim();
        if (text.length > 50) article.content.push(text);
      });
    }

    return article;
  }

  function extractGuardianList() {
    const articles = [];
    const articleEls = document.querySelectorAll('[data-link-name="article"], [class*="card"]');

    articleEls.forEach((el, index) => {
      if (index >= 24) return;
      const titleEl = el.querySelector('h2, h3, [class*="headline"]');
      const linkEl = el.querySelector('a');
      const descEl = el.querySelector('p');
      if (titleEl && linkEl) {
        articles.push({
          title: titleEl.textContent.trim(),
          url: linkEl.href,
          description: descEl ? descEl.textContent.trim() : '',
          source: 'The Guardian'
        });
      }
    });

    return articles;
  }

  const adapters = [
    {
      id: 'bbc',
      match: (host) => host.includes('bbc.com') || host.includes('bbc.co.uk'),
      siteName: 'BBC News',
      isArticlePage: bbcIsArticlePage,
      extractArticle: extractBBCArticle,
      extractList: extractBBCList
    },
    {
      id: 'guardian',
      match: (host) => host.includes('theguardian.com'),
      siteName: 'The Guardian',
      isArticlePage: guardianIsArticlePage,
      extractArticle: extractGuardianArticle,
      extractList: extractGuardianList
    }
  ];

  function getAdapter() {
    const host = window.location.hostname;
    return adapters.find((adapter) => adapter.match(host)) || null;
  }

  // -------------------------
  // Generic Extractors
  // -------------------------
  function extractArticleFromJsonLd() {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    const items = [];

    const collect = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(collect);
        return;
      }
      if (typeof value === 'object') {
        if (Array.isArray(value['@graph'])) {
          value['@graph'].forEach(collect);
        } else {
          items.push(value);
        }
      }
    };

    scripts.forEach((script) => {
      try {
        const json = JSON.parse(script.textContent.trim());
        collect(json);
      } catch {
        // ignore
      }
    });

    const articleNode = items.find((item) => {
      const type = item['@type'];
      if (Array.isArray(type)) {
        return type.some((t) => String(t).toLowerCase().includes('article'));
      }
      return String(type || '').toLowerCase().includes('article');
    });

    if (!articleNode) return null;

    const title = articleNode.headline || articleNode.name || '';
    const author = (() => {
      const a = articleNode.author;
      if (!a) return '';
      if (Array.isArray(a)) return a.map((x) => x?.name || x).join(', ');
      if (typeof a === 'object') return a.name || '';
      return String(a);
    })();
    const date = articleNode.datePublished || articleNode.dateCreated || '';
    const body = articleNode.articleBody || '';

    const content = body
      ? body.split(/\n{2,}|\r\n{2,}|\n/).map((p) => p.trim()).filter((p) => p.length > 40)
      : [];

    return { title, author, date, content };
  }

  function extractGenericArticle() {
    const siteName = getSiteName();

    const jsonLd = extractArticleFromJsonLd();
    if (jsonLd && jsonLd.content.length > 0) {
      return normalizeArticle({ ...jsonLd, source: siteName }, siteName);
    }

    const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
    const titleEl = document.querySelector('h1');
    const title = (titleEl?.textContent || ogTitle || document.title || '').trim();

    const author =
      document.querySelector('meta[name="author"]')?.content ||
      document.querySelector('[rel="author"]')?.textContent ||
      document.querySelector('[class*="byline"], [class*="author"]')?.textContent ||
      '';

    const date =
      document.querySelector('meta[property="article:published_time"]')?.content ||
      document.querySelector('time')?.getAttribute('datetime') ||
      document.querySelector('time')?.textContent ||
      '';

    const ogType = document.querySelector('meta[property="og:type"]')?.content || '';
    const articleNode = document.querySelector('article');
    const mainNode = document.querySelector('main') || document.querySelector('[role="main"]');

    if (!articleNode && !ogType.includes('article')) {
      return normalizeArticle({ title, author, date, source: siteName, content: [] }, siteName);
    }

    const container = articleNode || mainNode || document.body;
    const paragraphs = Array.from(container.querySelectorAll('p'))
      .map((p) => p.textContent.trim())
      .filter((text) => text.length > 50);

    return normalizeArticle({ title, author, date, source: siteName, content: paragraphs }, siteName);
  }

  function extractGenericList() {
    const siteName = getSiteName();
    const articles = [];
    const seen = new Set();

    const cards = Array.from(document.querySelectorAll('article'));
    const candidates = cards.length ? cards : Array.from(document.querySelectorAll('a[href]'));

    for (const el of candidates) {
      const linkEl = el.tagName === 'A' ? el : el.querySelector('a[href]');
      if (!linkEl) continue;
      const href = linkEl.getAttribute('href');
      if (!href || href.startsWith('#')) continue;

      let url;
      try {
        url = new URL(href, window.location.origin).href;
      } catch {
        continue;
      }

      if (!url.startsWith(window.location.origin)) continue;

      const titleEl = el.querySelector('h1, h2, h3') || linkEl.querySelector('h1, h2, h3');
      const rawTitle = (titleEl?.textContent || linkEl.textContent || linkEl.getAttribute('aria-label') || '').trim();
      if (rawTitle.length < 18) continue;

      const key = `${rawTitle}-${url}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const descEl = el.querySelector('p');
      const description = descEl ? descEl.textContent.trim() : '';

      articles.push({
        title: rawTitle,
        url,
        description,
        source: siteName
      });

      if (articles.length >= 24) break;
    }

    return articles;
  }

  function looksLikeArticlePage(adapter) {
    if (adapter?.isArticlePage) return adapter.isArticlePage();
    const ogType = document.querySelector('meta[property="og:type"]')?.content || '';
    if (ogType.includes('article')) return true;
    const articleEl = document.querySelector('article');
    if (articleEl && articleEl.querySelectorAll('p').length >= 4) return true;
    return false;
  }

  // -------------------------
  // Rendering
  // -------------------------
  function renderArticleView(article) {
    const overlay = document.createElement('div');
    overlay.className = 'boring-overlay';
    overlay.innerHTML = `
      <div class="boring-article">
        <button class="boring-back" type="button">
          ← Back
        </button>

        <div class="boring-article-header">
          <h1 class="boring-article-title">${escapeHtml(article.title)}</h1>
          <div class="boring-article-meta">
            ${escapeHtml(article.source)}
            ${article.author ? ` · ${escapeHtml(article.author)}` : ''}
            ${article.date ? ` · ${escapeHtml(article.date)}` : ''}
          </div>
        </div>

        <div class="boring-article-body">
          ${article.content.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
        </div>
      </div>
    `;

    document.body.classList.add('boring-mode-active');
    document.body.appendChild(overlay);
    if (window.boringAPI && typeof window.boringAPI.overlayReady === 'function') {
      window.boringAPI.overlayReady();
    }
    const backBtn = overlay.querySelector('.boring-back');
    if (backBtn) {
      backBtn.addEventListener('click', (event) => {
        event.preventDefault();
        window.history.back();
      });
    }
    console.log('[Boring Mode] Article view rendered');
  }

  function renderArticleList(articles, siteName) {
    const overlay = document.createElement('div');
    overlay.className = 'boring-overlay';
    overlay.innerHTML = `
      <div class="boring-container">
        <div class="boring-header">
          <h1 class="boring-title">${escapeHtml(siteName)}</h1>
          <p class="boring-subtitle">Clean, distraction-free news reading</p>
        </div>

        <div class="boring-grid">
          ${articles.map(article => `
            <a href="${escapeHtml(article.url)}" class="boring-card">
              <h3 class="boring-card-title">${escapeHtml(article.title)}</h3>
              ${article.description ? `<p class="boring-card-meta">${escapeHtml(truncate(article.description, 150))}</p>` : ''}
              <p class="boring-card-meta">${escapeHtml(article.source || siteName)}</p>
            </a>
          `).join('')}
        </div>

        ${articles.length === 0 ? `
          <div class="boring-empty">
            <p>No articles found. This might be an article page - content should appear above.</p>
          </div>
        ` : ''}
      </div>
    `;

    document.body.classList.add('boring-mode-active');
    document.body.appendChild(overlay);
    if (window.boringAPI && typeof window.boringAPI.overlayReady === 'function') {
      window.boringAPI.overlayReady();
    }
    console.log(`[Boring Mode] Article list rendered (${articles.length} articles)`);
  }

  // -------------------------
  // Main
  // -------------------------
  function init() {
    const existingOverlay = document.querySelector('.boring-overlay');
    if (existingOverlay) existingOverlay.remove();

    const adapter = getAdapter();
    const siteName = adapter?.siteName || getSiteName();
    const preferArticle = looksLikeArticlePage(adapter);

    let article = null;
    if (preferArticle) {
      const adapterArticle = adapter?.extractArticle ? normalizeArticle(adapter.extractArticle(), siteName) : null;
      article = isValidArticle(adapterArticle) ? adapterArticle : null;

      if (!article) {
        const genericArticle = extractGenericArticle();
        article = isValidArticle(genericArticle) ? genericArticle : null;
      }
    }

    if (article) {
      renderArticleView(article);
      return;
    }

    let list = adapter?.extractList ? adapter.extractList() : null;
    if (!isValidList(list)) list = extractGenericList();

    if (!isValidList(list) && !preferArticle) {
      const genericArticle = extractGenericArticle();
      if (isValidArticle(genericArticle)) {
        renderArticleView(genericArticle);
        return;
      }
    }

    renderArticleList(list || [], siteName);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 600));
  } else {
    setTimeout(init, 600);
  }

  console.log('[Boring Mode] News module initialized');
})();
