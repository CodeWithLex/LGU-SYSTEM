// =============================================
// auth.js — Authentication Module
// =============================================

const Auth = (() => {

  async function login(email, password) {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function register({ email, password, fullName, course, yearLevel }) {
    const { data, error } = await window.supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: 'student', course, year_level: yearLevel }
      }
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

  function onAuthChange(callback) {
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
      // Expose token globally so reports downloads can authenticate
      window._authToken = session?.access_token || null;
      callback(event, session);
    });
  }

  return { login, register, logout, getSession, getProfile, onAuthChange };
})();
