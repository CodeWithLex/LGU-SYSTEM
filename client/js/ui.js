// =============================================
// ui.js — Shared UI Utilities
// =============================================

const UI = (() => {

  // ---- Navigation ----
  function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const view = document.getElementById(`view-${viewId}`);
    const nav  = document.getElementById(`nav-${viewId}`);

    if (view) view.classList.add('active');
    if (nav)  nav.classList.add('active');

    // Re-render Lucide icons in case this view has dynamic content
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(`${screenId}-screen`);
    if (screen) screen.classList.add('active');

    // If switching to auth, strip all admin privileges and app state
    if (screenId === 'auth') {
      setAdminVisibility(false);
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    }

    // Show bottom nav only when app is active (mobile only via CSS)
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) bottomNav.classList.toggle('visible', screenId === 'app');
  }

  // ---- Toast Notifications ----
  let toastTimer = null;

  function toast(message, type = 'success') {
    const toastEl  = document.getElementById('toast');
    const iconEl   = document.getElementById('toast-icon');
    const msgEl    = document.getElementById('toast-message');

    const icons = { 
      success: 'check-circle', 
      error: 'x-circle', 
      info: 'info', 
      warning: 'alert-triangle' 
    };
    
    const iconName = icons[type] || 'check-circle';
    iconEl.innerHTML = `<i data-lucide="${iconName}" style="width:18px;height:18px;"></i>`;
    msgEl.textContent = message;
    
    toastEl.classList.remove('hidden');

    if (typeof lucide !== 'undefined') lucide.createIcons();

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 3500);
  }

  // ---- Formatters ----
  function currency(amount) {
    return '₱' + Number(amount || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function dateStr(dateString) {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

  function renderStatusBadge(type) {
    const cleanType = type.toLowerCase();
    return `<span class="status-badge"><span class="status-dot status-dot--${cleanType}"></span><span class="status-label">${capitalize(cleanType)}</span></span>`;
  }

  // ---- Admin-only elements ----
  function setAdminVisibility(isAdmin) {
    document.body.classList.toggle('is-admin', isAdmin);
    
    // Explicitly hide/show all protected elements
    document.querySelectorAll('.admin-only').forEach(el => {
      if (isAdmin) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
        // If an unauthorized user is currently looking at a protected view, kick them to dashboard
        if (el.classList.contains('view') && el.classList.contains('active')) {
          showView('dashboard');
        }
      }
    });

    // Re-render icons for any newly shown/hidden elements
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // ---- Loading / Empty states ----
  function setLoading(containerId, text = 'Loading…') {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `
      <div class="skeleton-stack" role="status" aria-label="${text}">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line short"></div>
        <div class="skeleton skeleton-line"></div>
      </div>`;
  }

  function setEmpty(containerId, icon = 'inbox', text = 'No data available.') {
    const el = document.getElementById(containerId);
    if (el) {
      el.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon"><i data-lucide="${icon}"></i></span>
          <p>${text}</p>
        </div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  // ---- Theme Management ----
  const Theme = {
    init() {
      const saved = localStorage.getItem('theme') || 'dark';
      this.set(saved);
      
      const toggles = document.querySelectorAll('#theme-toggle, #bottom-theme-toggle');
      toggles.forEach(t => {
        t.onclick = (e) => {
          e.preventDefault();
          this.toggle();
        };
      });
    },
    set(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      
      const icons = document.querySelectorAll('#theme-toggle-icon, .theme-toggle-icon');
      icons.forEach(icon => {
        icon.setAttribute('data-lucide', theme === 'dark' ? 'moon' : 'sun');
      });
      
      if (typeof lucide !== 'undefined') lucide.createIcons();
    },
    toggle() {
      document.body.classList.add('theme-transitioning');
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      this.set(current === 'dark' ? 'light' : 'dark');
      
      setTimeout(() => {
        document.body.classList.remove('theme-transitioning');
      }, 500);
    }
  };

  return { showView, showScreen, toast, currency, dateStr, capitalize, renderStatusBadge, setAdminVisibility, setLoading, setEmpty, Theme };
})();
