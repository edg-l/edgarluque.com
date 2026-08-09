(function () {
  'use strict';

  var thisScript = document.currentScript;

  // Widest viewport at which the rail would still overlap the centred
  // container: 1080px container + 2 * (32px gap + 200px rail).
  var RAIL_QUERY = '(min-width: 1560px)';

  // ---------- sticky TOC rail with scroll-spy ----------
  function setupStickyToc() {
    var toc = document.querySelector('details.toc');
    var article = document.querySelector('article');
    if (!toc || !article) return;
    if (!window.matchMedia(RAIL_QUERY).matches) return;

    var sidebar = document.createElement('nav');
    sidebar.className = 'toc-sidebar';
    sidebar.setAttribute('aria-label', 'Section navigation');
    var list = toc.querySelector('ul');
    if (!list) return;
    sidebar.appendChild(list.cloneNode(true));
    article.appendChild(sidebar);
    article.classList.add('has-rail');

    var links = sidebar.querySelectorAll('a[href^="#"]');
    if (!links.length) return;
    var headings = [];
    links.forEach(function (a) {
      var id = decodeURIComponent(a.getAttribute('href').slice(1));
      var h = document.getElementById(id);
      if (h) headings.push({ a: a, h: h });
    });
    if (!headings.length) return;

    function onScroll() {
      var y = window.scrollY + 120;
      var active = headings[0];
      for (var i = 0; i < headings.length; i++) {
        if (headings[i].h.offsetTop <= y) active = headings[i];
      }
      headings.forEach(function (item) {
        item.a.classList.toggle('active', item === active);
      });
    }
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () { onScroll(); ticking = false; });
        ticking = true;
      }
    }, { passive: true });
    onScroll();
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
    setupStickyToc();
    setupHeadingAnchors();
    setupSearch();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
