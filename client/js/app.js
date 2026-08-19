// =============================================
// app.js — Main Application Router
// =============================================

(async () => {

  // Initialize Theme and Lucide icons on load
  UI.Theme.init();
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // ---- Google OAuth SSO ----
  document.getElementById('google-sso-btn').addEventListener('click', async () => {
    const btn = document.getElementById('google-sso-btn');
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Redirecting…';
    try {
      const { error } = await window.supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/index.html',
          queryParams: {
            hd: 'g.cjc.edu.ph'   // restrict login to CJC Google Workspace domain
          }
        }
      });
      if (error) {
        const errEl = document.getElementById('login-error');
        errEl.textContent = 'Sign-in failed. Make sure you are using your official @g.cjc.edu.ph account.';
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Continue with CJC Google Account';
      }
      // On success, browser redirects — no else needed
    } catch (e) {
      const errEl = document.getElementById('login-error');
      errEl.textContent = 'Google sign-in unavailable. Try again later.';
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Continue with CJC Google Account';
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
