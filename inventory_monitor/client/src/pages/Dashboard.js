import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Package,
  Activity,
  Bell,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
  TrendingDown,
  AlertTriangle,
  PackageX,
  RotateCcw,
  Target,
  Unlink,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';
import api from '../api/client';
import { PageLoading, Card, SectionTitle, StatCard, Badge, EmptyState } from '../components/ui';
import { GRID, tooltipOpts, legendOpts, axisDefaults } from '../charts/setup';
import { timeAgo, money, RUN_META, ALERT_META } from '../utils/format';

const ALERT_ICONS = {
  TrendingDown, TrendingUp, AlertTriangle, PackageX, RotateCcw, Target, Unlink,
};

function priceGradient(ctx, area) {
  if (!area) return 'rgba(99, 102, 241, 0.25)';
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, 'rgba(129, 140, 248, 0.35)');
  g.addColorStop(1, 'rgba(129, 140, 248, 0.0)');
  return g;
}

const DATASET_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#38bdf8'];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .get('/dashboard')
      .then((res) => alive && setData(res.data))
      .catch((err) => alive && setError(err));
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <PageLoading label="Could not reach the API — is the server running on :5000?" />;
  if (!data) return <PageLoading label="Loading dashboard…" />;

  const { kpis, priceTrend, stockDist, runOutcomes, alertsByType, recentRuns, recentAlerts, engine } = data;

  const priceData = {
    labels: priceTrend.labels.map((d) => d.slice(5)),
    datasets: priceTrend.datasets.map((ds, i) => ({
      ...ds,
      borderColor: DATASET_COLORS[i % DATASET_COLORS.length],
      backgroundColor: priceGradient,
      borderWidth: 2,
      pointRadius: 2.5,
      pointHoverRadius: 5,
      pointBackgroundColor: DATASET_COLORS[i % DATASET_COLORS.length],
      tension: 0.35,
      spanGaps: true,
      fill: i === 0,
    })),
  };

  const stockLabels = { in_stock: 'In stock', low_stock: 'Low stock', out_of_stock: 'Out of stock', unknown: 'Unknown' };
  const stockColors = { in_stock: '#34d399', low_stock: '#fbbf24', out_of_stock: '#fb7185', unknown: '#64748b' };
  const stockData = {
    labels: stockDist.map((s) => stockLabels[s.status] || s.status),
    datasets: [{
      data: stockDist.map((s) => s.count),
      backgroundColor: stockDist.map((s) => stockColors[s.status] || '#64748b'),
      borderColor: '#0f172a',
      borderWidth: 3,
      hoverOffset: 6,
    }],
  };

  const runsData = {
    labels: runOutcomes.labels.map((d) => d.slice(5)),
    datasets: [
      { label: 'Success', data: runOutcomes.success, backgroundColor: '#34d399', borderRadius: 4, borderSkipped: false },
      { label: 'Partial', data: runOutcomes.partial, backgroundColor: '#fbbf24', borderRadius: 4, borderSkipped: false },
      { label: 'Failed', data: runOutcomes.failed, backgroundColor: '#fb7185', borderRadius: 4, borderSkipped: false },
    ],
  };

  const alertColors = ['#fbbf24', '#38bdf8', '#fb7185', '#f472b6', '#34d399', '#a78bfa', '#f87171'];
  const alertsData = {
    labels: alertsByType.map((a) => ALERT_META[a.type]?.label || a.type),
    datasets: [{
      data: alertsByType.map((a) => a.count),
      backgroundColor: alertsByType.map((_, i) => alertColors[i % alertColors.length]),
      borderRadius: 6,
      barThickness: 16,
    }],
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Package} label="Products tracked" value={kpis.products} sub={`${kpis.activeMonitors} monitors active`} tone="indigo" />
        <StatCard icon={Activity} label="Extraction success" value={kpis.successRate != null ? `${kpis.successRate}%` : '—'} sub={`last ${kpis.runsSampled} scan runs`} tone="emerald" />
        <StatCard icon={Bell} label="Open alerts" value={kpis.openAlerts} sub={`${kpis.lowStock} products low/out of stock`} tone={kpis.openAlerts > 0 ? 'rose' : 'sky'} />
        <StatCard icon={Sparkles} label="Selector hit rate" value={engine.hitRate != null ? `${engine.hitRate}%` : '—'} sub={`${engine.candidates} candidates · ${engine.learned} learned`} tone="violet" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle
            sub={`Average daily price · last 7 days${priceTrend.datasets.length ? ` · ${priceTrend.datasets.length <= 1 ? 'INR products' : 'top ' + priceTrend.datasets.length + ' INR products'}` : ''}`}
            right={<Badge cls="bg-indigo-500/15 text-indigo-400 border-indigo-500/25">₹ trend</Badge>}
          >
            Price history
          </SectionTitle>
          {priceTrend.labels.length ? (
            <div className="h-64">
              <Line
                data={priceData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: legendOpts,
                    tooltip: { ...tooltipOpts, callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y, c.dataset.currency || 'INR')}` } },
                  },
                  scales: {
                    x: axisDefaults({ grid: { color: GRID, display: false } }),
                    y: axisDefaults({ ticks: { ...axisDefaults().ticks, callback: (v) => money(v, 'INR').replace(/\.00$/, '') } }),
                  },
                }}
              />
            </div>
          ) : (
            <EmptyState icon={TrendingDown} title="No price history yet" hint="Scans run automatically every minute — history builds as the scheduler works." />
          )}
        </Card>

        <Card>
          <SectionTitle sub="Current stock status across all products">Stock health</SectionTitle>
          <div className="mx-auto h-52 max-w-[220px]">
            <Doughnut
              data={stockData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                  legend: { ...legendOpts.legend, position: 'bottom' },
                  tooltip: tooltipOpts,
                },
              }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
              <p className="text-lg font-bold text-white">{kpis.lowStock}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Need attention</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
              <p className="text-lg font-bold text-white">{kpis.activeMonitors}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Monitored</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Runs + alerts + engine */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle sub="Scheduler outcomes per day · stacked by result">Scan runs</SectionTitle>
          <div className="h-56">
            <Bar
              data={runsData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: legendOpts, tooltip: tooltipOpts },
                scales: {
                  x: { ...axisDefaults({ grid: { display: false } }), stacked: true },
                  y: { ...axisDefaults(), stacked: true, ticks: { ...axisDefaults().ticks, precision: 0 } },
                },
              }}
            />
          </div>
        </Card>

        <Card>
          <SectionTitle sub="Unresolved alerts grouped by type">Open alerts by type</SectionTitle>
          {alertsByType.length ? (
            <>
              <div className="h-40">
                <Bar
                  data={alertsData}
                  options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: tooltipOpts },
                    scales: {
                      x: { ...axisDefaults(), ticks: { ...axisDefaults().ticks, precision: 0 } },
                      y: { ...axisDefaults({ grid: { display: false } }), ticks: axisDefaults().ticks },
                    },
                  }}
                />
              </div>
              <Link to="/alerts" className="mt-3 flex items-center justify-end gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300">
                View all alerts <ArrowUpRight size={13} />
              </Link>
            </>
          ) : (
            <EmptyState icon={CheckCircle2} title="All clear" hint="No open alerts right now." />
          )}
        </Card>
      </div>

      {/* Activity */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <SectionTitle sub="Latest monitoring passes with selector outcomes" right={
            <Link to="/inventory" className="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Inventory →</Link>
          }>
            Recent scans
          </SectionTitle>
          <div className="space-y-1.5">
            {recentRuns.map((r) => (
              <Link
                key={r.id}
                to={`/inventory/${r.product_id}`}
                className="flex items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition hover:border-slate-800 hover:bg-slate-950/60"
              >
                <span className="text-lg">{r.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-slate-200">{r.title}</p>
                  <p className="text-[11px] text-slate-500">{r.site_name} · {timeAgo(r.created_at)} · {r.duration_ms}ms</p>
                </div>
                {r.healed && <Badge cls="bg-violet-500/15 text-violet-400 border-violet-500/25">healed</Badge>}
                <Badge cls={RUN_META[r.status]?.cls}>{RUN_META[r.status]?.label}</Badge>
                <ChevronRight size={14} className="text-slate-600" />
              </Link>
            ))}
            {!recentRuns.length && <EmptyState icon={Activity} title="No scans yet" />}
          </div>
        </Card>

        <Card>
          <SectionTitle sub="Newest unresolved events" right={
            <Link to="/alerts" className="text-xs font-semibold text-indigo-400 hover:text-indigo-300">All alerts →</Link>
          }>
            Recent alerts
          </SectionTitle>
          <div className="space-y-2">
            {recentAlerts.map((a) => {
              const meta = ALERT_META[a.type] || { icon: 'Bell', label: a.type, cls: 'text-slate-400 bg-slate-500/15 border-slate-500/25' };
              const Icon = ALERT_ICONS[meta.icon] || Bell;
              return (
                <div key={a.id} className={`flex items-start gap-3 rounded-xl border border-slate-800 border-l-2 bg-slate-950/50 px-3 py-2.5 ${a.severity === 'critical' ? 'border-l-rose-500' : a.severity === 'warning' ? 'border-l-amber-500' : 'border-l-sky-500'}`}>
                  <div className={`mt-0.5 rounded-lg border p-1.5 ${meta.cls}`}>
                    <Icon size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-slate-200">{a.message}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{a.site_name} · {timeAgo(a.created_at)}</p>
                  </div>
                </div>
              );
            })}
            {!recentAlerts.length && <EmptyState icon={CheckCircle2} title="Nothing needs attention" hint="The monitor hasn't raised any open alerts." />}
          </div>
        </Card>
      </div>

      {/* Engine explainer strip */}
      <Card className="flex flex-wrap items-center justify-between gap-4 !py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-2 text-violet-400">
            <Sparkles size={16} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-slate-200">Dynamic selector engine</p>
            <p className="text-[11px] text-slate-500">
              {engine.candidates} candidates evaluated {engine.evaluations} times · {engine.learned} selectors auto-learned from DOM changes
            </p>
          </div>
        </div>
        <Link to="/selectors" className="btn-ghost !py-2 text-xs">
          Open selector lab <ArrowUpRight size={14} />
        </Link>
      </Card>
    </div>
  );
}
