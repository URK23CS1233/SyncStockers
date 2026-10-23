export const AVAIL_META = {
  in_stock: { label: 'In stock', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  low_stock: { label: 'Low stock', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  out_of_stock: { label: 'Out of stock', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/25' },
  unknown: { label: 'Unknown', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/25' },
};

export const FIELD_META = {
  title: { label: 'Title', cls: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25' },
  price: { label: 'Price', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  availability: { label: 'Availability', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  rating: { label: 'Rating', cls: 'bg-violet-500/15 text-violet-400 border-violet-500/25' },
  image: { label: 'Image', cls: 'bg-sky-500/15 text-sky-400 border-sky-500/25' },
  sku: { label: 'SKU', cls: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/25' },
};

export const RUN_META = {
  success: { label: 'Success', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  partial: { label: 'Partial', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  failed: { label: 'Failed', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/25' },
};

export const ALERT_META = {
  price_drop: { label: 'Price drop', icon: 'TrendingDown', cls: 'text-amber-400 bg-amber-500/15 border-amber-500/25' },
  price_increase: { label: 'Price rise', icon: 'TrendingUp', cls: 'text-sky-400 bg-sky-500/15 border-sky-500/25' },
  low_stock: { label: 'Low stock', icon: 'AlertTriangle', cls: 'text-amber-400 bg-amber-500/15 border-amber-500/25' },
  out_of_stock: { label: 'Out of stock', icon: 'PackageX', cls: 'text-rose-400 bg-rose-500/15 border-rose-500/25' },
  back_in_stock: { label: 'Restocked', icon: 'RotateCcw', cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25' },
  target_price: { label: 'Target hit', icon: 'Target', cls: 'text-violet-400 bg-violet-500/15 border-violet-500/25' },
  selector_failure: { label: 'Selector failure', icon: 'Unlink', cls: 'text-rose-400 bg-rose-500/15 border-rose-500/25' },
};

export const SEVERITY_CLS = {
  critical: 'border-l-rose-500',
  warning: 'border-l-amber-500',
  info: 'border-l-sky-500',
};

export function money(value, currency = 'INR') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(n);
  } catch (e) {
    return `${currency === 'USD' ? '$' : '₹'}${n.toFixed(2)}`;
  }
}

export function timeAgo(iso) {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return 'just now';
  if (secs < 90) return '1 min ago';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString();
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function pct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.0%';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}
