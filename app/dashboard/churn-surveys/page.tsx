'use client';

/**
 * 탈퇴 사유 — 계정 삭제 직전 앱이 기록하는 가명 이탈 설문(churn_surveys).
 * userId를 저장하지 않는 익명 데이터라 개인 조회는 불가; 사유별 분포와
 * 가입 후 경과일로 "어디서 새는지"를 본다.
 */

import { useEffect, useState } from 'react';
import {
  collection, getDocs, limit, orderBy, query, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface ChurnSurvey {
  id: string;
  reason: string;
  reasonLabel: string;
  detail?: string;
  daysSinceSignup?: number | null;
  createdAt: Date | null;
}

const REASON_COLORS: Record<string, string> = {
  no_match: 'bg-blue-100 text-blue-800',
  hard_to_use: 'bg-purple-100 text-purple-800',
  not_using: 'bg-gray-100 text-gray-800',
  bad_experience: 'bg-red-100 text-red-800',
  privacy_concern: 'bg-amber-100 text-amber-800',
  other: 'bg-emerald-100 text-emerald-800',
};

export default function ChurnSurveysPage() {
  const [surveys, setSurveys] = useState<ChurnSurvey[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDocs(query(
      collection(db, 'churn_surveys'),
      orderBy('createdAt', 'desc'),
      limit(300),
    )).then((snap) => {
      if (cancelled) return;
      setSurveys(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          reason: (data.reason as string) ?? 'other',
          reasonLabel: (data.reasonLabel as string) ?? '기타',
          detail: data.detail as string | undefined,
          daysSinceSignup: (data.daysSinceSignup as number | null) ?? null,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
        };
      }));
      setError(null);
    }).catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = new Map<string, { label: string; count: number }>();
  for (const s of surveys ?? []) {
    const cur = counts.get(s.reason) ?? { label: s.reasonLabel, count: 0 };
    cur.count += 1;
    counts.set(s.reason, cur);
  }
  const total = surveys?.length ?? 0;
  const sorted = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="space-y-6">
      <Header
        title="탈퇴 사유"
        subtitle="계정 삭제 직전 선택한 이유 (익명 · 건너뛰기 가능이라 전체 탈퇴자의 일부입니다)"
      />

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          불러오기 실패: {error}
        </div>
      ) : surveys === null ? (
        <LoadingSpinner />
      ) : total === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          아직 기록된 탈퇴 사유가 없습니다.
        </div>
      ) : (
        <>
          {/* 사유별 분포 */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">
              사유별 분포 <span className="text-sm text-gray-400 font-normal">(응답 {total}건)</span>
            </h2>
            <div className="space-y-2">
              {sorted.map(([code, { label, count }]) => (
                <div key={code} className="flex items-center gap-3">
                  <div className="w-56 text-sm text-gray-700 truncate">{label}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div
                      className="h-4 bg-emerald-500 rounded-full"
                      style={{ width: `${Math.max(2, (count / total) * 100)}%` }}
                    />
                  </div>
                  <div className="w-20 text-right text-sm text-gray-600">
                    {count}건 ({((count / total) * 100).toFixed(0)}%)
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 최근 응답 */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">최근 응답</h2>
            <div className="divide-y divide-gray-50">
              {surveys.map((s) => (
                <div key={s.id} className="py-2.5 flex items-start gap-3 text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${REASON_COLORS[s.reason] ?? 'bg-gray-100 text-gray-700'}`}>
                    {s.reasonLabel}
                  </span>
                  <div className="flex-1 min-w-0">
                    {s.detail && <p className="text-gray-800">{s.detail}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {s.createdAt ? s.createdAt.toLocaleString('ko-KR') : '—'}
                      {s.daysSinceSignup != null && ` · 가입 ${s.daysSinceSignup}일차`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
