// =============================================
// ui.js - Shared UI Utilities
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

    // Remember the last navigable view so a page refresh returns the user
    // here instead of resetting to the dashboard. Sub-views that need their
    // own state (e.g. event-detail) are not stored.
    const NAV_VIEWS = ['dashboard', 'events', 'transactions', 'income', 'reports', 'units', 'admin'];
    if (NAV_VIEWS.includes(viewId)) {
      try { sessionStorage.setItem('lastView', viewId); } catch { /* storage unavailable */ }
    }
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

  // Shape the boot splash skeleton to match the view being loaded, so a
  // refresh on Units doesn't show a dashboard-shaped skeleton.
  function setSplashView(view) {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    const shape = view === 'units'
      ? 'units'
      : (['events', 'transactions', 'income', 'admin'].includes(view) ? 'list' : 'default');
    splash.classList.remove('splash-view-units', 'splash-view-list', 'splash-view-default');
    splash.classList.add(`splash-view-${shape}`);
  }

  // ---- Toast Notifications ----
  let toastTimer = null;

  function toast(message, type = 'success') {
    const toastEl  = document.getElementById('toast');
    const iconEl   = document.getElementById('toast-icon');
    const msgEl    = document.getElementById('toast-message');

    const icons = { 
      success: 'solar:check-circle-linear', 
      error: 'solar:close-circle-linear', 
      info: 'solar:info-circle-linear', 
      warning: 'solar:danger-triangle-linear' 
    };
    
    const iconName = icons[type] || 'solar:check-circle-linear';
    iconEl.innerHTML = `<iconify-icon icon="${iconName}" style="font-size:18px;"></iconify-icon>`;
    msgEl.textContent = message;
    
    toastEl.classList.remove('hidden');

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
    if (!dateString) return '-';
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
  }

  function setOfficerVisibility(isOfficer) {
    document.body.classList.toggle('is-officer', isOfficer);
    document.querySelectorAll('.officer-only').forEach(el => {
      el.classList.toggle('hidden', !isOfficer);
    });
    document.querySelectorAll('.student-only').forEach(el => {
      el.classList.toggle('hidden', isOfficer);
    });
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

  function setEmpty(containerId, icon = 'solar:box-minimalistic-linear', text = 'No data available.') {
    const el = document.getElementById(containerId);
    if (el) {
      const iconAttr = icon.includes(':') ? icon : `solar:${icon}-linear`;
      el.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon"><iconify-icon icon="${iconAttr}"></iconify-icon></span>
          <p>${text}</p>
        </div>`;
    }
  }

  return { showView, showScreen, setSplashView, toast, currency, dateStr, capitalize, renderStatusBadge, setAdminVisibility, setOfficerVisibility, setLoading, setEmpty };
})();
