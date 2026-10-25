/* Book a demo for a venture page.
   Adds a "Book Demo" button to the page and a popup with: name, country code + contact number, venture, optional email.
   It is sent the same way as the Raptor and home-page demo requests (FormSubmit's AJAX endpoint, JSON, honeypot field).

   Use:  ShoonyaBookDemo.init({ venture: 'Coral', accent: 'var(--accent)', accentText: '#fff',
                                mount: '.nav-links', before: '#navSignIn' })
     venture     which venture the page is about (preselected in the dropdown)
     accent      the page's accent colour (any CSS colour, or a var(--...) from the page)
     accentText  text colour on an accent-coloured button
     mount       CSS selector of the element the button goes into; before: a selector inside it to put the button in front of
     fixed       instead of mount: { top: '2.2rem', right: '270px' } places the button on the screen */
(function () {
  var TO = 'https://formsubmit.co/ajax/yogesh@shoonyaorigins.com';
  var COUNTRIES = [['India', '+91'], ['United States', '+1'], ['United Kingdom', '+44'], ['United Arab Emirates', '+971'], ['Singapore', '+65'],
    ['Australia', '+61'], ['Canada', '+1'], ['Germany', '+49'], ['France', '+33'], ['Saudi Arabia', '+966'], ['Qatar', '+974'], ['Kuwait', '+965'],
    ['Oman', '+968'], ['Bahrain', '+973'], ['Bangladesh', '+880'], ['Nepal', '+977'], ['Sri Lanka', '+94'], ['Pakistan', '+92'], ['Malaysia', '+60'],
    ['Indonesia', '+62'], ['Thailand', '+66'], ['Vietnam', '+84'], ['Philippines', '+63'], ['Japan', '+81'], ['South Korea', '+82'], ['China', '+86'],
    ['Hong Kong', '+852'], ['New Zealand', '+64'], ['South Africa', '+27'], ['Nigeria', '+234'], ['Kenya', '+254'], ['Egypt', '+20'], ['Turkey', '+90'],
    ['Italy', '+39'], ['Spain', '+34'], ['Netherlands', '+31'], ['Switzerland', '+41'], ['Sweden', '+46'], ['Ireland', '+353'], ['Brazil', '+55'],
    ['Mexico', '+52'], ['Russia', '+7']];
  var VENTURES = ['Raptor', 'rta', 'Coral', 'Vapus', 'Eklavya', 'Shakti', 'Project Jeeva', 'Charaka', 'Aether Labs', 'Shoonya Systems', 'Not sure yet'];

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function init(o) {
    o = o || {};
    var venture = o.venture || 'Not sure yet';
    var accent = o.accent || '#2563eb', accentText = o.accentText || '#fff';

    // ── button ──
    var btn = el('button', 'bd-btn', 'Book Demo');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.style.setProperty('--bd-accent', accent);
    btn.style.setProperty('--bd-accent-text', accentText);
    if (o.fixed) {
      btn.classList.add('bd-fixed');
      for (var k in o.fixed) btn.style[k] = o.fixed[k];
      document.body.appendChild(btn);
    } else {
      var host = document.querySelector(o.mount);
      if (!host) return;
      var ref = o.before ? host.querySelector(o.before) : null;
      if (ref) ref.parentNode.insertBefore(btn, ref); else host.appendChild(btn);
    }

    // ── popup ──
    var overlay = el('div', 'bd-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'bdTitle');
    overlay.style.setProperty('--bd-accent', accent);
    overlay.style.setProperty('--bd-accent-text', accentText);
    overlay.innerHTML =
      '<div class="bd-card">' +
        '<button type="button" class="bd-close" aria-label="Close">&times;</button>' +
        '<div class="bd-form-wrap">' +
          '<h2 id="bdTitle">Book a demo</h2>' +
          '<p class="bd-sub">Tell us how to reach you and which venture you would like to see. We will set up a walkthrough.</p>' +
          '<form novalidate>' +
            '<input type="text" name="_honey" class="bd-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
            '<div class="bd-field"><label for="bdName">Name</label><input id="bdName" name="name" type="text" autocomplete="name" required></div>' +
            '<div class="bd-field"><label for="bdPhone">Contact number</label><div class="bd-phone"><select name="country" aria-label="Country code"></select>' +
              '<input id="bdPhone" name="phone" type="tel" autocomplete="tel-national" inputmode="tel" required placeholder="98765 43210"></div></div>' +
            '<div class="bd-field"><label for="bdVenture">Which venture?</label><select id="bdVenture" name="venture"></select></div>' +
            '<div class="bd-field"><label for="bdEmail">Email <i>(optional)</i></label><input id="bdEmail" name="email" type="email" autocomplete="email"></div>' +
            '<p class="bd-err" role="alert"></p>' +
            '<button type="submit" class="bd-submit">Book my demo</button>' +
            '<p class="bd-small">We use your details only to contact you about a demo.</p>' +
          '</form>' +
        '</div>' +
        '<div class="bd-thanks" hidden><h2>Thank you</h2><p class="bd-sub">We have your request and will reach out to you shortly.</p></div>' +
      '</div>';
    document.body.appendChild(overlay);

    var form = overlay.querySelector('form'), err = overlay.querySelector('.bd-err'), submit = overlay.querySelector('.bd-submit');
    var wrap = overlay.querySelector('.bd-form-wrap'), thanks = overlay.querySelector('.bd-thanks'), closeBtn = overlay.querySelector('.bd-close');
    var countrySel = form.elements.country, ventureSel = form.elements.venture;

    COUNTRIES.forEach(function (c) {
      var op = document.createElement('option'); op.value = c[0]; op.textContent = c[0] + ' (' + c[1] + ')'; if (c[0] === 'India') op.selected = true; countrySel.appendChild(op);
    });
    VENTURES.forEach(function (v) {
      var op = document.createElement('option'); op.value = v; op.textContent = v; if (v === venture) op.selected = true; ventureSel.appendChild(op);
    });

    function dial() { var code = ''; COUNTRIES.forEach(function (c) { if (c[0] === countrySel.value) code = c[1]; }); return code; }
    function bad(node, msg) { node.setAttribute('aria-invalid', 'true'); err.textContent = msg; node.focus(); }

    function open() {
      wrap.hidden = false; thanks.hidden = true; err.textContent = '';
      overlay.classList.add('bd-open');
      document.body.style.overflow = 'hidden';
      form.elements.name.focus();
    }
    function close() {
      overlay.classList.remove('bd-open');
      document.body.style.overflow = '';
      btn.focus();
    }
    btn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('bd-open')) close(); });
    form.addEventListener('input', function (e) { e.target.removeAttribute('aria-invalid'); err.textContent = ''; });
    form.addEventListener('change', function (e) { e.target.removeAttribute('aria-invalid'); err.textContent = ''; });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements, name = f.name.value.trim(), phone = f.phone.value.trim(), email = f.email.value.trim();
      if (f._honey.value) return;
      if (!name) return bad(f.name, 'Please enter your name.');
      var digits = phone.replace(/\D/g, '');
      if (digits.length < 6 || digits.length > 14) return bad(f.phone, 'Please enter a valid contact number.');
      if (!f.venture.value) return bad(f.venture, 'Please choose a venture.');
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(f.email, 'That email address does not look right.');
      submit.disabled = true; submit.textContent = 'Sending...'; err.textContent = '';
      fetch(TO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          _subject: 'Demo request: ' + f.venture.value,
          _template: 'table',
          _captcha: 'false',
          name: name,
          phone: dial() + ' ' + phone,
          country: f.country.value,
          venture: f.venture.value,
          email: email || '(not given)',
          message: '(none)',
          source: 'Book Demo (' + venture + ' page)',
          page: location.href
        })
      })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || (j.success !== true && j.success !== 'true')) throw new Error('send failed'); }); })
      .then(function () { form.reset(); ventureSel.value = venture; countrySel.value = 'India'; wrap.hidden = true; thanks.hidden = false; closeBtn.focus(); })
      .catch(function () { err.textContent = 'Could not send that just now. Please try again in a moment.'; })
      .then(function () { submit.disabled = false; submit.textContent = 'Book my demo'; });
    });
  }

  window.ShoonyaBookDemo = { init: init };
})();
