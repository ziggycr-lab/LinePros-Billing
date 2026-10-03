import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import cookieSession from "cookie-session";
import rateLimit from "express-rate-limit";

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

function safeEqualString(a, b) {
  return timingSafeEqual(sha256(String(a)), sha256(String(b)));
}

export function verifyPassword(password, storedHash, plaintextFallback) {
  if (storedHash) {
    const [scheme, salt, hash] = String(storedHash).split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  }
  if (plaintextFallback) {
    return safeEqualString(password, plaintextFallback);
  }
  return false;
}

export function sessionMiddleware(config) {
  return cookieSession({
    name: "lp_session",
    keys: [config.sessionSecret],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookies,
    path: "/",
  });
}

export function loginLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "too many login attempts, try again later" },
  });
}

export function requireAuth(config) {
  return (req, res, next) => {
    if (config.authDisabled) return next();
    if (req.session?.user) return next();
    return res.status(401).json({ error: "authentication required" });
  };
}

export function mountAuth(app, config) {
  if (config.authDisabled) {
    app.get("/api/me", (_req, res) => {
      res.json({ username: "dev", auth: false });
    });
    return;
  }

  app.use(sessionMiddleware(config));

  app.get("/api/me", (req, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "authentication required" });
    }
    res.json({ username: req.session.user, auth: true });
  });

  app.post("/api/login", loginLimiter(), (req, res) => {
    const username = String(req.body?.username || "");
    const password = String(req.body?.password || "");
    const userOk = safeEqualString(username, config.adminUser);
    const passOk = verifyPassword(
      password,
      config.adminPasswordHash,
      config.adminPassword,
    );
    if (!userOk || !passOk) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    req.session.user = config.adminUser;
    res.json({ username: config.adminUser, auth: true });
  });

  app.post("/api/logout", (req, res) => {
    req.session = null;
    res.json({ ok: true });
  });
}
