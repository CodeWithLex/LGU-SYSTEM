// =============================================
// profile.js — User Account Profile & Settings Controller
// =============================================

const ProfileModal = (() => {
  let _currentProfile = null;
  let _currentSession = null;

  function init() {
    bindTriggers();
    bindTabs();
    bindForms();
  }

  function bindTriggers() {
    // Desktop triggers
    const userPill = document.getElementById('user-pill');
    if (userPill) {
      userPill.addEventListener('click', () => open());
      userPill.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    }

    const settingsBtn = document.getElementById('profile-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        open();
      });
    }

    // Mobile triggers
    const bottomProfileBtn = document.getElementById('bottom-profile-btn');
    if (bottomProfileBtn) {
      bottomProfileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        open();
      });
    }

    document.querySelectorAll('.mobile-profile-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        open();
      });
    });

    // Close buttons & overlay
    const overlay = document.getElementById('profile-modal-overlay');
    const closeBtn = document.getElementById('profile-modal-close');
    const cancelBtn = document.getElementById('profile-cancel-btn');

    if (overlay) overlay.addEventListener('click', () => close());
    if (closeBtn) closeBtn.addEventListener('click', () => close());
    if (cancelBtn) cancelBtn.addEventListener('click', () => close());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) {
        close();
      }
    });
  }

  function bindTabs() {
    const tabs = document.querySelectorAll('.profile-tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === targetTab));
        document.querySelectorAll('.profile-tab-content').forEach(c => {
          c.classList.toggle('active', c.id === `profile-tab-${targetTab}`);
        });
      });
    });
  }

  function bindForms() {
    // 1. General Info Form
    const generalForm = document.getElementById('profile-general-form');
    if (generalForm) {
      generalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveGeneralProfile();
      });
    }

    // 2. Security / Password Form
    const securityForm = document.getElementById('profile-security-form');
    if (securityForm) {
      securityForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await savePassword();
      });
    }
  }

  async function open(defaultTab = 'general') {
    const modal = document.getElementById('profile-modal');
    const overlay = document.getElementById('profile-modal-overlay');
    if (!modal || !overlay) return;

    // Reset tabs
    document.querySelectorAll('.profile-tab-btn').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === defaultTab);
    });
    document.querySelectorAll('.profile-tab-content').forEach(c => {
      c.classList.toggle('active', c.id === `profile-tab-${defaultTab}`);
    });

    // Clear feedbacks
    setFeedback('profile-general-feedback', '');
    setFeedback('profile-security-feedback', '');

    // Fetch and populate fresh data
    try {
      _currentSession = await Auth.getSession();
      _currentProfile = await Auth.getProfile();
      populateFields(_currentProfile, _currentSession);
    } catch (err) {
      console.error('Failed to load profile data:', err);
    }

    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }

  function close() {
    const modal = document.getElementById('profile-modal');
    const overlay = document.getElementById('profile-modal-overlay');
    if (modal) modal.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  function isOpen() {
    const modal = document.getElementById('profile-modal');
    return modal && !modal.classList.contains('hidden');
  }

  function populateFields(profile, session) {
    if (!profile && !session) return;

    const email = profile?.email || session?.user?.email || '';
    const fullName = profile?.full_name || '';
    const course = profile?.course || 'BSCoE';
    const yearLevel = String(profile?.year_level || '1');
    const enrollmentYear = profile?.enrollment_year || new Date().getFullYear();
    const role = profile?.role === 'admin' ? 'Administrator' : 'Student Member';
    const avatarLetter = (fullName || email || '?')[0].toUpperCase();

    // Headers & Identifiers
    const avatarEl = document.getElementById('profile-modal-avatar');
    const emailEl = document.getElementById('profile-modal-email');
    const secEmailEl = document.getElementById('profile-security-email');
    const roleEl = document.getElementById('profile-role-display');

    if (avatarEl) avatarEl.textContent = avatarLetter;
    if (emailEl) emailEl.textContent = email;
    if (secEmailEl) secEmailEl.textContent = email;
    if (roleEl) {
      roleEl.textContent = role;
      roleEl.className = `role-badge ${profile?.role === 'admin' ? 'role-admin' : 'role-student'}`;
    }

    // Input fields
    const nameInput = document.getElementById('profile-name-input');
    const courseSelect = document.getElementById('profile-course-select');
    const yearSelect = document.getElementById('profile-year-select');
    const enrollInput = document.getElementById('profile-enrollment-year');

    if (nameInput) nameInput.value = fullName;
    if (courseSelect) courseSelect.value = course;
    if (yearSelect) yearSelect.value = yearLevel;
    if (enrollInput) enrollInput.value = enrollmentYear;

    // Reset password inputs
    const newPass = document.getElementById('profile-new-password');
    const confPass = document.getElementById('profile-confirm-password');
    if (newPass) newPass.value = '';
    if (confPass) confPass.value = '';
  }

  async function saveGeneralProfile() {
    if (!_currentProfile || !_currentSession) return;

    const nameInput = document.getElementById('profile-name-input');
    const courseSelect = document.getElementById('profile-course-select');
    const yearSelect = document.getElementById('profile-year-select');
    const enrollInput = document.getElementById('profile-enrollment-year');
    const saveBtn = document.getElementById('profile-save-general-btn');

    const fullName = nameInput ? nameInput.value.trim() : '';
    const course = courseSelect ? courseSelect.value : 'BSCoE';
    const yearLevel = yearSelect ? yearSelect.value : '1';
    const enrollmentYear = enrollInput && enrollInput.value ? Number(enrollInput.value) : null;

    if (!fullName) {
      setFeedback('profile-general-feedback', 'Please enter your full name.', 'error');
      return;
    }

    setFeedback('profile-general-feedback', '');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<iconify-icon icon="icon-park-outline:loading" class="spin-icon"></iconify-icon> Saving…`;
    }

    try {
      const updates = {
        full_name: fullName,
        course,
        year_level: yearLevel,
        enrollment_year: enrollmentYear,
      };

      const updated = await Auth.updateProfile(_currentProfile.id, updates);
      _currentProfile = updated;

      // Update UI elements in DOM
      const userNameEl = document.getElementById('user-name');
      const userAvatarEl = document.getElementById('user-avatar');
      const mobileAvatarEl = document.getElementById('mobile-user-avatar');

      if (userNameEl) userNameEl.textContent = updated.full_name;
      if (userAvatarEl) userAvatarEl.textContent = updated.full_name[0].toUpperCase();
      if (mobileAvatarEl) mobileAvatarEl.textContent = updated.full_name[0].toUpperCase();

      // Invalidate units cache so the credit tracker reloads for new course/year if changed
      if (typeof Api !== 'undefined' && Api.invalidateCache) {
        Api.invalidateCache('/units/my');
        Api.invalidateCache('/units/checklists');
      }

      // Reload Units & Dashboard views if active
      if (typeof Units !== 'undefined' && Units.load) {
        Units.load();
      }

      UI.toast('Account profile updated successfully!', 'success');
      close();
    } catch (err) {
      console.error('Profile update failed:', err);
      setFeedback('profile-general-feedback', err.message || 'Failed to update profile.', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<iconify-icon icon="icon-park-outline:check"></iconify-icon> Save Profile`;
      }
    }
  }

  async function savePassword() {
    const newPassEl = document.getElementById('profile-new-password');
    const confPassEl = document.getElementById('profile-confirm-password');
    const saveBtn = document.getElementById('profile-save-security-btn');

    const newPassword = newPassEl ? newPassEl.value : '';
    const confirmPassword = confPassEl ? confPassEl.value : '';

    if (!newPassword || newPassword.length < 8) {
      setFeedback('profile-security-feedback', 'Password must be at least 8 characters long.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback('profile-security-feedback', 'Passwords do not match.', 'error');
      return;
    }

    setFeedback('profile-security-feedback', '');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<iconify-icon icon="icon-park-outline:loading" class="spin-icon"></iconify-icon> Updating…`;
    }

    try {
      await Auth.updatePassword(newPassword);
      UI.toast('Security password updated successfully!', 'success');
      if (newPassEl) newPassEl.value = '';
      if (confPassEl) confPassEl.value = '';
      close();
    } catch (err) {
      console.error('Password update failed:', err);
      setFeedback('profile-security-feedback', err.message || 'Failed to update password.', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<iconify-icon icon="icon-park-outline:lock"></iconify-icon> Update Password`;
      }
    }
  }

  function setFeedback(elementId, message, type = 'info') {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (!message) {
      el.textContent = '';
      el.classList.add('hidden');
      el.className = 'profile-feedback hidden';
      return;
    }
    el.textContent = message;
    el.className = `profile-feedback profile-feedback--${type}`;
    el.classList.remove('hidden');
  }

  return { init, open, close, populateFields };
})();
