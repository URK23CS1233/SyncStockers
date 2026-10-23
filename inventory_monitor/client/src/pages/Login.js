import React, { useState } from 'react';
import { ScanLine, ScanSearch, BellRing, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { errMsg } from '../api/client';

const FEATURES = [
  { icon: ScanSearch, title: 'Dynamic selector chains', text: 'Ordered fallback selectors per field — CSS, attributes and regex working together.' },
  { icon: ShieldCheck, title: 'Self-healing extraction', text: 'When a site redesigns its DOM, heuristic probes rediscover values and learn new selectors.' },
  { icon: BellRing, title: 'Real-time alerts', text: 'Price drops, stock-outs, low stock and selector failures pushed the moment they happen.' },
];

export default function Login() {
  const { login, register } = useAuth();
  const { push } = useToast();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(form.email.trim(), form.password);
        push('Welcome back to StockLens', 'success');
      } else {
        await register(form.username.trim(), form.email.trim(), form.password);
        push('Account created — happy monitoring!', 'success');
      }
    } catch (err) {
      push(errMsg(err, 'Authentication failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const useDemo = () => {
    setMode('login');
    setForm({ username: '', email: 'demo@stocklens.dev', password: 'demo1234' });
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-slate-950 lg:block">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-600/25 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30">
              <ScanLine size={20} className="text-white" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight text-white">StockLens</p>
              <p className="text-[11px] uppercase tracking-widest text-slate-500">Dynamic selector inventory monitor</p>
            </div>
          </div>

          <div>
            <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight text-white">
              Never get blind-sided by an{' '}
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                e-commerce stock-out
              </span>{' '}
              again.
            </h1>
            <div className="mt-10 space-y-6">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-4">
                  <div className="h-fit rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 text-indigo-400">
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{title}</p>
                    <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-slate-400">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-600">Simulated storefronts · Postgres · Express · React</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-slate-950 px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500">
              <ScanLine size={20} className="text-white" />
            </div>
            <p className="mt-3 text-lg font-bold text-white">StockLens</p>
          </div>

          <div className="mb-6 flex rounded-xl border border-slate-800 bg-slate-900/60 p-1">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  mode === m ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <h2 className="text-xl font-bold tracking-tight text-white">
            {mode === 'login' ? 'Welcome back' : 'Start monitoring'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {mode === 'login' ? 'Sign in to your monitoring console.' : 'Create an account to begin tracking products.'}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label">Username</label>
                <input className="input" value={form.username} onChange={set('username')} placeholder="jane_doe" required />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@store.dev" required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="••••••••" required />
            </div>

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button onClick={useDemo} className="mt-4 w-full rounded-xl border border-dashed border-slate-700 px-4 py-2.5 text-xs text-slate-400 transition hover:border-indigo-500 hover:text-indigo-300">
            Use demo account (demo@stocklens.dev)
          </button>
        </div>
      </div>
    </div>
  );
}
