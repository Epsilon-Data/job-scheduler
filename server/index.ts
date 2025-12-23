import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import type { SessionOptions } from "express-session";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { errorHandler } from "./middleware";

// Validate required environment variables
if (!process.env.SESSION_SECRET) {
  console.error("FATAL: SESSION_SECRET environment variable is not set");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session configuration with proper typing
// COOKIE_SECURE can override the default behavior (useful for Docker with HTTP)
const secureCookie = process.env.COOKIE_SECURE !== undefined
  ? process.env.COOKIE_SECURE === 'true'
  : process.env.NODE_ENV === "production";

const sessionConfig: SessionOptions = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true, // Allow session creation for OAuth flow
  cookie: {
    secure: secureCookie,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    sameSite: "lax", // Allow cross-site requests for OAuth
  },
};

// Use memory store for development, but warn about production
if (process.env.NODE_ENV === "production") {
  console.warn("Warning: Using MemoryStore in production. Consider using a persistent session store like Redis or PostgreSQL.");
}

app.use(session(sessionConfig));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Use centralized error handler
  app.use(errorHandler);

  // Setup vite in development only, after all other routes
  // so the catch-all route doesn't interfere with API routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve the app on configured port or default 5000
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
