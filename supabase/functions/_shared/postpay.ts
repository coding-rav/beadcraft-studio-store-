import { ensureInvoice } from './invoice.ts';
import { processQueue } from './notifyQueue.ts';
type Db = any;
/** After an order is newly marked paid: record method, issue the invoice, flush notifications. Never throws. */
export async function afterPaid(db: Db, orderId: string, method?: string | null) {
  try { if (method) await db.rpc('set_payment_method', { p_order: orderId, p_method: method }); } catch (e) { console.error('set_payment_method', (e as Error).message); }
  try { await ensureInvoice(db, orderId); } catch (e) { console.error('ensureInvoice', (e as Error).message); }
  try { await processQueue(db, { orderId }); } catch (e) { console.error('processQueue', (e as Error).message); }
}
