import { useEffect, useMemo, useState } from "react";
import {
  api,
  money,
  type Customer,
  type Invoice,
  type LineItem,
  type Stats,
} from "./api";

type Tab = "dashboard" | "customers" | "invoices";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
};

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [stats, setStats] = useState<Stats | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [s, c, i] = await Promise.all([api.stats(), api.customers(), api.invoices()]);
      setStats(s);
      setCustomers(c);
      setInvoices(i);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">L</span>
          <div>
            <div className="brand-name">LinePros</div>
            <div className="brand-sub">Billing</div>
          </div>
        </div>
        <nav>
          {(["dashboard", "customers", "invoices"] as Tab[]).map((t) => (
            <button
              key={t}
              className={tab === t ? "nav-item active" : "nav-item"}
              onClick={() => setTab(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        {error && <div className="banner error">{error}</div>}

        {tab === "dashboard" && <Dashboard stats={stats} invoices={invoices} />}
        {tab === "customers" && (
          <Customers customers={customers} onChange={refresh} />
        )}
        {tab === "invoices" && (
          <Invoices invoices={invoices} customers={customers} onChange={refresh} />
        )}
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

function Dashboard({ stats, invoices }: { stats: Stats | null; invoices: Invoice[] }) {
  return (
    <>
      <header className="page-head">
        <h1>Dashboard</h1>
        <p>Revenue and receivables at a glance.</p>
      </header>
      <section className="cards">
        <StatCard label="Customers" value={String(stats?.customers ?? 0)} />
        <StatCard label="Invoices" value={String(stats?.invoices ?? 0)} />
        <StatCard label="Collected" value={money(stats?.collected ?? 0)} accent="green" />
        <StatCard label="Outstanding" value={money(stats?.outstanding ?? 0)} accent="amber" />
      </section>

      <section className="panel">
        <h2>Recent invoices</h2>
        <InvoiceTable invoices={invoices.slice(0, 6)} />
      </section>
    </>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "amber";
}) {
  return (
    <div className={`stat-card ${accent ? `accent-${accent}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) return <p className="empty">No invoices yet.</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Number</th>
          <th>Customer</th>
          <th>Due</th>
          <th>Status</th>
          <th className="right">Total</th>
          <th className="right">Balance</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => (
          <tr key={inv.id}>
            <td className="mono">{inv.number}</td>
            <td>{inv.customer?.name}</td>
            <td>{inv.due_date}</td>
            <td>
              <StatusPill status={inv.status} />
            </td>
            <td className="right">{money(inv.total)}</td>
            <td className="right">{money(inv.balance)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Customers({
  customers,
  onChange,
}: {
  customers: Customer[];
  onChange: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createCustomer({ name, email, company: company || undefined });
      setName("");
      setEmail("");
      setCompany("");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <h1>Customers</h1>
        <p>Everyone you bill.</p>
      </header>
      <div className="split">
        <section className="panel">
          <h2>All customers</h2>
          {customers.length === 0 ? (
            <p className="empty">No customers yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.company || "—"}</td>
                    <td className="muted">{c.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel form-panel">
          <h2>Add customer</h2>
          <form onSubmit={submit}>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Company
              <input value={company} onChange={(e) => setCompany(e.target.value)} />
            </label>
            <button className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Add customer"}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

function Invoices({
  invoices,
  customers,
  onChange,
}: {
  invoices: Invoice[];
  customers: Customer[];
  onChange: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);

  useEffect(() => {
    if (selected) {
      const fresh = invoices.find((i) => i.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  }, [invoices]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <header className="page-head">
        <h1>Invoices</h1>
        <p>Create invoices and record payments.</p>
        <button className="btn primary" onClick={() => setCreating(true)}>
          + New invoice
        </button>
      </header>

      <section className="panel">
        <table className="table clickable">
          <thead>
            <tr>
              <th>Number</th>
              <th>Customer</th>
              <th>Due</th>
              <th>Status</th>
              <th className="right">Total</th>
              <th className="right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No invoices yet.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} onClick={() => setSelected(inv)}>
                  <td className="mono">{inv.number}</td>
                  <td>{inv.customer?.name}</td>
                  <td>{inv.due_date}</td>
                  <td>
                    <StatusPill status={inv.status} />
                  </td>
                  <td className="right">{money(inv.total)}</td>
                  <td className="right">{money(inv.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {creating && (
        <NewInvoiceModal
          customers={customers}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            onChange();
          }}
        />
      )}

      {selected && (
        <InvoiceDetailModal
          invoice={selected}
          onClose={() => setSelected(null)}
          onChange={onChange}
        />
      )}
    </>
  );
}

function NewInvoiceModal({
  customers,
  onClose,
  onCreated,
}: {
  customers: Customer[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [customerId, setCustomerId] = useState<number | "">(customers[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit_price: 0 },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const total = useMemo(
    () => items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0),
    [items],
  );

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.createInvoice({
        customer_id: Number(customerId),
        due_date: dueDate,
        notes: notes || undefined,
        items: items
          .filter((i) => i.description.trim())
          .map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
      });
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New invoice" onClose={onClose}>
      <form onSubmit={submit}>
        {err && <div className="banner error">{err}</div>}
        <label>
          Customer
          <select
            value={customerId}
            onChange={(e) => setCustomerId(Number(e.target.value))}
            required
          >
            {customers.length === 0 && <option value="">Add a customer first</option>}
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.company ? `· ${c.company}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Due date
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </label>

        <div className="line-items">
          <div className="line-items-head">
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price</span>
          </div>
          {items.map((it, idx) => (
            <div className="line-item-row" key={idx}>
              <input
                placeholder="Service or product"
                value={it.description}
                onChange={(e) => updateItem(idx, { description: e.target.value })}
              />
              <input
                type="number"
                min="0"
                step="1"
                value={it.quantity}
                onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={it.unit_price}
                onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
              />
            </div>
          ))}
          <button
            type="button"
            className="btn ghost"
            onClick={() => setItems((p) => [...p, { description: "", quantity: 1, unit_price: 0 }])}
          >
            + Add line
          </button>
        </div>

        <label>
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>

        <div className="modal-total">
          <span>Total</span>
          <strong>{money(total)}</strong>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || customers.length === 0}>
            {busy ? "Creating…" : "Create invoice"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InvoiceDetailModal({
  invoice,
  onClose,
  onChange,
}: {
  invoice: Invoice;
  onClose: () => void;
  onChange: () => void;
}) {
  const [amount, setAmount] = useState<string>(String(invoice.balance || ""));
  const [method, setMethod] = useState("card");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.recordPayment(invoice.id, { amount: Number(amount), method });
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={invoice.number} onClose={onClose}>
      <div className="detail-head">
        <div>
          <div className="muted">Bill to</div>
          <div className="strong">{invoice.customer?.name}</div>
          <div className="muted">{invoice.customer?.email}</div>
        </div>
        <StatusPill status={invoice.status} />
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="right">Qty</th>
            <th className="right">Unit</th>
            <th className="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it, i) => (
            <tr key={i}>
              <td>{it.description}</td>
              <td className="right">{it.quantity}</td>
              <td className="right">{money(it.unit_price)}</td>
              <td className="right">{money(it.quantity * it.unit_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals">
        <div>
          <span>Total</span>
          <strong>{money(invoice.total)}</strong>
        </div>
        <div>
          <span>Paid</span>
          <strong>{money(invoice.paid)}</strong>
        </div>
        <div className="balance">
          <span>Balance</span>
          <strong>{money(invoice.balance)}</strong>
        </div>
      </div>

      {invoice.status !== "paid" ? (
        <form className="pay-form" onSubmit={pay}>
          <h3>Record payment</h3>
          {err && <div className="banner error">{err}</div>}
          <div className="pay-row">
            <label>
              Amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label>
              Method
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="card">Card</option>
                <option value="wire">Wire</option>
                <option value="cash">Cash</option>
              </select>
            </label>
            <button className="btn primary" disabled={busy}>
              {busy ? "Recording…" : "Record payment"}
            </button>
          </div>
        </form>
      ) : (
        <div className="banner success">This invoice is fully paid.</div>
      )}
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
