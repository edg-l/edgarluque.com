document.querySelectorAll('pre').forEach(function (pre) {
  var btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.textContent = 'Copy';
  btn.addEventListener('click', function () {
    var code = pre.querySelector('code');
    var text = code ? code.textContent : pre.textContent;
    navigator.clipboard.writeText(text).then(function () {
      if (typeof umami !== 'undefined') umami.track('code-copy');
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
    });
  });
  pre.appendChild(btn);
});
