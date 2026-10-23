import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  PlayCircle,
  Pencil,
  Trash2,
  Package,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react';
import api, { errMsg } from '../api/client';
import { useToast } from '../context/ToastContext';
import { PageLoading, Card, Badge, Modal, ConfirmDialog, EmptyState, Field } from '../components/ui';
import { money, timeAgo, AVAIL_META, pct } from '../utils/format';

const EMOJIS = ['📦', '🎧', '🖱️', '⌨️', '📱', '💻', '👟', '👕', '⌚', '📷', '☕', '🥤', '🎒', '⚽', '🌀', '🍶', '🧰', '🔌', '💡', '🪑'];

export default function Products() {
  const { push } = useToast();
  const navigate = useNavigate();

  const [products, setProducts] = useState(null);
  const [sites, setSites] = useState([]);
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [availFilter, setAvailFilter] = useState('');
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  function emptyForm() {
    return {
      title: '', site_id: '', category: 'General', emoji: '📦', sku: '',
      base_price: '', low_stock_threshold: 10, target_price: '', monitor_interval_sec: 60,
    };
  }

  const load = () => {
    api.get('/products')
      .then((res) => setProducts(res.data))
      .catch((err) => {
        push(errMsg(err, 'Failed to load products'), 'error');
        setProducts([]);
      });
  };

  useEffect(() => {
    load();
    api.get('/sites').then((res) => setSites(res.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (siteFilter && String(p.site_id) !== siteFilter) return false;
      if (availFilter && p.availability !== availFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    });
  }, [products, search, siteFilter, availFilter]);

  const runOne = async (p) => {
    setBusyId(p.id);
    try {
      const res = await api.post(`/products/${p.id}/run`);
      const { run, change } = res.data;
      push(
        run.status === 'failed'
          ? `Scan failed for "${p.title}" — selector chain broken`
          : run.healed
            ? `Scanned with self-healing for "${p.title}"`
            : `Scanned "${p.title}" ✓`,
        run.status === 'failed' ? 'error' : 'success'
      );
      if (change && change.price) {
        const delta = ((change.price.to - change.price.from) / change.price.from) * 100;
        setTimeout(() => push(`Price ${delta < 0 ? 'dropped' : 'rose'} ${Math.abs(delta).toFixed(1)}% → ${money(change.price.to, p.currency || p.site_currency)}`, 'info'), 350);
      }
      load();
    } catch (err) {
      push(errMsg(err, 'Scan failed'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const runAll = async () => {
    setRunning(true);
    try {
      const res = await api.post('/products/run-all');
      const { total, ok, failed, healed } = res.data;
      push(`Scanned ${total} — ${ok} ok, ${failed} failed${healed ? `, ${healed} healed` : ''}`, failed ? 'error' : 'success', 5000);
      load();
    } catch (err) {
      push(errMsg(err, 'Bulk scan failed'), 'error');
    } finally {
      setRunning(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm(), site_id: sites[0] ? String(sites[0].id) : '' });
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      title: p.title, site_id: String(p.site_id), category: p.category || 'General', emoji: p.emoji || '📦',
      sku: p.sku || '', base_price: p.base_price || '', low_stock_threshold: p.low_stock_threshold,
      target_price: p.target_price ?? '', monitor_interval_sec: p.monitor_interval_sec,
    });
    setModalOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, {
          title: form.title, category: form.category, emoji: form.emoji,
          low_stock_threshold: Number(form.low_stock_threshold) || 10,
          target_price: form.target_price === '' ? null : Number(form.target_price),
          monitor_interval_sec: Number(form.monitor_interval_sec) || 60,
        });
        push('Product updated', 'success');
      } else {
        await api.post('/products', {
          ...form,
          site_id: Number(form.site_id),
          base_price: form.base_price === '' ? undefined : Number(form.base_price),
          low_stock_threshold: Number(form.low_stock_threshold) || 10,
          target_price: form.target_price === '' ? null : Number(form.target_price),
          monitor_interval_sec: Number(form.monitor_interval_sec) || 60,
        });
        push('Product added — first scan completed', 'success');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      push(errMsg(err, 'Save failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/products/${toDelete.id}`);
      push('Product removed', 'success');
      load();
    } catch (err) {
      push(errMsg(err, 'Delete failed'), 'error');
    }
  };

  const currencyOf = (p) => p.currency || p.site_currency || 'INR';

  if (!products) return <PageLoading label="Loading inventory…" />;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <Card className="!py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-52 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input !pl-9"
              placeholder="Search title, SKU or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input !w-auto" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
            <option value="">All storefronts</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input !w-auto" value={availFilter} onChange={(e) => setAvailFilter(e.target.value)}>
            <option value="">Any stock status</option>
            <option value="in_stock">In stock</option>
            <option value="low_stock">Low stock</option>
            <option value="out_of_stock">Out of stock</option>
            <option value="unknown">Unknown</option>
          </select>
          <button className="btn-ghost !py-2.5" onClick={runAll} disabled={running}>
            <RefreshCw size={15} className={running ? 'animate-spin' : ''} />
            {running ? 'Scanning…' : 'Run all scans'}
          </button>
          <button className="btn-primary !py-2.5" onClick={openAdd}>
            <Plus size={15} /> Add product
          </button>
        </div>
      </Card>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={products.length === 0 ? 'No products yet' : 'No matches'}
          hint={products.length === 0 ? 'Add your first product to start automated monitoring.' : 'Try clearing the search or filters.'}
          action={products.length === 0 ? <button className="btn-primary" onClick={openAdd}><Plus size={15} /> Add product</button> : null}
        />
      ) : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-semibold">Product</th>
                <th className="px-3 py-3 font-semibold">Storefront</th>
                <th className="px-3 py-3 font-semibold">Price</th>
                <th className="px-3 py-3 font-semibold">Stock status</th>
                <th className="px-3 py-3 font-semibold">Rating</th>
                <th className="px-3 py-3 font-semibold">Last checked</th>
                <th className="px-3 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const av = AVAIL_META[p.availability] || AVAIL_META.unknown;
                const delta = Number(p.price_change_pct || 0);
                return (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/inventory/${p.id}`)}
                    className="cursor-pointer border-b border-slate-800/60 transition last:border-0 hover:bg-slate-950/70"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{p.emoji}</span>
                        <div className="min-w-0">
                          <p className="max-w-72 truncate font-medium text-slate-100">{p.title}</p>
                          <p className="mono text-[11px] text-slate-500">{p.sku} · {p.category}</p>
                        </div>
                        {p.open_alerts > 0 && (
                          <Badge cls="bg-rose-500/15 text-rose-400 border-rose-500/25">{p.open_alerts} 🔔</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <Badge cls="bg-slate-800/80 text-slate-300 border-slate-700">{p.site_name}</Badge>
                      {p.last_run_healed && <Badge cls="bg-violet-500/15 text-violet-400 border-violet-500/25 ml-1">healed</Badge>}
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="font-semibold tabular-nums text-slate-100">{money(p.current_price, currencyOf(p))}</p>
                      <p className={`flex items-center gap-0.5 text-[11px] tabular-nums ${delta < 0 ? 'text-emerald-400' : delta > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                        {delta < 0 ? <TrendingDown size={11} /> : delta > 0 ? <TrendingUp size={11} /> : <Minus size={11} />}
                        {pct(delta)}
                      </p>
                    </td>
                    <td className="px-3 py-3.5">
                      <Badge cls={av.cls}>{av.label}</Badge>
                      {p.stock_count != null && (
                        <p className="mt-1 text-[11px] text-slate-500 tabular-nums">{p.stock_count} units</p>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-slate-300 tabular-nums">
                      {p.rating ? `★ ${Number(p.rating).toFixed(1)}` : '—'}
                    </td>
                    <td className="px-3 py-3.5 text-xs text-slate-400">{timeAgo(p.last_checked_at)}</td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          title="Scan now"
                          onClick={() => runOne(p)}
                          disabled={busyId === p.id}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-indigo-500/15 hover:text-indigo-400 disabled:opacity-40"
                        >
                          <PlayCircle size={16} className={busyId === p.id ? 'animate-pulse' : ''} />
                        </button>
                        <button
                          title="Edit"
                          onClick={() => openEdit(p)}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          title="Delete"
                          onClick={() => setToDelete(p)}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-400"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-center text-[11px] text-slate-600">
        {filtered.length} of {products.length} products · the scheduler rescans every product on its own interval
      </p>

      {/* Add / edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit product' : 'Add product to monitor'} width="max-w-xl">
        <form onSubmit={save} className="space-y-4">
          <Field label="Product title">
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Sony WH-1000XM5 Headphones" required />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Storefront" hint={editing ? 'Changing storefront is not supported' : 'Fixture profile + selector chain'}>
              <select
                className="input"
                value={form.site_id}
                onChange={(e) => setForm({ ...form, site_id: e.target.value })}
                disabled={!!editing}
                required
              >
                <option value="" disabled>Select…</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.currency}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Electronics" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="List price (baseline)">
              <input className="input" type="number" step="0.01" min="0" value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} placeholder="29990" disabled={!!editing} />
            </Field>
            <Field label="SKU" hint="Auto-generated if left blank">
              <input className="input mono" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="MB123456" disabled={!!editing} />
            </Field>
          </div>

          <div>
            <label className="label">Emoji marker</label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((em) => (
                <button
                  type="button"
                  key={em}
                  onClick={() => setForm({ ...form, emoji: em })}
                  className={`rounded-lg border px-2.5 py-1.5 text-lg transition ${
                    form.emoji === em ? 'border-indigo-500 bg-indigo-500/15' : 'border-slate-800 hover:border-slate-600'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Low-stock alert at">
              <input className="input" type="number" min="0" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
            </Field>
            <Field label="Target price" hint="Optional">
              <input className="input" type="number" step="0.01" min="0" value={form.target_price} onChange={(e) => setForm({ ...form, target_price: e.target.value })} placeholder="—" />
            </Field>
            <Field label="Scan interval (s)" hint="Min 15s">
              <input className="input" type="number" min="15" value={form.monitor_interval_sec} onChange={(e) => setForm({ ...form, monitor_interval_sec: e.target.value })} />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add & scan now'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Delete product"
        message={`"${toDelete?.title}" and its full scan history, price series and alerts will be permanently removed.`}
      />
    </div>
  );
}
