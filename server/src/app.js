import { existsSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { db, migrate } from "./db.js";
import { getConfig } from "./config.js";
import { mountAuth, requireAuth } from "./auth.js";

export function createApp(overrides = {}) {
  const config = { ...getConfig(), ...overrides };

  migrate();

  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  if (!config.isProduction) {
    app.use(cors({ origin: true, credentials: true }));
  }

  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "linepros-billing",
      time: new Date().toISOString(),
    });
  });

  mountAuth(app, config);
  app.use("/api", requireAuth(config));

  /* ---------------------------------- helpers --------------------------------- */

  function invoiceTotals(invoiceId) {
    const items = db
      .prepare("SELECT quantity, unit_price FROM line_items WHERE invoice_id = ?")
      .all(invoiceId);
    const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    const paid =
      db
        .prepare(
          "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?",
        )
        .get(invoiceId).paid || 0;
    return { total, paid, balance: Math.max(total - paid, 0) };
  }

  function hydrateInvoice(invoice) {
    const items = db
      .prepare("SELECT * FROM line_items WHERE invoice_id = ? ORDER BY id")
      .all(invoice.id);
    const payments = db
      .prepare("SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at")
      .all(invoice.id);
    const customer = db
      .prepare("SELECT * FROM customers WHERE id = ?")
      .get(invoice.customer_id);
    return { ...invoice, customer, items, payments, ...invoiceTotals(invoice.id) };
  }

  function nextInvoiceNumber() {
    const row = db.prepare("SELECT COUNT(*) AS n FROM invoices").get();
    const seq = String(row.n + 1).padStart(4, "0");
    return `INV-${new Date().getFullYear()}-${seq}`;
  }

  /* ---------------------------------- routes ---------------------------------- */

  app.get("/api/stats", (_req, res) => {
    const invoices = db.prepare("SELECT * FROM invoices").all();
    let outstanding = 0;
    let collected = 0;
    for (const inv of invoices) {
      const { paid, balance } = invoiceTotals(inv.id);
      collected += paid;
      if (inv.status !== "paid") outstanding += balance;
    }
    res.json({
      customers: db.prepare("SELECT COUNT(*) AS n FROM customers").get().n,
      invoices: invoices.length,
      outstanding: Number(outstanding.toFixed(2)),
      collected: Number(collected.toFixed(2)),
    });
  });

  app.get("/api/customers", (_req, res) => {
    res.json(db.prepare("SELECT * FROM customers ORDER BY created_at DESC").all());
  });

  app.post("/api/customers", (req, res) => {
    const { name, email, company } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ error: "name and email are required" });
    }
    const info = db
      .prepare("INSERT INTO customers (name, email, company) VALUES (?, ?, ?)")
      .run(name, email, company || null);
    res
      .status(201)
      .json(db.prepare("SELECT * FROM customers WHERE id = ?").get(info.lastInsertRowid));
  });

  app.get("/api/invoices", (_req, res) => {
    const invoices = db.prepare("SELECT * FROM invoices ORDER BY created_at DESC").all();
    res.json(invoices.map(hydrateInvoice));
  });

  app.get("/api/invoices/:id", (req, res) => {
    const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
    if (!invoice) return res.status(404).json({ error: "invoice not found" });
    res.json(hydrateInvoice(invoice));
  });

  app.post("/api/invoices", (req, res) => {
    const { customer_id, due_date, notes, items } = req.body || {};
    if (!customer_id || !due_date || !Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ error: "customer_id, due_date and at least one line item are required" });
    }
    const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(customer_id);
    if (!customer) return res.status(400).json({ error: "unknown customer_id" });

    const create = db.transaction(() => {
      const info = db
        .prepare(
          "INSERT INTO invoices (customer_id, number, due_date, notes, status) VALUES (?, ?, ?, ?, 'sent')",
        )
        .run(customer_id, nextInvoiceNumber(), due_date, notes || null);
      const invoiceId = info.lastInsertRowid;
      const insertItem = db.prepare(
        "INSERT INTO line_items (invoice_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)",
      );
      for (const item of items) {
        insertItem.run(
          invoiceId,
          item.description,
          Number(item.quantity) || 1,
          Number(item.unit_price) || 0,
        );
      }
      return invoiceId;
    });

    const invoiceId = create();
    res
      .status(201)
      .json(hydrateInvoice(db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId)));
  });

  app.post("/api/invoices/:id/payments", (req, res) => {
    const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
    if (!invoice) return res.status(404).json({ error: "invoice not found" });

    const amount = Number(req.body?.amount);
    const method = req.body?.method || "card";
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "a positive amount is required" });
    }

    const record = db.transaction(() => {
      db.prepare("INSERT INTO payments (invoice_id, amount, method) VALUES (?, ?, ?)").run(
        invoice.id,
        amount,
        method,
      );
      const { balance: newBalance } = invoiceTotals(invoice.id);
      if (newBalance <= 0.001) {
        db.prepare("UPDATE invoices SET status = 'paid' WHERE id = ?").run(invoice.id);
      }
    });
    record();

    res
      .status(201)
      .json(hydrateInvoice(db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoice.id)));
  });

  const clientDist = config.clientDist;
  if (existsSync(join(clientDist, "index.html"))) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(join(clientDist, "index.html"));
    });
  }

  return app;
}
