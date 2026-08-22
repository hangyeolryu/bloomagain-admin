'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getDistrictDensity,
  getSeatReadiness,
  SEAT_READY_MIN,
  SEAT_READY_OK,
  type DistrictDensityRecord,
  type SeatReadiness,
} from '@/lib/firestore';
import Header from '@/components/layout/Header';
import SeoulClusters from './SeoulClusters';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

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

/** 밀집도 등급. 200/50/10으로 잡았더니 전 지역이 '황무지'로 떠 판단에 못 썼다.
 *  지금 규모(전국 300명대)에 맞춰 내렸다. 규모가 커지면 다시 올릴 것. */
function densityLevel(users: number): {
  label: string;
  color: string;
  emoji: string;
} {
  if (users >= 40) return { label: '충분', color: 'bg-green-100 text-green-800', emoji: '🟢' };
  if (users >= 15) return { label: '보통', color: 'bg-yellow-100 text-yellow-800', emoji: '🟡' };
  if (users >= 5)  return { label: '부족', color: 'bg-orange-100 text-orange-800', emoji: '🟠' };
  return             { label: '황무지', color: 'bg-red-100 text-red-800', emoji: '🔴' };
}

/** 자리를 열 수 있는지. 세는 대상은 인증을 마친 분들뿐이다 — 신청은 그분들만 된다. */
function readyLevel(verified: number) {
  if (verified >= SEAT_READY_OK)
    return { label: '열 수 있어요', color: 'bg-green-100 text-green-800' };
  if (verified >= SEAT_READY_MIN)
    return { label: '한 자리는 가능', color: 'bg-yellow-100 text-yellow-800' };
  return { label: `${SEAT_READY_MIN - verified}명 더`, color: 'bg-gray-100 text-gray-500' };
}

