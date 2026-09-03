export interface Customer {
  id: number;
  name: string;
  email: string;
  company: string | null;
  created_at: string;
}

export interface LineItem {
  id?: number;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface Payment {
  id: number;
  amount: number;
  method: string;
  paid_at: string;
}

export interface Invoice {
  id: number;
  number: string;
  status: "draft" | "sent" | "paid";
  issue_date: string;
  due_date: string;
  notes: string | null;
  customer: Customer;
  items: LineItem[];
  payments: Payment[];
  total: number;
  paid: number;
  balance: number;
}

export interface Stats {
  customers: number;
  invoices: number;
  outstanding: number;
  collected: number;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  stats: () => request<Stats>("/api/stats"),
  customers: () => request<Customer[]>("/api/customers"),
  createCustomer: (data: { name: string; email: string; company?: string }) =>
    request<Customer>("/api/customers", { method: "POST", body: JSON.stringify(data) }),
  invoices: () => request<Invoice[]>("/api/invoices"),
  createInvoice: (data: {
    customer_id: number;
    due_date: string;
    notes?: string;
    items: LineItem[];
  }) => request<Invoice>("/api/invoices", { method: "POST", body: JSON.stringify(data) }),
  recordPayment: (invoiceId: number, data: { amount: number; method: string }) =>
    request<Invoice>(`/api/invoices/${invoiceId}/payments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
