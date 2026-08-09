(function () {
  'use strict';

  var thisScript = document.currentScript;

  var GUTTER_QUERY = '(min-width: 1200px)';

  // Blocks that are not part of the article's own body.
  function bodyBlocks(article) {
    var out = [];
    for (var i = 0; i < article.children.length; i++) {
      var el = article.children[i];
      if (el.classList.contains('hex-gutter')) continue;
      if (el.offsetHeight > 0) out.push(el);
    }
    return out;
  }

  function debounce(handler, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(handler, ms);
    };
  }

  // ---------- hex gutter: each block's offset in the article's text ----------
  function setupHexGutter() {
    var article = document.querySelector('article');
    if (!article || !window.matchMedia(GUTTER_QUERY).matches) return;

    var blocks = bodyBlocks(article);
    if (blocks.length < 4) return;

    var gutter = document.createElement('div');
    gutter.className = 'hex-gutter';
    gutter.setAttribute('aria-hidden', 'true');

    var offset = 0;
    var marks = blocks.map(function (el) {
      var span = document.createElement('span');
      span.textContent = '0x' + offset.toString(16).toUpperCase().padStart(4, '0');
      offset += (el.textContent || '').length;
      gutter.appendChild(span);
      return { el: el, span: span };
    });

    article.appendChild(gutter);

    function place() {
      var top = article.getBoundingClientRect().top + window.scrollY;
      marks.forEach(function (m) {
        var r = m.el.getBoundingClientRect();
        // Align with the first line of the block, not its box.
        var lead = parseFloat(getComputedStyle(m.el).fontSize) * 0.55;
        m.span.style.top = (r.top + window.scrollY - top + lead) + 'px';
      });
    }

    window.addEventListener('resize', debounce(place, 150));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    place();
  }

  // ---------- #3: heading anchor copy icons ----------
  function setupHeadingAnchors() {
    var headings = document.querySelectorAll('article h2[id], article h3[id]');
    if (!headings.length || !navigator.clipboard) return;
    headings.forEach(function (h) {
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.className = 'heading-anchor';
      a.setAttribute('aria-label', 'Copy link to ' + h.textContent);
      a.textContent = '#';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var url = window.location.origin + window.location.pathname + '#' + h.id;
        navigator.clipboard.writeText(url).then(function () {
          a.classList.add('copied');
          setTimeout(function () { a.classList.remove('copied'); }, 1200);
          history.replaceState(null, '', '#' + h.id);
        });
      });
      h.appendChild(a);
    });
  }

  // ---------- search ----------
  // The engine and the index are ~440 KB of JavaScript, so they are fetched on
  // the first interaction with the search box rather than on every page load.
  function setupSearch() {
    var input = document.getElementById('site-search');
    var results = document.getElementById('site-search-results');
    if (!input || !results) return;

    var libUrl = thisScript && thisScript.getAttribute('data-search-lib');
    var indexUrl = thisScript && thisScript.getAttribute('data-search-index');
    if (!libUrl || !indexUrl) return;

    function loadScript(src) {
      return new Promise(function (resolve, reject) {
        var el = document.createElement('script');
        el.src = src;
        el.onload = resolve;
        el.onerror = reject;
        document.head.appendChild(el);
      });
    }

    var loading = null;
    function load() {
      if (!loading) {
        loading = loadScript(libUrl)
          .then(function () { return loadScript(indexUrl); })
          .then(function () { return elasticlunr.Index.load(window.searchIndex); })
          .catch(function () {
            input.placeholder = 'Search unavailable';
            input.disabled = true;
            return null;
          });
      }
      return loading;
    }

    input.addEventListener('focus', load, { once: true });
    input.addEventListener('pointerdown', load, { once: true });

    function escapeHtml(s) {
      return s.replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function snippet(body, query) {
      if (!body) return '';
      var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      var lower = body.toLowerCase();
      var pos = -1;
      for (var i = 0; i < terms.length; i++) {
        var p = lower.indexOf(terms[i]);
        if (p !== -1 && (pos === -1 || p < pos)) pos = p;
      }
      if (pos === -1) return escapeHtml(body.slice(0, 140)) + '…';
      var start = Math.max(0, pos - 50);
      var end = Math.min(body.length, pos + 100);
      var text = (start > 0 ? '…' : '') + body.slice(start, end) + (end < body.length ? '…' : '');
      return escapeHtml(text);
    }

    function render(index, hits, query) {
      var html = '';
      for (var i = 0; i < hits.length; i++) {
        var h = hits[i];
        var doc = index.documentStore.getDoc(h.ref) || {};
        html += '<a class="search-hit" href="' + escapeHtml(h.ref) + '">'
          + '<div class="search-hit-title">' + escapeHtml(doc.title || h.ref) + '</div>'
          + '<div class="search-hit-snippet">' + snippet(doc.body || '', query) + '</div>'
          + '</a>';
      }
      results.innerHTML = html || '<div class="search-empty">No matches.</div>';
      results.hidden = false;
    }

    function query(q) {
      if (!q || q.length < 2) {
        results.hidden = true;
        results.innerHTML = '';
        return;
      }
      load().then(function (index) {
        if (!index || input.value.trim() !== q) return;
        var hits = index.search(q, {
          fields: { title: { boost: 3 }, body: { boost: 1 } },
          expand: true,
          bool: 'AND',
        }).slice(0, 8);
        render(index, hits, q);
      });
    }

    var debounceTimer;
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      var q = input.value.trim();
      debounceTimer = setTimeout(function () { query(q); }, 120);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        input.value = '';
        results.hidden = true;
        results.innerHTML = '';
        input.blur();
      } else if (e.key === 'Enter') {
        var first = results.querySelector('.search-hit');
        if (first) {
          e.preventDefault();
          window.location.href = first.href;
        }
      }
    });

    document.addEventListener('click', function (e) {
      if (!input.contains(e.target) && !results.contains(e.target)) {
        results.hidden = true;
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== input && !/input|textarea/i.test(document.activeElement.tagName)) {
        e.preventDefault();
        input.focus();
      }
    });
  }

  function init() {
    setupHexGutter();
    setupHeadingAnchors();
    setupSearch();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
