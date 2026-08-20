const supabaseAdmin = require('../lib/supabase');

/**
 * Auth Middleware
 * Verifies the Supabase JWT from the Authorization header.
 * Attaches the user object to req.user for downstream use.
 */
module.exports = async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
  }

  const token = authHeader.split(' ')[1];

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }

  // Fetch profile for role info
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, full_name, course, enrollment_year, created_at')
    .eq('id', user.id)
    .single();

  req.user    = user;
  req.profile = profile;
  next();
};
