/* Raptor pre-login pages: theme persistence, mobile menu, scroll reveal.
   Everything here is progressive enhancement; the pages read fine without it. */
(function () {
  var root = document.documentElement;
  var body = document.body;
  root.classList.add('js');

  /* theme: same key the landing page's lamp writes */
  var toggle = document.getElementById('themeToggle');
  function syncToggle() {
    if (!toggle) return;
    var dark = body.classList.contains('dark-mode');
    toggle.textContent = dark ? 'Light mode' : 'Dark mode';
    toggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
  }
  syncToggle();
  if (toggle) {
    toggle.addEventListener('click', function () {
      body.classList.toggle('dark-mode');
      try { localStorage.setItem('raptor-theme', body.classList.contains('dark-mode') ? 'dark' : 'light'); } catch (e) {}
      syncToggle();
    });
  }

  /* mobile menu */
  var nav = document.querySelector('.rx-nav');
  var menuBtn = document.getElementById('menuBtn');
  if (nav && menuBtn) {
    menuBtn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.focus();
      }
    });
  }

  /* reveal on scroll */
  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  items.forEach(function (el) { io.observe(el); });
})();
