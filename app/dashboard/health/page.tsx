'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface HealthSnapshot {
  checked_at: string;
  backend_url: string;
  round_trip_ms: number;
  health: { ok: boolean; data?: unknown; error?: string; status?: number };
  metrics: { ok: boolean; data?: unknown; error?: string; status?: number };
}

const POLL_INTERVAL_MS = 30_000;

export default function HealthPage() {
  const [snap, setSnap] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/backend-health', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as HealthSnapshot;
      setSnap(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-6">
      <Header
        title="백엔드 상태"
        subtitle="Cloud Run 서비스 상태 · 요청/오류 지표. 30초마다 자동 갱신됩니다."
      />

      {loading && !snap ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          <p className="font-semibold">상태 확인 실패</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-xs text-red-600">
            환경변수 <code className="bg-red-100 px-1 rounded">BLOOMAGAIN_BACKEND_URL</code>이
            설정되어 있는지 확인하세요.
          </p>
        </div>
      ) : snap ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatusCard
              label="전체 상태"
              ok={snap.health.ok && snap.metrics.ok}
              okLabel="정상"
              badLabel="주의"
            />
            <InfoCard
              label="왕복 지연"
              value={`${snap.round_trip_ms} ms`}
              hint={snap.round_trip_ms > 2000 ? '느림' : '양호'}
              hintColor={snap.round_trip_ms > 2000 ? 'text-orange-600' : 'text-green-600'}
            />
            <InfoCard
              label="백엔드 URL"
              value={snap.backend_url.replace(/^https?:\/\//, '')}
              valueClass="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EndpointPanel title="GET /api/v1/health" result={snap.health} />
            <EndpointPanel title="GET /api/v1/metrics" result={snap.metrics} />
          </div>

          <div className="text-xs text-gray-500">
            마지막 확인: {new Date(snap.checked_at).toLocaleString('ko-KR')}
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatusCard({
  label,
  ok,
  okLabel,
  badLabel,
}: {
  label: string;
  ok: boolean;
  okLabel: string;
  badLabel: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        ok
          ? 'bg-green-50 border-green-200'
          : 'bg-red-50 border-red-200'
      }`}
    >
      <div className="text-xs text-gray-600">{label}</div>
      <div
        className={`text-xl font-bold mt-1 ${ok ? 'text-green-700' : 'text-red-700'}`}
      >
        {ok ? `🟢 ${okLabel}` : `🔴 ${badLabel}`}
      </div>
    </div>
  );
}

function InfoCard({
  label,
  value,
  hint,
  hintColor,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  hintColor?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-600">{label}</div>
      <div className={`text-lg font-semibold text-gray-900 mt-1 ${valueClass ?? ''}`}>
        {value}
      </div>
      {hint && (
        <div className={`text-xs mt-1 ${hintColor ?? 'text-gray-500'}`}>{hint}</div>
      )}
    </div>
  );
}

function EndpointPanel({
  title,
  result,
}: {
  title: string;
  result: HealthSnapshot['health'];
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <code className="text-sm font-mono text-gray-700">{title}</code>
        <span
          className={
            'text-xs px-2 py-0.5 rounded font-medium ' +
            (result.ok
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700')
          }
        >
          {result.ok ? 'OK' : `FAIL${result.status ? ` ${result.status}` : ''}`}
        </span>
      </div>
      {result.ok ? (
        <pre className="text-[11px] text-gray-700 bg-gray-50 rounded p-2 overflow-auto max-h-48">
          {JSON.stringify(result.data, null, 2)}
        </pre>
      ) : (
        <p className="text-xs text-red-600">{result.error ?? 'Unknown error'}</p>
      )}
    </div>
  );
}
