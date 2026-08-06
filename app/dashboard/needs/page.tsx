'use client';

// 광고 랜딩 대시보드 — /needs(9문항)와 /enjoy(3문항).
//
// 맨 위 "랜딩 비교"에서만 두 랜딩을 견주고, 나머지 표는 전부 /needs만 센다.
// 문항 수도 목적도 달라 한 표에 섞으면 둘 다 못 읽는다.
//
// 5060 광고 퍼널의 수요 데이터: situation(자녀독립·이혼·사별·은퇴) ⭐,
// activity(하고 싶은 것) ⭐, worry(걱정=광고 각도) ⭐ + 퍼널·연령·유입.

import { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  getNeedsStats,
  getAdAttribution,
  type AdAttribution as AdAttributionType,
  NEEDS_LABELS,
  ENJOY_LABELS,
  NEEDS_DIM_LABELS,
  GYEOL_AGE_LABELS,
  type NeedsStats,
  type NeedsDay,
} from '@/lib/firestore';

/// 무엇을 언제 바꿨는지 — 표 옆에 두는 이유가 있다.
///
/// 몇 주 뒤에 이 표를 보면 숫자가 왜 꺾였는지 아무도 기억 못 한다. 특히
/// 2026-08-04처럼 하루에 셋을 한꺼번에 바꾼 날은, 기록이 없으면 "질문을 바꿔서
/// 좋아졌다"처럼 하나에 공을 몰아주게 된다. 실제로는 어느 것 때문인지 갈라낼 수
/// 없다 — 그 사실 자체를 적어둔다.
///
/// 새 변경이 생기면 여기 한 줄 추가한다. day는 KST 기준 YYYY-MM-DD.
const CHANGE_LOG: { day: string; items: string[] }[] = [
  {
    day: '2026-08-04',
    items: [
      '18:20 앱 받기 버튼 승격 (밑줄 글줄 → 테두리 버튼, 모든 질문으로 확대)',
      '18:51 첫 질문 교체 (시간 사용 → 삶의 변화)',
      '광고 CTA 변경 (지금 신청하기 → 더 알아보기)',
    ],
  },
  {
    day: '2026-08-05',
    items: [
      '09:35 첫 질문 교체 되돌림 — 첫 질문 이탈 56.5% → 70.4%로 나빠졌다 '
        + '(시간대 맞춰도 58.0% → 70.4%, z=2.77 p=0.0056). 완주율도 11.0% → 5.6%. '
        + '시간대·광고 CTA 어느 쪽도 원인이 아니었다.',
      '오후 광고 URL에 utm_campaign/content/term 태그를 붙였다. 이때부터 '
        + '소재별 성적을 볼 수 있다 — 그 전 세션은 (태그 이전)으로 묶인다.',
      '광고 지역을 서울+40km만 남기고 부산·대구·대전을 껐다. 살아있는 만남 '
        + '자리표 68장이 전부 서울이고 그 세 도시는 유저가 2~4명씩이라 3~4인 '
        + '자리가 구조적으로 안 열린다. 도착 수는 줄어드는 게 정상 — 볼 것은 '
        + '도착→다운이다.',
      '리타게팅 픽셀 추가: NeedsAgeQualified(45+) / NeedsUnderage.',
      '/enjoy 3문항 밝은판 랜딩 신설. 이 페이지의 다른 표는 모두 /needs만 '
        + '세고, 두 랜딩은 맨 위 "랜딩 비교"에서만 견준다.',
    ],
  },
  {
    day: '2026-08-06',
    items: [
      '"광고 → 가입 연결" 추가. 스토어를 거치면 광고 정보가 끊겨서, 앱 받기 '
        + '클릭과 가입 시각을 30분 안에서 이어 붙인다. 실측 간격이 대부분 '
        + '0~1분이라 매칭이 잘 맞는다.',
      '20:00 광고 URL을 전부 /enjoy로 옮겼다. 그때까지 "506070이제 즐길때"만 '
        + '/enjoy였고 "[2026. 8. 4.] /needs 홍보"가 계속 /needs로 보내고 있었다 '
        + '— 오히려 그쪽 도착이 더 많았는데(24시간 134 대 98), 6시간 사람 기준 '
        + '완주가 /needs 20명 중 2명, /enjoy 55명 중 21명이었다. 이 시각 앞뒤로 '
        + '/needs 숫자가 끊기는 건 정상이다.',
      '21:13 마지막 광고까지 /enjoy로 넘어간 것을 유입에서 확인했다(21:11 /needs '
        + '→ 21:13 /enjoy). 다만 utm_campaign에는 여전히 옛 이름 '
        + '"[2026. 8. 4.] ... /needs 홍보"가 찍힌다 — 캠페인 이름을 바꿨는데도 '
        + 'Meta가 옛 이름을 보낸다. 그 이름이 보여도 랜딩은 /enjoy가 맞다.',
      '앱 받기 버튼이 "안드로이드가 아니면 App Store"였던 것을 고쳤다. 기기를 '
        + '못 알아본 접속이 전부 iOS 클릭으로 잡혀서, iOS 클릭 27건 중 18건이 '
        + '허수였다(사람만 세면 9건). 이 날짜 앞의 iOS 다운로드 수는 부풀려져 '
        + '있으니 그대로 믿으면 안 된다.',
    ],
  },
];
const changesOn = (day: string) => CHANGE_LOG.find((c) => c.day === day)?.items;

