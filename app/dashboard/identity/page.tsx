'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import Badge from '@/components/ui/Badge';

interface IdentityData {
  name?: string;
  mobile_no?: string;
  birth_date?: string;
  gender?: string;
  nation_info?: string;
  ci?: string;
  di?: string;
  [key: string]: string | undefined;
}

interface VerificationRecord {
  id: string;
  data: IdentityData;
  verifiedAt: Date;
}

type VerifyStatus = 'idle' | 'loading' | 'waiting' | 'success' | 'error';

const FIELD_LABELS: Record<string, string> = {
  name: '이름',
  mobile_no: '휴대폰 번호',
  birth_date: '생년월일',
  gender: '성별',
  nation_info: '내/외국인',
  ci: 'CI',
  di: 'DI',
};

function GenderBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-gray-400">-</span>;
  if (value === '1' || value.toLowerCase() === 'm') return <Badge variant="blue">남성</Badge>;
  if (value === '2' || value.toLowerCase() === 'f') return <Badge variant="yellow">여성</Badge>;
  return <Badge variant="gray">{value}</Badge>;
}

function NationBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-gray-400">-</span>;
  if (value === '0') return <Badge variant="green">내국인</Badge>;
  if (value === '1') return <Badge variant="orange">외국인</Badge>;
  return <Badge variant="gray">{value}</Badge>;
}

