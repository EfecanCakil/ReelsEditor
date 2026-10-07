import { useEffect } from 'react';
import { useStore } from '../store.js';

export default function Toast() {
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useStore.setState({ toast: null }), toast.kind === 'error' ? 7000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind}`} onClick={() => useStore.setState({ toast: null })}>
      {toast.msg}
    </div>
  );
}
