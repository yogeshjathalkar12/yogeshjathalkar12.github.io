// Theme toggle for Aura site pages. Uses the same storage key and attribute as the landing page,
// so the choice carries across every Aura page and the app.
(function () {
  var KEY = 'aura_theme', root = document.documentElement;
  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function apply(t) {
    if (t === 'dark') root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    var b = document.getElementById('themeBtn'); if (b) b.textContent = t === 'dark' ? '☀' : '☾';
  }
  apply(saved() === 'dark' ? 'dark' : 'light');
  document.addEventListener('DOMContentLoaded', function () {
    apply(saved() === 'dark' ? 'dark' : 'light');
    var b = document.getElementById('themeBtn'); if (!b) return;
    b.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) { /* storage blocked: still switch for this page */ }
      apply(next);
    });
  });
})();