const sumOf = (rows: NeedsDay[], k: keyof NeedsDay) =>
  rows.reduce((a, r) => a + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
// 다운로드는 두 갈래로 들어온다 — 설문을 끝내고 받는 길, 첫 질문에서 건너뛰고
// 받는 길. 둘을 따로만 보면 "오늘 몇 명이 받았나"를 매번 암산해야 한다.
const totalDown = (rows: NeedsDay[]) => sumOf(rows, 'download') + sumOf(rows, 'skipDownload');

function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev <= 0) return null;
  const d = Math.round(((now - prev) / prev) * 100);
  if (d === 0) return <span className="text-gray-400">직전 7일과 같음</span>;
  return (
    <span className={d > 0 ? 'font-medium text-emerald-600' : 'font-medium text-red-600'}>
      직전 7일 {d > 0 ? '▲' : '▼'}{Math.abs(d)}%
    </span>
  );
}

// 요약 — 표를 읽기 전에 "지금 어떤 상태인가"를 문장으로 먼저 준다.
// 기간이 섞이면 거짓말이 되므로, 최근 7일과 전체 기간을 갈라서 말한다.
function Summary({ stats }: { stats: NeedsStats }) {
  const d = stats.daily;
  if (d.length === 0) return null;
  const last7 = d.slice(-7);
  // 직전 주가 온전히 7일 있을 때만 비교한다. 7/28부터 데이터가 있어서, 그냥
  // slice하면 "7일 대 1일"을 견줘 ▲1100% 같은 헛소리가 나온다.
  const prev7 = d.length >= 14 ? d.slice(-14, -7) : [];

  const start = sumOf(last7, 'start');
  const complete = sumOf(last7, 'complete');
  const down = totalDown(last7);
  const skipOpen = sumOf(last7, 'skipOpen');
  const skipDown = sumOf(last7, 'skipDownload');
  const pc = (n: number, d0: number) => (d0 > 0 ? `${Math.round((n / d0) * 100)}%` : '—');

  // 전체 기간 기준 — 여기만 stepFunnel/연령을 쓴다(일자별로는 안 쌓고 있다).
  const base = stats.stepFunnel[0]?.reached ?? 0;
  const q1 = stats.stepFunnel.find((f) => f.step === 0);
  const topSource = stats.bySource[0];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">한눈에</h2>
      {stats.excludedNonHuman > 0 && (
        // 조용히 빼면 "어제보다 왜 줄었지"가 된다. 뺀 만큼 적어 둔다.
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          사람 아닌 접속 <b className="tabular-nums">{stats.excludedNonHuman}</b>건을
          빼고 셌습니다(User-Agent 기준 · 봇 또는 데스크톱). 우리 광고는 인스타그램
          모바일 대상이라 데스크톱 유입은 사람으로 보지 않습니다.
          8/5 이전 기록에는 판정 정보가 없어 그대로 포함됩니다.
        </p>
      )}

      <p className="mt-3 text-[15px] leading-relaxed text-gray-800">
        최근 7일 <b className="tabular-nums">{start}</b>명이 도착해{' '}
        <b className="tabular-nums">{complete}</b>명이 끝까지 답했고(
        <span className="tabular-nums">{pc(complete, start)}</span>),{' '}
        <b className="tabular-nums">{down}</b>명이 앱을 받으러 갔습니다(도착의{' '}
        <span className="tabular-nums">{pc(down, start)}</span>).
      </p>
      <p className="mt-1 text-xs text-gray-500">
        도착 <Delta now={start} prev={sumOf(prev7, 'start')} /> · 다운{' '}
        <Delta now={down} prev={totalDown(prev7)} />
      </p>

      <ul className="mt-4 space-y-1.5 text-sm text-gray-700">
        {q1 && base > 0 && (
          <li>
            가장 크게 새는 곳은 여전히 <b>첫 질문</b> — 전체 기간 도착{' '}
            <span className="tabular-nums">{base}</span>명 중{' '}
            <b className="tabular-nums text-red-600">{q1.abandonedHere}</b>명(
            <span className="tabular-nums">{pc(q1.abandonedHere, base)}</span>)이 아무것도
            안 누르고 나갔습니다.
          </li>
        )}
        <li>
          건너뛰고 앱만 받는 길은 최근 7일 <b className="tabular-nums">{skipOpen}</b>명이
          열어 <b className="tabular-nums">{skipDown}</b>명이 스토어로 갔습니다
          {skipOpen > 0 && <> (<span className="tabular-nums">{pc(skipDown, skipOpen)}</span>)</>}.
          {down > 0 && (
            <> 전체 다운의 <span className="tabular-nums">{pc(skipDown, down)}</span>가 이 길에서 나왔습니다.</>
          )}
        </li>
        {stats.underAgeShare > 0 && (
          <li>
            완주자의 <b className="tabular-nums text-red-600">{Math.round(stats.underAgeShare * 100)}%</b>가
            만 45세 미만입니다 — 설치해도 본인인증에서 막힙니다.
          </li>
        )}
        {topSource && (
          <li>
            유입 1위는 <b>{topSource.source}</b>
            <span className="tabular-nums"> ({topSource.count}명 완주)</span>.
          </li>
        )}
      </ul>
    </section>
  );
}


