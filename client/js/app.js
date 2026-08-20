// =============================================
// app.js — Main Application Router
// =============================================

(async () => {

  // Initialize Lucide icons on load
// Reveal the brand-panel artwork only after its PNG has finished loading,
  // so the fade-in always covers the moment it becomes visible.
  const brandPanel = document.querySelector('.auth-brand-panel');
  if (brandPanel) {
    const pattern = new Image();
    pattern.onload = pattern.onerror = () => brandPanel.classList.add('brand-pattern-ready');
    pattern.src = 'assets/bg-pattern-front.png';
  }

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
      btn.textContent = 'Sign In';
      btn.disabled = false;
    }
  });

  // Allow Enter key on login form
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });

  // ---- Toggle between Sign in / Register ----
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const switchBtn = document.getElementById('auth-switch-btn');
  const switchHint = document.getElementById('auth-switch-hint');

  function showAuthForm(which) {
    const toLogin = which === 'login';
    loginForm.classList.toggle('active', toLogin);
    registerForm.classList.toggle('active', !toLogin);
    switchHint.textContent = toLogin ? "Don't have an account?" : 'Already have an account?';
    switchBtn.textContent = toLogin ? 'Register' : 'Sign in';
    // Clear stale messages and reset register fields when switching
    const loginErr = document.getElementById('login-error');
    loginErr.classList.remove('auth-success');
    loginErr.classList.add('auth-error');
    loginErr.classList.add('hidden');
    document.getElementById('register-error').classList.add('hidden');
    if (!toLogin) {
      ['register-name', 'register-email', 'register-password', 'register-confirm', 'register-course', 'register-year'].forEach(id => {
        const el = document.getElementById(id);
        if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
      });
      dropdowns.forEach(d => d.sync());
    }
  }

  switchBtn.addEventListener('click', () => {
    showAuthForm(loginForm.classList.contains('active') ? 'register' : 'login');
  });

  // ---- Register ----
  document.getElementById('register-btn').addEventListener('click', async () => {
    const errEl = document.getElementById('register-error');
    const btn = document.getElementById('register-btn');
    const name = document.getElementById('register-name').value.trim();
    const course = document.getElementById('register-course').value;
    const year = document.getElementById('register-year').value;
    const email = document.getElementById('register-email').value.trim();
    const pass = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;

    errEl.classList.add('hidden');

    if (!name || !course || !year || !email || !pass || !confirm) {
      errEl.textContent = 'Please fill in all fields.';
      errEl.classList.remove('hidden');
      return;
    }
    if (pass.length < 8) {
      errEl.textContent = 'Password must be at least 8 characters long.';
      errEl.classList.remove('hidden');
      return;
    }
    if (pass !== confirm) {
      errEl.textContent = 'Passwords do not match.';
      errEl.classList.remove('hidden');
      return;
    }

    // School-only registration — personal email accounts are rejected
    const schoolDomain = '@g.cjc.edu.ph';
    if (!email.toLowerCase().endsWith(schoolDomain)) {
      errEl.textContent = 'Only @g.cjc.edu.ph school accounts can register.';
      errEl.classList.remove('hidden');
      return;
    }

    btn.textContent = 'Registering…';
    btn.disabled = true;

    try {
      const data = await Auth.register(name, email, pass, { course, year_level: year });
      if (data.session) {
        // Email confirmation disabled — session already active
        await bootApp(data.session);
      } else {
        // Confirmation email sent — return to login with a success message
        showAuthForm('login');
        const loginErr = document.getElementById('login-error');
        loginErr.classList.remove('auth-error');
        loginErr.classList.add('auth-success');
        loginErr.textContent = 'Account created! Please confirm your email address before signing in.';
        loginErr.classList.remove('hidden');
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.textContent = 'Register';
      btn.disabled = false;
    }
  });

  // Allow Enter key on register form
  ['register-password', 'register-confirm'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('register-btn').click();
    });
  });

  // ---- Custom animated dropdowns ----
  // Replaces a native <select> with an animating listbox while keeping the
  // original <select> in the DOM (hidden) as the single source of truth, so
  // existing submit handlers, change listeners, and form resets keep working
  // unchanged. The menu is rebuilt on every open, so selects whose options are
  // populated dynamically (event pickers, transfer source/target) always show
  // the current option set.
  const dropdowns = [];

  function bindDropdown(select) {
    if (!select || select.dataset.ddBound) return;
    select.dataset.ddBound = '1';

    const wrap = select.closest('.input-icon-wrap');
    const dd = document.createElement('div');
    dd.className = 'dd' + (wrap ? '' : ' dd-system');
    // Filter-bar selects size themselves via inline min-width; carry it over
    if (!wrap && select.style.minWidth) dd.style.minWidth = select.style.minWidth;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'dd-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'dd-label';

    const chevron = document.createElement('i');
    chevron.innerHTML = '<iconify-icon icon="icon-park-outline:down"></iconify-icon>';
    chevron.className = 'dd-chevron';

    trigger.append(label, chevron);

    const menu = document.createElement('ul');
    menu.className = 'dd-menu';
    menu.setAttribute('role', 'listbox');

    function buildMenu() {
      menu.innerHTML = '';
      [...select.options].forEach((opt, i) => {
        const li = document.createElement('li');
        li.textContent = opt.text;
        if (opt.style?.color) li.style.color = opt.style.color;
        li.dataset.index = i;
        li.setAttribute('role', 'option');
        li.addEventListener('click', () => {
          // Disabled placeholder option — clicking it just dismisses the menu
          if (opt.disabled) { close(); return; }
          select.selectedIndex = i;
          sync();
          markSelected();
          select.dispatchEvent(new Event('change', { bubbles: true }));
          close();
        });
        menu.appendChild(li);
      });
    }

    // Clicking the menu's empty padding dismisses it instead of reaching a
    // covered field below, so a stray click can't accidentally pick an option.
    menu.addEventListener('click', e => {
      if (e.target === menu) close();
    });

    function sync() {
      const opt = select.options[select.selectedIndex];
      const hasValue = opt && opt.value;
      label.textContent = hasValue ? opt.text : select.options[0].text;
      label.classList.toggle('dd-placeholder', !hasValue);
    }

    function markSelected() {
      menu.querySelectorAll('li').forEach(li => {
        li.classList.toggle('dd-selected', Number(li.dataset.index) === select.selectedIndex);
      });
    }

    function open() {
      buildMenu(); // rebuild so dynamically-added options appear
      dd.classList.add('dd-open');
      trigger.setAttribute('aria-expanded', 'true');
      markSelected();
    }

    function close() {
      dd.classList.remove('dd-open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    function pick(index) {
      if (index >= 0 && index < select.options.length) {
        select.selectedIndex = index;
        sync();
        markSelected();
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    trigger.addEventListener('click', e => {
      // No stopPropagation: letting this bubble to the document-level
      // listener closes any other open dropdown, so menus never overlap.
      if (dd.classList.contains('dd-open')) close();
      else open();
    });

    trigger.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(); trigger.focus(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        pick(select.selectedIndex + (e.key === 'ArrowDown' ? 1 : -1));
      }
    });

    document.addEventListener('click', e => {
      if (!dd.contains(e.target)) close();
    });

    dd.append(trigger, menu);
    if (wrap) wrap.insertBefore(dd, select);
    else select.parentNode.insertBefore(dd, select);
    select.style.display = 'none';
    wrap?.querySelector('.input-icon-right')?.remove();

    sync();
    // Keep the label truthful when a form reset clears the hidden select.
    const form = select.closest('form');
    if (form) form.addEventListener('reset', sync);

    dropdowns.push({ sync });
  }

  // Register form selects (have a left input icon + custom chevron in the wrap)
  ['register-course', 'register-year'].forEach(id => bindDropdown(document.getElementById(id)));

  // Every other select in the logged-in app
  document.querySelectorAll('#app-screen select').forEach(bindDropdown);

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
    if (view === 'units')       Units.load();
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
    document.getElementById('user-role').textContent   = profile?.role === 'admin' ? 'Admin' : 'Student';
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
