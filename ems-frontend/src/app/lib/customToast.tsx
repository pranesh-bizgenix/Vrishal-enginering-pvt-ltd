'use client';

import { useEffect, type ReactNode } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { CheckIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/solid';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

type AppToastPayload = {
  type: ToastType;
  title?: string;
  message: string;
};

const toastStyles: Record<ToastType, { title: string; color: string; icon: ReactNode }> = {
  success: {
    title: 'Success!',
    color: '#12b76a',
    icon: <CheckIcon className="h-3 w-3 text-white" />,
  },
  warning: {
    title: 'Warning!',
    color: '#fb8c1a',
    icon: <ExclamationTriangleIcon className="h-3 w-3 text-white" />,
  },
  error: {
    title: 'Error!',
    color: '#dc2f5d',
    icon: <XMarkIcon className="h-3 w-3  text-white" />,
  },
  info: {
    title: 'Help!',
    color: '#0b84de',
    icon: <InformationCircleIcon className="h-3 w-3 text-white" />,
  },
};

function showAppToast({ type, title, message }: AppToastPayload) {
  const style = toastStyles[type];
  const toastId = `app-${type}`;

  toast.dismiss();
  toast.custom(
    (currentToast) => (
      <div
        className={[
          'pointer-events-auto flex w-[min(92vw,330px)] items-stretch bg-white pr-3 shadow-[0_18px_48px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/80 transition-all duration-200',
          currentToast.visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
        ].join(' ')}
      >
        <div className="w-2 shrink-0" style={{ backgroundColor: style.color }} />
        <div className="flex min-w-0 flex-1 gap-3 p-3">
          <div className="flex h-4 w-4 mt-1 shrink-0 items-center justify-center rounded-full shadow-sm" style={{ backgroundColor: style.color }}>
            {style.icon}
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold leading-tight" style={{ color: style.color }}>
              {title || style.title}
            </p>
            <p className="text-sm leading-6 text-slate-600">{message}</p>
          </div>
        </div>
        <button
          aria-label="Close notification"
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          onClick={() => toast.dismiss(currentToast.id)}
          type="button"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
    ),
    { duration: 3600, id: toastId, position: 'top-right' },
  );
}

export function showSuccessToast(title: string, message: string) {
  showAppToast({ type: 'success', title, message });
}

export function showWarningToast(title: string, message: string) {
  showAppToast({ type: 'warning', title, message });
}

export function showErrorToast(title: string, message: string) {
  showAppToast({ type: 'error', title, message });
}

export function showInfoToast(title: string, message: string) {
  showAppToast({ type: 'info', title, message });
}

export function dispatchToast(type: ToastType, message: string, title?: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<AppToastPayload>('ems-toast', { detail: { type, title, message } }));
}

export function AppToaster() {
  useEffect(() => {
    function handleToast(event: Event) {
      const detail = (event as CustomEvent<AppToastPayload>).detail;
      if (!detail?.message) {
        return;
      }
      showAppToast(detail);
    }

    window.addEventListener('ems-toast', handleToast);
    return () => window.removeEventListener('ems-toast', handleToast);
  }, []);

  return <Toaster gutter={14} toastOptions={{ duration: 3600 }} />;
}
