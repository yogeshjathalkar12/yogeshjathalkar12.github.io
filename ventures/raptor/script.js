// ═══════════════════════════════════════════════════
// SUPABASE CONFIG — fill these in with your project's values
// (Supabase dashboard → Settings → API)
// ═══════════════════════════════════════════════════
const SUPABASE_URL = 'https://pcdbtcpctlnvdtbrrqoo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjZGJ0Y3BjdGxudmR0YnJycW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MjIxMjQsImV4cCI6MjA5ODE5ODEyNH0._y59k8mmSqvkCL9gPBWp5hfp2LwpP_IBvr5h7y3nP7Q';
const supabaseClient = (SUPABASE_URL.startsWith('http'))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ── LAMP TOGGLE ──
const lamp = document.getElementById('lightSwitch');
let isAnimating = false;
lamp.addEventListener('click', () => {
  if (isAnimating) return;
  isAnimating = true;
  lamp.classList.add('pulled');
  setTimeout(() => {
    document.body.classList.toggle('dark-mode');
    lamp.classList.remove('pulled');
    isAnimating = false;
  }, 250);
});

// ── SCROLL REVEAL ──
const reveals = document.querySelectorAll('.reveal');
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      setTimeout(() => e.target.classList.add('in'), 60);
      obs.unobserve(e.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -50px 0px' });
reveals.forEach(el => { el.style.transitionDelay = '0s'; obs.observe(el); });

document.querySelectorAll('.cap-grid, .who-grid, .loop-steps, .proof-cards, .proof-stats').forEach(grid => {
  grid.querySelectorAll('.reveal').forEach((item, i) => { item.dataset.delay = i * 0.08; });
});
const staggerObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      const delay = parseFloat(e.target.dataset.delay || 0);
      setTimeout(() => e.target.classList.add('in'), delay * 1000 + 60);
      staggerObs.unobserve(e.target);
    }
  });
}, { threshold: 0.05 });
document.querySelectorAll('[data-delay]').forEach(el => staggerObs.observe(el));

// 5. Professional AI Chat Agent - FIXED LOGIC
document.addEventListener('DOMContentLoaded', () => {
    const avatar = document.getElementById('pro-agent-avatar');
    const bubble = document.getElementById('pro-speech-bubble');
    const chatHistory = document.getElementById('pro-chat-history');
    const userInput = document.getElementById('pro-user-input');
    const sendBtn = document.getElementById('pro-send-btn');
    let knowledgeBase = [];

    // Load Knowledge Base immediately on load
    fetch('knowledge.json')
        .then(res => res.json())
        .then(data => { knowledgeBase = data; })
        .catch(err => console.error("Knowledge base missing:", err));

    // Toggle Chat
    avatar.addEventListener('click', () => {
        const isHidden = bubble.style.display === 'none' || bubble.style.display === '';
        bubble.style.display = isHidden ? 'flex' : 'none';
        
        // Initial Greeting if it's the first time
        if (isHidden && chatHistory.children.length === 1) { 
            // Ensures it doesn't double-greet if already populated
        }
    });

    function appendMessage(text, sender) {
        const p = document.createElement('p');
        p.className = sender === 'user' ? 'user-msg' : 'bot-msg';
        p.innerText = text;
        chatHistory.appendChild(p);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    function handleChat() {
        const text = userInput.value.trim().toLowerCase();
        if (!text) return;

        appendMessage(userInput.value, 'user');
        userInput.value = '';

        // Match logic
        let finalReply = "I am a local knowledge assistant. Try asking about our ventures like Aura, Construct, or Raptor.";
        let bestMatchCount = 0;

        knowledgeBase.forEach(record => {
            let matchCount = 0;
            record.tags.forEach(tag => {
                if (text.includes(tag)) matchCount++;
            });
            if (matchCount > bestMatchCount) {
                bestMatchCount = matchCount;
                finalReply = record.response;
            }
        });

        // Small delay for natural feel
        setTimeout(() => appendMessage(finalReply, 'bot'), 300);
    }

    sendBtn.addEventListener('click', handleChat);
    userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleChat(); });
});

// ── FAQ ACCORDION ──
function toggleFaq(trigger) {
  const item = trigger.closest('.faq-item');
  const isOpen = item.classList.contains('open');
  // Close all
  document.querySelectorAll('.faq-item.open').forEach(i => {
    i.classList.remove('open');
    i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
  });
  // Open clicked (if it was closed)
  if (!isOpen) {
    item.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }
}

