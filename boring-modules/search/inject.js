/**
 * Search Results Boring Mode Injection
 * Extracts search results and displays them in clean list
 */

(function() {
  'use strict';

  console.log('[Boring Mode] Search module loaded');

  // Extract search results from DuckDuckGo
  function extractSearchResults() {
    const results = [];
    const seenUrls = new Set(); // Track URLs to prevent duplicates

    // DuckDuckGo result selectors - use most specific first
    const resultElements = document.querySelectorAll(
      'article[data-testid="result"], li[data-layout="organic"], .result__body'
    );

    resultElements.forEach((result, index) => {
      try {
        // Get title and link
        const titleElement = result.querySelector('h2 a, h3 a, .result__a, a[data-testid="result-title-a"]');
        if (!titleElement) return;

        const title = titleElement.textContent.trim();
        const url = titleElement.getAttribute('href');
        if (!title || !url) return;

        // Skip if we've already seen this URL (deduplication)
        if (seenUrls.has(url)) return;
        seenUrls.add(url);

        // Limit to 20 unique results
        if (results.length >= 20) return;

        // Get snippet/description
        let snippet = '';
        const snippetElement = result.querySelector(
          '.result__snippet, [data-result="snippet"], [data-testid="result-snippet"], .XUrCbd'
        );
        if (snippetElement) {
          snippet = snippetElement.textContent.trim();
        }

        // Get domain
        let domain = '';
        try {
          const urlObj = new URL(url);
          domain = urlObj.hostname.replace('www.', '');
        } catch (e) {
          // If URL parsing fails, try to extract domain from visible text
          const domainElement = result.querySelector('.result__url, cite, .tjvcx');
          if (domainElement) {
            domain = domainElement.textContent.trim().split(' › ')[0];
          }
        }

        results.push({
          title,
          url,
          snippet,
          domain
        });
      } catch (e) {
        console.warn('[Boring Mode] Failed to extract result:', e);
      }
    });

    return results;
  }

  // Get the search query from URL
  function getSearchQuery() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('q') || '';
  }

  // Check if input is a URL or search query (same logic as main browser)
  function isUrl(input) {
    const trimmed = input.trim();

    // Already has protocol
    if (/^https?:\/\//i.test(trimmed)) return true;

    // Localhost or IP address
    if (/^localhost(:\d+)?$/i.test(trimmed)) return true;
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(trimmed)) return true;

    // Has domain extension (e.g., .com, .org, .co.uk)
    if (/\.[a-z]{2,}(\/|$|:|\?|#)/i.test(trimmed)) return true;

    // Simple domain without path (e.g., "example.com" or "bbc.co.uk")
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(trimmed)) return true;

    return false;
  }

  // Render homepage with minimal search box
  function renderHomepage() {
    const overlay = document.createElement('div');
    overlay.className = 'boring-overlay';
    overlay.innerHTML = `
      <div class="boring-container boring-homepage">
        <div class="boring-search-home">
          <form id="boring-search-form" class="boring-search-form">
            <input
              type="text"
              id="boring-search-input"
              class="boring-search-input-home"
              placeholder="search"
              autofocus
            />
          </form>
        </div>
      </div>
    `;

    document.body.classList.add('boring-mode-active');
    document.body.appendChild(overlay);

    // Add smart search/URL detection
    const form = document.getElementById('boring-search-form');
    const input = document.getElementById('boring-search-input');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = input.value.trim();

      if (!value) return;

      let targetUrl;
      if (isUrl(value)) {
        // It's a URL - navigate directly
        targetUrl = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      } else {
        // It's a search query - use current search engine
        const query = encodeURIComponent(value);
        targetUrl = `${window.location.origin}/search?q=${query}`;
      }

      window.location.href = targetUrl;
    });

    console.log('[Boring Mode] Homepage rendered');
  }

  // Render search results view
  function renderSearchResults(results, query) {
    const overlay = document.createElement('div');
    overlay.className = 'boring-overlay';
    overlay.innerHTML = `
      <div class="boring-container">
        <div class="boring-header">
          <h1 class="boring-title">search results</h1>
          <p class="boring-subtitle">${escapeHtml(query)} • ${results.length} results</p>
        </div>

        <div class="boring-search-results">
          ${results.map(result => `
            <a href="${escapeHtml(result.url)}" class="boring-search-result">
              <div class="boring-search-result-domain">${escapeHtml(result.domain)}</div>
              <h3 class="boring-search-result-title">${escapeHtml(result.title)}</h3>
              ${result.snippet ? `
                <p class="boring-search-result-snippet">${escapeHtml(result.snippet)}</p>
              ` : ''}
            </a>
          `).join('')}
        </div>

        ${results.length === 0 ? `
          <div class="boring-empty">
            <p>no results found. the page might still be loading - try refreshing.</p>
          </div>
        ` : ''}
      </div>
    `;

    document.body.classList.add('boring-mode-active');
    document.body.appendChild(overlay);
    console.log(`[Boring Mode] Search results rendered (${results.length} results)`);
  }

  // Helper: Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Check if we're on the homepage or search results page
  function isHomepage() {
    return !getSearchQuery();
  }

  // Main initialization
  function init() {
    // Remove any existing overlay
    const existingOverlay = document.querySelector('.boring-overlay');
    if (existingOverlay) existingOverlay.remove();

    if (isHomepage()) {
      // Show minimal search box on homepage
      console.log('[Boring Mode] Rendering homepage...');
      renderHomepage();
    } else {
      // Show search results
      console.log('[Boring Mode] Extracting search results...');
      const results = extractSearchResults();
      const query = getSearchQuery();
      renderSearchResults(results, query);
    }
  }

  // Run after page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }

  console.log('[Boring Mode] Search module initialized');
})();
