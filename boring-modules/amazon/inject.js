/**
 * Amazon Focused Mode
 *
 * Strips product images, recommendations, sidebars, and cross-sells.
 * Renders a text-only overlay using the global dark theme.
 * Works on search results, category pages, and the homepage.
 * Product detail pages show only the essentials: name, price, rating, key bullets.
 * Purchasing requires opening the real Amazon page in a new tab (added friction).
 */
(function () {
  'use strict';

  console.log('[Boring Mode] Amazon module loaded');

  // Currency symbol based on TLD
  const currency = window.location.hostname.includes('amazon.co.uk') ? '£' : '$';

  // --- Helpers ---

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Strip Amazon tracking/referral params, keep only /dp/ASIN
  function cleanProductUrl(href) {
    var match = href.match(/(\/dp\/[A-Z0-9]+)/);
    if (match) {
      return window.location.origin + match[1];
    }
    return href;
  }

  // Extract price from a container element
  function readPrice(container) {
    var wholeEl = container.querySelector('.a-price .a-price-whole');
    var fracEl  = container.querySelector('.a-price .a-price-fraction');
    if (!wholeEl) return '';
    var price = currency + wholeEl.textContent.trim();
    if (fracEl) price += '.' + fracEl.textContent.trim();
    return price;
  }

  // Extract numeric rating from nearest .a-icon-alt element
  function readRating(container) {
    var el = container.querySelector('.a-icon-alt');
    if (!el) return '';
    var m = el.textContent.match(/([\d.]+)/);
    return m ? m[1] + ' / 5' : '';
  }

  // Extract a short description snippet from a product card.
  // Looks for secondary-coloured text spans that aren't the title, price, or rating.
  function readDescription(container, titleText) {
    var spans = container.querySelectorAll('span[class*="a-size-base"]');
    for (var i = 0; i < spans.length; i++) {
      var text = spans[i].textContent.trim();
      if (text.length < 15) continue;
      if (text === titleText) continue;
      if (spans[i].closest('.a-price')) continue;
      if (spans[i].closest('[class*="a-icon"]')) continue;
      return text.length > 150 ? text.substring(0, 150) + '\u2026' : text;
    }
    return '';
  }

  // Returns true if the product card is a sponsored/ad placement.
  // Amazon marks these with a "Sponsored" label span inside the card.
  function isSponsored(el) {
    var spans = el.querySelectorAll('span');
    for (var i = 0; i < spans.length; i++) {
      var t = spans[i].textContent.trim();
      if (t === 'Sponsored' || t === 'Sponsored product') return true;
    }
    return !!el.querySelector('[class*="sponsored"], [class*="Sponsored"]');
  }

  // --- Page-type detection ---

  function isProductPage() {
    return /\/dp\/[A-Z0-9]+/.test(window.location.pathname);
  }

  function isHomepage() {
    var p = window.location.pathname;
    return p === '/' || p === '';
  }

  // --- Listing / search pages ---

  function extractProducts() {
    var products = [];
    var seen = {}; // deduplicate by ASIN

    // Primary: search result containers (search / category pages)
    var candidates = document.querySelectorAll(
      '[data-component-type="s-search-result"], ' +
      '[class*="s-search-result"]'
    );

    // Fallback: any element with data-asin (homepage carousels, deals, etc.)
    if (candidates.length === 0) {
      candidates = document.querySelectorAll('[data-asin]');
    }

    candidates.forEach(function (el) {
      if (isSponsored(el)) return;

      var linkEl = el.querySelector('a[href*="/dp/"]');
      if (!linkEl) return;

      // Deduplicate by ASIN
      var href = linkEl.getAttribute('href');
      var asinMatch = href.match(/\/dp\/([A-Z0-9]+)/);
      if (!asinMatch) return;
      if (seen[asinMatch[1]]) return;
      seen[asinMatch[1]] = true;

      var titleEl = el.querySelector('h2 span, [class*="a-size-medium"] span, a[href*="/dp/"] span');
      if (!titleEl || titleEl.textContent.trim().length < 3) return;

      var title = titleEl.textContent.trim();

      products.push({
        title:       title,
        url:         cleanProductUrl(href),
        price:       readPrice(el),
        rating:      readRating(el),
        description: readDescription(el, title)
      });
    });

    return products;
  }

  function renderProductList(products) {
    var overlay = document.createElement('div');
    overlay.className = 'boring-overlay';

    var cardsHtml = products.map(function (p) {
      var meta = escapeHtml(p.price);
      if (p.rating) meta += ' &middot; ' + escapeHtml(p.rating);

      var descHtml = '';
      if (p.description) {
        descHtml = '<div class="boring-card-description">' + escapeHtml(p.description) + '</div>';
      }

      return '<a href="' + escapeHtml(p.url) + '" class="boring-card">' +
        '<h3 class="boring-card-title">' + escapeHtml(p.title) + '</h3>' +
        '<div class="boring-card-meta">' + meta + '</div>' +
        descHtml +
        '</a>';
    }).join('');

    var emptyHtml = '';
    if (products.length === 0) {
      emptyHtml = '<p class="boring-empty-msg">No products found — try searching first, or the page may still be loading.</p>';
    }

    overlay.innerHTML =
      '<div class="boring-container">' +
        '<div class="boring-header">' +
          '<h1 class="boring-title">Amazon</h1>' +
        '</div>' +
        '<div class="boring-grid">' + cardsHtml + '</div>' +
        emptyHtml +
      '</div>';

    document.body.appendChild(overlay);
    console.log('[Boring Mode] Amazon listing rendered (' + products.length + ' products)');
  }

  // --- Homepage ---

  function renderHomepage() {
    var overlay = document.createElement('div');
    overlay.className = 'boring-overlay';

    overlay.innerHTML =
      '<div class="boring-container">' +
        '<div class="boring-header">' +
          '<h1 class="boring-title">Amazon</h1>' +
        '</div>' +
        '<div class="boring-search-wrapper">' +
          '<input type="text" class="boring-search-input" id="amazon-search" placeholder="Search Amazon" />' +
          '<button class="boring-search-btn" id="amazon-search-btn">Search</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var input = overlay.querySelector('#amazon-search');
    var btn   = overlay.querySelector('#amazon-search-btn');

    function doSearch() {
      var q = input.value.trim();
      if (q) {
        window.location.href = window.location.origin + '/s?k=' + encodeURIComponent(q);
      }
    }

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doSearch();
    });
    input.focus();

    console.log('[Boring Mode] Amazon homepage rendered');
  }

  // --- Product detail pages ---

  function extractProductDetails() {
    var product = {
      name:    '',
      price:   '',
      rating:  '',
      details: [],
      url:     window.location.href
    };

    // Title
    var titleEl = document.querySelector('#productTitle span, #productTitle');
    if (titleEl) product.name = titleEl.textContent.trim();

    // Price — try the main price widget
    var priceContainer = document.querySelector('[data-feature-name="price"], #price_display_Amazon_Feature_Price_Desktop');
    if (priceContainer) {
      product.price = readPrice(priceContainer);
    }
    // Fallback: first .a-price on the page
    if (!product.price) {
      product.price = readPrice(document);
    }

    // Rating
    var ratingEl = document.querySelector('[data-hook="review-star-rating"] .a-icon-alt, #ratingValue');
    if (ratingEl) {
      var m = ratingEl.textContent.match(/([\d.]+)/);
      if (m) product.rating = m[1] + ' / 5';
    }

    // Feature bullets — the most useful dense info on the page, capped at 5
    document.querySelectorAll('#feature-bullets li, [data-feature-name="feature-bullets"] li').forEach(function (li) {
      if (product.details.length >= 5) return;
      var text = li.textContent.trim();
      if (text.length > 5 && !/click here/i.test(text)) {
        product.details.push(text);
      }
    });

    // Fallback: product description block
    if (product.details.length === 0) {
      var descEl = document.querySelector('#productDescription span, [data-feature-name="product-description"] span');
      if (descEl) {
        var text = descEl.textContent.trim();
        if (text.length > 10) product.details.push(text.substring(0, 400));
      }
    }

    // Clean tracking params from URL
    var dpMatch = product.url.match(/(https?:\/\/[^/]+\/dp\/[A-Z0-9]+)/);
    if (dpMatch) product.url = dpMatch[1];

    return product;
  }

  function renderProductDetail(product) {
    var overlay = document.createElement('div');
    overlay.className = 'boring-overlay';

    var detailsHtml = '';
    if (product.details.length > 0) {
      detailsHtml =
        '<div class="boring-product-details">' +
          product.details.map(function (d) {
            return '<p>' + escapeHtml(d) + '</p>';
          }).join('') +
        '</div>';
    }

    var ratingHtml = '';
    if (product.rating) {
      ratingHtml = '<div class="boring-product-rating">' + escapeHtml(product.rating) + '</div>';
    }

    overlay.innerHTML =
      '<div class="boring-container">' +
        '<button class="boring-back" onclick="history.back()">&#8592; Back</button>' +
        '<div class="boring-product-detail">' +
          '<h1 class="boring-product-name">' + escapeHtml(product.name) + '</h1>' +
          '<div class="boring-product-price">' + escapeHtml(product.price) + '</div>' +
          ratingHtml +
          detailsHtml +
          '<a href="' + escapeHtml(product.url) + '" target="_blank" class="boring-button boring-button-primary">' +
            'Open on Amazon to purchase' +
          '</a>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    console.log('[Boring Mode] Amazon product detail rendered');
  }

  // --- Init ---

  function init() {
    var existing = document.querySelector('.boring-overlay');
    if (existing) existing.remove();

    if (isProductPage()) {
      var product = extractProductDetails();
      if (product.name) {
        renderProductDetail(product);
      } else {
        console.warn('[Boring Mode] Could not extract product name');
      }
    } else if (isHomepage()) {
      renderHomepage();
    } else {
      var products = extractProducts();
      renderProductList(products);
    }
  }

  // Amazon pages are mostly server-rendered, but give a short delay for any
  // late-hydrating elements before scraping.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1500); });
  } else {
    setTimeout(init, 1500);
  }

  console.log('[Boring Mode] Amazon module initialized');
})();
