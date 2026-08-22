'use client';

import { useMemo } from 'react';
import type { DistrictDensityRecord } from '@/lib/firestore';

/**
 * 옆 동네는 같은 자리다.
 *
 * 표만 보면 "마포 3명, 서대문 2명"이라 어디도 자리를 못 여는 것처럼 보인다.
 * 그런데 두 구는 지하철로 몇 정거장이라 실제로는 다섯 명짜리 자리다. 구별
 * 숫자만 세다가 열 수 있는 자리를 못 보는 일이 실제로 있었다(2026-08).
 *
 * 그래서 두 가지를 함께 보여준다.
 *   1) 권역 합계 — 붙어 있는 구를 묶은 수. 자리를 열 수 있는지는 이걸로 판단한다.
 *   2) 배치도 — 어느 쪽에 몰려 있는지 한눈에. 실제 지도가 아니라 배치도다.
 */

/** 서울 5대 권역 + 지하철로 바로 닿는 경기·인천 도시. */
const CLUSTERS: {
  name: string;
  seoul: string[];
  near: string[];
  note: string;
}[] = [
  {
    name: '도심권',
    seoul: ['종로구', '중구', '용산구', '성동구'],
    near: [],
    note: '지금 자리 대부분이 여기 (안국·시청)',
  },
  {
    name: '강남권',
    seoul: ['강남구', '서초구', '송파구', '강동구'],
    near: ['성남시', '용인시', '하남시', '과천시'],
    note: '신분당·분당선으로 분당·용인이 닿음',
  },
  {
    name: '서북권',
    seoul: ['은평구', '서대문구', '마포구'],
    near: ['고양시', '파주시'],
    note: '',
  },
  {
    name: '동북권',
    seoul: ['성북구', '강북구', '도봉구', '노원구', '중랑구', '동대문구', '광진구'],
    near: ['남양주시', '구리시', '의정부시', '양주시'],
    note: '',
  },
  {
    name: '서남권',
    seoul: ['강서구', '양천구', '구로구', '금천구', '영등포구', '동작구', '관악구'],
    near: ['광명시', '부천시', '인천', '김포시', '안양시', '수원시'],
    note: '',
  },
];

/** 서울 25개 구의 대략적인 배치. 실제 지도가 아니라 방향만 맞춘 격자다. */
const GRID: (string | null)[][] = [
  [null, '은평구', null, '강북구', '도봉구', '노원구'],
  [null, '서대문구', '종로구', '성북구', '중랑구', null],
  ['강서구', '마포구', '중구', '동대문구', '광진구', null],
  ['양천구', '영등포구', '용산구', '성동구', '송파구', '강동구'],
  ['구로구', '동작구', '서초구', '강남구', null, null],
  ['금천구', '관악구', null, null, null, null],
];

/** 인원에 따른 칸 색. 자리를 열려면 인증회원 4명이 필요하다는 감각에 맞춘다. */
function tone(n: number): string {
  if (n >= 10) return 'bg-emerald-600 text-white';
  if (n >= 5) return 'bg-emerald-300 text-emerald-950';
  if (n >= 2) return 'bg-emerald-100 text-emerald-900';
  if (n >= 1) return 'bg-gray-100 text-gray-600';
  return 'bg-white text-gray-300 border-dashed';
}

export default function SeoulClusters({ rows }: { rows: DistrictDensityRecord[] }) {
  // 구 이름 → 인원. '서울 강남구'처럼 city가 따로 있어 district만 본다.
  const byDistrict = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) {
      if (!r.district) continue;
      m[r.district] = (m[r.district] ?? 0) + r.user_count;
    }
    return m;
  }, [rows]);

  const clusters = useMemo(() => {
    return CLUSTERS.map((c) => {
      const seoulCount = c.seoul.reduce((s, d) => s + (byDistrict[d] ?? 0), 0);
      const nearCount = c.near.reduce((s, d) => s + (byDistrict[d] ?? 0), 0);
      const parts = [...c.seoul, ...c.near]
        .map((d) => ({ d, n: byDistrict[d] ?? 0 }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n);
      return { ...c, seoulCount, nearCount, total: seoulCount + nearCount, parts };
    }).sort((a, b) => b.total - a.total);
  }, [byDistrict]);

  const maxCell = Math.max(1, ...Object.values(byDistrict));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900">권역으로 묶어 보기</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          붙어 있는 구는 한 자리로 봅니다. 구 하나씩 세면 어디도 자리를 못 여는 것처럼
          보이지만, 마포 3명과 서대문 2명은 실제로 다섯 명짜리 자리예요.
        </p>
        <ul className="mt-3 space-y-2">
          {clusters.map((c) => (
            <li key={c.name} className="rounded-lg border border-gray-100 p-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-semibold text-gray-900">{c.name}</span>
                <span className="text-lg font-bold tabular-nums text-emerald-700">
                  {c.total}명
                </span>
                {c.nearCount > 0 && (
                  <span className="text-xs text-gray-500">
                    서울 {c.seoulCount} + 인접 {c.nearCount}
                  </span>
                )}
                {c.note && <span className="text-xs text-gray-400">· {c.note}</span>}
              </div>
              {c.parts.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {c.parts.map((p) => (
                    <span
                      key={p.d}
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        c.near.includes(p.d)
                          ? 'border border-sky-200 bg-sky-50 text-sky-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {p.d} {p.n}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-gray-400">
          파란 칩은 서울 밖이지만 지하철로 바로 닿는 곳이에요. 여기 인원은 자리를 열
          때 같이 세도 됩니다.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900">서울 어느 쪽에 모여 있나</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          방향만 맞춘 배치도예요. 실제 지도는 아니지만 어느 쪽이 비어 있는지는 보입니다.
        </p>
        <div className="mt-3 overflow-x-auto">
          <div className="inline-grid grid-cols-6 gap-1.5">
            {GRID.flat().map((d, i) => {
              if (!d) return <div key={i} className="h-14 w-20" />;
              const n = byDistrict[d] ?? 0;
              return (
                <div
                  key={i}
                  className={`flex h-14 w-20 flex-col items-center justify-center rounded-lg border border-gray-200 ${tone(n)}`}
                  title={`${d} ${n}명`}
                >
                  <span className="text-[11px] leading-tight">{d.replace('구', '')}</span>
                  <span className="text-sm font-bold tabular-nums">{n}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
          <span>위쪽이 북쪽, 오른쪽이 동쪽</span>
          <span className="text-gray-300">·</span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded bg-white ring-1 ring-gray-200" />0명
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded bg-emerald-100" />2~4
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded bg-emerald-300" />5~9
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded bg-emerald-600" />10+
          </span>
          <span className="text-gray-300">·</span>
          <span>가장 많은 구 {maxCell}명</span>
        </div>
      </section>
    </div>
  );
}
