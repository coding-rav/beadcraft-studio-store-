import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { inr } from '@/lib/money';
import { cell, errText, smallBtn, Table } from './shared';

export default function Refunds() {
  const [rows, setRows] = useState<any[]>([]); const [prov, setProv] = useState<any[]>([]); const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const { data } = await supabase.from('refund_requests').select('id,status,reason,created_at,orders(order_number,total_paise,razorpay_payment_id)').order('created_at', { ascending: false });
    setRows(data ?? []);
    const r = await supabase.from('refunds').select('id,amount_paise,status,razorpay_refund_id,failure_reason,created_at,orders(order_number)').order('created_at', { ascending: false }).limit(100); setProv(r.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function decide(id: string, d: 'approved' | 'rejected') {
    const { error } = await supabase.rpc('admin_review_refund', { p_id: id, p_decision: d }); setMsg(error ? errText(error) : 'Saved.'); load();
  }
  return (
    <section aria-label="Refund requests">
      <p className="text-sm">Approving records your decision. Then issue the refund from the order (it calls Razorpay) or in the Razorpay Dashboard; the <code>refund.processed</code> webhook marks the request and order as refunded.</p>
      <p role="status" className="min-h-[24px] text-sm">{msg}</p>
      <Table heads={['Order', 'Amount', 'Reason', 'Requested', 'Status', 'Razorpay payment', 'Decision']}>
        {rows.map((r) => { const o = Array.isArray(r.orders) ? r.orders[0] : r.orders; return (
          <tr key={r.id}><td className={cell}>{o?.order_number}</td><td className={cell}>{o ? inr(o.total_paise) : ''}</td><td className={cell}>{r.reason}</td>
            <td className={cell}>{new Date(r.created_at).toLocaleDateString('en-IN')}</td><td className={cell}>{r.status}</td><td className={cell}>{o?.razorpay_payment_id ?? '—'}</td>
            <td className={cell}>{r.status === 'requested' ? <div className="flex gap-1"><button className={smallBtn} onClick={() => decide(r.id, 'approved')}>Approve</button><button className={smallBtn} onClick={() => decide(r.id, 'rejected')}>Reject</button></div> : '—'}</td></tr>); })}
      </Table>
      {!rows.length && <p className="mt-3 text-sm">No refund requests.</p>}
      <h2 className="mb-2 mt-6 font-serif text-xl text-[#7A1F2B]">Refunds sent to Razorpay</h2>
      <p className="text-sm">A refund is <b>pending</b> until Razorpay confirms it. Start one from Orders → open the order → “Refund via Razorpay”.</p>
      <Table heads={['Order', 'Amount', 'Status', 'Razorpay refund id', 'Note', 'Started']}>
        {prov.map((r) => { const o = Array.isArray(r.orders) ? r.orders[0] : r.orders; return <tr key={r.id}><td className={cell}>{o?.order_number}</td><td className={cell}>{inr(r.amount_paise)}</td><td className={cell}>{r.status}</td><td className={cell}>{r.razorpay_refund_id ?? '—'}</td><td className={cell}>{r.failure_reason ?? ''}</td><td className={cell}>{new Date(r.created_at).toLocaleDateString('en-IN')}</td></tr>; })}
      </Table>
    </section>);
}
