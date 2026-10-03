import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getConfig() {
  const isProduction = process.env.NODE_ENV === "production";
  const authExplicit = process.env.LINEPROS_AUTH;
  const authDisabled =
    authExplicit === "off" || (!isProduction && authExplicit !== "on");

  const sessionSecret = process.env.LINEPROS_SESSION_SECRET || "";
  const adminPassword = process.env.LINEPROS_ADMIN_PASSWORD || "";
  const adminPasswordHash = process.env.LINEPROS_ADMIN_PASSWORD_HASH || "";

  if (!authDisabled) {
    if (sessionSecret.length < 32) {
      throw new Error(
        "LINEPROS_SESSION_SECRET must be at least 32 characters when auth is enabled",
      );
    }
    if (!adminPasswordHash && !adminPassword) {
      throw new Error(
        "Set LINEPROS_ADMIN_PASSWORD_HASH (preferred) or LINEPROS_ADMIN_PASSWORD when auth is enabled",
      );
    }
  }

  return {
    isProduction,
    authDisabled,
    port: Number(process.env.PORT || 4000),
    host: process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1"),
    adminUser: process.env.LINEPROS_ADMIN_USER || "admin",
    adminPassword,
    adminPasswordHash,
    sessionSecret,
    secureCookies: process.env.LINEPROS_SECURE_COOKIES === "true",
    clientDist:
      process.env.LINEPROS_CLIENT_DIST ||
      join(__dirname, "..", "..", "client", "dist"),
  };
}
