import { CheckCircle, WarningCircle, X } from "@phosphor-icons/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ToastTone = "success" | "error";
type ShowToast = (message: string, options?: { tone?: ToastTone }) => void;

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

export const SUCCESS_TOAST_MS = 4000;

const ToastContext = createContext<ShowToast | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback<ShowToast>(
    (message, { tone = "success" } = {}) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      // Errors stay until dismissed so there is time to read what to do next.
      if (tone === "success") {
        const timer = window.setTimeout(() => {
          timers.current.delete(timer);
          dismiss(id);
        }, SUCCESS_TOAST_MS);
        timers.current.add(timer);
      }
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-5 lg:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full max-w-[400px] items-center gap-3 rounded-control bg-ink py-1 pr-1 pl-4 text-sm text-card"
          >
            {toast.tone === "success" ? (
              <CheckCircle aria-hidden="true" size={20} className="shrink-0" />
            ) : (
              <WarningCircle aria-hidden="true" size={20} className="shrink-0" />
            )}
            <p className="flex-1 py-2">{toast.message}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-control"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside ToastProvider.");
  return show;
}
