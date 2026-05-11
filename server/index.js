require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const eventsRouter = require("./routes/events");
const transactionsRouter = require("./routes/transactions");
const reportsRouter = require("./routes/reports");
const authMiddleware = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// Middleware
// =============================================
app.use(cors());
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
  console.log(
    `✅ COE Budget System Server running on http://localhost:${PORT}`,
  );
});

module.exports = app;
