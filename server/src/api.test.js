import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Use an isolated temp database so tests never touch the dev data file.
process.env.LINEPROS_DB_PATH = join(mkdtempSync(join(tmpdir(), "linepros-")), "test.db");
process.env.PORT = "4999";

const { server } = await import("./index.js");
const base = "http://localhost:4999";

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