export default function IdentityPage() {
  const [status, setStatus] = useState<VerifyStatus>('idle');
  const [error, setError] = useState('');
  const [latestResult, setLatestResult] = useState<IdentityData | null>(null);
  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [popupRef, setPopupRef] = useState<Window | null>(null);

  // Listen for postMessage from the callback popup
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'NICE_RESULT') return;

      if (event.data.success) {
        const result: IdentityData = event.data.data;
        setLatestResult(result);
        setRecords((prev) => [
          { id: crypto.randomUUID(), data: result, verifiedAt: new Date() },
          ...prev,
        ]);
        setStatus('success');
      } else {
        setError(event.data.error ?? '인증 실패');
        setStatus('error');
      }

      popupRef?.close();
      setPopupRef(null);
    },
    [popupRef]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Poll for popup closure (user closed popup without completing)
  useEffect(() => {
    if (!popupRef) return;
    const timer = setInterval(() => {
      if (popupRef.closed) {
        setPopupRef(null);
        if (status === 'waiting') {
          setStatus('idle');
        }
        clearInterval(timer);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [popupRef, status]);

  const startVerification = async () => {
    setStatus('loading');
    setError('');
    setLatestResult(null);

    try {
      const returnUrl = `${window.location.origin}/verify/callback/`;
      const res = await fetch('/api/nice/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_url: returnUrl }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error ?? json.detail ?? '인증 시작 요청에 실패했습니다.');
      }

      const np = json.nice_pass as
        | {
            action: string;
            token_version_id: string;
            enc_data: string;
            integrity_value: string;
          }
        | undefined;

      const popup = window.open(
        'about:blank',
        'NICE_AUTH',
        'width=500,height=700,left=200,top=100,toolbar=0,menubar=0,scrollbars=1'
      );

      if (!popup) {
        throw new Error('Pop-up blocked. Allow pop-ups for this site.');
      }

      if (np?.action && np.token_version_id && np.enc_data && np.integrity_value) {
        const esc = (s: string) =>
          s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        popup.document.open();
        popup.document.write(
          `<!DOCTYPE html><html><body><form id="nicef" method="POST" action="${esc(np.action)}" accept-charset="UTF-8">` +
            `<input type="hidden" name="token_version_id" value="${esc(np.token_version_id)}" />` +
            `<input type="hidden" name="enc_data" value="${esc(np.enc_data)}" />` +
            `<input type="hidden" name="integrity_value" value="${esc(np.integrity_value)}" />` +
            `</form><script>document.getElementById('nicef')?.submit();<\/script></body></html>`
        );
        popup.document.close();
      } else if (json.auth_url) {
        popup.location.href = json.auth_url;
      } else {
        popup.close();
        throw new Error(json.error ?? 'Unexpected NICE init response');
      }

      setPopupRef(popup);
      setStatus('waiting');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      setError(msg);
      setStatus('error');
    }
  };

  const reset = () => {
    setStatus('idle');
    setError('');
    setLatestResult(null);
    popupRef?.close();
    setPopupRef(null);
  };

  return (
    <div>
      <Header
        title="NICE 본인확인"
        subtitle="NICE 통합인증 서비스를 통한 실명·휴대폰 인증"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Verification card */}
        <div className="lg:col-span-1 space-y-4">
          {/* Info card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-xl">
                🪪
              </div>
              <div>
                <p className="font-semibold text-gray-900">본인확인 서비스</p>
                <p className="text-xs text-gray-500">NICE평가정보</p>
              </div>
            </div>

            <ul className="space-y-2 mb-5">
              {[
                { icon: '📱', text: '휴대폰 인증 (M)' },
                { icon: '🏦', text: '금융인증서 (F)' },
                { icon: '🌐', text: '아이핀 (I)' },
                { icon: '📋', text: '공동인증서 (U)' },
              ].map(({ icon, text }) => (
                <li key={text} className="flex items-center gap-2 text-sm text-gray-600">
                  <span>{icon}</span>
                  {text}
                </li>
              ))}
            </ul>

            {/* Action button */}
            {status === 'idle' || status === 'error' ? (
              <button
                onClick={startVerification}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <span>🔐</span>
                본인확인 시작
              </button>
            ) : status === 'loading' ? (
              <div className="w-full bg-blue-50 text-blue-600 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                인증 URL 요청 중...
              </div>
            ) : status === 'waiting' ? (
              <div className="space-y-3">
                <div className="w-full bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  팝업에서 인증 진행 중...
                </div>
                <button
                  onClick={reset}
                  className="w-full bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
              </div>
            ) : status === 'success' ? (
              <button
                onClick={reset}
                className="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <span>✅</span>
                다시 인증하기
              </button>
            ) : null}

            {/* Error message */}
            {status === 'error' && error && (
              <div className="mt-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>

          {/* Env warning */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-xs text-amber-700 space-y-1">
            <p className="font-semibold">⚙️ 환경 변수 안내</p>
            <p>
              관리자 앱(Next.js): <code className="bg-amber-100 px-1 rounded">NICE_BACKEND_URL</code>만 설정합니다.
            </p>
            <p className="mt-1 text-amber-600">
              <code className="bg-amber-100 px-1 rounded">NICE_CLIENT_ID</code>,{' '}
              <code className="bg-amber-100 px-1 rounded">NICE_CLIENT_SECRET</code>는 백엔드(FastAPI) 서버
              환경에만 설정하세요.
            </p>
          </div>
        </div>

        {/* Right: Result + history */}
        <div className="lg:col-span-2 space-y-4">
          {/* Latest result */}
          {status === 'success' && latestResult && (
            <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 text-white flex items-center gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-semibold">인증 완료</p>
                  <p className="text-green-100 text-xs">방금 인증된 정보</p>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ResultField label="이름" value={latestResult.name} />
                  <ResultField label="휴대폰" value={latestResult.mobile_no} />
                  <ResultField label="생년월일" value={latestResult.birth_date} />
                  <div>
                    <p className="text-xs text-gray-500 mb-1">성별</p>
                    <GenderBadge value={latestResult.gender} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">내/외국인</p>
                    <NationBadge value={latestResult.nation_info} />
                  </div>
                </div>

                {(latestResult.ci || latestResult.di) && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                    {latestResult.ci && (
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">CI (연계정보)</p>
                        <p className="text-xs font-mono bg-gray-50 px-3 py-2 rounded-lg text-gray-700 break-all">
                          {latestResult.ci}
                        </p>
                      </div>
                    )}
                    {latestResult.di && (
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">DI (중복가입확인정보)</p>
                        <p className="text-xs font-mono bg-gray-50 px-3 py-2 rounded-lg text-gray-700 break-all">
                          {latestResult.di}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Additional unknown fields */}
                {Object.entries(latestResult)
                  .filter(([k]) => !FIELD_LABELS[k])
                  .map(([k, v]) => (
                    <div key={k} className="mt-2">
                      <p className="text-xs text-gray-500 mb-0.5 font-mono">{k}</p>
                      <p className="text-xs bg-gray-50 px-3 py-2 rounded-lg text-gray-700 break-all">{v}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Verification history */}
          {records.length > 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-50">
                <h2 className="font-semibold text-gray-900 text-sm">인증 기록</h2>
                <p className="text-xs text-gray-400 mt-0.5">현재 세션 기록 (페이지 새로고침 시 초기화)</p>
              </div>
              <div className="divide-y divide-gray-50">
                {records.map((rec) => (
                  <div
                    key={rec.id}
                    className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-sm">
                        ✅
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {rec.data.name ?? '(이름 없음)'}
                        </p>
                        <p className="text-xs text-gray-400">{rec.data.mobile_no ?? '-'}</p>
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <Badge variant="green">인증 완료</Badge>
                      <p className="text-xs text-gray-400 mt-1">
                        {rec.verifiedAt.toLocaleTimeString('ko-KR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-2">🪪</p>
                <p className="text-sm">아직 인증 기록이 없습니다</p>
                <p className="text-xs mt-1">본인확인 시작 버튼을 눌러 인증을 진행하세요</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value ?? '-'}</p>
    </div>
  );
}
