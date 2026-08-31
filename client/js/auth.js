// =============================================
// auth.js - Authentication Module
// =============================================

const Auth = (() => {

  function client() {
    if (!window.supabaseClient) {
      throw new Error('Database connection not initialized. Please check your internet connection and refresh.');
    }
    return window.supabaseClient;
  }

  async function login(email, password) {
    const { data, error } = await client().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function register(fullName, email, password, extra = {}) {
    const { data, error } = await client().auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, ...extra } },
    });
    if (error) throw error;
    return data;
  }

  async function logout() {
    try { localStorage.removeItem('coe_pending_verification'); } catch {}
    if (window.supabaseClient?.auth) {
      await window.supabaseClient.auth.signOut();
    }
  }

  async function getSession() {
    if (!window.supabaseClient?.auth) return null;
    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      return session;
    } catch {
      return null;
    }
  }

  async function getProfile() {
    const session = await getSession();
    if (!session || !window.supabaseClient) return null;

    try {
      const { data } = await window.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      return data;
    } catch {
      return null;
    }
  }

  async function loginWithGoogle() {
    const sb = client();
    const redirectUrl = window.location.origin && window.location.origin !== 'null'
      ? (window.location.origin + window.location.pathname)
      : window.location.href.split('#')[0].split('?')[0];

    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          hd: 'g.cjc.edu.ph', // Enforces Cor Jesu College Google account selection
          prompt: 'select_account'
        }
      }
    });
    if (error) throw error;
    if (data?.url) {
      window.location.href = data.url;
    }
    return data;
  }

  async function updateProfile(userId, updates) {
    const { data, error } = await client()
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updatePassword(password) {
    const { data, error } = await client().auth.updateUser({ password });
    if (error) throw error;
    return data;
  }

  function onAuthChange(callback) {
    if (!window.supabaseClient?.auth) return;
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
      // Expose token globally so reports downloads can authenticate
      window._authToken = session?.access_token || null;
      callback(event, session);
    });
  }

  return { login, loginWithGoogle, register, logout, getSession, getProfile, updateProfile, updatePassword, onAuthChange };
})();


