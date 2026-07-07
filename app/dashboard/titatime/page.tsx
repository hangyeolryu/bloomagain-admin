'use client';

// 티타임 가격 실험 — 암별 지불의사 대시보드
// ──────────────────────────────────────────────────────────────────────────
// 질문: "45+가 유료 티타임에 신청 의사가 있는가" — 인터뷰로는 답이 안 나와서
// (예의상 '네') 행동으로 읽는다. /titatime 방문자를 가격 암(무료/9,900/19,000)에
// 랜덤 배정 → '이 자리 신청하기' 클릭률을 암별 비교. fake-door라 실제 결제 없음.
//
// 읽는 법: 유료 암 신청률이 무료 암의 30% 밑이면 B2C 유료 티타임 보류
// (kill 게이트), 이상이면 소규모 유료 파일럿 2-3회로 진행. 표본이 암당
// view 30-50은 쌓여야 방향이 보인다 — 그 전엔 참고만.

import { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  getTitatimeStats,
  TITATIME_ARM_LABELS,
  type TitatimeStats,
} from '@/lib/firestore';

function Tile({ label, value, hint, strong }: { label: string; value: string | number; hint?: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 tabular-nums ${strong ? 'text-3xl font-bold text-gray-900' : 'text-2xl font-semibold text-gray-900'}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

export default function TitatimeDashboardPage() {
  const [stats, setStats] = useState<TitatimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getTitatimeStats()
      .then(setStats)
      .catch((e) => setErr(e?.message ?? '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (err) return <div className="p-6 text-sm text-red-600">에러: {err}</div>;
  if (!stats) return null;

  const t = stats.totals;
  const pct = (n: number) => `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;
  const freeRate = stats.byArm.find((a) => a.arm === 'free')?.applyRate ?? 0;

  return (
    <div className="max-w-5xl space-y-8 p-6">
      <Header
        title="티타임 가격 실험"
        subtitle="유료 신청 의사를 행동으로 측정 (fake-door · 방문자별 가격 랜덤 배정 · 익명)"
      />

      {/* 전체 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">전체</h2>
        <div className="grid grid-cols-3 gap-3">
          <Tile label="페이지 조회 (view)" value={t.view} strong />
          <Tile label="신청 클릭 (apply)" value={t.apply} strong />
          <Tile label="다운로드 클릭" value={t.download} hint="신청 후 스토어 이동" />
        </div>
      </section>

      {/* ⭐ 암별 전환 — 이 실험의 본론 */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">가격별 신청률 (본론)</h2>
        <p className="mb-3 text-xs text-gray-400">
          유료 신청률이 무료의 30% 밑이면 B2C 유료 보류 · 암당 view 30+ 쌓인 뒤 판단
        </p>
        {stats.byArm.length === 0 ? (
          <p className="text-sm text-gray-400">아직 데이터가 없어요. 웹 배포 후 쌓이기 시작해요.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">참가비</th>
                  <th className="px-3 py-2 text-right font-medium">노출</th>
                  <th className="px-3 py-2 text-right font-medium">신청 클릭</th>
                  <th className="px-3 py-2 text-right font-medium">신청률</th>
                  <th className="px-3 py-2 text-right font-medium">무료 대비</th>
                  <th className="px-3 py-2 text-right font-medium">다운 클릭</th>
                </tr>
              </thead>
              <tbody>
                {stats.byArm.map((a) => {
                  const vsFree = a.arm === 'free' || freeRate === 0
                    ? null
                    : a.applyRate / freeRate;
                  return (
                    <tr key={a.arm} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {TITATIME_ARM_LABELS[a.arm] ?? a.arm}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{a.views}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{a.applies}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">{pct(a.applyRate)}</td>
                      <td className={`px-3 py-2 text-right font-medium ${
                        vsFree === null ? 'text-gray-400'
                        : vsFree >= 0.3 ? 'text-green-700' : 'text-red-600'
                      }`}>
                        {vsFree === null ? '기준' : `${Math.round(vsFree * 100)}%`}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">{a.downloads}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 지역별 신청 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">지역별 신청 클릭</h2>
        {stats.byDistrict.length === 0 ? (
          <p className="text-sm text-gray-400">아직 신청이 없어요.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {stats.byDistrict.map((d) => (
              <span key={d.district} className="rounded-full bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800">
                {d.district} <b className="tabular-nums">{d.applies}</b>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 최근 이벤트 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">최근 이벤트</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">시각</th>
                <th className="px-3 py-2 text-left font-medium">단계</th>
                <th className="px-3 py-2 text-left font-medium">참가비</th>
                <th className="px-3 py-2 text-left font-medium">지역</th>
                <th className="px-3 py-2 text-left font-medium">유입</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{r.createdAt ? r.createdAt.toLocaleString('ko-KR') : '—'}</td>
                  <td className="px-3 py-2">{{ view: '조회', apply: '신청 클릭', download: '다운클릭' }[r.phase] ?? r.phase}</td>
                  <td className="px-3 py-2 text-gray-700">{r.arm ? (TITATIME_ARM_LABELS[r.arm] ?? r.arm) : '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{r.district ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-gray-400">
        {stats.capped && '최근 2,000건 기준 집계. '}
        fake-door 실험 — 실제 결제는 없고, 신청 클릭 후 &ldquo;신청은 앱에서&rdquo; 안내로 다운로드 퍼널에 연결돼요.
      </p>
    </div>
  );
}
