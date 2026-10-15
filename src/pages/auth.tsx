import { FormEvent, ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { btn, field, isEmail, isMobile, safeRedirect } from '@/lib/ui';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-6 font-serif text-3xl text-[#7A1F2B]">{title}</h1>{children}
    </main>);
}
function Pw({ value, onChange, label, auto }: { value: string; onChange: (e: any) => void; label: string; auto: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input className={field} type={show ? 'text' : 'password'} autoComplete={auto} placeholder={label} aria-label={label} value={value} onChange={onChange} />
      <button type="button" aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}
        className="absolute right-1 top-0 h-[44px] min-w-[44px] px-3 text-sm underline">{show ? 'Hide' : 'Show'}</button>
    </div>);
}
const Banner = ({ from }: { from?: string }) => from?.startsWith('/checkout')
  ? <p role="status" className="mb-4 rounded-xl bg-[#F5DADD] p-3 text-sm">Please sign in or create an account to continue to checkout.</p> : null;
const Msg = ({ ok, text }: { ok?: boolean; text: string }) =>
  text ? <p role="status" className={`mt-3 text-sm ${ok ? 'text-green-800' : 'text-red-700'}`}>{text}</p> : null;
const friendly = (e: any) => /invalid login/i.test(e?.message) ? 'Email or password is incorrect.'
  : /already registered/i.test(e?.message) ? 'An account with this email already exists. Try logging in.'
  : e?.message ?? 'Something went wrong. Please try again.';

export function Login() {
  const { signIn } = useAuth(); const nav = useNavigate(); const loc = useLocation() as any; const [q] = useSearchParams();
  const next = safeRedirect(loc.state?.from ?? q.get('next'));
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!isEmail(email) || !pw) return setErr('Enter your email and password.');
    setBusy(true);
    try { await signIn(email, pw); nav(next, { replace: true }); }
    catch (x) { setErr(friendly(x)); } finally { setBusy(false); }
  }
  return (
    <Shell title="Welcome back">
      <Banner from={next} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <input className={field} type="email" autoComplete="email" placeholder="Email address" aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Pw auto="current-password" label="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className={`${btn} w-full`} disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <Msg text={err} />
      </form>
      <p className="mt-4 text-sm"><Link to="/forgot-password" className="underline">Forgot password?</Link> · <Link to="/signup" state={{ from: next }} className="underline">Create an account</Link></p>
    </Shell>);
}

export function Signup() {
  const { signUp } = useAuth(); const nav = useNavigate(); const loc = useLocation() as any;
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const next = safeRedirect(loc.state?.from);
  const [err, setErr] = useState(''); const [info, setInfo] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (f.name.trim().length < 2) return setErr('Enter your name.');
    if (!isEmail(f.email)) return setErr('Enter a valid email address.');
    if (!isMobile(f.phone)) return setErr('Enter a valid 10-digit mobile number.');
    if (f.password.length < 8) return setErr('Password must be at least 8 characters.');
    if (f.password !== f.confirm) return setErr('Passwords do not match.');
    setBusy(true);
    try {
      const { needsEmailConfirm } = await signUp({ ...f, next });
      if (needsEmailConfirm) setInfo('Account created. Check your email and confirm your address, then log in.');
      else nav(next, { replace: true });
    } catch (x) { setErr(friendly(x)); } finally { setBusy(false); }
  }
  return (
    <Shell title="Create your account">
      <Banner from={next} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <input className={field} autoComplete="name" placeholder="Full name" aria-label="Full name" value={f.name} onChange={set('name')} />
        <input className={field} type="email" autoComplete="email" placeholder="Email address" aria-label="Email address" value={f.email} onChange={set('email')} />
        <input className={field} inputMode="numeric" maxLength={10} autoComplete="tel-national" placeholder="Mobile number (10 digits)" aria-label="Mobile number" value={f.phone} onChange={set('phone')} />
        <Pw auto="new-password" label="Password (8+ characters)" value={f.password} onChange={set('password')} />
        <Pw auto="new-password" label="Confirm password" value={f.confirm} onChange={set('confirm')} />
        <button className={`${btn} w-full`} disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</button>
        <Msg text={err} /><Msg ok text={info} />
      </form>
      <p className="mt-4 text-sm">Already registered? <Link to="/login" state={{ from: next }} className="underline">Log in</Link></p>
    </Shell>);
}

export function ForgotPassword() {
  const { sendReset } = useAuth();
  const [email, setEmail] = useState(''); const [msg, setMsg] = useState(''); const [ok, setOk] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) { setOk(false); return setMsg('Enter a valid email address.'); }
    try { await sendReset(email); setOk(true); setMsg('If an account exists for that email, a reset link is on its way.'); }
    catch (x) { setOk(false); setMsg(friendly(x)); }
  }
  return (
    <Shell title="Reset your password">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <input className={field} type="email" placeholder="Email address" aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className={`${btn} w-full`}>Send reset link</button><Msg ok={ok} text={msg} />
      </form>
    </Shell>);
}

export function ResetPassword() { // the emailed link lands here with a temporary recovery session
  const { setNewPassword, user } = useAuth(); const nav = useNavigate();
  const [pw, setPw] = useState(''); const [msg, setMsg] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setMsg('Password must be at least 8 characters.');
    try { await setNewPassword(pw); nav('/account', { replace: true }); } catch (x) { setMsg(friendly(x)); }
  }
  return (
    <Shell title="Choose a new password">
      {!user ? <p>This reset link is invalid or has expired. <Link to="/forgot-password" className="underline">Request a new one</Link>.</p> : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Pw auto="new-password" label="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className={`${btn} w-full`}>Save password</button><Msg text={msg} />
        </form>)}
    </Shell>);
}
