import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ScanSearch,
  Bell,
  LogOut,
  ScanLine,
  PlayCircle,
  Activity,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/selectors', label: 'Dynamic Selectors', icon: ScanSearch },
  { to: '/alerts', label: 'Alerts', icon: Bell },
];

const TITLES = {
  '/': ['Dashboard', 'Overview of your monitored storefronts'],
  '/inventory': ['Inventory', 'Products under automated monitoring'],
  '/selectors': ['Dynamic Selectors', 'Fallback chains, live tester & self-healing'],
  '/alerts': ['Alerts', 'Price, stock and selector-health events'],
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { push } = useToast();
  const location = useLocation();
  const [running, setRunning] = useState(false);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [live, setLive] = useState(true);

  const [title, sub] = TITLES[location.pathname] || ['StockLens', ''];

  useEffect(() => {
    api.get('/alerts?state=open&limit=1')
      .then((res) => setOpenAlerts(res.data.counts.open))
      .catch(() => {});
    const t = setInterval(() => {
      api.get('/alerts?state=open&limit=1')
        .then((res) => setOpenAlerts(res.data.counts.open))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [location.pathname]);

  const runAll = async () => {
    setRunning(true);
    try {
      const res = await api.post('/products/run-all');
      const { total, ok, failed, healed } = res.data;
      push(
        `Scanned ${total} products — ${ok} ok, ${failed} failed${healed ? `, ${healed} healed by learned selectors` : ''}`,
        failed ? 'error' : 'success',
        5000
      );
    } catch (err) {
      push('Scan failed — API unreachable', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-900 bg-slate-950">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30">
            <ScanLine size={18} className="text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-tight text-white">StockLens</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Inventory monitor</p>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-inner shadow-slate-800/60'
                    : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-100'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`absolute left-0 h-5 w-0.5 rounded-r bg-gradient-to-b from-indigo-400 to-violet-400 transition ${
                      isActive ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  <Icon size={17} className={isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'} />
                  {label}
                  {label === 'Alerts' && openAlerts > 0 && (
                    <span className="ml-auto rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-400">
                      {openAlerts}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-900 p-3">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-600 text-xs font-bold text-white">
              {(user?.username || '?').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-200">{user?.username}</p>
              <p className="truncate text-[10px] text-slate-500">{user?.email}</p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-rose-400"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col pl-60">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-900 bg-slate-950/80 px-6 py-3.5 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold tracking-tight text-white">{title}</h1>
            <p className="truncate text-xs text-slate-500">{sub}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 sm:inline-flex">
              <span
                className={`h-1.5 w-1.5 rounded-full bg-emerald-400 ${live ? 'animate-pulse' : ''}`}
                onClick={() => setLive(!live)}
              />
              Scheduler live
            </span>
            <button onClick={runAll} disabled={running} className="btn-ghost !py-2 text-xs">
              {running ? (
                <>
                  <Activity size={14} className="animate-pulse text-indigo-400" /> Scanning…
                </>
              ) : (
                <>
                  <PlayCircle size={14} /> Run all scans
                </>
              )}
            </button>
            <NavLink
              to="/alerts"
              className="relative rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 transition hover:text-white"
              title="Alerts"
            >
              <Bell size={16} />
              {openAlerts > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                  {openAlerts > 9 ? '9+' : openAlerts}
                </span>
              )}
            </NavLink>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