export default function DistrictDensityPage() {
  const [rows, setRows] = useState<DistrictDensityRecord[]>([]);
  const [ready, setReady] = useState<SeatReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterCity, setFilterCity] = useState<string>('all');

  useEffect(() => {
    getDistrictDensity()
      .then(setRows)
      .finally(() => setLoading(false));
    // 준비 현황은 부가 정보 — 못 불러와도 아래 표는 그대로 보여준다.
    getSeatReadiness().then(setReady).catch(() => {});
  }, []);

  const cities = useMemo(() => {
    const set = new Set(rows.map((r) => r.city).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [rows]);

  const visible = useMemo(() => {
    return filterCity === 'all' ? rows : rows.filter((r) => r.city === filterCity);
  }, [rows, filterCity]);

  const totals = useMemo(() => {
    return visible.reduce(
      (acc, r) => ({
        users: acc.users + r.user_count,
        circles: acc.circles + r.circle_count,
        events: acc.events + r.event_count_30d,
      }),
      { users: 0, circles: 0, events: 0 },
    );
  }, [visible]);

  const mostRecent = useMemo(() => {
    return visible.reduce<Date | undefined>((acc, r) => {
      if (!r.aggregated_at) return acc;
      if (!acc || r.aggregated_at > acc) return r.aggregated_at;
      return acc;
    }, undefined);
  }, [visible]);

  return (
    <div className="space-y-6">
      <Header
        title="지역 밀집도"
        subtitle="도시·구 단위의 사용자/모임/일정 집계. 콜드스타트 지역을 발견해 초기 사용자 모객 지역을 정하는 데 쓰세요."
      />

      {/* Aggregated-at freshness banner */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>
          마지막 집계:{' '}
          <span className="font-mono text-gray-700">{formatDate(mostRecent)}</span>
        </span>
        <span className="text-gray-300">·</span>
        <span>
          스케줄러 <code className="bg-gray-100 px-1.5 py-0.5 rounded">district-density-aggregate</code>{' '}
          가 4시간마다 업데이트합니다.
        </span>
      </div>

      {ready && <SeatReadinessCard data={ready} />}

      {/* 구 하나씩 세면 어디도 자리를 못 여는 것처럼 보인다. 옆 동네는 같은
          자리라, 묶어서 보는 화면을 표보다 앞에 둔다. */}
      {!loading && rows.length > 0 && <SeoulClusters rows={rows} />}

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="총 사용자" value={totals.users} emoji="👥" />
        <SummaryCard label="총 모임" value={totals.circles} emoji="🌿" />
        <SummaryCard label="최근 30일 일정" value={totals.events} emoji="📅" />
      </div>

      {/* City filter */}
      <div className="flex flex-wrap gap-2">
        {cities.map((c) => (
          <button
            key={c}
            onClick={() => setFilterCity(c)}
            className={
              'px-3 py-1.5 rounded-lg text-sm transition-colors ' +
              (filterCity === c
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50')
            }
          >
            {c === 'all' ? '전체' : c}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="font-semibold text-gray-800">집계 데이터가 아직 없어요</p>
          <p className="text-sm text-gray-500 mt-1">
            Cloud Scheduler가 <code>/operations/district-density/aggregate</code>를
            최초 실행한 후 이 표가 채워집니다.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left py-3 px-4 font-medium">도시</th>
                <th className="text-left py-3 px-4 font-medium">구/군</th>
                <th className="text-right py-3 px-4 font-medium">사용자</th>
                <th className="text-right py-3 px-4 font-medium">모임</th>
                <th className="text-right py-3 px-4 font-medium">30일 일정</th>
                <th className="text-left py-3 px-4 font-medium">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((r) => {
                const level = densityLevel(r.user_count);
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-800">{r.city || '-'}</td>
                    <td className="py-3 px-4 text-gray-600">
                      {r.district ?? <span className="text-gray-400">(구 미지정)</span>}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-900">
                      {r.user_count.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-700">
                      {r.circle_count.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-700">
                      {r.event_count_30d.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${level.color}`}
                      >
                        <span>{level.emoji}</span>
                        {level.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * 어느 도시에 자리를 열 수 있는지. 전국 광고를 돌리면 서울 밖에서 들어오시는데,
 * 그분들께 열어드릴 자리가 언제 생기는지는 이 표에서만 보인다.
 */
function SeatReadinessCard({ data }: { data: SeatReadiness }) {
  const outside = data.cities.filter((c) => !c.metro && c.total > 0);
  const metro = data.cities.filter((c) => c.metro);
  const metroVerified = metro.reduce((n, c) => n + c.verified, 0);

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-900">자리 열 준비 — 도시별</h2>
        <span className="text-xs text-gray-400">지금 시점</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        아래 밀집도 표와 세는 대상이 다릅니다. 여기서는 <b>본인인증을 마친 분들만</b>{' '}
        셉니다 — 자리를 신청할 수 있는 건 그분들뿐이라, 가입자가 많아도 인증한 분이
        적으면 자리를 못 엽니다. 정원 {SEAT_READY_MIN}명이 최소, {SEAT_READY_OK}명부터
        여유가 있습니다.
      </p>

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg bg-gray-50 px-3 py-1.5 text-gray-700">
          인증 완료 <b className="tabular-nums">{data.verifiedTotal}</b>명
        </span>
        <span className="rounded-lg bg-gray-50 px-3 py-1.5 text-gray-700">
          수도권 <b className="tabular-nums">{metroVerified}</b>명 · 이미 서울 자리로 닿음
        </span>
        {data.verifiedWithoutCity > 0 && (
          <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-800">
            도시 미상 <b className="tabular-nums">{data.verifiedWithoutCity}</b>명 —
            이만큼은 아래 표에서 빠져 있습니다
          </span>
        )}
      </div>

      {outside.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">서울 밖 회원이 아직 없어요.</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {outside.map((c) => {
            const lv = readyLevel(c.verified);
            return (
              <li key={c.city} className="flex items-center gap-3 py-2">
                <span className="w-14 text-sm text-gray-800">{c.city}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{
                      width: `${Math.min(100, (c.verified / SEAT_READY_OK) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-24 text-right text-sm tabular-nums text-gray-700">
                  인증 {c.verified} / 가입 {c.total}
                </span>
                <span
                  className={`w-24 shrink-0 rounded px-2 py-0.5 text-center text-xs font-medium ${lv.color}`}
                >
                  {lv.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {data.warnings.length > 0 && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          <p className="font-medium">못 센 항목이 있습니다 (0으로 보일 수 있어요)</p>
          <ul className="mt-1 space-y-1">
            {data.warnings.map((w, i) => {
              const url = w.message.match(/https:\/\/console\.firebase\.google\.com\S+/)?.[0];
              return (
                <li key={i} className="break-all">
                  <b>{w.label}</b> — {url ? '색인이 없습니다. ' : w.message}
                  {url && (
                    <a href={url} target="_blank" rel="noreferrer" className="underline">
                      색인 만들기
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  emoji,
}: {
  label: string;
  value: number;
  emoji: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-2xl">{emoji}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-0.5">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
