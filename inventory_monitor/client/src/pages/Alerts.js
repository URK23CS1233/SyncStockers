import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BellRing,
  CheckCheck,
  Check,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  PackageX,
  RotateCcw,
  Target,
  Unlink,
  ChevronRight,
} from 'lucide-react';
import api, { errMsg } from '../api/client';
import { useToast } from '../context/ToastContext';
import { PageLoading, Card, Badge, EmptyState, ConfirmDialog } from '../components/ui';
import { timeAgo, ALERT_META, SEVERITY_CLS } from '../utils/format';

const ICONS = { TrendingDown, TrendingUp, AlertTriangle, PackageX, RotateCcw, Target, Unlink, BellRing };

const SEV_FILTERS = [
  { key: '', label: 'All severities' },
  { key: 'critical', label: 'Critical' },
  { key: 'warning', label: 'Warning' },
  { key: 'info', label: 'Info' },
];

export default function Alerts() {
  const { push } = useToast();
  const [payload, setPayload] = useState(null);
  const [state, setState] = useState('open');
  const [type, setType] = useState('');
  const [sev, setSev] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = () => {
    api.get('/alerts?state=all&limit=200')
      .then((res) => setPayload(res.data))
      .catch((err) => push(errMsg(err, 'Failed to load alerts'), 'error'));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolve = async (a) => {
    try {
      await api.post(`/alerts/${a.id}/resolve`);
      push('Alert resolved', 'success');
      load();
    } catch (err) {
      push(errMsg(err, 'Resolve failed'), 'error');
    }
  };

  const resolveAll = async () => {
    try {
      const res = await api.post('/alerts/resolve-all', type ? { type } : {});
      push(`Resolved ${res.data.resolved} alert${res.data.resolved === 1 ? '' : 's'}`, 'success');
      load();
    } catch (err) {
      push(errMsg(err, 'Bulk resolve failed'), 'error');
    }
  };

  const counts = payload?.counts || { open: 0, resolved: 0, total: 0 };

  const visible = useMemo(() => {
    if (!payload) return [];
    return payload.alerts.filter((a) => {
      if (state === 'open' && a.resolved) return false;
      if (state === 'resolved' && !a.resolved) return false;
      if (type && a.type !== type) return false;
      if (sev && a.severity !== sev) return false;
      return true;
    });
  }, [payload, state, type, sev]);

  const typeOptions = useMemo(() => {
    const set = new Set((payload?.alerts || []).map((a) => a.type));
    return [...set];
  }, [payload]);

  if (!payload) return <PageLoading label="Loading alerts…" />;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Tabs + filters */}
      <Card className="!py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-slate-800 bg-slate-950/70 p-1">
            {[
              { key: 'open', label: `Open (${counts.open})` },
              { key: 'resolved', label: `Resolved (${counts.resolved})` },
              { key: 'all', label: `All (${counts.total})` },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setState(t.key)}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  state === t.key ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <select className="input !w-auto !py-2" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{ALERT_META[t]?.label || t}</option>
            ))}
          </select>

          <div className="flex rounded-xl border border-slate-800 bg-slate-950/70 p-1">
            {SEV_FILTERS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSev(s.key)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  sev === s.key ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {counts.open > 0 && state !== 'resolved' && (
            <button className="btn-ghost !py-2 text-xs" onClick={() => setBulkOpen(true)}>
              <CheckCheck size={14} /> Resolve all open
            </button>
          )}
        </div>
      </Card>

      {/* List */}
      {visible.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title={counts.total === 0 ? 'No alerts yet' : 'Nothing in this view'}
          hint={counts.total === 0 ? 'The monitor raises alerts on price moves, stock changes and selector failures.' : 'Try switching tabs or clearing filters.'}
        />
      ) : (
        <div className="space-y-2.5">
          {visible.map((a) => {
            const meta = ALERT_META[a.type] || { icon: 'BellRing', label: a.type, cls: 'text-slate-400 bg-slate-500/15 border-slate-500/25' };
            const Icon = ICONS[meta.icon] || BellRing;
            return (
              <div
                key={a.id}
                className={`card flex items-start gap-3.5 !border-l-4 px-4 py-3.5 transition ${
                  a.resolved ? 'opacity-50' : ''
                } ${SEVERITY_CLS[a.severity] || 'border-l-slate-500'}`}
              >
                <div className={`mt-0.5 shrink-0 rounded-xl border p-2 ${meta.cls}`}>
                  <Icon size={16} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge cls={meta.cls}>{meta.label}</Badge>
                    <Badge cls={
                      a.severity === 'critical'
                        ? 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                        : a.severity === 'warning'
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                          : 'bg-sky-500/15 text-sky-400 border-sky-500/25'
                    }>
                      {a.severity}
                    </Badge>
                    {a.resolved && <Badge cls="bg-emerald-500/15 text-emerald-400 border-emerald-500/25">resolved</Badge>}
                    <span className="text-[11px] text-slate-500">{timeAgo(a.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-snug text-slate-200">{a.message}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span>{a.emoji} {a.product_title}</span>
                    <span>·</span>
                    <span>{a.site_name}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Link
                    to={`/inventory/${a.product_id}`}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-white"
                    title="Open product"
                  >
                    <ChevronRight size={16} />
                  </Link>
                  {!a.resolved && (
                    <button
                      onClick={() => resolve(a)}
                      className="btn-ghost !px-3 !py-1.5 text-[11px]"
                    >
                      <Check size={13} /> Resolve
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-[11px] text-slate-600">
        {visible.length} alert{visible.length === 1 ? '' : 's'} shown · duplicates of the same open type are suppressed until resolved
      </p>

      <ConfirmDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onConfirm={resolveAll}
        title="Resolve all open alerts"
        message={`Every currently open alert${type ? ` of type "${ALERT_META[type]?.label || type}"` : ''} will be marked as resolved. New events will keep raising fresh alerts.`}
        confirmLabel="Resolve all"
      />
    </div>
  );
}
