import express from "express";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 443;

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// Start servers
// HTTP server - redirects to HTTPS in production
const httpServer = http.createServer((req, res) => {
  if (process.env.NODE_ENV === "production") {
    // Redirect HTTP to HTTPS in production
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
  } else {
    // Use HTTP in development
    app(req, res);
  }
});

// HTTPS server (requires valid certificate)
let httpsServer: https.Server | null = null;

if (process.env.NODE_ENV === "production" && process.env.CERT_PATH && process.env.KEY_PATH) {
  try {
    const cert = fs.readFileSync(process.env.CERT_PATH, "utf8");
    const key = fs.readFileSync(process.env.KEY_PATH, "utf8");
    
    httpsServer = https.createServer({ cert, key }, app);
    
    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`🔒 HTTPS server running on port ${HTTPS_PORT}`);
    });
  } catch (error) {
    console.error("Failed to load SSL certificates:", error);
    console.log("Falling back to HTTP only");
  }
}

// Start HTTP server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  if (!httpsServer) {
    console.log("💡 To enable HTTPS, set CERT_PATH and KEY_PATH environment variables");
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  httpServer.close();
  if (httpsServer) {
    httpsServer.close();
  }
  process.exit(0);
});
