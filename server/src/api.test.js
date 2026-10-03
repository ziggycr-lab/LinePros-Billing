import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

process.env.LINEPROS_DB_PATH = join(mkdtempSync(join(tmpdir(), "linepros-")), "test.db");
process.env.LINEPROS_AUTH = "off";
process.env.PORT = "4999";
process.env.HOST = "127.0.0.1";

const { createApp } = await import("./app.js");
const { hashPassword } = await import("./auth.js");

const app = createApp();
const server = app.listen(4999, "127.0.0.1");
const base = "http://127.0.0.1:4999";

after(() => server.close());

test("health endpoint reports ok", async () => {
  const res = await fetch(`${base}/api/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, "ok");
});

test("full billing lifecycle: customer -> invoice -> payment", async () => {
  const customer = await (
    await fetch(`${base}/api/customers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test Co", email: "test@example.com" }),
    })
  ).json();
  assert.ok(customer.id, "customer created");

  const invoice = await (
    await fetch(`${base}/api/invoices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_id: customer.id,
        due_date: "2026-12-01",
        items: [{ description: "Widget", quantity: 3, unit_price: 100 }],
      }),
    })
  ).json();
  assert.equal(invoice.total, 300);
  assert.equal(invoice.balance, 300);
  assert.equal(invoice.status, "sent");

  const paid = await (
    await fetch(`${base}/api/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 300, method: "card" }),
    })
  ).json();
  assert.equal(paid.balance, 0);
  assert.equal(paid.status, "paid");
});

test("auth-enabled app rejects data routes without a session", async () => {
  process.env.LINEPROS_AUTH = "on";
  process.env.LINEPROS_SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.LINEPROS_ADMIN_USER = "admin";
  process.env.LINEPROS_ADMIN_PASSWORD_HASH = hashPassword("test-pass-123");

  const locked = createApp();
  const lockedServer = locked.listen(4998, "127.0.0.1");
  const lockedBase = "http://127.0.0.1:4998";

  try {
    const health = await fetch(`${lockedBase}/api/health`);
    assert.equal(health.status, 200);

    const denied = await fetch(`${lockedBase}/api/customers`);
    assert.equal(denied.status, 401);

    const badLogin = await fetch(`${lockedBase}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "nope" }),
    });
    assert.equal(badLogin.status, 401);

    const login = await fetch(`${lockedBase}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "test-pass-123" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie");
    assert.ok(cookie, "session cookie set");

    const ok = await fetch(`${lockedBase}/api/customers`, {
      headers: { cookie },
    });
    assert.equal(ok.status, 200);
  } finally {
    lockedServer.close();
    process.env.LINEPROS_AUTH = "off";
  }
});

test("health response does not include secrets", async () => {
  const res = await fetch(`${base}/api/health`);
  const body = await res.json();
  const blob = JSON.stringify(body);
  assert.equal(blob.includes("password"), false);
  assert.equal(blob.includes("secret"), false);
  assert.equal(blob.includes("SESSION"), false);
});
