'use client';

/**
 * 티타임 신청 명단 — 앱의 teatime_signup_sheet가 teatime_signups에 쓴 예약.
 * 이벤트별로 누가 신청했는지 보고, 장소 확정·문자 안내에 쓴다.
 * (열린 자리표=대기 중 블랙홀과 달리, 날짜가 확정된 자리의 실제 참석 명단)
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getTeatimeSignups } from '@/lib/firestore';
import type { TeatimeSignup } from '@/lib/firestore';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// 참석은 여기서 못 고친다 — 고치는 곳은 '티타임 자리 관리' 한 곳뿐이다.
// 같은 걸 두 화면에서 고칠 수 있으면 어느 쪽이 맞는지 모르게 된다.
const ATT_KO: Record<string, string> = {
  pending: '—',
  coming: '온다고 함',
  cant: '못 온다고 함',
  attended: '왔음',
  noshow: '안 왔음',
};

const ATT_TONE: Record<string, string> = {
  coming: 'text-emerald-700',
  cant: 'text-gray-400',
  attended: 'font-semibold text-blue-700',
  noshow: 'text-red-600',
};

function genderKo(g?: string): string {
  const v = (g ?? '').toLowerCase().trim();
  if (['female', 'f', '여', '여성', 'woman'].includes(v)) return '여성';
  if (['male', 'm', '남', '남성', 'man'].includes(v)) return '남성';
  return '미상';
}

export default function TeatimePage() {
  const [rows, setRows] = useState<TeatimeSignup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTeatimeSignups()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  // 이벤트별 그룹 (최신 이벤트가 위로)
  const byEvent = useMemo(() => {
    const m = new Map<string, TeatimeSignup[]>();
    for (const r of rows ?? []) {
      (m.get(r.eventId) ?? m.set(r.eventId, []).get(r.eventId)!).push(r);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  return (
    <div className="space-y-6">
      <Header
        title="티타임 신청 명단"
        subtitle="날짜가 확정된 티타임에 실제로 신청한 분들. 장소 확정·문자 안내에 쓰세요."
      />

      {/* 자리를 만드는 곳과 신청을 보는 곳이 갈려 있고, 경로도 titatime /
          teatime으로 한 글자만 달라 서로를 못 찾는다. 양쪽에 길을 낸다. */}
      <p className="-mt-4 text-xs text-gray-500">
        <b>참석 체크</b>와 확인 문자, 자리를 새로 열거나 고치는 일은{' '}
        <Link href="/dashboard/titatime" className="font-medium text-emerald-700 underline">
          티타임 자리 관리
        </Link>
        에서 합니다. 이 화면은 신청 이력만 보여줍니다.
      </p>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          불러오기 실패: {error}
        </div>
      ) : rows === null ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          아직 신청자가 없습니다.
        </div>
      ) : (
        byEvent.map(([eventId, all]) => {
          // 신청 후 탈퇴한 사람은 명단에서 뺀다 — 정원과 성비가 그대로면
          // 안 올 사람을 세면서 자리를 닫게 된다. 대신 몇 명이 빠졌는지는
          // 아래 한 줄로 남긴다.
          const list = all.filter((r) => !r.withdrawn);
          const left = all.filter((r) => r.withdrawn);
          const f = list.filter((r) => genderKo(r.gender) === '여성').length;
          const m = list.filter((r) => genderKo(r.gender) === '남성').length;
          const na = list.length - f - m;
          return (
            <section key={eventId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-gray-900">
                  {eventId}
                  <span className="ml-3 text-sm font-normal text-gray-500">
                    총 {list.length}명 · 여성 {f} · 남성 {m} · 미상 {na}
                  </span>
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-5 py-2.5">이름</th>
                    <th className="text-left px-5 py-2.5">지역</th>
                    <th className="text-left px-5 py-2.5">성별</th>
                    <th className="text-left px-5 py-2.5">상태</th>
                    <th className="text-left px-5 py-2.5">참석</th>
                    <th className="text-right px-5 py-2.5">신청 시각</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-5 py-2.5">
                        <Link href={`/dashboard/users/view?id=${r.uid}`} className="text-blue-600 hover:underline font-medium">
                          {r.name || '(이름 없음)'}
                        </Link>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">{r.uid.slice(0, 10)}…</div>
                      </td>
                      <td className="px-5 py-2.5 text-gray-700">{r.region || '—'}</td>
                      <td className="px-5 py-2.5 text-gray-700">{genderKo(r.gender)}</td>
                      <td className="px-5 py-2.5 text-gray-600">{r.status}</td>
                      <td className={`px-5 py-2.5 ${ATT_TONE[r.attendance ?? 'pending'] ?? 'text-gray-400'}`}>
                        {ATT_KO[r.attendance ?? 'pending'] ?? '—'}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-gray-500 whitespace-nowrap">
                        {r.createdAt ? r.createdAt.toLocaleString('ko-KR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {left.length > 0 && (
                <p className="border-t border-gray-100 bg-gray-50 px-5 py-2.5 text-xs text-gray-500">
                  탈퇴해서 뺀 신청 {left.length}건
                  <span className="ml-1 text-gray-400">
                    ({left.map((r) => r.name || '이름없음').join(', ')})
                  </span>
                </p>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
