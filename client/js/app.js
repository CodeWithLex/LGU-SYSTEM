// =============================================
// app.js — Main Application Router
// =============================================

(async () => {

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

  // ---- Login ----
  document.getElementById('login-btn').addEventListener('click', async () => {
    const errEl = document.getElementById('login-error');
    const btn   = document.getElementById('login-btn');
    errEl.classList.add('hidden');
    btn.textContent = 'Signing in…';
    btn.disabled = true;

    try {
      await Auth.login(
        document.getElementById('login-email').value,
        document.getElementById('login-password').value
      );
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.textContent = 'Sign In';
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
    errEl.classList.add('hidden');
    btn.textContent = 'Creating account…';
    btn.disabled = true;

    try {
      await Auth.register({
        email:     document.getElementById('reg-email').value,
        password:  document.getElementById('reg-password').value,
        fullName:  document.getElementById('reg-name').value,
        course:    document.getElementById('reg-course').value,
        yearLevel: document.getElementById('reg-year').value
      });
      UI.toast('Account created! Check your email to confirm.', 'success');
      // Switch back to login
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

  // ---- Logout ----
  document.getElementById('logout-btn').addEventListener('click', async () => {
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
    if (view === 'admin')        Admin.init();
  }

  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
    item.addEventListener('click', async e => {
      e.preventDefault();
      navigateTo(item.dataset.view);
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
    UI.showScreen('app');

    const profile = await Auth.getProfile();

    // Sidebar user info
    document.getElementById('user-name').textContent  = profile?.full_name || session.user.email;
    document.getElementById('user-role').textContent  = profile?.role === 'admin' ? '🛡 Admin' : '🎓 Student';
    document.getElementById('user-avatar').textContent = (profile?.full_name || session.user.email)[0].toUpperCase();

    UI.setAdminVisibility(profile?.role === 'admin');

    UI.showView('dashboard');
    await Dashboard.load();
  }

})();
