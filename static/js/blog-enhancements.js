(function () {
  'use strict';

  // ---------- #2: sticky TOC sidebar with scroll-spy ----------
  function setupStickyToc() {
    var toc = document.querySelector('details.toc');
    var article = document.querySelector('article');
    if (!toc || !article) return;
    if (window.matchMedia('(max-width: 1099px)').matches) return;

    var sidebar = document.createElement('nav');
    sidebar.className = 'toc-sidebar';
    sidebar.setAttribute('aria-label', 'Section navigation');
    var list = toc.querySelector('ul');
    if (!list) return;
    sidebar.appendChild(list.cloneNode(true));
    article.appendChild(sidebar);

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
  function setupSearch() {
    var input = document.getElementById('site-search');
    var results = document.getElementById('site-search-results');
    if (!input || !results) return;
    if (typeof elasticlunr === 'undefined' || typeof window.searchIndex === 'undefined') {
      input.placeholder = 'Search unavailable';
      input.disabled = true;
      return;
    }

    var index = elasticlunr.Index.load(window.searchIndex);

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

    function render(hits, query) {
      if (!hits.length) {
        results.innerHTML = '<div class="search-empty">No matches.</div>';
      } else {
        var html = '';
        for (var i = 0; i < hits.length; i++) {
          var h = hits[i];
          var doc = h.doc;
          if (!doc) continue;
          var title = doc.title || h.ref;
          var url = h.ref;
          html += '<a class="search-hit" href="' + escapeHtml(url) + '">'
            + '<div class="search-hit-title">' + escapeHtml(title) + '</div>'
            + '<div class="search-hit-snippet">' + snippet(doc.body || '', query) + '</div>'
            + '</a>';
        }
        results.innerHTML = html;
      }
      results.hidden = false;
    }

    function query(q) {
      if (!q || q.length < 2) {
        results.hidden = true;
        results.innerHTML = '';
        return;
      }
      var hits = index.search(q, {
        fields: { title: { boost: 3 }, body: { boost: 1 } },
        expand: true,
        bool: 'AND',
      }).slice(0, 8);
      render(hits, q);
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
