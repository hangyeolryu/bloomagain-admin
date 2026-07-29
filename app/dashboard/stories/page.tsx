'use client';

/**
 * 사연 투고 — 앱 '티타 이야기' 탭에서 회원이 보낸 사연(story_submissions).
 *
 * 공개 UGC가 아니라 관리자가 읽고 다듬어 정식 글로 싣는 파이프라인이라,
 * 이 화면이 유일한 열람 창구다. 보낸 시점이 곧 게재 동의 시점이므로
 * (앱에서 게재 전 재확인을 하지 않는다) 그때 보여준 동의 문구를 함께 남긴다.
 *
 * 상태: pending(안 읽음) → reviewed(읽음) → published(실음) / rejected(안 실음)
 */

import { useCallback, useEffect, useState } from 'react';
import {
  collection, doc, getDocs, limit, orderBy, query, Timestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface StorySubmission {
  id: string;
  uid: string;
  text: string;
  penName: string;
  status: string;
  consentVersion?: string;
  consentText?: string;
  createdAt: Date | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '새 사연', cls: 'bg-emerald-100 text-emerald-800' },
  reviewed: { label: '읽음', cls: 'bg-blue-100 text-blue-800' },
  published: { label: '실음', cls: 'bg-purple-100 text-purple-800' },
  rejected: { label: '안 실음', cls: 'bg-gray-100 text-gray-700' },
};

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '새 사연' },
  { key: 'reviewed', label: '읽음' },
  { key: 'published', label: '실음' },
  { key: 'rejected', label: '안 실음' },
] as const;

function fmt(d: Date | null): string {
  if (!d) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function StoriesPage() {
  const [rows, setRows] = useState<StorySubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(() => {
    getDocs(query(
      collection(db, 'story_submissions'),
      orderBy('createdAt', 'desc'),
      limit(300),
    )).then((snap) => {
      setRows(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          uid: (data.uid as string) ?? '',
          text: (data.text as string) ?? '',
          penName: (data.penName as string) ?? '',
          status: (data.status as string) ?? 'pending',
          consentVersion: data.consentVersion as string | undefined,
          consentText: data.consentText as string | undefined,
          createdAt: data.createdAt instanceof Timestamp
            ? data.createdAt.toDate() : null,
        };
      }));
      setError(null);
    }).catch((e: unknown) => {
      // 인덱스가 없으면 콘솔 생성 링크가 메시지에 담겨 온다 — 그대로 노출한다.
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    });
  }, []);

  useEffect(load, [load]);

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    try {
      await updateDoc(doc(db, 'story_submissions', id), { status });
      setRows((prev) => (prev
        ? prev.map((r) => (r.id === id ? { ...r, status } : r)) : prev));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function copyText(row: StorySubmission) {
    await navigator.clipboard.writeText(row.text);
    setCopiedId(row.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const visible = rows?.filter((r) => filter === 'all' || r.status === filter);
  const counts = (rows ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <Header title="사연 투고" />

      <div className="p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">불러오지 못했어요</p>
            <p className="mt-1 break-all whitespace-pre-wrap">{error}</p>
          </div>
        )}

        {rows === null ? <LoadingSpinner /> : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {FILTERS.map((f) => {
                const n = f.key === 'all' ? rows.length : (counts[f.key] ?? 0);
                const on = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      on
                        ? 'bg-emerald-700 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {f.label} {n}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={load}
                className="ml-auto rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                새로고침
              </button>
            </div>

            {visible && visible.length === 0 ? (
              <p className="py-16 text-center text-gray-500">
                {rows.length === 0 ? '아직 들어온 사연이 없어요.' : '이 상태의 사연이 없어요.'}
              </p>
            ) : (
              <div className="space-y-4">
                {visible?.map((r) => {
                  const meta = STATUS_META[r.status] ?? STATUS_META.pending;
                  return (
                    <div
                      key={r.id}
                      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.cls}`}>
                          {meta.label}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {r.penName || '익명'}
                        </span>
                        <span className="text-xs text-gray-500">{fmt(r.createdAt)}</span>
                        <span className="text-xs text-gray-400">· {r.text.length}자</span>
                        <span className="ml-auto font-mono text-xs text-gray-400">
                          {r.uid.slice(0, 8)}
                        </span>
                      </div>

                      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-800">
                        {r.text}
                      </p>

                      {r.consentText && (
                        <p className="mt-3 border-l-2 border-amber-300 bg-amber-50 py-2 pl-3 text-xs leading-relaxed text-amber-900">
                          <span className="font-semibold">
                            보낼 때 동의한 문구 ({r.consentVersion ?? '-'})
                          </span>
                          <br />
                          {r.consentText}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => copyText(r)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          {copiedId === r.id ? '복사됨' : '본문 복사'}
                        </button>
                        {(['reviewed', 'published', 'rejected'] as const)
                          .filter((s) => s !== r.status)
                          .map((s) => (
                            <button
                              key={s}
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => setStatus(r.id, s)}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              {STATUS_META[s].label}으로
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
