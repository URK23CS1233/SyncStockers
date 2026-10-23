import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import {
  ArrowLeft,
  PlayCircle,
  Pencil,
  CheckCircle2,
  XCircle,
  Sparkles,
  Timer,
  RefreshCw,
  Save,
} from 'lucide-react';
import api, { errMsg } from '../api/client';
import { useToast } from '../context/ToastContext';
import { PageLoading, Card, Badge, Modal, EmptyState, Field, SectionTitle } from '../components/ui';
import { tooltipOpts, legendOpts, axisDefaults } from '../charts/setup';
import { money, timeAgo, fmtDateTime, AVAIL_META, RUN_META, FIELD_META, pct } from '../utils/format';

const TRACE_SOURCE_CLS = {
  authored: 'bg-slate-700/70 text-slate-300 border-slate-600',
  learned: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
  probe: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
};

export default function ProductDetail() {
  const { id } = useParams();
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expandedField, setExpandedField] = useState(null);
  const [running, setRunning] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get(`/products/${id}/history`)
      .then((res) => {
        setData(res.data);
        const p = res.data.product;
        setForm({
          title: p.title,
          category: p.category || 'General',
          emoji: p.emoji || '📦',
          low_stock_threshold: p.low_stock_threshold,
          target_price: p.target_price ?? '',
          monitor_interval_sec: p.monitor_interval_sec,
        });
      })
      .catch((err) => setError(err));
  };

  useEffect(load, [id]);

  if (error) return <PageLoading label={errMsg(error, 'Product not found')} />;
  if (!data || !form) return <PageLoading label="Loading product…" />;

  const { product, history, runs } = data;
  const site = { name: product.site_name, currency: product.site_currency };
  const latest = runs[0];
  const av = AVAIL_META[product.availability] || AVAIL_META.unknown;

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await api.post(`/products/${id}/run`);
      const { run, change, learned } = res.data;
      if (run.status === 'failed') push('Scan failed — the selector chain could not extract critical fields', 'error');
      else if (run.healed) push('Scan completed using self-healed selectors ✨', 'success', 4500);
      else push('Scan completed ✓', 'success');
      if (learned && learned.length) {
        setTimeout(() => push(`${learned.length} new selector${learned.length > 1 ? 's' : ''} learned from this DOM`, 'info'), 400);
      }
      if (change && change.price) {
        const d = ((change.price.to - change.price.from) / change.price.from) * 100;
        setTimeout(() => push(`Price ${d < 0 ? 'dropped' : 'rose'} ${Math.abs(d).toFixed(1)}%`, 'info'), 750);
      }
      load();
    } catch (err) {
      push(errMsg(err, 'Scan failed'), 'error');
    } finally {
      setRunning(false);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/products/${id}`, {
        ...form,
        low_stock_threshold: Number(form.low_stock_threshold) || 10,
        target_price: form.target_price === '' ? null : Number(form.target_price),
        monitor_interval_sec: Number(form.monitor_interval_sec) || 60,
      });
      push('Settings saved', 'success');
      setEditOpen(false);
      load();
    } catch (err) {
      push(errMsg(err, 'Save failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ---- price chart ------------------------------------------------------
  const points = history.filter((h) => h.price != null);
  const priceData = {
    labels: points.map((h) => new Date(h.observed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label: `${product.emoji} ${product.title}`,
        data: points.map((h) => Number(h.price)),
        borderColor: '#818cf8',
        backgroundColor: (ctx) => {
          const { chart } = ctx;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'rgba(129,140,248,0.2)';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, 'rgba(129,140,248,0.35)');
          g.addColorStop(1, 'rgba(129,140,248,0)');
          return g;
        },
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0.35,
        fill: true,
      },
      ...(product.target_price != null
        ? [{
            label: `Target ${money(product.target_price, site.currency)}`,
            data: points.map(() => Number(product.target_price)),
            borderColor: '#34d399',
            borderWidth: 1.5,
            borderDash: [6, 5],
            pointRadius: 0,
            fill: false,
          }]
        : []),
    ],
  };

  const traceFields = latest ? latest.selector_trace || [] : [];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link to="/inventory" className="mt-1 rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 transition hover:text-white">
            <ArrowLeft size={16} />
          </Link>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-3xl">
            {product.emoji}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">{product.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <Badge cls="bg-slate-800 text-slate-300 border-slate-700">{site.name}</Badge>
              <Badge cls={av.cls}>{av.label}</Badge>
              <span className="mono">{product.sku}</span>
              <span>· {product.category}</span>
              <span>· checked {timeAgo(product.last_checked_at)}</span>
              {product.last_error && <Badge cls="bg-rose-500/15 text-rose-400 border-rose-500/25">{product.last_error}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost !py-2.5" onClick={() => setEditOpen(true)}>
            <Pencil size={15} /> Thresholds
          </button>
          <button className="btn-primary !py-2.5" onClick={runNow} disabled={running}>
            {running ? <RefreshCw size={15} className="animate-spin" /> : <PlayCircle size={15} />}
            {running ? 'Scanning…' : 'Scan now'}
          </button>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Current price</p>
          <p className="mt-1.5 text-2xl font-bold text-white">{money(product.current_price, site.currency)}</p>
          <p className={`mt-1 text-xs ${Number(product.price_change_pct) < 0 ? 'text-emerald-400' : Number(product.price_change_pct) > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
            {pct(product.price_change_pct)} last change
          </p>
        </Card>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Availability</p>
          <p className="mt-2 text-lg font-bold text-slate-100">{av.label}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{product.availability_text || '—'}</p>
        </Card>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Stock count</p>
          <p className="mt-1.5 text-2xl font-bold text-white">{product.stock_count ?? '—'}</p>
          <p className="mt-1 text-xs text-slate-500">alert at ≤ {product.low_stock_threshold}</p>
        </Card>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Rating</p>
          <p className="mt-1.5 text-2xl font-bold text-white">{product.rating ? `★ ${Number(product.rating).toFixed(1)}` : '—'}</p>
          <p className="mt-1 text-xs text-slate-500">customer average</p>
        </Card>
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Monitor</p>
          <p className="mt-1.5 text-2xl font-bold text-white">{product.monitor_interval_sec}s</p>
          <p className="mt-1 text-xs text-slate-500">{product.status === 'active' ? 'active' : 'paused'} · target {product.target_price ? money(product.target_price, site.currency) : '—'}</p>
        </Card>
      </div>

      {/* Chart + latest trace */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <SectionTitle sub={`${points.length} observations over ${history.length ? 'the last week of scans' : 'no data yet'}`}>Price history</SectionTitle>
          <div className="h-72">
            <Line
              data={priceData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: legendOpts, tooltip: { ...tooltipOpts, callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y, site.currency)}` } } },
                scales: {
                  x: axisDefaults({ grid: { display: false } }),
                  y: axisDefaults({ ticks: { ...axisDefaults().ticks, callback: (v) => money(v, site.currency).replace(/\.00$/, '') } }),
                },
              }}
            />
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <SectionTitle
            sub={latest ? `Scan #${latest.id} · ${fmtDateTime(latest.created_at)} · ${latest.duration_ms}ms` : 'No scans yet'}
            right={latest && <Badge cls={RUN_META[latest.status]?.cls}>{RUN_META[latest.status]?.label}</Badge>}
          >
            Latest selector trace
          </SectionTitle>
          {!latest && <EmptyState icon={RefreshCw} title="No runs yet" hint="Hit “Scan now” to execute the chain." />}
          <div className="space-y-1.5">
            {traceFields.map((t) => {
              const fm = FIELD_META[t.field] || { label: t.field, cls: 'bg-slate-500/15 text-slate-400 border-slate-500/25' };
              const used = (t.candidates || []).find((c) => c.matched && !c.healed);
              const healedEntry = (t.candidates || []).find((c) => c.healed && c.matched);
              const open = expandedField === t.field;
              return (
                <div key={t.field} className="rounded-xl border border-slate-800 bg-slate-950/50">
                  <button
                    onClick={() => setExpandedField(open ? null : t.field)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                  >
                    <Badge cls={fm.cls}>{fm.label}</Badge>
                    {t.healed ? (
                      <Badge cls="bg-violet-500/15 text-violet-400 border-violet-500/25"><Sparkles size={10} /> healed</Badge>
                    ) : t.matched ? (
                      <Badge cls="bg-emerald-500/15 text-emerald-400 border-emerald-500/25">matched</Badge>
                    ) : (
                      <Badge cls="bg-rose-500/15 text-rose-400 border-rose-500/25">missed</Badge>
                    )}
                    <span className="ml-auto flex items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                      {t.attempts} tries · {t.ms}ms
                    </span>
                    <span className="text-slate-600">{open ? '−' : '+'}</span>
                  </button>
                  <div className="border-t border-slate-800/70 px-3 py-2">
                    <p className="mono truncate text-[11.5px] text-slate-400" title={used?.pattern || healedEntry?.pattern || 'no candidate matched'}>
                      <span className="text-slate-600">value → </span>
                      <span className="text-slate-300">{t.value || '—'}</span>
                    </p>
                    {(used || healedEntry) && (
                      <p className="mono mt-1 truncate text-[11px] text-slate-500">
                        via <span className={healedEntry ? 'text-violet-400' : 'text-emerald-400'}>{used ? used.kind : 'probe'}</span>
                        {' '}“{(used || healedEntry).pattern}” · {used ? used.source : 'healing probe'}
                      </p>
                    )}
                    {open && (
                      <div className="mt-2 space-y-1 border-t border-slate-800/70 pt-2">
                        {(t.candidates || []).map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]">
                            {c.matched ? <CheckCircle2 size={12} className="text-emerald-400" /> : <XCircle size={12} className="text-rose-400/70" />}
                            <span className={`rounded px-1 ${TRACE_SOURCE_CLS[c.source] || TRACE_SOURCE_CLS.authored} border text-[9.5px] font-bold uppercase`}>{c.source}</span>
                            <span className={`mono truncate ${c.matched ? 'text-slate-300' : 'text-slate-600'}`} title={c.pattern}>
                              {c.kind}: {c.pattern}
                            </span>
                            <span className="ml-auto shrink-0 tabular-nums text-slate-600">{c.ms}ms</span>
                          </div>
                        ))}
                        {!t.candidates?.length && <p className="text-[11px] text-slate-600">No candidates available for this field.</p>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Run history */}
      <Card>
        <SectionTitle sub="Newest first · change detection applied after every extraction">Scan history</SectionTitle>
        <div className="space-y-1.5">
          {runs.map((r) => {
            const ch = r.change || {};
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
                <span className="text-xs font-medium text-slate-300">{fmtDateTime(r.created_at)}</span>
                <Badge cls={RUN_META[r.status]?.cls}>{RUN_META[r.status]?.label}</Badge>
                {r.healed && <Badge cls="bg-violet-500/15 text-violet-400 border-violet-500/25"><Sparkles size={10} /> healed</Badge>}
                <span className="flex items-center gap-1 text-[11px] text-slate-500 tabular-nums">
                  <Timer size={11} /> {r.duration_ms}ms
                </span>
                {ch.price && (
                  <span className="flex items-center gap-1 text-[11px] tabular-nums text-amber-300">
                    {money(ch.price.from, site.currency)} → {money(ch.price.to, site.currency)}
                  </span>
                )}
                {ch.availability && (
                  <span className="text-[11px] text-slate-400">
                    {(AVAIL_META[ch.availability.from] || {}).label || ch.availability.from} → {(AVAIL_META[ch.availability.to] || {}).label || ch.availability.to}
                  </span>
                )}
                {!ch.price && !ch.availability && <span className="text-[11px] text-slate-600">no change</span>}
                <span className="ml-auto text-[11px] text-slate-500">
                  {r.extracted?.price ? money(r.extracted.price.value, site.currency) : '—'}
                </span>
              </div>
            );
          })}
          {!runs.length && <EmptyState icon={RefreshCw} title="No scans yet" />}
        </div>
      </Card>

      {/* Thresholds modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Monitoring thresholds">
        <form onSubmit={saveSettings} className="space-y-4">
          <Field label="Product title">
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Low-stock alert at">
              <input className="input" type="number" min="0" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
            </Field>
            <Field label="Target price" hint="Optional">
              <input className="input" type="number" step="0.01" min="0" value={form.target_price} onChange={(e) => setForm({ ...form, target_price: e.target.value })} placeholder="—" />
            </Field>
            <Field label="Interval (s)">
              <input className="input" type="number" min="15" value={form.monitor_interval_sec} onChange={(e) => setForm({ ...form, monitor_interval_sec: e.target.value })} />
            </Field>
          </div>
          <Field label="Emoji marker">
            <input className="input" value={form.emoji} maxLength={4} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setEditOpen(false)}>Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary"><Save size={15} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
