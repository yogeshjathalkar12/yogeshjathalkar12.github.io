// Shared behaviour for the Basis feature / legal pages: theme toggle,
// mobile menu, scroll reveal. (index.html keeps its own inline copy.)
(function () {
  var html = document.documentElement;
  var toggle = document.getElementById('themeToggle');

  function paint() {
    var dark = html.getAttribute('data-theme') === 'dark';
    if (toggle) { toggle.textContent = dark ? '☀️' : '🌙'; toggle.setAttribute('aria-pressed', String(dark)); }
  }
  paint();
  if (toggle) {
    toggle.addEventListener('click', function () {
      var dark = html.getAttribute('data-theme') === 'dark';
      html.setAttribute('data-theme', dark ? 'light' : 'dark');
      try { localStorage.setItem('basis-theme', dark ? 'light' : 'dark'); } catch (e) {}
      paint();
    });
  }

  var btn = document.getElementById('menuBtn');
  var links = document.getElementById('bxLinks');
  if (btn && links) {
    btn.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
  }

  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('visible'); });
  }
})();
