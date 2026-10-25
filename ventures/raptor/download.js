/* Raptor download chooser.
 *
 * EVERY download button on every Raptor page (the header's, the big buttons in the page, the ones in the footer) opens this same window,
 * "Choose your device": Windows or Mac. Picking one starts that download; the Mac choice also shows the install help. Nothing else on a
 * page needs to know about it: any link to an installer, and any element marked data-download, opens the chooser instead of going straight
 * to a file. (Without JavaScript the links still work: they keep their addresses and download the file directly.)
 *
 * The addresses below are rewritten by scripts/set_release.py from scripts/release.json after every release, like the page links.
 * A link that is specifically for one system (for example "Download for Mac") opens the chooser with that system already focused.
 */
(function () {
  'use strict';

  var RELEASE_VERSION = '0.1.14';
  var LINKS = {
    windows: 'https://raptor-download.yogeshjathalkar.workers.dev/windows',
    mac: 'https://raptor-download.yogeshjathalkar.workers.dev/mac'
  };

  // The newest versions, read from the download server (its /version page) so the window never shows an old number. RELEASE_VERSION above is only
  // the fallback for when the server cannot be reached; the download links themselves (/windows, /mac) are always the newest anyway.
  var fresh = { windows: '', mac: '' };
  function ver(os) { return fresh[os] || RELEASE_VERSION; }
  function showVersions() {
    if (!overlay) return;
    ['windows', 'mac'].forEach(function (os) {
      var small = overlay.querySelector('[data-os="' + os + '"] small');
      if (small) small.innerHTML = (os === 'windows' ? '64-bit' : 'Apple Silicon') + ' &middot; v' + ver(os);
    });
  }
  function readVersions() {
    try {
      fetch(new URL(LINKS.windows).origin + '/version').then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
        if (!v) return;
        if (v.windows && /^\d+\.\d+\.\d+$/.test(v.windows.version || '')) fresh.windows = v.windows.version;
        if (v.mac && /^\d+\.\d+\.\d+$/.test(v.mac.version || '')) fresh.mac = v.mac.version;
        if (window.RaptorDownload) window.RaptorDownload.version = ver('windows');
        showVersions();
      }).catch(function () { /* offline or the server is busy: the number written in the page stays */ });
    } catch (e) { /* an old browser without fetch/URL: same */ }
  }

  var INSTALLER_LINK = /Raptor-Setup-[\d.]+\.exe|Raptor-[\d.]+-mac-arm64\.dmg|workers\.dev\/(?:windows|mac)\b/;
  var overlay, step1, step2, previous = null, last = 'windows';

  function osOf(el) {
    var href = el.getAttribute('href') || '';
    var marked = el.getAttribute('data-download');
    if (marked === 'mac' || marked === 'windows') return marked;
    if (/mac-arm64\.dmg|workers\.dev\/mac\b/.test(href)) return 'mac';
    if (/Raptor-Setup-[\d.]+\.exe|workers\.dev\/windows\b/.test(href)) return 'windows';
    return null;
  }

  function build() {
    if (overlay) return;
    var host = document.createElement('div');
    host.innerHTML =
      '<div class="dl-overlay" id="dlOverlay" role="dialog" aria-modal="true" aria-labelledby="dlTitle">' +
      '<div class="dl-card">' +
      '<button type="button" class="dl-close" id="dlClose" aria-label="Close">&times;</button>' +
      '<div class="dl-step" id="dlStep1">' +
      '<h3 id="dlTitle">Download Raptor</h3><p>Choose your device.</p>' +
      '<div class="dl-options">' +
      '<button type="button" class="dl-option" data-os="windows">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5.5l7.5-1v7H3zM11.5 4.4L21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zM11.5 12.5H21V21l-9.5-1.4z"/></svg>' +
      '<b>Windows</b><small>64-bit &middot; v' + ver('windows') + '</small></button>' +
      '<button type="button" class="dl-option" data-os="mac">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg>' +
      '<b>Mac</b><small>Apple Silicon &middot; v' + ver('mac') + '</small></button>' +
      '</div></div>' +
      '<div class="dl-step" id="dlStep2" hidden>' +
      '<div class="dl-ok"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>' +
      '<h3>Download started</h3>' +
      '<p id="dlMsg">Your download should begin in a moment. If nothing happens, <button type="button" class="dl-retry" id="dlRetry">try again</button>.</p>' +
      '<div id="dlMacNote" hidden>' +
      '<p>New to Mac installs? Read the <a href="/ventures/raptor/install-mac.html">install guide</a>.</p>' +
      '<div class="dl-fix"><b>Error -10661, &ldquo;The application can&rsquo;t be opened&rdquo;?</b><ol>' +
      '<li>Drag Raptor into Applications, eject the installer, and open Raptor from Applications (not from the installer window).</li>' +
      '<li>In Terminal run <code>xattr -cr /Applications/Raptor.app</code>, then open Raptor again.</li>' +
      '<li>Right-click Raptor in Applications, choose Open, then Open.</li>' +
      '<li>Still blocked? Run <code>codesign --force --deep --sign - /Applications/Raptor.app</code> and open it again.</li>' +
      '<li>The installer should be about 850 MB. If yours is smaller, download it again.</li></ol>' +
      '<a href="/ventures/raptor/install-mac.html#error-10661">See the full steps</a></div></div>' +
      '<div class="dl-help">Any problem? Reach out to us at <a href="mailto:service.raptor@shoonyaorigins.com">service.raptor@shoonyaorigins.com</a></div>' +
      '</div></div></div>';
    overlay = host.firstChild;
    document.body.appendChild(overlay);
    step1 = overlay.querySelector('#dlStep1');
    step2 = overlay.querySelector('#dlStep2');

    overlay.querySelector('#dlClose').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
    overlay.querySelectorAll('.dl-option').forEach(function (b) {
      b.addEventListener('click', function () { start(b.getAttribute('data-os')); });
    });
    overlay.querySelector('#dlRetry').addEventListener('click', function () { start(last); });
  }

  function open(focusOs) {
    build();
    step1.hidden = false;
    step2.hidden = true;
    overlay.classList.add('open');
    previous = document.activeElement;
    var target = overlay.querySelector('.dl-option[data-os="' + (focusOs || 'windows') + '"]') || overlay.querySelector('.dl-option');
    if (target) target.focus();
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    if (previous && previous.focus) previous.focus();
  }

  function start(os) {
    last = os;
    var a = document.createElement('a');
    a.href = LINKS[os];
    a.download = '';
    a.rel = 'noopener';
    a.setAttribute('data-dl-start', '');   // this link is the download itself: the click handler below must let it through
    document.body.appendChild(a);
    a.click();
    a.remove();
    overlay.querySelector('#dlMacNote').hidden = (os !== 'mac');
    step1.hidden = true;
    step2.hidden = false;
    overlay.querySelector('#dlClose').focus();
  }

  // Capture phase, so this runs before any other handler a page has on the same element.
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // a new-tab click still goes to the file
    var el = e.target && e.target.closest ? e.target.closest('a,button') : null;
    if (!el || el.hasAttribute('data-dl-start')) return;
    var isHeaderButton = el.id === 'navDownload';
    var isMarked = el.hasAttribute('data-download');
    var isInstallerLink = el.tagName === 'A' && INSTALLER_LINK.test(el.getAttribute('href') || '');
    if (!isHeaderButton && !isMarked && !isInstallerLink) return;
    e.preventDefault();
    open(osOf(el));
  }, true);

  window.RaptorDownload = { open: open, links: LINKS, version: RELEASE_VERSION };
  readVersions();
})();
