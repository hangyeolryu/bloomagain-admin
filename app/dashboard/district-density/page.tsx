'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getDistrictDensity,
  type DistrictDensityRecord,
} from '@/lib/firestore';
import Header from '@/components/layout/Header';
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

/** Density classification — used to flag cold-start deserts. */
function densityLevel(users: number): {
  label: string;
  color: string;
  emoji: string;
} {
  if (users >= 200) return { label: '충분', color: 'bg-green-100 text-green-800', emoji: '🟢' };
  if (users >= 50)  return { label: '보통', color: 'bg-yellow-100 text-yellow-800', emoji: '🟡' };
  if (users >= 10)  return { label: '부족', color: 'bg-orange-100 text-orange-800', emoji: '🟠' };
  return              { label: '황무지', color: 'bg-red-100 text-red-800', emoji: '🔴' };
}

export default function DistrictDensityPage() {
  const [rows, setRows] = useState<DistrictDensityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCity, setFilterCity] = useState<string>('all');

  useEffect(() => {
    getDistrictDensity()
      .then(setRows)
      .finally(() => setLoading(false));
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
