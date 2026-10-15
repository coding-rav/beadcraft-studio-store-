import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callFn } from '@/lib/fn';
import { cell, errText, smallBtn, Table } from './shared';

export function Notifications() {
  const [rows, setRows] = useState<any[]>([]); const [msg, setMsg] = useState('');
  const load = useCallback(async () => { const { data } = await supabase.from('notifications').select('id,kind,status,attempts,last_error,created_at,sent_at,orders(order_number)').order('created_at', { ascending: false }).limit(100); setRows(data ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  async function sendNow() { const r = await callFn('process-notifications', {}); setMsg(r.error ?? (r.data?.configured === false ? r.data.message : `Sent ${r.data?.sent ?? 0}, failed ${r.data?.failed ?? 0}.`)); load(); }
  async function retry(id: string) { const { error } = await supabase.rpc('admin_retry_notification', { p_id: id }); setMsg(error ? errText(error) : 'Queued for retry. Press "Send queued now".'); load(); }
  return (
    <section aria-label="Notifications">
      <p className="text-sm">Customer emails are queued once per order and event. They are sent through Resend only when <code>RESEND_API_KEY</code>, <code>EMAIL_FROM</code> and <code>SITE_URL</code> are configured; otherwise they stay <b>pending</b>. Nothing is marked sent unless the provider accepted it.</p>
      <p className="mt-2"><button className={smallBtn} onClick={sendNow}>Send queued now</button></p>
      <p role="status" className="min-h-[24px] text-sm">{msg}</p>
      <Table heads={['Order', 'Email', 'Status', 'Attempts', 'Error', 'Created', '']}>
        {rows.map((n) => { const o = Array.isArray(n.orders) ? n.orders[0] : n.orders; return (
          <tr key={n.id}><td className={cell}>{o?.order_number}</td><td className={cell}>{n.kind}</td><td className={cell}>{n.status}</td><td className={cell}>{n.attempts}</td><td className={cell}>{n.last_error ?? ''}</td>
            <td className={cell}>{new Date(n.created_at).toLocaleString('en-IN')}</td><td className={cell}>{(n.status === 'failed' || n.status === 'dead') && <button className={smallBtn} onClick={() => retry(n.id)}>Retry</button>}</td></tr>); })}
      </Table>
    </section>);
}

export function Payments() {
  const [res, setRes] = useState<any>(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  async function run(apply: boolean) {
    if (apply && !window.confirm('Mark the listed orders as paid? Only orders where Razorpay shows a captured payment for the exact amount are changed.')) return;
    setBusy(true); setMsg(''); const r = await callFn('reconcile-payments', { apply }); setBusy(false);
    if (r.error) return setMsg(r.error); setRes(r.data);
  }
  return (
    <section aria-label="Payment reconciliation">
      <p className="text-sm">Compares recent unpaid orders (older than 5 minutes, last 7 days) with Razorpay. It finds payments that were captured at Razorpay but never confirmed here (for example a lost webhook).</p>
      <p className="mt-2 flex gap-2"><button className={smallBtn} disabled={busy} onClick={() => run(false)}>Check now</button>{res?.conflicts?.length > 0 && <button className={smallBtn} disabled={busy} onClick={() => run(true)}>Apply fixes</button>}</p>
      <p role="status" className="min-h-[24px] text-sm">{busy ? 'Checking Razorpay…' : msg}</p>
      {res && <><p className="text-sm">Checked {res.checked} orders. {res.conflicts.length ? `${res.conflicts.length} conflict(s):` : 'No conflicts found.'}</p>
        <ul className="mt-2 space-y-1 text-sm">{res.conflicts.map((c: any) => <li key={c.order}>{c.order}: {c.problem}{c.payment ? ` (${c.payment})` : ''}{c.applied ? ' — fixed' : ''}</li>)}</ul></>}
    </section>);
}
