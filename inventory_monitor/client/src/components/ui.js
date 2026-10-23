import React from 'react';
import { X, Inbox } from 'lucide-react';

export function Badge({ cls = 'bg-slate-500/15 text-slate-400 border-slate-500/25', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls} ${className}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = '', ...rest }) {
  return (
    <div className={`card p-5 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, sub, right }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-100">{children}</h2>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'indigo' }) {
  const tones = {
    indigo: 'from-indigo-500/20 to-indigo-500/5 text-indigo-400 border-indigo-500/20',
    violet: 'from-violet-500/20 to-violet-500/5 text-violet-400 border-violet-500/20',
    emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-400 border-emerald-500/20',
    rose: 'from-rose-500/20 to-rose-500/5 text-rose-400 border-rose-500/20',
    amber: 'from-amber-500/20 to-amber-500/5 text-amber-400 border-amber-500/20',
    sky: 'from-sky-500/20 to-sky-500/5 text-sky-400 border-sky-500/20',
  };
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
        <div className={`rounded-xl border bg-gradient-to-b p-2.5 ${tones[tone]}`}>
          <Icon size={18} />
        </div>
      </div>
    </Card>
  );
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center">
      <div className={`card my-8 w-full ${width} animate-scale-in bg-slate-900 shadow-2xl shadow-black/50`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-800 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete' }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md">
      <p className="text-sm leading-relaxed text-slate-300">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn-danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function Spinner({ className = '' }) {
  return (
    <div className={`h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400 ${className}`} />
  );
}

export function PageLoading({ label = 'Loading…' }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 px-6 py-14 text-center">
      <div className="mb-3 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-slate-500">
        <Icon size={22} />
      </div>
      <p className="text-sm font-semibold text-slate-300">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function HealthBar({ hits, misses, className = '' }) {
  const total = hits + misses;
  const pctVal = total ? Math.round((hits / total) * 100) : 100;
  const color = pctVal >= 85 ? 'bg-emerald-500' : pctVal >= 60 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pctVal}%` }} />
      </div>
      <span className="w-9 text-right text-[11px] tabular-nums text-slate-400">{pctVal}%</span>
    </div>
  );
}
