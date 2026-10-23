import React, { useEffect, useMemo, useState } from 'react';
import {
  ScanSearch,
  AlertTriangle,
  Sparkles,
  Eye,
  Play,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  Workflow,
  GraduationCap,
  Code2,
  X,
} from 'lucide-react';
import api, { errMsg } from '../api/client';
import { useToast } from '../context/ToastContext';
import { PageLoading, Card, Badge, Modal, EmptyState, Field, HealthBar } from '../components/ui';
import { FIELD_META } from '../utils/format';

const KIND_CLS = {
  css: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
  attr: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  regex: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/25',
};

const FIELD_ORDER = ['title', 'price', 'availability', 'rating', 'image', 'sku'];

const STEPS = [
  { icon: Workflow, title: '1 · Walk the chain', text: 'Each field has an ordered list of candidates (CSS → attr → regex). The engine times every attempt and records a full trace.' },
  { icon: ShieldCheck, title: '2 · Rescue with fallbacks', text: 'If the primary selector breaks, the chain falls through — JSON-LD regexes and og: meta tags usually still answer.' },
  { icon: GraduationCap, title: '3 · Self-heal & learn', text: 'When every candidate misses, heuristic probes rediscover the value and the winning pattern is persisted as a learned selector.' },
];

export default function Selectors() {
  const { push } = useToast();
  const [sites, setSites] = useState(null);
  const [siteId, setSiteId] = useState(null);
  const [groups, setGroups] = useState({});
  const [busy, setBusy] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [addingField, setAddingField] = useState(null);
  const [newSel, setNewSel] = useState({ pattern: '', kind: 'css', attr_name: '', priority: 100 });

  const [test, setTest] = useState({ field: 'price', kind: 'css', pattern: '', attr_name: '' });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const load = () => {
    Promise.all([api.get('/sites'), siteId ? api.get(`/selectors?siteId=${siteId}`) : api.get('/selectors')])
      .then(([sitesRes, selRes]) => {
        setSites(sitesRes.data);
        if (!siteId) setSiteId(sitesRes.data[0].id);
        setGroups(selRes.data.groups);
      })
      .catch((err) => push(errMsg(err, 'Failed to load selectors'), 'error'));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const site = useMemo(() => (sites || []).find((s) => String(s.id) === String(siteId)), [sites, siteId]);

  const redesign = async () => {
    if (!site) return;
    setBusy(true);
    try {
      const res = await api.post(`/sites/${site.id}/redesign`);
      push(res.data.message, 'info', 6000);
      load();
    } catch (err) {
      push(errMsg(err, 'Redesign failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const openPreview = async () => {
    try {
      const res = await api.get(`/sites/${site.id}/fixture`, { transformResponse: [(d) => d] });
      setPreviewHtml(res.data);
      setPreviewOpen(true);
    } catch (err) {
      push(errMsg(err, 'Could not render fixture'), 'error');
    }
  };

  const move = async (sel, dir) => {
    const list = groups[sel.field] || [];
    const idx = list.findIndex((x) => x.id === sel.id);
    const swap = list[idx + dir];
    if (!swap) return;
    try {
      await Promise.all([
        api.put(`/selectors/${sel.id}`, { priority: swap.priority }),
        api.put(`/selectors/${swap.id}`, { priority: sel.priority }),
      ]);
      setGroups({
        ...groups,
        [sel.field]: list
          .map((x) => (x.id === sel.id ? { ...x, priority: swap.priority } : x.id === swap.id ? { ...x, priority: sel.priority } : x))
          .sort((a, b) => a.priority - b.priority),
      });
    } catch (err) {
      push(errMsg(err, 'Reorder failed'), 'error');
    }
  };

  const toggleActive = async (sel) => {
    try {
      const res = await api.put(`/selectors/${sel.id}`, { active: !sel.active });
      setGroups({
        ...groups,
        [sel.field]: (groups[sel.field] || []).map((x) => (x.id === sel.id ? { ...x, active: res.data.active } : x)),
      });
    } catch (err) {
      push(errMsg(err, 'Toggle failed'), 'error');
    }
  };

  const removeSel = async (sel) => {
    try {
      await api.delete(`/selectors/${sel.id}`);
      push('Candidate removed', 'success');
      setGroups({ ...groups, [sel.field]: (groups[sel.field] || []).filter((x) => x.id !== sel.id) });
    } catch (err) {
      push(errMsg(err, 'Delete failed'), 'error');
    }
  };

  const addSel = async (field) => {
    if (!newSel.pattern.trim()) return push('Enter a selector pattern first', 'error');
    try {
      const created = await api.post('/selectors', {
        site_id: Number(siteId),
        field,
        pattern: newSel.pattern.trim(),
        kind: newSel.kind,
        attr_name: newSel.kind === 'attr' ? newSel.attr_name || null : null,
        priority: Number(newSel.priority) || 100,
      });
      push(`Candidate added to ${field} chain`, 'success');
      setAddingField(null);
      setNewSel({ pattern: '', kind: 'css', attr_name: '', priority: 100 });
      setGroups({ ...groups, [field]: [...(groups[field] || []), created.data].sort((a, b) => a.priority - b.priority) });
    } catch (err) {
      push(errMsg(err, 'Add failed'), 'error');
    }
  };

  const runTest = async () => {
    if (!test.pattern.trim()) return push('Enter a pattern to test', 'error');
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/selectors/test', {
        site_id: Number(siteId),
        field: test.field,
        kind: test.kind,
        pattern: test.pattern.trim(),
        attr_name: test.kind === 'attr' ? test.attr_name || null : null,
      });
      setTestResult(res.data);
    } catch (err) {
      push(errMsg(err, 'Test failed'), 'error');
    } finally {
      setTesting(false);
    }
  };

  if (!sites || !site) return <PageLoading label="Loading selector lab…" />;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Site tabs + redesign */}
      <Card className="!p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-slate-800 bg-slate-950/70 p-1">
            {sites.map((s) => (
              <button
                key={s.id}
                onClick={() => setSiteId(String(s.id))}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  String(s.id) === String(siteId) ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {s.name}
                {s.learned_count > 0 && (
                  <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold">{s.learned_count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Badge cls="bg-slate-800 text-slate-300 border-slate-700">DOM v{site.dom_version}</Badge>
            <span className="hidden md:inline">{site.description}</span>
          </div>

          <div className="ml-auto flex gap-2">
            <button className="btn-ghost !py-2 text-xs" onClick={openPreview}>
              <Eye size={14} /> Preview live DOM
            </button>
            <button className="btn !border-violet-500/40 !bg-violet-500/10 !text-violet-300 hover:!bg-violet-500/20 !py-2 text-xs" onClick={redesign} disabled={busy}>
              <AlertTriangle size={14} className={busy ? 'animate-pulse' : ''} />
              {busy ? 'Reshuffling…' : 'Simulate site redesign'}
            </button>
          </div>
        </div>
      </Card>

      {/* How it works */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="!py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/10 p-2 text-indigo-400">
                <Icon size={16} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-100">{title}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">{text}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Live tester */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-2 text-violet-400">
              <Play size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Live selector tester</h2>
              <p className="text-[11px] text-slate-500">Runs one candidate against a freshly rendered {site.name} page (DOM v{site.dom_version})</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <Field label="Extract field">
              <select className="input !py-2" value={test.field} onChange={(e) => setTest({ ...test, field: e.target.value })}>
                {FIELD_ORDER.map((f) => <option key={f} value={f}>{FIELD_META[f].label}</option>)}
              </select>
            </Field>
          </div>
          <div className="w-28">
            <Field label="Kind">
              <select className="input !py-2" value={test.kind} onChange={(e) => setTest({ ...test, kind: e.target.value })}>
                <option value="css">CSS</option>
                <option value="attr">Attr</option>
                <option value="regex">Regex</option>
              </select>
            </Field>
          </div>
          {test.kind === 'attr' && (
            <div className="w-36">
              <Field label="Attribute">
                <input className="input !py-2 mono" placeholder="content / src / data-x" value={test.attr_name} onChange={(e) => setTest({ ...test, attr_name: e.target.value })} />
              </Field>
            </div>
          )}
          <div className="min-w-56 flex-1">
            <Field label={test.kind === 'regex' ? 'Pattern (capture group 1 = value)' : 'Selector pattern'}>
              <input
                className="input !py-2 mono"
                placeholder={test.kind === 'regex' ? '"price"\\s*:\\s*"?([0-9.,]+)' : test.kind === 'attr' ? 'meta[property="og:image"]' : '#productTitle'}
                value={test.pattern}
                onChange={(e) => setTest({ ...test, pattern: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && runTest()}
              />
            </Field>
          </div>
          <button className="btn-primary !py-2" onClick={runTest} disabled={testing}>
            {testing ? 'Testing…' : 'Test selector'}
          </button>
        </div>

        {testResult && (
          <div className={`mt-4 animate-fade-in rounded-xl border px-4 py-3 ${testResult.matched ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}>
            <div className="flex flex-wrap items-center gap-2.5">
              {testResult.matched ? (
                <Badge cls="bg-emerald-500/15 text-emerald-400 border-emerald-500/25">✓ matched in {testResult.ms}ms</Badge>
              ) : (
                <Badge cls="bg-rose-500/15 text-rose-400 border-rose-500/25">✗ no match ({testResult.ms}ms)</Badge>
              )}
              {testResult.matched && testResult.value && (
                <span className="mono text-[12.5px] text-slate-200">
                  → {typeof testResult.value === 'object' ? (testResult.value.raw ?? JSON.stringify(testResult.value)) : testResult.value}
                  {testResult.value?.status && <span className="text-slate-500"> · {testResult.value.status}{testResult.value.count != null ? ` · ${testResult.value.count} left` : ''}</span>}
                </span>
              )}
              {!testResult.matched && <span className="text-xs text-slate-400">The engine would now run its healing probes for this field.</span>}
            </div>
            {testResult.matchHtml && (
              <pre className="mono mt-2.5 max-h-32 overflow-auto rounded-lg bg-slate-950/80 p-3 text-[11px] leading-relaxed text-slate-400">
                {testResult.matchHtml}
              </pre>
            )}
          </div>
        )}
      </Card>

      {/* Chains */}
      <div className="space-y-4">
        {FIELD_ORDER.map((f) => {
          const list = groups[f] || [];
          const fm = FIELD_META[f];
          return (
            <Card key={f}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Badge cls={fm.cls}>{fm.label}</Badge>
                  <span className="text-[11px] text-slate-500">{list.length} candidate{list.length !== 1 ? 's' : ''} · evaluated top-down</span>
                </div>
                <div className="flex items-center gap-2">
                  <HealthBar hits={list.reduce((a, s) => a + s.hits, 0)} misses={list.reduce((a, s) => a + s.misses, 0)} />
                  <button
                    className="btn-ghost !px-2.5 !py-1.5 text-[11px]"
                    onClick={() => setAddingField(addingField === f ? null : f)}
                  >
                    <Plus size={12} /> Add
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {list.map((s, i) => (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                      s.active ? 'border-slate-800 bg-slate-950/50' : 'border-slate-900 bg-slate-950/30 opacity-50'
                    } ${i === 0 ? 'border-l-2 border-l-indigo-500' : ''}`}
                  >
                    <span className="mono w-4 text-center text-[11px] font-bold text-slate-600">{i + 1}</span>
                    <Badge cls={KIND_CLS[s.kind]}>{s.kind}</Badge>
                    <code className={`mono min-w-0 flex-1 truncate ${s.source === 'learned' ? 'text-violet-300' : 'text-slate-300'}`} title={s.pattern}>
                      {s.pattern}
                    </code>
                    {s.source === 'learned' && (
                      <Badge cls="bg-violet-500/15 text-violet-400 border-violet-500/25"><Sparkles size={10} /> learned</Badge>
                    )}
                    <HealthBar hits={s.hits} misses={s.misses} className="hidden lg:flex" />
                    <span className="hidden w-20 text-right text-[10.5px] tabular-nums text-slate-600 sm:block">{s.hits}✓ {s.misses}✗</span>
                    <div className="flex items-center opacity-60 transition group-hover:opacity-100">
                      <button className="rounded p-1 text-slate-500 hover:text-white disabled:opacity-20" disabled={i === 0} onClick={() => move(s, -1)} title="Move up">
                        <ChevronUp size={13} />
                      </button>
                      <button className="rounded p-1 text-slate-500 hover:text-white disabled:opacity-20" disabled={i === list.length - 1} onClick={() => move(s, 1)} title="Move down">
                        <ChevronDown size={13} />
                      </button>
                      <button className="rounded p-1 text-slate-500 hover:text-indigo-400" onClick={() => toggleActive(s)} title={s.active ? 'Disable' : 'Enable'}>
                        {s.active ? <ToggleRight size={15} className="text-emerald-500" /> : <ToggleLeft size={15} />}
                      </button>
                      <button className="rounded p-1 text-slate-500 hover:text-rose-400" onClick={() => removeSel(s)} title="Remove">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}

                {!list.length && (
                  <div className="rounded-xl border border-dashed border-slate-800 px-4 py-5 text-center text-[11.5px] text-slate-600">
                    No candidates — every scan will rely purely on healing probes for <b>{f}</b>.
                  </div>
                )}
              </div>

              {addingField === f && (
                <div className="mt-3 animate-fade-in rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3.5">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-28">
                      <Field label="Kind">
                        <select className="input !py-2" value={newSel.kind} onChange={(e) => setNewSel({ ...newSel, kind: e.target.value })}>
                          <option value="css">CSS</option>
                          <option value="attr">Attr</option>
                          <option value="regex">Regex</option>
                        </select>
                      </Field>
                    </div>
                    {newSel.kind === 'attr' && (
                      <div className="w-32">
                        <Field label="Attribute">
                          <input className="input !py-2 mono" value={newSel.attr_name} onChange={(e) => setNewSel({ ...newSel, attr_name: e.target.value })} placeholder="content" />
                        </Field>
                      </div>
                    )}
                    <div className="min-w-52 flex-1">
                      <Field label="Pattern">
                        <input
                          className="input !py-2 mono"
                          value={newSel.pattern}
                          onChange={(e) => setNewSel({ ...newSel, pattern: e.target.value })}
                          placeholder={newSel.kind === 'regex' ? 'SKU:\\s*([A-Z0-9-]+)' : '[data-testid="price"]'}
                        />
                      </Field>
                    </div>
                    <div className="w-24">
                      <Field label="Priority">
                        <input className="input !py-2" type="number" value={newSel.priority} onChange={(e) => setNewSel({ ...newSel, priority: e.target.value })} />
                      </Field>
                    </div>
                    <button className="btn-primary !py-2" onClick={() => addSel(f)}>Add</button>
                    <button className="btn-ghost !py-2" onClick={() => setAddingField(null)}><X size={14} /></button>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Code2 size={12} /> Lower priority runs first. Tip: test the pattern in the live tester above before saving.
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* DOM preview */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={`${site.name} — rendered DOM (v${site.dom_version})`} width="max-w-4xl">
        <div className="mb-3 flex items-center justify-between text-[11px] text-slate-500">
          <span>Fixture HTML as the engine sees it</span>
          <button className="btn-ghost !px-2.5 !py-1 text-[11px]" onClick={openPreview}>Re-render</button>
        </div>
        <iframe
          title="fixture-preview"
          srcDoc={previewHtml}
          sandbox=""
          className="h-96 w-full rounded-xl border border-slate-800 bg-white"
        />
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-white">View raw HTML source</summary>
          <pre className="mono mt-2 max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-500">{previewHtml}</pre>
        </details>
      </Modal>

      {!sites.length && <EmptyState icon={ScanSearch} title="No storefronts configured" />}
    </div>
  );
}
