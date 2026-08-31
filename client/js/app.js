// =============================================
// app.js - Main Application Router
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

  // ---- Google OAuth Sign-in Handlers ----
  const googleLoginBtn = document.getElementById('google-login-btn');
  const googleRegisterBtn = document.getElementById('google-register-btn');

  async function handleGoogleAuth(btn, errorElId) {
    const errEl = document.getElementById(errorElId);
    if (errEl) errEl.classList.add('hidden');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>Connecting to Google…</span>';
    btn.disabled = true;

    try {
      await Auth.loginWithGoogle();
      // Supabase redirects to Google OAuth flow
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Google sign-in failed. Please try again.';
        errEl.classList.remove('hidden');
      }
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => handleGoogleAuth(googleLoginBtn, 'login-error'));
  }
  if (googleRegisterBtn) {
    googleRegisterBtn.addEventListener('click', () => handleGoogleAuth(googleRegisterBtn, 'register-error'));
  }


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
      ['register-name', 'register-email', 'register-password', 'register-confirm', 'register-course', 'register-year', 'register-enrollment-year'].forEach(id => {
        const el = document.getElementById(id);
        if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
      });
      Dropdowns.syncAll();
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
    const enrollment_year = Number(document.getElementById('register-enrollment-year').value);
    const email = document.getElementById('register-email').value.trim();
    const pass = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;

    errEl.classList.add('hidden');

    if (!name || !course || !year || !enrollment_year || !email || !pass || !confirm) {
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

    // School-only registration - personal email accounts are rejected
    const schoolDomain = '@g.cjc.edu.ph';
    if (!email.toLowerCase().endsWith(schoolDomain)) {
      errEl.textContent = 'Only @g.cjc.edu.ph school accounts can register.';
      errEl.classList.remove('hidden');
      return;
    }

    btn.textContent = 'Registering…';
    btn.disabled = true;

    try {
      const data = await Auth.register(name, email, pass, { course, year_level: year, enrollment_year });
      if (data.session) {
        // Email confirmation disabled - session already active
        await bootApp(data.session);
      } else {
        // Confirmation email sent - return to login with a success message
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

  // ---- Custom animated dropdowns (shared component, see dropdown.js) ----
  // Auth & Onboarding selects
  ['register-course', 'register-year', 'register-enrollment-year', 'onboarding-course', 'onboarding-year', 'onboarding-enrollment-year'].forEach(id => {
    Dropdowns.bindDropdown(document.getElementById(id));
  });

  // Every other select in the logged-in app
  Dropdowns.bindAll('#app-screen');


  // ---- First-Time Onboarding Modal ----
  const onboardingModal = document.getElementById('onboarding-modal');
  const onboardingSubmitBtn = document.getElementById('onboarding-submit-btn');
  const onboardingError = document.getElementById('onboarding-error');

  function showOnboardingModal(user, profile) {
    if (!onboardingModal) return;
    const nameInput = document.getElementById('onboarding-name');
    if (nameInput) {
      nameInput.value = ''; // Empty so the placeholder 'COE Numbawan' is displayed
      nameInput.placeholder = 'COE Numbawan';
    }
    const courseSel = document.getElementById('onboarding-course');
    const yearSel = document.getElementById('onboarding-year');
    const enrollSel = document.getElementById('onboarding-enrollment-year');
    const passInput = document.getElementById('onboarding-password');
    const confirmInput = document.getElementById('onboarding-confirm');

    if (courseSel && profile?.course) courseSel.value = profile.course;
    if (yearSel && profile?.year_level) yearSel.value = profile.year_level;
    if (enrollSel && profile?.enrollment_year) enrollSel.value = profile.enrollment_year;
    if (passInput) passInput.value = '';
    if (confirmInput) confirmInput.value = '';

    Dropdowns.syncAll();
    onboardingModal.classList.remove('hidden');
  }

  if (onboardingSubmitBtn) {
    onboardingSubmitBtn.addEventListener('click', async () => {
      const name = document.getElementById('onboarding-name')?.value.trim();
      const course = document.getElementById('onboarding-course')?.value;
      const year = document.getElementById('onboarding-year')?.value;
      const enrollYear = document.getElementById('onboarding-enrollment-year')?.value;
      const pass = document.getElementById('onboarding-password')?.value;
      const confirm = document.getElementById('onboarding-confirm')?.value;

      onboardingError.classList.add('hidden');

      if (!name) {
        onboardingError.textContent = 'Please enter your Full Name.';
        onboardingError.classList.remove('hidden');
        return;
      }

      if (!course || !year || !enrollYear) {
        onboardingError.textContent = 'Please select your Engineering Program, Year Level, and Enrollment Year.';
        onboardingError.classList.remove('hidden');
        return;
      }

      if (pass || confirm) {
        if (!pass || pass.length < 8) {
          onboardingError.textContent = 'Password must be at least 8 characters long.';
          onboardingError.classList.remove('hidden');
          return;
        }
        if (pass !== confirm) {
          onboardingError.textContent = 'Passwords do not match.';
          onboardingError.classList.remove('hidden');
          return;
        }
      }

      onboardingSubmitBtn.disabled = true;
      const originalText = onboardingSubmitBtn.innerHTML;
      onboardingSubmitBtn.innerHTML = '<span>Saving Profile…</span>';

      try {
        const session = await Auth.getSession();
        if (!session?.user?.id) throw new Error('Session expired. Please sign in again.');

        await Auth.updateProfile(session.user.id, {
          full_name: name,
          course,
          year_level: year,
          enrollment_year: Number(enrollYear)
        });

        // Set/update account password if provided
        if (pass) {
          await Auth.updatePassword(pass);
        }

        // Update user display in sidebar immediately
        const displayName = name || session.user.email;
        document.getElementById('user-name').textContent   = displayName;
        document.getElementById('user-avatar').textContent = displayName[0].toUpperCase();

        // Dismiss modal smoothly
        onboardingModal.classList.add('modal-closing');
        setTimeout(() => {
          onboardingModal.classList.add('hidden');
          onboardingModal.classList.remove('modal-closing');
        }, 160);

        UI.toast('Profile & credentials setup complete! Welcome to COE Portal.', 'success');

        // Refresh units tracker if open
        if (window.Units && typeof Units.init === 'function') {
          Units.init();
        }
      } catch (err) {
        onboardingError.textContent = err.message || 'Failed to update profile. Please try again.';
        onboardingError.classList.remove('hidden');
      } finally {
        onboardingSubmitBtn.disabled = false;
        onboardingSubmitBtn.innerHTML = originalText;
      }
    });
  }


  // ---- Logout (sidebar + mobile headers + profile modal) ----
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await Auth.logout();
  });
  document.getElementById('app-mobile-logout-btn')?.addEventListener('click', async () => {
    await Auth.logout();
  });
  document.getElementById('bottom-logout-btn')?.addEventListener('click', async () => {
    await Auth.logout();
  });
  document.getElementById('profile-modal-logout-btn')?.addEventListener('click', async () => {
    const modal = document.getElementById('profile-modal');
    const overlay = document.getElementById('profile-modal-overlay');
    if (modal) modal.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
    await Auth.logout();
  });

  // ---- Theme Manager (Light / Dark Mode Toggle & Sync) ----
  const ThemeManager = {
    init() {
      const toggleBtn = document.getElementById('theme-toggle-btn');
      const ursaThemeBtn = document.getElementById('ursa-theme-btn');
      const profileThemeSelect = document.getElementById('profile-theme-select');

      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => this.toggleTheme());
      }
      if (ursaThemeBtn) {
        ursaThemeBtn.addEventListener('click', () => this.toggleTheme());
      }
      document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
        btn.addEventListener('click', () => this.toggleTheme());
      });
      if (profileThemeSelect) {
        profileThemeSelect.value = localStorage.getItem('theme') || 'dark';
        profileThemeSelect.addEventListener('change', (e) => {
          this.setTheme(e.target.value);
        });
      }

      this.updateUI();
    },

    setTheme(theme) {
      localStorage.setItem('theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
      if (typeof UI !== 'undefined' && UI.syncThemeColor) UI.syncThemeColor(theme);
      this.updateUI();
      // Dispatch a custom event to notify other components (e.g. Chart.js redraw in reports.js)
      window.dispatchEvent(new CustomEvent('themechanged', { detail: { theme } }));
    },

    toggleTheme() {
      const currentTheme = localStorage.getItem('theme') || 'dark';
      const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
      this.setTheme(targetTheme);
    },

    updateUI() {
      const currentTheme = localStorage.getItem('theme') || 'dark';
      const icon = currentTheme === 'dark' ? 'solar:sun-linear' : 'solar:moon-linear';
      const title = currentTheme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme';

      const themeIcon = document.getElementById('theme-icon');
      const themeBtn = document.getElementById('theme-toggle-btn');
      if (themeIcon) themeIcon.setAttribute('icon', icon);
      if (themeBtn) themeBtn.setAttribute('title', title);

      document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
        const iconEl = btn.querySelector('iconify-icon');
        if (iconEl) iconEl.setAttribute('icon', icon);
        btn.setAttribute('title', title);
      });

      const ursaThemeIcon = document.getElementById('ursa-theme-icon');
      const ursaThemeBtn = document.getElementById('ursa-theme-btn');
      if (ursaThemeIcon) ursaThemeIcon.setAttribute('icon', icon);
      if (ursaThemeBtn) ursaThemeBtn.setAttribute('title', title);

      const profileThemeSelect = document.getElementById('profile-theme-select');
      if (profileThemeSelect) profileThemeSelect.value = currentTheme;
    }
  };
  window.ThemeManager = ThemeManager; // Expose globally for profile.js access
  ThemeManager.init();


  let _bootedUserId = null;

  // ---- Auth State Observer ----
  Auth.onAuthChange(async (event, session) => {
    if (session) {
      // Ignore background token refresh or window refocus events if already booted
      if (_bootedUserId === session.user.id) {
        return;
      }
      _bootedUserId = session.user.id;
      await bootApp(session);
    } else {
      _bootedUserId = null;
      // Fresh login should start at the dashboard, not a stale last view
      try { sessionStorage.removeItem('lastView'); } catch { /* storage unavailable */ }
      UI.showScreen('auth');
      Dashboard.destroy();
    }
  });

  // ---- Boot on existing session ----
  const session = await Auth.getSession();
  if (session) {
    if (_bootedUserId !== session.user.id) {
      _bootedUserId = session.user.id;
      await bootApp(session);
    }
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

  // Expose navigateTo globally for modular triggers (e.g. dashboard cards, quick links)
  window.navigateTo = navigateTo;

  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
    item.addEventListener('click', async e => {
      if (item.dataset.view) {
        e.preventDefault();
        navigateTo(item.dataset.view);
      }
    });
  });

  // Global [data-nav] delegate handler for springboards
  document.addEventListener('click', e => {
    const navEl = e.target.closest('[data-nav]');
    if (navEl && navEl.dataset.nav) {
      // Don't intercept if clicking an actual anchor with an href to another page
      if (navEl.tagName === 'A' && navEl.getAttribute('href') && !navEl.getAttribute('href').startsWith('#')) return;
      e.preventDefault();
      navigateTo(navEl.dataset.nav);
    }
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

    // Determine the view to restore on a refresh, so the splash skeleton
    // already matches it before the splash is revealed.
    let saved = null;
    try { saved = sessionStorage.getItem('lastView'); } catch { /* storage unavailable */ }

    // Show splash screen during boot and record start time
    const splash = document.getElementById('splash-screen');
    const splashStart = Date.now();
    if (splash) {
      UI.setSplashView(saved && document.getElementById(`view-${saved}`) ? saved : 'dashboard');
      splash.style.opacity = '1';
      splash.style.visibility = 'visible';
      splash.classList.remove('hidden');
    }

    UI.showScreen('app');

    const profile = await Auth.getProfile();

    // Check if First-Time Onboarding is required (e.g. new Google OAuth signup)
    if (profile && profile.role !== 'admin' && (!profile.course || !profile.year_level || !profile.enrollment_year)) {
      showOnboardingModal(session.user, profile);
    }

    // Sidebar & Mobile Header user info
    const displayName = profile?.full_name || session.user.email;
    const roleLabels  = { admin: 'Administrator', governor: 'Governor', cashier: 'Cashier', officer: 'Officer', student: 'Student' };
    const roleKey     = profile?.role || 'student';
    const roleLabel   = roleLabels[roleKey] || UI.capitalize(roleKey);
    const officerRole = ['admin', 'governor', 'cashier', 'officer'].includes(roleKey);

    document.getElementById('user-name').textContent   = displayName;
    document.getElementById('user-role').textContent   = roleLabel;

    const mobileRoleBadge = document.getElementById('mobile-user-role-badge');
    if (mobileRoleBadge) {
      mobileRoleBadge.textContent = roleLabel;
      mobileRoleBadge.className = `role-badge role-${roleKey}`;
    }

    UI.setAdminVisibility(profile?.role === 'admin');
    UI.setOfficerVisibility(officerRole);
    
    if (window.ProfileModal) {
      ProfileModal.init();
      ProfileModal.syncAvatars(profile?.avatar_url, displayName);
    } else {
      document.getElementById('user-avatar').textContent = displayName[0].toUpperCase();
      const mobileAvatar = document.getElementById('mobile-user-avatar');
      if (mobileAvatar) mobileAvatar.textContent = displayName[0].toUpperCase();
    }

    if (window.GrizzAI) {
      GrizzAI.init();
    } else if (window.UrsaAI) {
      UrsaAI.init();
    }

    // Return the user to the view they were last on instead of resetting to
    // the dashboard. Fall back to the dashboard when nothing is saved, the
    // view no longer exists, or a non-admin somehow saved 'admin'.
    const isAdmin = profile?.role === 'admin';
    const target = saved
      && document.getElementById(`view-${saved}`)
      && (saved !== 'admin' || isAdmin)
      ? saved : 'dashboard';
    navigateTo(target);

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

    // Schedule background pre-fetching AFTER the splash is completely hidden
    // so the initial active view loads at full speed without network competition
    setTimeout(() => {
      if (typeof Api.prefetchAll === 'function') {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => Api.prefetchAll(profile?.role, profile?.course));
        } else {
          Api.prefetchAll(profile?.role, profile?.course);
        }
      }
    }, hideDelay + 600);
  }

})();
