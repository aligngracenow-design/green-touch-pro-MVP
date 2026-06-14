import { useEffect, useState } from 'react';
import { cx } from '../lib/utils';

let toastFn: ((msg: string, type?: 'success' | 'error') => void) | null = null;

export function toast(msg: string, type: 'success' | 'error' = 'success') {
  toastFn?.(msg, type);
}

export function Toaster() {
  const [state, setState] = useState<{ msg: string; type: 'success' | 'error'; show: boolean }>({
    msg: '', type: 'success', show: false,
  });

  useEffect(() => {
    toastFn = (msg, type = 'success') => {
      setState({ msg, type, show: true });
      setTimeout(() => setState((s) => ({ ...s, show: false })), 3000);
    };
    return () => { toastFn = null; };
  }, []);

  return (
    <div
      className={cx(
        'fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl font-semibold text-sm shadow-card transition-all duration-300',
        state.type === 'success' ? 'bg-green text-bg' : 'bg-red text-white',
        state.show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none',
      )}
    >
      {state.msg}
    </div>
  );
}
