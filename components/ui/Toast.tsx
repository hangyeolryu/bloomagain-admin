'use client';

/**
 * 화면 우하단 토스트.
 *
 * 차단처럼 "핵심 동작은 성공했지만 후처리가 실패한" 경우를 알린다. 이런 부분
 * 실패를 console.warn만 남기면 관리자는 정리까지 다 끝났다고 믿는데, 실제로는
 * 대기 웨이브가 남아 있거나 대화에 차단 표시가 안 붙어 있다.
 *
 * 통계 화면의 StatWarnings가 "읽는 화면"용이라면, 이건 "동작한 직후"용이다.
 */

import { useEffect } from 'react';

export type ToastKind = 'warning' | 'success';

export interface ToastState {
  kind: ToastKind;
  title: string;
  /** 줄 단위로 표시할 상세(실패한 후처리 목록 등) */
  details?: string[];
}

export default function Toast({
  toast,
  onClose,
  autoCloseMs = 8000,
}: {
  toast: ToastState | null;
  onClose: () => void;
  autoCloseMs?: number;
}) {
  useEffect(() => {
    if (!toast) return;
    // 경고는 읽는 데 시간이 걸리니 성공보다 오래 띄운다.
    const ms = toast.kind === 'warning' ? autoCloseMs : 3500;
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [toast, onClose, autoCloseMs]);

  if (!toast) return null;

  const warn = toast.kind === 'warning';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border p-4 shadow-lg ${
        warn
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-emerald-300 bg-emerald-50 text-emerald-900'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.details && toast.details.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs">
              {toast.details.map((d) => (
                <li key={d} className="break-words">{d}</li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="shrink-0 text-lg leading-none opacity-60 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}
