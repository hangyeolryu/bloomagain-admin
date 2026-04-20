'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

interface IdentityData {
  name?: string;
  mobile_no?: string;
  birth_date?: string;
  gender?: string;
  nation_info?: string;
  [key: string]: string | undefined;
}

type Status = 'loading' | 'success' | 'error' | 'closed';

// CI and DI are intentionally excluded — they are hashed server-side and
// must not re-traverse the client. Only display-safe fields are shown.
const FIELD_LABELS: Record<string, string> = {
  name: '이름',
  mobile_no: '휴대폰 번호',
  birth_date: '생년월일',
  gender: '성별',
  nation_info: '내/외국인',
};

/**
 * Send result to whoever opened this page:
 *  - Flutter WebView  → window.NiceAuth.postMessage(JSON)   (JavascriptChannel)
 *  - Admin popup      → window.opener.postMessage(object)
 */
function notifyResult(payload: { success: boolean; verification_token?: string; data?: IdentityData; error?: string }) {
  const json = JSON.stringify(payload);

  // Flutter WebView JS channel (registered via addJavaScriptChannel('NiceAuth', ...))
  if (typeof window !== 'undefined' && (window as any).NiceAuth) {
    (window as any).NiceAuth.postMessage(json);
    return;
  }

  // Admin dashboard popup fallback
  if (typeof window !== 'undefined' && window.opener) {
    window.opener.postMessage(
      { type: 'NICE_RESULT', ...payload },
      window.location.origin
    );
  }
}

function CallbackInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<IdentityData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const tokenVersionId = searchParams.get('token_version_id');
    const encData = searchParams.get('enc_data');
    const integrityValue = searchParams.get('integrity_value');
    const webTransactionId = searchParams.get('web_transaction_id');
    const sessionKey = searchParams.get('key');
    // Embedded by backend during init_flow for new NICE Auth API session recovery
    const niceReqNo = searchParams.get('nice_req_no');
    const closed = searchParams.get('closed');

    if (closed === '1') {
      notifyResult({ success: false, error: '사용자가 본인확인을 취소했습니다.' });
      setStatus('closed');
      return;
    }

    const nicePassOk = !!(tokenVersionId && encData && integrityValue);
    const niceAuthOk = !!(webTransactionId && niceReqNo);
    const legacyOk = !!(webTransactionId && sessionKey);  // kept for backwards compat

    if (!nicePassOk && !niceAuthOk && !legacyOk) {
      const msg = '필수 파라미터가 없습니다.';
      notifyResult({ success: false, error: msg });
      setError(msg);
      setStatus('error');
      return;
    }

    (async () => {
      try {
        const body = nicePassOk
          ? {
              token_version_id: tokenVersionId!,
              enc_data: encData!,
              integrity_value: integrityValue!,
            }
          : niceAuthOk
          ? {
              web_transaction_id: webTransactionId!,
              req_no: niceReqNo!,
            }
          : {
              web_transaction_id: webTransactionId!,
              session_key: sessionKey!,
            };

        const res = await fetch('/api/nice/result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error ?? '결과 조회 실패');
        }

        setData(json.data);
        setStatus('success');
        notifyResult({ success: true, verification_token: json.verification_token, data: json.data });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '알 수 없는 오류';
        setError(msg);
        setStatus('error');
        notifyResult({ success: false, error: msg });
      }
    })();
  }, [searchParams]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center w-80">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-700 font-medium">인증 결과를 확인하는 중...</p>
          <p className="text-sm text-gray-400 mt-1">잠시만 기다려 주세요</p>
        </div>
      </div>
    );
  }

  // ── Cancelled ─────────────────────────────────────────────────────────────
  if (status === 'closed') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center w-80">
          <div className="text-4xl mb-3">👋</div>
          <p className="text-gray-700 font-medium">본인확인을 취소하셨습니다.</p>
          <button
            onClick={() => window.close()}
            className="mt-4 w-full bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-sm font-medium"
          >
            닫기
          </button>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center w-80">
          <div className="text-4xl mb-3">❌</div>
          <p className="font-semibold text-gray-900 mb-1">인증 실패</p>
          <p className="text-sm text-red-500 mb-4">{error}</p>
          <button
            onClick={() => window.close()}
            className="w-full bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm font-medium"
          >
            닫기
          </button>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  const knownFields = Object.entries(FIELD_LABELS).filter(([k]) => data?.[k]);
  const unknownFields = data
    ? Object.entries(data).filter(([k]) => !FIELD_LABELS[k] && k !== 'raw')
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-white text-center">
          <div className="text-4xl mb-2">✅</div>
          <h1 className="text-lg font-bold">본인확인 완료</h1>
          <p className="text-green-100 text-sm mt-0.5">NICE 통합인증 서비스</p>
        </div>

        {/* Identity data */}
        <div className="p-6 space-y-3">
          {knownFields.map(([key, label]) => (
            <div key={key} className="flex justify-between items-start">
              <span className="text-sm text-gray-500 w-28 flex-shrink-0">{label}</span>
              <span className="text-sm font-medium text-gray-900 text-right break-all">
                {data?.[key] ?? '-'}
              </span>
            </div>
          ))}

          {unknownFields.length > 0 && (
            <>
              <hr className="border-gray-100" />
              {unknownFields.map(([key, val]) => (
                <div key={key} className="flex justify-between items-start">
                  <span className="text-sm text-gray-500 w-28 flex-shrink-0 font-mono">{key}</span>
                  <span className="text-sm text-gray-700 text-right break-all">{val}</span>
                </div>
              ))}
            </>
          )}

          {data?.raw && (
            <div className="bg-gray-50 rounded-xl p-3 mt-2">
              <p className="text-xs text-gray-500 mb-1 font-medium">원본 데이터</p>
              <pre className="text-xs text-gray-700 break-all whitespace-pre-wrap">{data.raw}</pre>
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={() => window.close()}
            className="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            확인 후 닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VerifyCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
