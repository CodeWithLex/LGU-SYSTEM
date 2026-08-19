// =============================================
// app.js — Main Application Router
// =============================================

(async () => {

  // Initialize Theme and Lucide icons on load
  UI.Theme.init();
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // ---- Auth Form Toggles ----
  document.getElementById('show-register').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('register-form').classList.add('active');
  });

  document.getElementById('show-login').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('register-form').classList.remove('active');
    document.getElementById('login-form').classList.add('active');
  });

  // ---- Google OAuth SSO ----
  document.getElementById('google-sso-btn').addEventListener('click', async () => {
    try {
      const { error } = await window.supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: { hd: 'g.cjc.edu.ph' }   // restrict to CJC domain
        }
      });
      if (error) UI.toast(error.message, 'error');
    } catch (e) {
      UI.toast('Google sign-in failed. Try email instead.', 'error');
    }
  });

  // ---- Login ----
  document.getElementById('login-btn').addEventListener('click', async () => {
    const errEl = document.getElementById('login-error');
    const btn   = document.getElementById('login-btn');
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;

    errEl.classList.add('hidden');

    if (!email || !pass) {
      errEl.textContent = 'Please enter your email and password.';
      errEl.classList.remove('hidden');
      return;
    }

    btn.textContent = 'Signing in…';
    btn.disabled = true;

    try {
      await Auth.login(email, pass);
    } catch (err) {
      if (err.message.includes('missing email or phone') || err.message.includes('phone')) {
        errEl.textContent = 'Please enter your email and password.';
      } else {
        errEl.textContent = err.message;
      }
      errEl.classList.remove('hidden');
    } finally {
      btn.textContent = 'Sign In with Email';
      btn.disabled = false;
    }
  });

  // Allow Enter key on login form
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });

  // ---- Register ----
  document.getElementById('register-btn').addEventListener('click', async () => {
    const errEl = document.getElementById('reg-error');
    const btn   = document.getElementById('register-btn');
    const email = document.getElementById('reg-email').value.trim();
    const pass  = document.getElementById('reg-password').value;
    const name  = document.getElementById('reg-name').value.trim();

    errEl.classList.add('hidden');

    // ---- Required fields ----
    if (!email || !pass || !name) {
      errEl.textContent = 'Please fill out all required fields.';
      errEl.classList.remove('hidden');
      return;
    }

    // ---- Domain gate ----
    if (!email.toLowerCase().endsWith('@g.cjc.edu.ph')) {
      errEl.textContent = 'Only @g.cjc.edu.ph accounts are allowed to register.';
      errEl.classList.remove('hidden');
      return;
    }

    btn.textContent = 'Creating account…';
    btn.disabled = true;

    try {
      await Auth.register({
        email,
        password:  pass,
        fullName:  name,
        course:    document.getElementById('reg-course').value,
        yearLevel: document.getElementById('reg-year').value
      });
      UI.toast('Account created! Check your CJC Gmail to confirm your email.', 'success');
      document.getElementById('register-form').classList.remove('active');
      document.getElementById('login-form').classList.add('active');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.textContent = 'Create Account';
      btn.disabled = false;
    }
  });

  // ---- Logout (sidebar + mobile bottom nav) ----
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await Auth.logout();
  });
  document.getElementById('bottom-logout-btn').addEventListener('click', async () => {
    await Auth.logout();
  });

  // ---- Auth State Observer ----
  Auth.onAuthChange(async (event, session) => {
    if (session) {
      await bootApp(session);
    } else {
      UI.showScreen('auth');
      Dashboard.destroy();
    }
  });

  // ---- Boot on existing session ----
  const session = await Auth.getSession();
  if (session) {
    await bootApp(session);
  } else {
    UI.showScreen('auth');
  }

  // ---- Navigation (sidebar + bottom nav) ----
  function navigateTo(view) {
    UI.showView(view);

    // Sync active class on both sidebar and bottom nav
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });

    if (view === 'dashboard')    Dashboard.load();
    if (view === 'events')       Events.load();
    if (view === 'transactions') Transactions.load();
    if (view === 'reports')      Reports.load();
    if (view === 'income') {
        Income.load();
        Income.bindForm();
    }
    if (view === 'admin')        Admin.init();
  }

  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
    item.addEventListener('click', async e => {
      if (item.dataset.view) {
        e.preventDefault();
        navigateTo(item.dataset.view);
      }
    });
  });

  Events.bindBackButton();

  // "+ New Event" button on events view goes to admin tab
  const createEvtBtn = document.getElementById('create-event-btn');
  if (createEvtBtn) {
    createEvtBtn.addEventListener('click', () => {
      UI.showView('admin');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('nav-admin').classList.add('active');
      Admin.init();
    });
  }

  // ---- Boot App ----
  async function bootApp(session) {
    // ---- Email confirmation gate ----
    if (!session.user.email_confirmed_at) {
      await Auth.logout();
      UI.showScreen('auth');
      const errEl = document.getElementById('login-error');
      errEl.textContent = 'Please confirm your email address before logging in. Check your CJC Gmail inbox.';
      errEl.classList.remove('hidden');
      return;
    }

    // Show splash screen during boot and record start time
    const splash = document.getElementById('splash-screen');
    const splashStart = Date.now();
    if (splash) {
      splash.style.opacity = '1';
      splash.style.visibility = 'visible';
      splash.classList.remove('hidden');
    }

    UI.showScreen('app');

    const profile = await Auth.getProfile();

    // Sidebar user info
    document.getElementById('user-name').textContent   = profile?.full_name || session.user.email;
    document.getElementById('user-role').textContent   = profile?.role === 'admin' ? '🛡 Admin' : '🎓 Student';
    document.getElementById('user-avatar').textContent = (profile?.full_name || session.user.email)[0].toUpperCase();

    UI.setAdminVisibility(profile?.role === 'admin');

    UI.showView('dashboard');
    await Dashboard.load();

    // Ensure splash stays visible for at least 1.2s to show off the animation smoothly
    const elapsed = Date.now() - splashStart;
    const minSplashDuration = 1200; 
    const hideDelay = Math.max(0, minSplashDuration - elapsed);

    setTimeout(() => {
      // 0.5s CSS transition handles the fade out
      if (splash) {
        splash.style.opacity = '0';
        splash.style.visibility = 'hidden';
        setTimeout(() => splash.classList.add('hidden'), 500);
      }
    }, hideDelay);
  }

})();
