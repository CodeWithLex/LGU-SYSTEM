// =============================================
// profile.js — User Account Profile & Settings Controller
// =============================================

const ProfileModal = (() => {
  let _currentProfile = null;
  let _currentSession = null;
  let _initialized = false;

  function init() {
    if (_initialized) return;
    _initialized = true;
    bindGlobalTriggers();
    bindTabs();
    bindForms();
  }

  function bindGlobalTriggers() {
    // Robust document-level event delegation for all profile opening triggers
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('#user-pill, #profile-settings-btn, #bottom-profile-btn, .mobile-profile-btn, [data-action="open-profile"]');
      if (trigger) {
        e.preventDefault();
        e.stopPropagation();
        open();
      }

      // Close triggers
      if (e.target.closest('#profile-modal-close') || e.target.closest('#profile-cancel-btn') || e.target.id === 'profile-modal-overlay') {
        e.preventDefault();
        close();
      }
    });

    // Keyboard trigger on user-pill
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) {
        close();
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.id === 'user-pill') {
        e.preventDefault();
        open();
      }
    });
  }

  function bindTabs() {
    document.addEventListener('click', (e) => {
      const tab = e.target.closest('.profile-tab-btn');
      if (!tab) return;
      
      const targetTab = tab.dataset.tab;
      document.querySelectorAll('.profile-tab-btn').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === targetTab);
      });
      document.querySelectorAll('.profile-tab-content').forEach(c => {
        c.classList.toggle('active', c.id === `profile-tab-${targetTab}`);
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
    if (!modal || !overlay) {
      console.warn('Profile modal elements not found in DOM');
      return;
    }

    // 1. Instantly show modal to user (Zero Lag)
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');

    // 2. Reset tabs
    document.querySelectorAll('.profile-tab-btn').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === defaultTab);
    });
    document.querySelectorAll('.profile-tab-content').forEach(c => {
      c.classList.toggle('active', c.id === `profile-tab-${defaultTab}`);
    });

    // 3. Clear feedbacks
    setFeedback('profile-general-feedback', '');
    setFeedback('profile-security-feedback', '');

    // 4. Pre-fill from current UI state immediately
    const curName = document.getElementById('user-name')?.textContent || '';
    if (curName && curName !== 'Loading...') {
      const nameInput = document.getElementById('profile-name-input');
      if (nameInput && !nameInput.value) nameInput.value = curName;
      const avatarEl = document.getElementById('profile-modal-avatar');
      if (avatarEl) avatarEl.textContent = curName[0].toUpperCase();
    }

    // 5. Asynchronously fetch latest profile from Supabase
    try {
      _currentSession = await Auth.getSession();
      _currentProfile = await Auth.getProfile();
      populateFields(_currentProfile, _currentSession);
    } catch (err) {
      console.error('Failed to load profile data:', err);
    }
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
      if (!_currentSession) {
        _currentSession = await Auth.getSession();
      }
      if (!_currentProfile && _currentSession) {
        _currentProfile = await Auth.getProfile();
      }

      const userId = _currentProfile?.id || _currentSession?.user?.id;
      if (!userId) throw new Error('User session not active');

      const updates = {
        full_name: fullName,
        course,
        year_level: yearLevel,
        enrollment_year: enrollmentYear,
      };

      const updated = await Auth.updateProfile(userId, updates);
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

      // Reload Units view if available
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
        saveBtn.innerHTML = `<iconify-icon icon="icon-park-outline:check"></iconify-icon> Save Changes`;
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

window.ProfileModal = ProfileModal;

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ProfileModal.init());
} else {
  ProfileModal.init();
}
