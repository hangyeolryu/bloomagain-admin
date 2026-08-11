'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import {
  getSyncFailures,
  dismissSyncFailure,
  type SyncFailureRecord,
} from '@/lib/firestore';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const PAGE_SIZE = 30;

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SyncFailuresPage() {
  const [items, setItems] = useState<SyncFailureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);

  const load = useCallback(async (fresh = false) => {
    if (fresh) setLoading(true);
    else setLoadingMore(true);
    try {
      const { items: batch, lastDoc } = await getSyncFailures(
        PAGE_SIZE,
        fresh ? undefined : lastDocRef.current ?? undefined,
      );
      lastDocRef.current = lastDoc;
      setHasMore(batch.length === PAGE_SIZE);
      setItems((prev) => (fresh ? batch : [...prev, ...batch]));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const onDismiss = async (id: string) => {
    if (!confirm('이 항목을 큐에서 제거할까요? (원본 오류는 그대로 남습니다)')) return;
    setDismissing(id);
    try {
      await dismissSyncFailure(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } finally {
      setDismissing(null);
    }
  };

  return (
    <div className="space-y-6">
      <Header
        title="Firestore 싱크 실패"
        subtitle="백엔드 → Firestore 동기화가 재시도 3회까지 실패한 기록 (DLQ). 베타 중에는 매일 확인하세요."
      />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
        <p className="font-semibold mb-1">무엇을 봐야 하나요?</p>
        <ul className="list-disc list-inside space-y-1 text-blue-800">
          <li>
            <code>backend_synced_at</code> 관련 실패는 Flutter 앱에서
            싱크 배너가 사라지지 않는 원인입니다.
          </li>
          <li>
            특정 사용자 ID가 반복 등장하면 그 계정 상태를 직접 확인하세요.
          </li>
          <li>
            에러 메시지가 <em>permission-denied</em> 또는
            <em> unauthenticated</em>이면 Cloud Run 서비스 계정의 Firestore
            권한을 점검하세요.
          </li>
        </ul>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="text-4xl mb-2">🌱</div>
          <p className="font-semibold text-gray-800">실패한 싱크가 없어요</p>
          <p className="text-sm text-gray-500 mt-1">
            이 화면이 계속 비어 있는 게 건강한 상태입니다.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <div
              key={it.id}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-500">
                      {it.user_id || '(no user_id)'}
                    </span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500">
                      {formatDate(it.failed_at)}
                    </span>
                  </div>
                  <p className="text-sm text-red-700 font-mono break-all">
                    {it.error || '(no error detail)'}
                  </p>
                  {it.doc_data && (
                    <details className="mt-2 text-xs text-gray-500">
                      <summary className="cursor-pointer select-none hover:text-gray-700">
                        payload 보기
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-50 rounded text-[11px] overflow-auto">
                        {JSON.stringify(it.doc_data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
                <button
                  onClick={() => onDismiss(it.id)}
                  disabled={dismissing === it.id}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {dismissing === it.id ? '처리 중…' : '해결됨으로 표시'}
                </button>
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => load(false)}
                disabled={loadingMore}
                className="px-5 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingMore ? '불러오는 중…' : '더 보기'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
