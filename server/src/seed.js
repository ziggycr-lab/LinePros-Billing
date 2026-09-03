import { db, migrate } from "./db.js";

migrate();

const existing = db.prepare("SELECT COUNT(*) AS n FROM customers").get().n;
if (existing > 0 && !process.argv.includes("--force")) {
  console.log(`[linepros] database already has ${existing} customers; skipping seed (use --force to reseed).`);
  process.exit(0);
}

if (process.argv.includes("--force")) {
  db.exec("DELETE FROM payments; DELETE FROM line_items; DELETE FROM invoices; DELETE FROM customers;");
}

const seed = db.transaction(() => {
  const insertCustomer = db.prepare(
    "INSERT INTO customers (name, email, company) VALUES (?, ?, ?)",
  );
  const acme = insertCustomer.run("Ada Lovelace", "ada@acme.io", "Acme Corp").lastInsertRowid;
  const globex = insertCustomer.run("Grace Hopper", "grace@globex.com", "Globex LLC").lastInsertRowid;

  const insertInvoice = db.prepare(
    "INSERT INTO invoices (customer_id, number, status, due_date, notes) VALUES (?, ?, ?, ?, ?)",
  );
  const insertItem = db.prepare(
    "INSERT INTO line_items (invoice_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)",
  );
  const insertPayment = db.prepare(
    "INSERT INTO payments (invoice_id, amount, method) VALUES (?, ?, ?)",
  );

  const inv1 = insertInvoice.run(acme, "INV-2026-0001", "sent", "2026-10-01", "Monthly retainer").lastInsertRowid;
  insertItem.run(inv1, "Platform subscription", 1, 499);
  insertItem.run(inv1, "Priority support", 2, 75);

  const inv2 = insertInvoice.run(globex, "INV-2026-0002", "paid", "2026-09-15", "Onboarding").lastInsertRowid;
  insertItem.run(inv2, "Implementation services", 10, 120);
  insertPayment.run(inv2, 1200, "wire");
});

seed();
console.log("[linepros] seeded demo customers, invoices, and payments.");
