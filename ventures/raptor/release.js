/* THE one variable that says which Raptor version the pages show.

   Normally you never edit it: when a page loads, this file asks the download server (the Cloudflare Worker 'raptor-download', page /version, which reads the
   newest release published in raptor-dist) and writes the newest version into every place that carries a marker:

     <span data-raptor-version="windows">0.1.18</span>            the Windows version
     <span data-raptor-version="mac">0.1.18</span>                the Mac version
     <span data-raptor-version="mac-file">Raptor-0.1.18-mac-arm64.dmg</span>   the Mac file name
     <a data-raptor-label="Download Raptor {windows} for Windows" aria-label="...">   {windows} {mac} {mac-file} are filled in

   So publishing a release needs NO page edit and NO commit: the pages are right the moment the release is public.

   The numbers written below, and inside the markers, are only what shows if the server cannot be reached (and what a search engine or a browser without
   scripts reads). scripts/set_release.py keeps them in step with scripts/release.json when you want to refresh them: python scripts/set_release.py */
(function () {
  'use strict';

  var R = window.RAPTOR_RELEASE = { windows: '0.1.18', mac: '0.1.18', macFile: 'Raptor-0.1.18-mac-arm64.dmg' };
  var WORKER = 'https://raptor-download.yogeshjathalkar.workers.dev';
  var VERSION = /^\d+\.\d+\.\d+$/;
  var MAC_FILE = /^Raptor-\d+\.\d+\.\d+-mac-arm64\.dmg$/;

  function values() { return { 'windows': R.windows, 'mac': R.mac, 'mac-file': R.macFile }; }

  function fill() {
    var v = values(), i, nodes, key, label;
    nodes = document.querySelectorAll('[data-raptor-version]');
    for (i = 0; i < nodes.length; i++) {
      key = nodes[i].getAttribute('data-raptor-version');
      if (v[key] && nodes[i].textContent !== v[key]) nodes[i].textContent = v[key];
    }
    nodes = document.querySelectorAll('[data-raptor-label]');
    for (i = 0; i < nodes.length; i++) {
      label = nodes[i].getAttribute('data-raptor-label').replace(/\{([\w-]+)\}/g, function (m, k) { return v[k] || m; });
      nodes[i].setAttribute('aria-label', label);
    }
  }

  function readLive() {
    try {
      fetch(WORKER + '/version').then(function (r) { return r.ok ? r.json() : null; }).then(function (live) {
        if (!live) return;
        if (live.windows && VERSION.test(live.windows.version || '')) R.windows = live.windows.version;
        if (live.mac && VERSION.test(live.mac.version || '')) R.mac = live.mac.version;
        if (live.mac && MAC_FILE.test(live.mac.file || '')) R.macFile = live.mac.file;
        else if (live.mac && VERSION.test(live.mac.version || '')) R.macFile = 'Raptor-' + live.mac.version + '-mac-arm64.dmg';
        fill();
        try { window.dispatchEvent(new CustomEvent('raptor-release', { detail: R })); } catch (e) { /* an old browser: the markers are already filled */ }
      }).catch(function () { /* offline, or the server is busy: the numbers written in the page stay */ });
    } catch (e) { /* an old browser without fetch: same */ }
  }

  function start() { fill(); readLive(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}());
