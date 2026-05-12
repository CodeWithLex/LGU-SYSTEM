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

    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    iconEl.textContent  = icons[type] || '✅';
    msgEl.textContent   = message;
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
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

  // ---- Admin-only elements ----
  function setAdminVisibility(isAdmin) {
    document.body.classList.toggle('is-admin', isAdmin);
    document.querySelectorAll('.admin-only').forEach(el => {
      if (isAdmin) el.classList.remove('hidden');
      else         el.classList.add('hidden');
    });
  }

  // ---- Loading / Empty states ----
  function setLoading(containerId, text = 'Loading…') {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `<div class="loading-state">${text}</div>`;
  }

  function setEmpty(containerId, icon = '📭', text = 'No data available.') {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">${icon}</span>
        <p>${text}</p>
      </div>`;
  }

  // ---- Theme Management ----
  const Theme = {
    init() {
      const saved = localStorage.getItem('theme') || 'dark';
      this.set(saved);
      
      const toggleBtn = document.getElementById('theme-toggle');
      if (toggleBtn) {
        toggleBtn.onclick = () => this.toggle();
      }
    },
    set(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      const icon = document.getElementById('theme-toggle-icon');
      if (icon) {
        icon.setAttribute('data-lucide', theme === 'dark' ? 'moon' : 'sun');
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
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

  return { showView, showScreen, toast, currency, dateStr, capitalize, setAdminVisibility, setLoading, setEmpty, Theme };
})();