// 광고 → 가입 연결. 스토어를 거치면 광고 정보가 끊기므로 시간으로 잇는다.
//
// 다운로드 클릭까지만 보면 "받으러 갔다"에서 끝난다. 실제로 가입까지 온
// 사람을 소재별로 봐야 어디에 돈을 더 넣을지 정할 수 있다.
//
// 매칭 한계를 숨기지 않는다 — 스토어에서 바로 안 받고 나중에 받은 사람은
// 못 잡는다. 그래서 매칭률이 100%가 아닌 게 정상이고, 그 사실을 적어 둔다.
function AdAttribution({ data }: { data: AdAttributionType }) {
  if (data.signupsTotal === 0) return null;
  const pct = data.signupsTotal > 0
    ? Math.round((data.matched / data.signupsTotal) * 100)
    : 0;
  const fmt = (d: Date) =>
    new Date(d.getTime() + 9 * 3600_000).toISOString().slice(5, 16).replace('T', ' ');
  const withSignup = data.byCreative.filter((c) => c.signups > 0 || c.downloads > 0);

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-gray-900">광고 → 가입 연결</h2>
      <p className="mb-3 text-xs text-gray-400">
        최근 14일. 앱 받기 클릭과 가입 시각을 {data.windowMin}분 안에서 이어 붙입니다.
        스토어에서 바로 안 받고 <b>나중에 받은 분은 못 잡습니다</b> — 매칭률이 100%가
        아닌 게 정상입니다. 가입 {data.signupsTotal}명 중{' '}
        <b className="tabular-nums">{data.matched}명({pct}%)</b> 연결됨.
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="px-4 py-2.5 text-left font-medium">유입 / 캠페인</th>
              <th className="px-3 py-2.5 text-left font-medium">소재</th>
              <th className="px-3 py-2.5 text-right font-medium">앱 받기 클릭</th>
              <th className="px-3 py-2.5 text-right font-medium">가입</th>
              <th className="px-3 py-2.5 text-right font-medium">클릭→가입</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {withSignup.map((c) => (
              <tr key={c.key} className={c.signups > 0 ? 'bg-emerald-50/40' : undefined}>
                <td className="whitespace-nowrap px-4 py-2 text-gray-800">
                  {c.source}
                  <span className="ml-1.5 text-xs text-gray-400">{c.campaign}</span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{c.content || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{c.downloads}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${c.signups > 0 ? 'font-semibold text-emerald-700' : 'text-gray-300'}`}>
                  {c.signups}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                  {c.downloads > 0 ? `${Math.round((c.signups / c.downloads) * 100)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                <th className="px-4 py-2.5 text-left font-medium">가입 시각</th>
                <th className="px-3 py-2.5 text-left font-medium">기기</th>
                <th className="px-3 py-2.5 text-left font-medium">랜딩</th>
                <th className="px-3 py-2.5 text-left font-medium">고른 것</th>
                <th className="px-3 py-2.5 text-right font-medium">클릭 후</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.rows.slice(0, 15).map((r, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gray-700">
                    {fmt(r.signupAt)}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.platform}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">/{r.variant}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {[r.activity && (NEEDS_LABELS[r.activity] ?? r.activity), r.district]
                      .filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-gray-400">
                    {r.gapMin}분
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// 랜딩 비교 — /needs(9문항) vs /enjoy(3문항).
//
// 이 페이지의 다른 표는 전부 /needs만 센다. 문항 수도 목적도 달라 섞으면
// 둘 다 못 읽기 때문이다. 두 랜딩을 견주는 자리는 여기 하나뿐이다.
//
// 판정은 '도착 → 앱 받기' 하나로 한다. 완주율은 문항 수가 다르면 비교가
// 안 된다(3문항이 당연히 높다). 우리가 알고 싶은 건 "같은 광고비로 누가 더
// 앱을 받게 하나"다.
function VariantCompare({ rows }: { rows: NeedsStats['byVariant'] }) {
  if (rows.length === 0) return null;
  const pc = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
  const MIN = 80;
  const best = [...rows]
    .filter((r) => r.arrivals >= MIN)
    .sort((a, b) => b.downloaded / b.arrivals - a.downloaded / a.arrivals)[0];

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-gray-900">랜딩 비교</h2>
      <p className="mb-3 text-xs text-gray-400">
        아래 다른 표들은 <b>/needs만</b> 셉니다. 문항 수가 달라 한 표에 섞으면 둘 다
        못 읽습니다. 판정은 <b>도착 → 앱 받기</b>로 하세요 — 완주율은 3문항이 당연히
        높습니다.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => {
          const win = best && best.variant === r.variant && rows.length > 1;
          return (
            <div
              key={r.variant}
              className={`rounded-xl border p-4 ${win ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 bg-white'}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">{r.label}</div>
                {win && (
                  <span className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                    앞서는 중
                  </span>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[
                  ['도착', r.arrivals, null],
                  ['첫 질문 이탈', r.q1Abandoned, pc(r.q1Abandoned, r.arrivals)],
                  ['완주', r.completed, pc(r.completed, r.arrivals)],
                  ['앱 받기', r.downloaded, pc(r.downloaded, r.arrivals)],
                ].map(([label, n, p], i) => (
                  <div
                    key={label as string}
                    className={`rounded-lg px-2 py-2 ${i === 3 ? 'bg-emerald-50' : 'bg-gray-50'}`}
                  >
                    <dt className="text-[11px] text-gray-500">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums text-gray-900">
                      {n as number}
                    </dd>
                    {p !== null && (
                      <dd className={`text-[11px] tabular-nums ${i === 3 ? 'font-semibold text-emerald-700' : 'text-gray-400'}`}>
                        {p as string}
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
              {r.arrivals < MIN && (
                <p className="mt-2 text-xs text-amber-700">
                  도착 {r.arrivals}명 — 판정 기준 {MIN}명에 못 미칩니다. 기다려 주세요.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// 첫 질문 교체 효과 — 교체 전/후를 나란히 놓는다.
//
// 한 표에 겹쳐 그릴 수 없다. step이 숫자로만 저장돼서 교체 전 step 0은
// '시간 사용', 교체 후는 '삶의 변화'다. 겹치면 서로 다른 질문을 같은 줄에서
// 견주게 된다. 그래서 두 벌을 각자 라벨로 그리고, 비교는 "첫 질문"이라는
// 자리끼리만 한다 — 우리가 바꾼 게 바로 그 자리다.
function SwapCompare({ swap }: { swap: NeedsStats['swap'] }) {
  const { before, after, reverted } = swap;
  // 표본이 적을 때 퍼센트를 크게 띄우면 소음을 신호로 읽는다. 최소치를 두고
  // 그 아래면 판정을 미룬다.
  const MIN = 80;
  const ready = after.base >= MIN;
  const rate = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  const q1Before = rate(before.q1Abandoned, before.base);
  const q1After = rate(after.q1Abandoned, after.base);
  const q1Rev = rate(reverted.q1Abandoned, reverted.base);
  const diff = q1After - q1Before;
  // 되돌린 뒤는 질문이 '교체 전'과 같다. 그래서 이 차이는 질문이 아니라
  // 그 사이에 남긴 것들(앱 받기 버튼 승격 · 광고 CTA 변경)의 효과다.
  const diffRev = q1Rev - q1Before;
  const revReady = reverted.base >= MIN;

  const Col = ({ era, tone }: { era: typeof before; tone: 'gray' | 'green' | 'red' }) => {
    const head = tone === 'green'
      ? 'border-emerald-200 bg-emerald-50/50'
      : tone === 'red'
        // 결과가 나빠 되돌린 구간 — 색으로도 "이건 채택 안 됨"을 남긴다.
        ? 'border-red-200 bg-red-50/40'
        : 'border-gray-200 bg-gray-50';
    return (
      <div className={`rounded-xl border ${head} p-4`}>
        <div className="text-xs font-semibold text-gray-500">{era.title}</div>
        <div className="mt-0.5 text-sm font-medium text-gray-900">
          첫 질문: “{era.firstQuestion}”
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ['도착', era.base, null],
            ['첫 질문 이탈', era.q1Abandoned, rate(era.q1Abandoned, era.base)],
            ['완주', era.complete, rate(era.complete, era.base)],
          ].map(([label, n, p]) => (
            <div key={label as string} className="rounded-lg bg-white px-2 py-2">
              <dt className="text-[11px] text-gray-500">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums text-gray-900">{n as number}</dd>
              {p !== null && (
                <dd className="text-[11px] tabular-nums text-gray-400">
                  {Math.round(p as number)}%
                </dd>
              )}
            </div>
          ))}
        </dl>
        <div className="mt-3 space-y-1.5">
          {era.funnel.map((f) => (
            <Bar key={f.step} label={f.label} count={f.reached} max={era.base || 1} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-gray-900">
        첫 질문 교체 실험 <span className="text-gray-400">(종료 · 되돌림)</span>
      </h2>
      <p className="mb-3 text-xs text-gray-400">
        2026-08-04 18:55 교체 → 08-05 09:35 되돌림. 세션은 시작 시각으로 한쪽에
        붙습니다. 되돌린 뒤 트래픽은 다시 옛 순서라 왼쪽에 들어갑니다.
      </p>
      {/* 이 카드 이름이 '첫 질문 교체 효과'라, 여기 숫자를 질문 교체만의
          성적표로 읽기 가장 쉽다. 실제로는 같은 날 셋을 바꿨다. */}
      <p className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
        같은 날 <b>앱 받기 버튼 승격</b>과 <b>광고 CTA 변경</b>도 함께 했습니다.
        여기 차이를 질문 교체만의 결과로 읽지 마세요. 특히 광고 CTA가 바뀌면
        <b> 오는 사람 자체가 달라져</b> 이탈률의 의미도 달라집니다.
      </p>

      <div
        className={`mb-3 rounded-xl border p-4 ${
          ready
            ? diff < 0
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-red-200 bg-red-50'
            : 'border-amber-200 bg-amber-50'
        }`}
      >
        {ready ? (
          <p className="text-sm text-gray-800">
            첫 질문 이탈률{' '}
            <b className="tabular-nums">{Math.round(q1Before)}%</b> →{' '}
            <b className="tabular-nums">{Math.round(q1After)}%</b>{' '}
            <b className={diff < 0 ? 'text-emerald-700' : 'text-red-700'}>
              ({diff < 0 ? '▼' : '▲'}
              {Math.abs(Math.round(diff))}%p)
            </b>
            {diff < 0
              ? ' — 교체가 먹혔습니다.'
              : ' — 교체 전이 더 나았습니다. 그래서 8/5 09:35에 되돌렸습니다.'}
          </p>
        ) : (
          <p className="text-sm text-amber-900">
            교체 후 도착이 아직 <b className="tabular-nums">{after.base}</b>명입니다
            (판정 기준 {MIN}명). 지금 퍼센트는 몇 사람에 따라 크게 흔들리니
            <b> 판단을 미뤄 주세요.</b>{' '}
            {after.base === 0
              ? `교체 전 첫 질문 이탈률은 ${Math.round(q1Before)}%였습니다 — 이 숫자보다 낮아지면 성공입니다.`
              : `참고로 지금은 ${Math.round(q1Before)}% → ${Math.round(q1After)}%입니다.`}
          </p>
        )}
      </div>

      {/* 되돌린 뒤는 질문이 '교체 전'과 같으니, 이 비교는 남아 있는 변경
          (앱 받기 버튼 · 광고 CTA)의 성적표가 된다. */}
      <div
        className={`mb-3 rounded-xl border p-4 ${
          revReady
            ? diffRev < 0
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-gray-200 bg-gray-50'
            : 'border-amber-200 bg-amber-50'
        }`}
      >
        <div className="text-xs font-semibold text-gray-500">
          되돌린 뒤 (질문은 교체 전과 같음 · 앱 버튼 + 새 광고 CTA 적용 중)
        </div>
        {revReady ? (
          <p className="mt-1 text-sm text-gray-800">
            첫 질문 이탈률{' '}
            <b className="tabular-nums">{Math.round(q1Before)}%</b> →{' '}
            <b className="tabular-nums">{Math.round(q1Rev)}%</b>{' '}
            <b className={diffRev < 0 ? 'text-emerald-700' : 'text-gray-600'}>
              ({diffRev < 0 ? '▼' : '▲'}
              {Math.abs(Math.round(diffRev))}%p)
            </b>
            {' '}— 질문이 같으니 이 차이는 <b>앱 버튼과 광고 CTA</b>의 몫입니다.
          </p>
        ) : (
          <p className="mt-1 text-sm text-amber-900">
            도착이 아직 <b className="tabular-nums">{reverted.base}</b>명입니다
            (판정 기준 {MIN}명). 되돌린 지 얼마 안 됐으니 <b>기다려 주세요.</b>
          </p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Col era={before} tone="gray" />
        <Col era={after} tone="red" />
        <Col era={reverted} tone="green" />
      </div>
    </section>
  );
}

// 광고 소재별 성적 — 어떤 소재가 '앱을 받는 사람'을 데려오는가.
//
// 도착·완주만 보면 안 된다. 쓰레드 유입 완주자 9명이 전원 남성이었는데,
// 채널이 좋아 보였을 뿐 여성 타겟 광고와 나란히 볼 수 없는 숫자였다. 그래서
// 성별 구성을 같은 줄에 놓는다(2026-08-05).
function ByCreative({ rows }: { rows: NeedsStats['byCreative'] }) {
  if (rows.length === 0) return null;
  const pc = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-gray-900">광고 소재별 성적</h2>
      <p className="mb-3 text-xs text-gray-400">
        세션 단위. 광고 URL에 <code>utm_campaign / utm_content / utm_term</code>을
        붙이면 캠페인·소재·지면으로 갈립니다. 붙이기 전 세션은{' '}
        <b>(태그 이전)</b>으로 묶입니다. 성별은 완주자만 알 수 있습니다.
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="px-4 py-2.5 text-left font-medium">유입 / 캠페인</th>
              <th className="px-3 py-2.5 text-left font-medium">소재 · 지면</th>
              <th className="px-3 py-2.5 text-right font-medium">도착</th>
              <th className="px-3 py-2.5 text-right font-medium">첫 질문 이탈</th>
              <th className="px-3 py-2.5 text-right font-medium">완주</th>
              <th className="px-3 py-2.5 text-right font-medium">앱 받기</th>
              <th className="px-3 py-2.5 text-right font-medium">여 / 남</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap px-4 py-2 text-gray-800">
                  {r.source}
                  <span className="ml-1.5 text-xs text-gray-400">{r.campaign}</span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {r.content || '—'}{r.term ? ` · ${r.term}` : ''}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.arrivals}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                  {pc(r.q1Abandoned, r.arrivals)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                  {r.completed}<span className="ml-1 text-xs text-gray-400">{pc(r.completed, r.arrivals)}</span>
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.downloaded > 0 ? 'font-semibold text-emerald-700' : 'text-gray-300'}`}>
                  {r.downloaded}<span className="ml-1 text-xs font-normal text-gray-400">{pc(r.downloaded, r.arrivals)}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums text-gray-500">
                  {r.women} / {r.men}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// 나날의 현황 — 누적만 보면 소재를 바꾸거나 화면을 고친 날이 평균에 묻힌다.
function DailyTable({ daily, partialFrom }: { daily: NeedsDay[]; partialFrom: string | null }) {
  const rows = daily.slice(-14).reverse(); // 최신이 위
  if (rows.length === 0) return null;
  const maxStart = Math.max(...rows.map((r) => r.start), 1);
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const WD = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-gray-900">나날의 현황 (최근 14일)</h2>
      <p className="mb-3 text-xs text-gray-400">
        한국 시간 기준. &apos;다운&apos;은 설문을 끝내고 받은 것과 건너뛰고 받은 것을 합친 수입니다.
        {partialFrom && ` ${partialFrom} 이전은 조회 상한에 걸려 표시하지 않습니다.`}
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="px-4 py-2.5 text-left font-medium">날짜</th>
              <th className="px-3 py-2.5 text-right font-medium">도착</th>
              <th className="px-3 py-2.5 text-right font-medium">완주</th>
              <th className="px-3 py-2.5 text-right font-medium">완주율</th>
              <th className="px-3 py-2.5 text-right font-medium">다운</th>
              <th className="px-3 py-2.5 text-right font-medium">도착→다운</th>
              <th className="px-3 py-2.5 text-right font-medium">건너뛰기</th>
              <th className="px-3 py-2.5 text-left font-medium">공유</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const down = r.download + r.skipDownload;
              const dt = new Date(`${r.day}T00:00:00Z`);
              const isToday = r.day === today;
              return (
                <tr key={r.day} className={isToday ? 'bg-amber-50/60' : undefined}>
                  <td className="whitespace-nowrap px-4 py-2 text-gray-700">
                    {r.day.slice(5).replace('-', '/')}
                    <span className="ml-1.5 text-xs text-gray-400">{WD[dt.getUTCDay()]}</span>
                    {isToday && <span className="ml-1.5 text-xs text-amber-600">오늘</span>}
                    {changesOn(r.day) && (
                      <span
                        className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700"
                        title={changesOn(r.day)!.join('\n')}
                      >
                        변경
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                    <div className="flex items-center justify-end gap-2">
                      {/* 막대를 옆에 붙여야 "어느 날 광고가 세게 돌았나"가 눈으로 잡힌다. */}
                      <span
                        className="h-1.5 rounded-full bg-blue-200"
                        style={{ width: `${Math.max(2, (r.start / maxStart) * 56)}px` }}
                      />
                      {r.start}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.complete}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    {r.start > 0 ? `${Math.round((r.complete / r.start) * 100)}%` : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${down > 0 ? 'font-semibold text-emerald-700' : 'text-gray-300'}`}>
                    {down}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    {r.start > 0 ? `${Math.round((down / r.start) * 100)}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    {r.skipOpen > 0 ? `${r.skipOpen} → ${r.skipDownload}` : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-gray-400">{r.share || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* 표 밑에 펼쳐 둔다. 마우스를 올려야 보이는 정보는 없는 것과 같다. */}
      {CHANGE_LOG.filter((c) => rows.some((r) => r.day === c.day)).map((c) => (
        <div
          key={c.day}
          className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-4"
        >
          <div className="text-xs font-semibold text-violet-900">
            {c.day.slice(5).replace('-', '/')} 바꾼 것
          </div>
          <ul className="mt-1.5 space-y-1 text-sm text-violet-900">
            {c.items.map((it) => (
              <li key={it}>· {it}</li>
            ))}
          </ul>
          {c.items.length > 1 && (
            <p className="mt-2 text-xs text-violet-700">
              하루에 여러 개를 바꿨습니다. 이 날 이후의 변화는 <b>어느 것 때문인지
              갈라낼 수 없습니다</b> — 합쳐진 결과로만 읽으세요.
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

function Bar({ label, count, max, tone }: { label: string; count: number; max: number; tone?: 'green' | 'red' }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-44 shrink-0 truncate text-sm text-gray-700" title={label}>{label}</div>
      <div className="relative h-6 flex-1 overflow-hidden rounded bg-gray-100">
        <div
          className={`absolute inset-y-0 left-0 rounded ${tone === 'red' ? 'bg-red-500/80' : 'bg-green-600/80'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-12 shrink-0 text-right text-sm tabular-nums text-gray-600">{count}</div>
    </div>
  );
}

// /enjoy(밝은판) 답. 지금 광고가 전부 여기로 오므로 살아 있는 조사다.
//
// /needs와 한 표에 못 섞는다 — 활동 보기가 다르고(연극·뮤지컬이 여기만 있다)
// 지역·바깥활동은 여기만 묻는다. 같은 이름 다른 보기를 합치면 어느 설문
// 숫자인지 아무도 모르게 된다.
function EnjoySections({ data }: { data: NeedsStats['enjoy'] }) {
  if (data.respondents === 0) return null;
  const dlPct = data.respondents > 0
    ? Math.round((data.downloaded / data.respondents) * 100) : 0;
  const thin = data.respondents < 150;

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-5">
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-gray-900">/enjoy — 지금 돌아가는 조사</h2>
        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">
          진행 중
        </span>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        한 문항이라도 답한 <b className="tabular-nums">{data.respondents}</b>명 ·
        앱 받기 <b className="tabular-nums">{data.downloaded}</b>명(
        <span className="tabular-nums">{dlPct}%</span>).
        아래 ①~⑥은 <b>닫힌 /needs</b> 숫자라 여기와 이어지지 않습니다.
      </p>

      {thin && (
        // 46명일 때 "전시·공연 28%가 1위"를 결론처럼 읽던 일이 있었다.
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          아직 <b className="tabular-nums">{data.respondents}</b>명뿐입니다.
          <b> 150명을 넘기기 전에는 항목별 비율로 결론 내지 마세요</b> — 한두 명
          차이로 순위가 뒤집힙니다.
        </p>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <Section
          title="① 뭐가 제일 하고 싶은가"
          hint="/needs의 '하고 싶은 것'과 보기가 다릅니다 — 연극·뮤지컬이 여기만 있어 두 표를 더할 수 없습니다."
          data={data.activity}
          labels={ENJOY_LABELS}
        />
        <Section
          title="② 어디서 만나기 편한가"
          hint="8/6에 경기·인천을 넷으로 쪼갰습니다. '경기·인천 (~8/6 통합 보기)'는 그 전 응답이라 어느 도시인지 알 수 없습니다."
          data={data.district}
          labels={ENJOY_LABELS}
        />
        <Section
          title="③ 요즘 바깥 활동"
          hint={
            `앱 받기를 예측한 유일한 행동 신호(/needs에서 34% 대 18%, p=0.013). `
            + `8/6 저녁 배포분부터 들어옵니다 — 지금까지 ${data.outingRespondents}명.`
          }
          data={data.outing}
          labels={ENJOY_LABELS}
        />
        <Section
          title="④ 연령"
          data={data.ageBand}
          labels={ENJOY_LABELS}
          redKey="under45"
        />
      </div>
    </section>
  );
}

function Section({ title, hint, data, redKey, labels }: {
  title: string; hint?: string;
  data: { key: string; count: number }[]; redKey?: string;
  // /enjoy는 자기 표를 쓴다 — solo_out이 두 설문에서 뜻이 다르다.
  labels?: Record<string, string>;
}) {
  const max = data[0]?.count ?? 0;
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-gray-900">{title}</h2>
      {hint && <p className="mb-3 text-xs text-gray-400">{hint}</p>}
      {data.length === 0 ? (
        <p className="text-sm text-gray-400">아직 응답이 없어요.</p>
      ) : (
        <div className="space-y-2">
          {data.map((d) => (
            <Bar
              key={d.key}
              label={labels?.[d.key] ?? NEEDS_LABELS[d.key] ?? GYEOL_AGE_LABELS[d.key] ?? d.key}
              count={d.count}
              max={max}
              tone={d.key === redKey ? 'red' : 'green'}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function NeedsDashboardPage() {
  const [stats, setStats] = useState<NeedsStats | null>(null);
  const [attr, setAttr] = useState<AdAttributionType | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getAdAttribution()
      .then(setAttr)
      .catch(() => setAttr(null));
    getNeedsStats()
      .then(setStats)
      .catch((e) => setErr(e?.message ?? '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (err) return <div className="p-6 text-sm text-red-600">에러: {err}</div>;
  if (!stats) return null;

  const t = stats.totals;
  const pct = (n: number) => `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;

  return (
    <div className="space-y-8 p-6">
      <Header
        title="니즈 설문 (5060)"
        subtitle="tita-app.com/needs — 겉은 1분 테스트, 속은 수요 설문. 답 하나하나가 광고·모임 조준 데이터."
      />

      <VariantCompare rows={stats.byVariant} />

      {attr && <AdAttribution data={attr} />}

      <Summary stats={stats} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="도착 (실제 본)" value={t.start} hint={`7/28 14:19 정확 집계 이후 · 누적 ${stats.allTotals.start}`} />
        <Tile label="완료" value={t.complete} hint={`완료율 ${pct(stats.completionRate)} · 누적 ${stats.allTotals.complete}`} />
        <Tile label="다운클릭" value={t.download} hint={`완료→다운 ${pct(stats.downloadRate)} · 누적 ${stats.allTotals.download}`} />
        <Tile label="공유" value={t.share} hint={`누적 ${stats.allTotals.share}`} />
      </div>

      {/* 설문 건너뛰고 앱만 받기 — 첫 질문에서 떠나는 사람에게 뚫어준 길.
          여기 숫자가 붙으면 그만큼은 원래 그냥 잃던 사람이다. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="건너뛰기 열어봄"
          value={stats.skip.open}
          hint="첫 질문에서 '앱만 받을게요'"
        />
        <Tile
          label="건너뛰기로 다운"
          value={stats.skip.download}
          hint={stats.skip.open
            ? `열어본 사람의 ${pct(stats.skip.download / stats.skip.open)}`
            : '아직 없음'}
        />
      </div>

      <SwapCompare swap={stats.swap} />

      <ByCreative rows={stats.byCreative} />

      <DailyTable daily={stats.daily} partialFrom={stats.dailyPartialFrom} />

      {/* 질문별 이탈 — answer 이벤트 도입(2026-07-28) 이후 세션부터 잡힌다 */}
      {stats.stepFunnel.some((f) => f.reached > 0) && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-gray-900">어디서 관두나 (질문별 도달)</h2>
          <p className="mb-3 text-xs text-gray-400">
            7/28 14:19(정확 집계) 이후 — 도달=답한 세션, "보고 나감"=그 질문을 보다가 답 없이 떠남
          </p>
          {/* 이 표는 두 시기가 섞여 있다. 교체 효과를 볼 자리는 위의 비교 카드다. */}
          <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            이 표는 <b>교체 전후가 섞여</b> 있고 라벨은 지금 순서 기준입니다(8/4에 1번과
            3번을 맞바꿈). 교체 효과는 위의 <b>&lsquo;첫 질문 교체 효과&rsquo;</b>에서 보세요.
          </p>
          <div className="space-y-2">
            {stats.stepFunnel.map((f) => (
              <div key={f.step} className="flex items-center gap-2">
                <div className="flex-1">
                  <Bar label={f.label} count={f.reached} max={stats.stepFunnel[0]?.reached ?? 0} />
                </div>
                <span className={`w-24 shrink-0 text-right text-xs tabular-nums ${f.abandonedHere > 0 ? 'text-red-600 font-semibold' : 'text-gray-300'}`}>
                  {f.abandonedHere > 0 ? `보고 나감 ${f.abandonedHere}` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 분포 기준 안내 — 타일(정확 집계 이후)과 분모가 다름을 명시 */}
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
        아래 응답 분포는 <b>완주 {stats.allTotals.complete}명 전체</b> 기준이에요
        (상단 타일은 7/28 14:19 정확 집계 이후만 세서 숫자가 달라요).
      </p>

      <EnjoySections data={stats.enjoy} />

      {/* 아래 6개는 설문 화면에 나오는 순서 그대로다(needs/page.tsx).
          응답을 흐름대로 읽어야 어디서 마음이 바뀌는지 보인다.

          2026-08-06 광고를 전부 /enjoy로 옮기면서 이 조사는 사실상 닫혔다.
          숫자가 안 늘어도 고장난 게 아니다 — 그걸 화면에 적어 두지 않으면
          몇 주 뒤에 "요즘 사람들이 원하는 것"으로 잘못 읽게 된다. */}
      <div className="rounded-xl border border-gray-300 bg-gray-50 p-4">
        <div className="mb-1 flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-gray-700">/needs — 닫힌 조사 (9문항)</h2>
          <span className="rounded-full bg-gray-500 px-2 py-0.5 text-[11px] font-medium text-white">
            2026-08-06 종료
          </span>
        </div>
        <p className="text-xs text-gray-500">
          광고를 전부 /enjoy로 옮겨 새 응답이 들어오지 않습니다.
          <b> 아래 숫자는 더 늘지 않는 게 정상입니다.</b> 지우지 않는 이유는 이
          281명분이 수요 근거의 전부라서입니다 —
          자세한 건 <code className="text-[11px]">docs/product/수요공급_정리_2026_08_06.md</code>.
        </p>
      </div>

      <Section
        title="① 지금 그 시간을 어떻게 보내나 (실태)"
        hint='사실상 경쟁자 조사 — TV·유튜브가 경쟁자인지, "그냥 흘러가요"(핵심 타겟)가 몇인지'
        data={stats.timeuse}
      />
      <Section
        title="② '누가 있었으면' 싶은 순간"
        hint="외로움이 어느 장면에서 오는지 — 광고 후킹 장면과 모임 시나리오의 재료"
        data={stats.moment}
      />
      <Section
        title="③ 삶의 변화 (왜 시간이 많아졌나)"
        hint='"비슷한 길을 걷는 사람끼리" 세그먼트 — 자녀독립·이혼·사별·은퇴별 모임/카피 근거'
        data={stats.situation}
      />
      <Section
        title="④ 새 친구와 하고 싶은 것"
        hint="모임 주제 수요 + 광고 크리에이티브 분기 근거"
        data={stats.activity}
      />
      <Section
        title="⑤ 어떤 사람이 편한가"
        hint="8/4부터 결큐·앱과 같은 축(동성/상관없음/이성). 그 전 '조용한 분·활발한 분'은 폐지된 보기라 8/4 이전 응답입니다."
        data={stats.person}
      />
      <Section
        title="⑥ 만남에서 걱정되는 것"
        hint="1위가 광고 첫 줄이 된다 (사기 걱정 → 안전 먼저, 어색함 → 여럿이 함께 먼저)"
        data={stats.worry}
      />

      {/* 응답자가 누구인가 — 문항이 아니라 배경 정보라 따로 묶는다. */}
      <div className="grid gap-8 md:grid-cols-2">
        <Section title="연령 분포" hint={`45 미만 ${pct(stats.underAgeShare)}`} data={stats.ageBand} redKey="under45" />
        <Section title="성별" data={stats.gender} />
        <Section title="온라인 먼저 vs 만나서" data={stats.funnel} />
      </div>

      {/* "또는, 직접 쓸게요" 원문 — 보기 밖 수요의 원석. 다음 보기·모임 기획 재료 */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">✏️ 직접 입력 답변 (원문)</h2>
        <p className="mb-3 text-xs text-gray-400">
          보기에 없어서 직접 쓴 답 — 다음 보기 확장·모임 기획의 재료 (최신 100건)
        </p>
        {stats.customTexts.length === 0 ? (
          <p className="text-sm text-gray-400">아직 직접 입력한 답이 없어요.</p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {stats.customTexts.map((c, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <span className="mt-0.5 shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {NEEDS_DIM_LABELS[c.dim] ?? c.dim}
                </span>
                <span className="flex-1 text-gray-800">{c.text}</span>
                <span className="shrink-0 text-xs tabular-nums text-gray-400">
                  {c.createdAt ? c.createdAt.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Section title="유입 채널" hint="완료 기준 · utm_source → 없으면 유입 도메인" data={
        stats.bySource.slice(0, 10).map((s) => ({ key: s.source, count: s.count }))
      } />

      {stats.capped && (
        <p className="text-xs text-amber-600">
          질문별 퍼널은 최근 8,000건까지만 봤어요 (합계·응답 분포는 전체 기준).
        </p>
      )}
    </div>
  );
}
