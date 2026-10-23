import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

let nextId = 1;

const STYLES = {
  success: 'border-emerald-700/60 bg-emerald-950/90 text-emerald-100',
  error: 'border-rose-700/60 bg-rose-950/90 text-rose-100',
  info: 'border-slate-700 bg-slate-900/95 text-slate-100',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback((message, type = 'info', ms = 3500) => {
    const id = nextId++;
    setToasts((list) => [...list, { id, message, type }]);
    timers.current[id] = setTimeout(() => dismiss(id), ms);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto animate-fade-in cursor-pointer rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${STYLES[t.type] || STYLES.info}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
