'use client';

import { useEffect, useState } from 'react';

/**
 * /verify/
 *
 * Flutter WebView entry point for NICE 본인확인.
 *
 * Flow:
 *   1. Page loads → calls /api/nice/init with return_url pointing back here
 *   2. Redirects the entire page (no popup) to NICE auth_url
 *   3. NICE runs verification in the same WebView window
 *   4. NICE redirects back to /verify/callback/?key=...&web_transaction_id=...
 *   5. Callback page sends result to Flutter via window.NiceAuth.postMessage()
 *
 * This page is NOT the admin dashboard — it has no sidebar and is mobile-optimised.
 */

type Status = 'loading' | 'error';

export default function VerifyStartPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // Always send the explicit return_url so the FastAPI backend knows
        // which domain to redirect back to, regardless of Origin header behaviour.
        const returnUrl = `${window.location.origin}/verify/callback/`;

        const res = await fetch('/api/nice/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ return_url: returnUrl }),
        });

        const json = await res.json();

        if (!res.ok || !json.auth_url) {
          throw new Error(json.error ?? 'auth_url을 받지 못했습니다.');
        }

        // Full-page redirect → works in both browser and Flutter WebView.
        // (window.open popup would be blocked in WebView.)
        window.location.href = json.auth_url;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '알 수 없는 오류';
        setError(msg);
        setStatus('error');

        // Notify Flutter of the failure
        if (typeof window !== 'undefined' && (window as any).NiceAuth) {
          (window as any).NiceAuth.postMessage(
            JSON.stringify({ success: false, error: msg })
          );
        }
      }
    })();
  }, []);

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center w-full max-w-sm">
          <div className="text-4xl mb-3">❌</div>
          <p className="font-semibold text-gray-900 mb-2">본인확인 시작 실패</p>
          <p className="text-sm text-red-500 mb-6">{error}</p>
          <button
            onClick={() => {
              setStatus('loading');
              setError('');
              window.location.reload();
            }}
            className="w-full bg-blue-600 text-white px-4 py-3 rounded-xl text-sm font-semibold"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // Loading / redirecting state
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center w-full max-w-sm">
        {/* NICE logo placeholder */}
        <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <span className="text-3xl">🪪</span>
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-1">NICE 본인확인</h1>
        <p className="text-sm text-gray-500 mb-6">
          인증 서비스로 연결 중입니다
        </p>

        {/* Animated steps */}
        <div className="space-y-3 text-left mb-6">
          {[
            '인증 URL 요청 중...',
            'NICE 서비스로 이동합니다',
            '잠시만 기다려 주세요',
          ].map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <div
                className="w-5 h-5 rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin flex-shrink-0"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
              <span className="text-sm text-gray-600">{step}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400">
          NICE평가정보의 본인확인 서비스를 이용합니다
        </p>
      </div>
    </div>
  );
}
