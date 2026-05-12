require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const path       = require("path");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");

const eventsRouter        = require("./routes/events");
const transactionsRouter  = require("./routes/transactions");
const reportsRouter       = require("./routes/reports");
const announcementsRouter = require("./routes/announcements");
const adminRouter         = require("./routes/admin");
const authMiddleware      = require("./middleware/auth");
const keepAlive           = require("./lib/keepAlive");

const app  = express();
const PORT = process.env.PORT || 3000;

// =============================================
// Security: Helmet (sets 11+ security headers)
// =============================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:   ["'self'"],
      scriptSrc:    ["'self'", "'unsafe-inline'",
                     "https://cdn.jsdelivr.net",
                     "https://unpkg.com",
                     "https://fonts.googleapis.com"],
      styleSrc:     ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:      ["'self'", "https://fonts.gstatic.com"],
      imgSrc:       ["'self'", "data:", "https://hchkfunaofyoualrdnkk.supabase.co"],
      connectSrc:   ["'self'",
                     "https://hchkfunaofyoualrdnkk.supabase.co",
                     "wss://hchkfunaofyoualrdnkk.supabase.co",
                     "https://api.brevo.com",
                     "https://api.sendinblue.com"],
      frameSrc:     ["'none'"],
      objectSrc:    ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false, // needed for Supabase realtime
}));

// =============================================
// CORS — strict allowlist only
// =============================================
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://lgu-system-eight.vercel.app',
  'https://lgu-system.onrender.com',
  'https://coelgu.tech',
  'https://www.coelgu.tech',
  'https://coelgu-system.engineer',
  'https://www.coelgu-system.engineer',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

// =============================================
// Body parsing — with size limits (prevents DoS)
// =============================================
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// =============================================
// Global Rate Limiting — 1000 req / 15 min per IP
// =============================================
const globalLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutes
  max:              1000,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'Too many requests. Please wait 15 minutes and try again.' },
  skip: (req) => req.path === '/api/health', // exempt health check
});
app.use('/api/', globalLimiter);

// Stricter limiter for specific operations if needed (presently just a reference)
const writeLimiter = rateLimit({
  windowMs:        5 * 60 * 1000, // 5 minutes
  max:             100,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many write requests. Slow down.' },
});

// =============================================
// Serve static frontend files
// =============================================
app.use(express.static(path.join(__dirname, "../client")));

// =============================================
// Public Routes
// =============================================
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// =============================================
// Protected API Routes
// =============================================
app.use("/api/events",        authMiddleware, eventsRouter);
app.use("/api/transactions",  authMiddleware, transactionsRouter);
app.use("/api/reports",       authMiddleware, reportsRouter);
app.use("/api/announcements", authMiddleware, announcementsRouter);
app.use("/api/admin",         authMiddleware, adminRouter);

// =============================================
// SPA Fallback
// =============================================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// =============================================
// Global Error Handler — never leak stack traces
// =============================================
app.use((err, req, res, next) => {
  // Log full error internally, never expose to client
  console.error("[Server Error]", err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred.'
      : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`✅ COE Budget System Server running on http://localhost:${PORT}`);
  const serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  keepAlive.start(serverUrl);
});

module.exports = app;
