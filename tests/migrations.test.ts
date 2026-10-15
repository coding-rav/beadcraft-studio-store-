// Static policy checks over the SQL files. These do NOT execute SQL; they catch structural mistakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = 'supabase/migrations';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const sql = files.map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');

test('migrations are ordered by unique 14-digit timestamps', () => {
  assert.ok(files.every((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)));
  assert.equal(new Set(files.map((f) => f.slice(0, 14))).size, files.length);
});
test('every public table has RLS enabled', () => {
  const tables = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/g)].map((m) => m[1]);
  assert.ok(tables.length >= 15);
  for (const t of tables) assert.match(sql, new RegExp(`alter table public\\.${t}\\s+enable row level security`), `RLS missing on ${t}`);
});
test('every SECURITY DEFINER function pins search_path', () => {
  const defs = sql.split(/create (?:or replace )?function /i).slice(1).filter((b) => /security definer/i.test(b.split(/\$\$/)[0]));
  assert.ok(defs.length >= 8);
  for (const d of defs) assert.match(d.split(/\$\$/)[0], /set search_path/i, 'missing search_path: ' + d.slice(0, 60));
});
test('server-only functions are revoked from clients', () => {
  for (const fn of ['create_checkout_order', 'mark_order_paid', 'mark_payment_failed', 'release_order', 'record_full_refund'])
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}[^;]*from public, anon, authenticated`), fn);
});
test('money columns are integer paise, never float/numeric', () => {
  assert.ok(!/\b(price|total|amount|fee|discount)\w*\s+(numeric|decimal|real|double|float|money)\b/i.test(sql));
});
test('customers get no direct write grants on orders, payments or stock', () => {
  assert.ok(!/grant[^;]*\b(insert|update|delete)\b[^;]*public\.(orders|order_items|payments)\b[^;]*to (anon|authenticated)/i.test(sql));
  assert.ok(!/grant update\s*\([^)]*stock_quantity/i.test(sql), 'stock_quantity must only change through admin_adjust_stock');
});
test('no admin role is ever inserted by a migration', () => {
  assert.ok(!/insert into public\.user_roles[^;]*'admin'/i.test(sql.replace(/--.*$/gm, '')));
});

// ---- migration 10 guards (workflow, invoices, refunds, settings) ----
const strip = (s: string) => s.replace(/--.*$/gm, '');
const code = strip(sql);

test('order history and issued invoices are immutable', () => {
  assert.match(code, /create trigger order_events_immutable before update or delete on public\.order_events/);
  assert.match(code, /create trigger invoices_protect before update or delete on public\.invoices/);
  assert.ok(!/grant[^;]*\b(insert|update|delete)\b[^;]*public\.(order_events|invoices|refunds|notifications)\b[^;]*to (anon|authenticated)/i.test(code));
});
test('the invoices bucket is private and has no client policies', () => {
  assert.match(code, /values \('invoices', 'invoices', false,/);
  assert.ok(!/create policy[^;]*bucket_id\s*(=|in)\s*[^;]*'invoices'/i.test(code), 'no storage policy may expose invoices');
});
test('cost prices live in an admin-only table, not on products', () => {
  assert.ok(!/alter table public\.products[^;]*cost/i.test(code));
  assert.match(code, /create policy product_costs_admin on public\.product_costs for all to authenticated using \(public\.is_admin\(\)\)/);
});
test('private store settings (business/GSTIN) are not publicly readable', () => {
  const m = /create policy settings_read_public[^;]*;/s.exec(code)![0];
  assert.ok(!m.includes("'business'")); assert.match(m, /public\.is_admin\(\)/);
});
test('only one active refund per order is enforced by an index', () => {
  assert.match(code, /create unique index refunds_one_active on public\.refunds\(order_id\) where status in \('pending','processed'\)/);
});
test('payment, refund, invoice and queue functions are service-role only', () => {
  for (const fn of ['issue_invoice', 'begin_refund', 'attach_refund', 'fail_refund', 'set_payment_method', 'set_invoice_pdf'])
    assert.match(code, new RegExp(`'${fn}\\(`), `${fn} must be in the server-only list`);
});
test('admin functions check is_admin() and fulfilment only moves forward', () => {
  for (const fn of ['admin_set_fulfillment', 'admin_cancel_order', 'admin_update_tracking', 'admin_add_order_note', 'admin_retry_notification']) {
    const body = new RegExp(`function public\\.${fn}\\([\\s\\S]*?\\$\\$;`).exec(code)![0];
    assert.match(body, /public\.is_admin\(\)/, fn);
  }
  assert.match(code, /o\.order_status = 'out_for_delivery' and p_status = 'delivered'/);
  assert.ok(!/p_status in \([^)]*'pending'/.test(code));
});
test('serviceable states and coupon eligibility are enforced inside the order function', () => {
  assert.match(code, /raise exception 'NOT_SERVICEABLE'/); assert.match(code, /raise exception 'COUPON_NOT_ELIGIBLE'/);
});
