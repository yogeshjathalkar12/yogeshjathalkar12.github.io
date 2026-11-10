/* Shakti light / dark theme.
   The first part runs while the page loads, so there is no flash of the wrong colours: it uses the person's saved
   choice, otherwise the computer's own light/dark setting. The second part adds a Light / Dark button to the top bar. */
(function () {
  var KEY = 'shakti-theme';
  var root = document.documentElement;

  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: the choice just lasts for this page */ } }

  var theme = saved();
  if (theme !== 'light' && theme !== 'dark') {
    theme = (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }
  root.setAttribute('data-theme', theme);

  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('nav');
    if (!nav) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'so-theme-toggle';

    function paint() {
      var light = root.getAttribute('data-theme') === 'light';
      btn.textContent = light ? 'Dark' : 'Light';          // the button names the theme it switches TO
      btn.setAttribute('aria-label', light ? 'Switch to the dark theme' : 'Switch to the light theme');
    }
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      save(next);
      paint();
    });
    paint();

    var brand = nav.querySelector('.brand');
    var links = nav.querySelector('.nav-links');
    if (links) {                      // Sentinel Systems page: the button goes after the links
      nav.appendChild(btn);
    } else if (brand) {               // the other pages: next to the page name on the right
      var wrap = document.createElement('div');
      wrap.className = 'so-nav-end';
      brand.parentNode.insertBefore(wrap, brand);
      wrap.appendChild(btn);
      wrap.appendChild(brand);
    } else {
      nav.appendChild(btn);
    }
  });
})();