// ═══════════════════════════════════════════════════
// AUTH MODAL LOGIC
// All views already exist in the DOM (hidden via CSS display:none).
// This script only toggles which one is visible — no page navigation,
// no separate login.html. Supabase calls are marked clearly below.
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('authOverlay');
  const closeBtn = document.getElementById('authClose');
  const views = document.querySelectorAll('.auth-view');

  // Keep email between forgot-password steps without re-typing
  let resetFlowEmail = '';

  // ── Open / close modal ──
  function openAuth(viewName = 'login') {
    overlay.classList.add('active');
    showView(viewName);
    document.body.style.overflow = 'hidden';
  }
  function closeAuth() {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Any element with data-open-auth="login" / "signup" opens the modal on that view
  document.querySelectorAll('[data-open-auth]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openAuth(el.dataset.openAuth);
    });
  });

  closeBtn.addEventListener('click', closeAuth);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAuth(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('active')) closeAuth(); });

  // ── Switch between views inside the modal ──
  function showView(name) {
    views.forEach(v => v.classList.toggle('active', v.dataset.view === name));
    clearErrors();
  }
  function clearErrors() {
    document.querySelectorAll('.auth-error').forEach(e => e.classList.remove('show'));
  }
  function showError(id, message) {
    const el = document.getElementById(id);
    if (message) el.textContent = message;
    el.classList.add('show');
  }

  // Any element with data-goto="viewname" switches views (back links, "Sign up" links, etc.)
  document.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => showView(el.dataset.goto));
  });

  // ── OTP box behavior: auto-advance + backspace + paste ──
  const otpBoxes = Array.from(document.querySelectorAll('.otp-box'));
  otpBoxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (box.value && otpBoxes[i + 1]) otpBoxes[i + 1].focus();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && otpBoxes[i - 1]) otpBoxes[i - 1].focus();
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const digits = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '').split('');
      digits.forEach((d, idx) => { if (otpBoxes[i + idx]) otpBoxes[i + idx].value = d; });
      const next = otpBoxes[i + digits.length] || otpBoxes[otpBoxes.length - 1];
      next.focus();
    });
  });
  function getOtpValue() {
    return otpBoxes.map(b => b.value).join('');
  }
  function clearOtp() {
    otpBoxes.forEach(b => b.value = '');
    otpBoxes[0].focus();
  }

  // ── LOGIN ──
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const btn = document.getElementById('loginSubmitBtn');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    btn.disabled = true; btn.textContent = 'Logging in...';

    if (!supabaseClient) {
      setTimeout(() => {
        btn.disabled = false; btn.textContent = 'Log In';
        showError('loginError', 'Supabase not configured yet — set SUPABASE_URL and SUPABASE_ANON_KEY at the top of this script.');
      }, 400);
      return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    btn.disabled = false; btn.textContent = 'Log In';
    if (error) { showError('loginError', error.message); return; }

    window.location.href = '/ventures/raptor/app/#/dashboard';
  });

  // ── SIGN UP ──
  document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const btn = document.getElementById('signupSubmitBtn');
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;

    btn.disabled = true; btn.textContent = 'Creating account...';

    if (!supabaseClient) {
      setTimeout(() => {
        btn.disabled = false; btn.textContent = 'Create Account';
        showError('signupError', 'Supabase not configured yet — set SUPABASE_URL and SUPABASE_ANON_KEY at the top of this script.');
      }, 400);
      return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
      email, password,
      options: {
        data: { full_name: name },
        // Only relevant if email confirmation is ON in Supabase --
        // this is where Supabase sends the user after they click the
        // confirmation link in their inbox. Must also be added to
        // Supabase → Authentication → URL Configuration → Redirect URLs.
        emailRedirectTo: window.location.origin + '/ventures/raptor/app/#/dashboard'
      }
    });
    btn.disabled = false; btn.textContent = 'Create Account';
    if (error) { showError('signupError', error.message); return; }

    // If Supabase returned a live session, email confirmation is OFF
    // for this project -- the account is immediately usable.
    if (data.session) {
      window.location.href = '/ventures/raptor/app/#/dashboard';
      return;
    }

    // Otherwise email confirmation is ON: no session yet, the account
    // exists but is unusable until the user clicks the link in their
    // inbox. Do NOT redirect to the dashboard here -- there is no
    // session, so it would just bounce straight back to login and
    // look broken. Tell the user to check their inbox instead.
    showError('signupError', '');
    document.getElementById('signupError').classList.remove('show');
    showView('login');
    showError('loginError', 'Account created — check your inbox to confirm your email before logging in.');
  });

  // ── GOOGLE OAUTH (login + signup buttons both call this) ──
  function googleAuth() {
    if (!supabaseClient) {
      console.warn('Supabase not configured yet — set SUPABASE_URL and SUPABASE_ANON_KEY at the top of this script.');
      return;
    }
    // redirectTo is explicit so the OAuth flow always lands on the
    // dashboard, regardless of what Site URL is configured (or
    // misconfigured) in the Supabase project settings. This must be
    // added to "Redirect URLs" in Supabase → Authentication → URL
    // Configuration, or Supabase will refuse the redirect.
    supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/ventures/raptor/app/#/dashboard' }
    });
  }
  document.getElementById('googleLoginBtn').addEventListener('click', googleAuth);
  document.getElementById('googleSignupBtn').addEventListener('click', googleAuth);

  // ── FORGOT PASSWORD — STEP 1: send OTP to email ──
  document.getElementById('forgotEmailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const btn = document.getElementById('forgotEmailSubmitBtn');
    const email = document.getElementById('forgotEmail').value.trim();

    btn.disabled = true; btn.textContent = 'Sending...';

    if (!supabaseClient) {
      setTimeout(() => {
        resetFlowEmail = email;
        document.getElementById('otpEmailDisplay').textContent = email;
        clearOtp();
        btn.disabled = false; btn.textContent = 'Send OTP';
        showView('forgot-otp');
      }, 400);
      return;
    }

    // IMPORTANT: signInWithOtp() is a PASSWORDLESS LOGIN mechanism --
    // verifying that OTP logs the user straight in with full account
    // access. Using it for "forgot password" means anyone who can read
    // the OTP from the inbox gets a full login, not a scoped permission
    // to set a new password. resetPasswordForEmail() is the correct,
    // narrower call: it issues an OTP whose only valid use is the
    // password-recovery flow (type: 'recovery' below).
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
    btn.disabled = false; btn.textContent = 'Send OTP';
    if (error) { showError('forgotEmailError', error.message); return; }

    resetFlowEmail = email;
    document.getElementById('otpEmailDisplay').textContent = email;
    clearOtp();
    showView('forgot-otp');
  });

  // ── FORGOT PASSWORD — STEP 2: verify OTP ──
  document.getElementById('otpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const btn = document.getElementById('otpSubmitBtn');
    const code = getOtpValue();

    if (code.length < 6) { showError('otpError', 'Please enter all 6 digits.'); return; }

    btn.disabled = true; btn.textContent = 'Verifying...';

    if (!supabaseClient) {
      setTimeout(() => {
        btn.disabled = false; btn.textContent = 'Verify Code';
        showView('forgot-newpass');
      }, 400);
      return;
    }

    const { data, error } = await supabaseClient.auth.verifyOtp({
      email: resetFlowEmail, token: code, type: 'recovery'
    });
    btn.disabled = false; btn.textContent = 'Verify Code';
    if (error) { showError('otpError', error.message); clearOtp(); return; }

    // data.session now lets the user call supabaseClient.auth.updateUser() below
    showView('forgot-newpass');
  });

  let resendCooldownActive = false;
  document.getElementById('resendOtpBtn').addEventListener('click', () => {
    if (resendCooldownActive) return; // simple client-side spam guard;
    // Supabase also rate-limits this server-side regardless.
    if (!supabaseClient) { console.warn('Supabase not configured yet.'); clearOtp(); return; }
    supabaseClient.auth.resetPasswordForEmail(resetFlowEmail);
    clearOtp();

    resendCooldownActive = true;
    const btn = document.getElementById('resendOtpBtn');
    const original = btn.textContent;
    let seconds = 30;
    btn.textContent = `Resend in ${seconds}s`;
    const interval = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(interval);
        btn.textContent = original;
        resendCooldownActive = false;
      } else {
        btn.textContent = `Resend in ${seconds}s`;
      }
    }, 1000);
  });

  // ── FORGOT PASSWORD — STEP 3: set new password, then reload ──
  document.getElementById('newPassForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const btn = document.getElementById('newPassSubmitBtn');
    const pass1 = document.getElementById('newPassword').value;
    const pass2 = document.getElementById('confirmPassword').value;

    if (pass1.length < 8 || pass1 !== pass2) {
      showError('newPassError', 'Passwords must match and be at least 8 characters.');
      return;
    }

    btn.disabled = true; btn.textContent = 'Updating...';

    if (!supabaseClient) {
      setTimeout(() => {
        showView('forgot-success');
        setTimeout(() => { window.location.reload(); }, 1500);
      }, 400);
      return;
    }

    const { error } = await supabaseClient.auth.updateUser({ password: pass1 });
    btn.disabled = false; btn.textContent = 'Update Password';
    if (error) { showError('newPassError', error.message); return; }

    showView('forgot-success');
    setTimeout(() => { window.location.reload(); }, 1500); // reload → user logs in fresh with new password
  });
});
