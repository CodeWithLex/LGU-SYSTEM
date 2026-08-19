// =============================================
// config.js — Supabase Client Configuration
// =============================================
window.SUPABASE_URL  = 'https://hchkfunaofyoualrdnkk.supabase.co';
window.SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjaGtmdW5hb2Z5b3VhbHJkbmtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDU2ODMsImV4cCI6MjA5NDA4MTY4M30.H42DgGtRkJv-bfuODygHcZhdeA5dB5jJ5wRy757Dp2A';
// Detect if running in Electron
window.IS_ELECTRON = window.navigator.userAgent.includes('Electron');
// Use production API by default for Desktop to avoid blank UI when local server is not running
// Override via preload if needed: window.electronAPI.getApiBase()
window.API_BASE = window.IS_ELECTRON 
  ? (window.electronAPI && window.electronAPI.getApiBase ? window.electronAPI.getApiBase() : 'https://api.coelgu-system.engineer')
  : 'https://api.coelgu-system.engineer';

if (typeof supabase === 'undefined') {
  console.error('❌ Supabase CDN failed to load. Check your internet connection.');
} else {
  window.supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON, {
    auth: {
      storage: window.localStorage, // explicit — never fall back to cookie storage
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

