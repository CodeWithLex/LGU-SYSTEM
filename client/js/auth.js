// =============================================
// auth.js — Authentication Module
// =============================================

const Auth = (() => {

  async function login(email, password) {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function register(fullName, email, password, extra = {}) {
    const { data, error } = await window.supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, ...extra } },
    });
    if (error) throw error;
    return data;
  }

  async function logout() {
    await window.supabaseClient.auth.signOut();
  }

  async function getSession() {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    return session;
  }

  async function getProfile() {
    const session = await getSession();
    if (!session) return null;

    const { data } = await window.supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    return data;
  }

  async function loginWithGoogle() {
    const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          hd: 'g.cjc.edu.ph', // Enforces Cor Jesu College Google account selection
          prompt: 'select_account'
        }
      }
    });
    if (error) throw error;
    return data;
  }

  async function updateProfile(userId, updates) {
    const { data, error } = await window.supabaseClient
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updatePassword(password) {
    const { data, error } = await window.supabaseClient.auth.updateUser({ password });
    if (error) throw error;
    return data;
  }

  function onAuthChange(callback) {
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
      // Expose token globally so reports downloads can authenticate
      window._authToken = session?.access_token || null;
      callback(event, session);
    });
  }

  return { login, loginWithGoogle, register, logout, getSession, getProfile, updateProfile, updatePassword, onAuthChange };
})();


