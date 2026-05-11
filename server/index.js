require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const eventsRouter = require("./routes/events");
const transactionsRouter = require("./routes/transactions");
const reportsRouter = require("./routes/reports");
const authMiddleware = require("./middleware/auth");
const keepAlive = require("./lib/keepAlive");

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// Middleware
// =============================================
const allowedOrigins = [
  'http://localhost:3000',
  'https://lgu-system-eight.vercel.app',
  'https://lgu-system.onrender.com'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Serve static frontend files
app.use(express.static(path.join(__dirname, "../client")));

// =============================================
// Public Routes (no auth needed)
// Health check & SPA fallback
// =============================================
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// =============================================
// Protected API Routes
// =============================================
app.use("/api/events", authMiddleware, eventsRouter);
app.use("/api/transactions", authMiddleware, transactionsRouter);
app.use("/api/reports", authMiddleware, reportsRouter);

// SPA Fallback — serve index.html for all non-API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// =============================================
// Global Error Handler
// =============================================
app.use((err, req, res, next) => {
  console.error("[Server Error]", err.stack);
  res.status(500).json({ error: "An internal server error occurred." });
});

app.listen(PORT, () => {
  console.log(`✅ COE Budget System Server running on http://localhost:${PORT}`);

  // Start keep-alive to prevent Render sleep & Supabase pause
  const serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  keepAlive.start(serverUrl);
});

module.exports = app;
