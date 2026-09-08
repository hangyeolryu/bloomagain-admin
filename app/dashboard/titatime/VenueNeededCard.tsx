'use client';

// 장소 잡아야 하는 자리 — 전화 걸기 전에 여는 화면.
//
// 이게 없어서 장소 미정인 자리가 그대로 열려 있었다. 장소가 정해진 자리
// 11개는 신청이 14명 붙었고, 미정인 11개는 0명이다(2026-09-06 진단). 회원이
// 자리를 열어도 "어디서 만나는지 모르는 자리"는 아무도 안 누른다.
//
// 그래서 남은 날짜를 크게 띄운다. 자리는 사흘 전에 자동으로 접히니, 장소를
// 잡을 시간이 실제로 며칠인지가 이 화면의 핵심 숫자다.

import Link from 'next/link';

const DAY = 86400000;

export type VenueSeat = {
  id: string;
  cardTitle?: string | null;
  dateLabel?: string | null;
  district?: string | null;
  activity?: string | null;
  startAt?: string | null;
  status?: string;
  published?: boolean;
  needsVenue?: boolean;
  venue?: string | null;
  capacity?: number | null;
  minToOpen?: number | null;
  signupCount?: number;
  interestCount?: number | null;
  leaderName?: string | null;
  genderPref?: string | null;
  minBirthYear?: number | null;
  maxBirthYear?: number | null;
  autoCancelledAt?: boolean;
};

function daysLeft(startAt?: string | null): number | null {
  if (!startAt) return null;
  const t = Date.parse(startAt);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / DAY);
}

const GENDER_LABEL: Record<string, string> = {
  women: '여성분들끼리',
  men: '남성분들끼리',
};

export default function VenueNeededCard({ sessions }: { sessions: VenueSeat[] }) {
  const rows = sessions
    .filter(
      (s) =>
        s.needsVenue &&
        !s.venue &&
        !s.autoCancelledAt &&
        s.status !== 'cancelled' &&
        s.status !== 'closed' &&
        (daysLeft(s.startAt) ?? 99) >= 0,
    )
    .sort((a, b) => (daysLeft(a.startAt) ?? 999) - (daysLeft(b.startAt) ?? 999));

  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold text-amber-900">
          장소 잡아야 하는 자리 {rows.length}건
        </h2>
        <Link
          href="/dashboard/venues"
          className="text-xs font-semibold text-amber-800 underline"
        >
          장소 대장 →
        </Link>
      </div>
      <p className="mt-0.5 text-xs text-amber-700">
        예약은 &ldquo;티타&rdquo; 이름과 대표님 번호로. 회원 정보는 쓰지 않습니다.
      </p>

      <ul className="mt-4 space-y-3">
        {rows.map((s) => {
          const left = daysLeft(s.startAt);
          // 자리는 사흘 전에 접힌다. 그 전까지가 실제로 남은 시간이다.
          const toDecide = left === null ? null : left - 3;
          const urgent = toDecide !== null && toDecide <= 3;
          return (
            <li
              key={s.id}
              className="rounded-xl border border-amber-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {s.cardTitle || s.activity || '자리'}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {[s.dateLabel, s.district].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-lg font-bold tabular-nums ${
                      urgent ? 'text-red-600' : 'text-amber-800'
                    }`}
                  >
                    {toDecide === null
                      ? '-'
                      : toDecide <= 0
                        ? '오늘까지'
                        : `${toDecide}일 남음`}
                  </p>
                  <p className="text-[11px] text-gray-400">모임 {left}일 전</p>
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-gray-400">몇 분</dt>
                  <dd className="font-semibold text-gray-800 tabular-nums">
                    {s.signupCount ?? 0} / {s.capacity ?? '-'}명
                    {s.minToOpen ? (
                      <span className="ml-1 font-normal text-gray-400">
                        ({s.minToOpen}명부터)
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">열어본 분</dt>
                  <dd className="font-semibold text-gray-800 tabular-nums">
                    {s.interestCount ?? 0}명
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">연 사람</dt>
                  <dd className="font-semibold text-gray-800 truncate">
                    {s.leaderName || '티타'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">조건</dt>
                  <dd className="font-semibold text-gray-800">
                    {[
                      s.genderPref && GENDER_LABEL[s.genderPref],
                      s.minBirthYear && s.maxBirthYear
                        ? `${s.minBirthYear}~${s.maxBirthYear}년생`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '없음'}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
