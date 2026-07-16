'use client';

// 결 유형 테스트 (무가입) — 관심·유입 대시보드
// ──────────────────────────────────────────────────────────────────────────
// 마케팅 웹(tita-app.com/gyeol)의 무가입 결 유형 테스트가 남기는 익명 이벤트를
// 집계한다. 테스트는 로그인이 없어 "누가"(개인)는 없고, "몇 명·어떤 유형·
// 어디서·다운 전환"을 본다. 데이터: Firestore `gyeol_test_events` (백엔드가
// POST /api/v1/gyeol/events로 적재).

import { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  getGyeolStats,
  gyeolTypeLabel,
  GYEOL_GENDER_LABELS,
  GYEOL_COMFORT_LABELS,
  type GyeolStats,
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

function FlowStep({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-[88px] flex-1 flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-4 text-center">
      <div className="text-3xl font-bold tabular-nums text-gray-900">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  );
}

function Conn({ pct, caption, weak }: { pct: string; caption: string; weak: boolean }) {
  return (
    <div className="flex min-w-[62px] flex-col items-center justify-center px-1">
      <div className={`text-sm font-bold tabular-nums ${weak ? 'text-red-600' : 'text-green-700'}`}>{pct}</div>
      <div className="text-[10px] text-gray-400">{caption}</div>
      <div className={`mt-0.5 text-xl leading-none ${weak ? 'text-red-400' : 'text-gray-300'}`}>→</div>
    </div>
  );
}

function Journey({ furthest }: { furthest: 'start' | 'complete' | 'download' }) {
  const rank = furthest === 'download' ? 3 : furthest === 'complete' ? 2 : 1;
  const steps = [
    { n: 1, label: '시작' },
    { n: 2, label: '완료' },
    { n: 3, label: '다운클릭' },
  ];
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-1">
          <span
            className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ${
              rank >= s.n ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-400'
            }`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span className={`text-xs ${rank > s.n ? 'text-green-500' : 'text-gray-300'}`}>→</span>
          )}
        </div>
      ))}
    </div>
  );
}

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0 truncate text-sm text-gray-700" title={label}>{label}</div>
      <div className="relative h-6 flex-1 overflow-hidden rounded bg-gray-100">
        <div className="absolute inset-y-0 left-0 rounded bg-green-600/80" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-12 shrink-0 text-right text-sm tabular-nums text-gray-600">{count}</div>
    </div>
  );
}

export default function GyeolDashboardPage() {
  const [stats, setStats] = useState<GyeolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getGyeolStats()
      .then(setStats)
      .catch((e) => setErr(e?.message ?? '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (err) return <div className="p-6 text-sm text-red-600">에러: {err}</div>;
  if (!stats) return null;

  const t = stats.totals;
  // 비율은 0~100%로 클램프한다. start 전송이 유실되거나(네트워크) 한 유저가
  // iOS/Android 둘 다 누르면 비율이 100%를 넘을 수 있어 표시가 깨진다.
  const pct = (n: number) => `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;
  const typeMax = stats.typeDistribution[0]?.count ?? 0;
  const srcMax = stats.bySource[0]?.count ?? 0;
  const genderMax = stats.genderDistribution[0]?.count ?? 0;
  const comfortMax = stats.comfortDistribution[0]?.count ?? 0;
  const genderKnown = stats.genderDistribution.reduce((s, d) => s + d.count, 0);
  // 막대 스케일은 start·complete 통합 최댓값 기준 (complete>start여도 안 넘침).
  const dayMax = Math.max(1, ...stats.daily.flatMap((d) => [d.start, d.complete]));
  // 오늘(KST) 시작·완료 — daily는 yyyy-mm-dd(KST) 버킷. 없으면 0.
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const today = stats.daily.find((d) => d.date === todayKey);
  // 사람(세션) 단위 퍼널 — "시작한 N명 중 몇 명이 끝까지 갔나".
  const sf = stats.sessionFunnel;
  const di = stats.downloadInsight;
  const sCompRate = sf.total ? sf.completed / sf.total : 0;
  const sDlRate = sf.completed ? sf.downloaded / sf.completed : 0;
  // 빨간 화살표 = 절반 이상 이탈(전환 <50%)하는 '큰 누수' 구간.
  const compLeak = sCompRate < 0.5;
  const dlLeak = sDlRate < 0.5;

  return (
    <div className="max-w-5xl space-y-8 p-6">
      <Header
        title="결 유형 테스트"
        subtitle="무가입 테스트 관심·유입 (익명 집계 — 개인 신원은 남지 않음)"
      />

      {/* 한눈에 — 오늘 + 퍼널 흐름(어디서 새는지) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">한눈에</h2>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-green-50 px-3 py-1 font-semibold text-green-700">오늘</span>
            <span className="text-gray-700">
              테스트 시작 <b className="tabular-nums">{today?.start ?? 0}</b>
              <span className="mx-1.5 text-gray-300">·</span>
              완료 <b className="tabular-nums">{today?.complete ?? 0}</b>
            </span>
          </div>
          <div className="mb-1 text-xs text-gray-500">사람(세션) 단위 — 시작한 {sf.total}명 중 몇 명이 끝까지 갔나</div>
          <div className="flex items-stretch gap-1 overflow-x-auto">
            <FlowStep label="테스트 시작" value={sf.total} />
            <Conn pct={pct(sCompRate)} caption="완료율" weak={compLeak} />
            <FlowStep label="완료" value={sf.completed} />
            <Conn pct={pct(sDlRate)} caption="다운 전환" weak={dlLeak} />
            <FlowStep label="다운로드 클릭" value={sf.downloaded} />
          </div>
          <p className="mt-3 text-xs text-gray-400">
            빨간 화살표 = 절반 이상 이탈하는 큰 누수 구간. 세션ID 이전 데이터는 유입원·시간으로 <b>추정</b>해 묶었어요.
            다운클릭 다음(스토어 설치 → 가입)은 이 화면 밖 — 인스타 인앱 브라우저 누수 구간이에요.
          </p>
        </div>
      </section>

      {/* 세션별 여정 — 한 명이 어디까지 갔나 */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">세션별 여정 (한 명이 어디까지 갔나)</h2>
        <p className="mb-3 text-xs text-gray-400">
          최근 50세션 · 시작 → 완료 → 다운클릭. 성별·이성/동성은 완료(프로필) 단계에서 남긴 값이에요.
          세션ID 없는 과거 데이터는 유입원·시간으로 추정해 묶었어요.
        </p>
        {stats.sessions.length === 0 ? (
          <p className="text-sm text-gray-400">아직 세션 데이터가 없어요.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">시작 시각</th>
                  <th className="px-3 py-2 text-left font-medium">유입</th>
                  <th className="px-3 py-2 text-left font-medium">성별</th>
                  <th className="px-3 py-2 text-left font-medium">누구와 (동성·이성·결)</th>
                  <th className="px-3 py-2 text-left font-medium">결 유형</th>
                  <th className="px-3 py-2 text-left font-medium">여정</th>
                </tr>
              </thead>
              <tbody>
                {stats.sessions.map((s, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-500">
                      {s.startedAt ? s.startedAt.toLocaleString('ko-KR') : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{s.source}</td>
                    <td className="px-3 py-2 font-medium">
                      {s.gender === 'f' ? (
                        <span className="text-pink-600">여성</span>
                      ) : s.gender === 'm' ? (
                        <span className="text-blue-600">남성</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {s.comfort === 'opp'
                        ? '이성'
                        : s.comfort === 'same'
                        ? '동성'
                        : s.comfort === 'any'
                        ? '결 (상관없음)'
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{s.type ? gyeolTypeLabel(s.type) : '—'}</td>
                    <td className="px-3 py-2"><Journey furthest={s.furthest} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 다운클릭 심층 — 다운까지 간 사람들이 뭘 원하나 + 세그먼트별 전환 */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">다운클릭한 사람들 (심층 분석)</h2>
        <p className="mb-3 text-xs text-gray-400">
          완료 {di.completed}명 중 다운클릭 {di.clickers}명 · 완료→다운 전환 {pct(di.convOverall)} ·
          &ldquo;누구와&rdquo;는 완료(프로필) 단계 응답 기준
        </p>
        {di.clickers === 0 ? (
          <p className="text-sm text-gray-400">아직 다운클릭한 세션이 없어요.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* 인앱 브라우저 누수 — "클릭했는데 설치 안 됨"의 대표 원인 */}
            <div className={`rounded-lg border p-4 md:col-span-2 ${di.inAppShare >= 0.3 ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
              <div className="mb-1 text-xs font-semibold text-gray-500">
                인앱 브라우저에서 다운클릭 (설치 핸드오프가 깨지는 누수)
              </div>
              {di.inAppKnown === 0 ? (
                <p className="text-sm text-gray-400">
                  아직 인앱 여부 기록이 없어요. 웹 배포 후 다운클릭분부터 집계돼요.
                </p>
              ) : (
                <p className="text-sm text-gray-800">
                  다운클릭 {di.inAppKnown}건 중{' '}
                  <b className={di.inAppShare >= 0.3 ? 'text-amber-700' : 'text-gray-900'}>
                    인앱 {di.inAppClickers}건 ({pct(di.inAppShare)})
                  </b>
                  {di.inAppShare >= 0.3 && ' — 인스타/페북/카톡 인앱에서 스토어로 못 넘어가 설치가 새는 주범일 수 있어요.'}
                </p>
              )}
            </div>
            {/* 다운클릭자 구성 */}
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="mb-2 text-xs font-semibold text-gray-500">다운클릭한 사람들은 누구?</div>
              <div className="mb-2 flex gap-3 text-sm">
                <span className="font-semibold text-pink-600">여성 {di.gender.f}</span>
                <span className="font-semibold text-blue-600">남성 {di.gender.m}</span>
                {di.gender.na > 0 && <span className="text-gray-400">미상 {di.gender.na}</span>}
              </div>
              <div className="text-sm text-gray-600">
                누구와 — 동성 {di.comfort.same} · 이성 {di.comfort.opp} · 결 {di.comfort.any}
              </div>
            </div>
            {/* 세그먼트별 완료→다운 전환율 */}
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="mb-2 text-xs font-semibold text-gray-500">
                어느 세그먼트가 다운으로 잘 넘어가나 (완료→다운)
              </div>
              <div className="space-y-1 text-sm text-gray-700">
                <div>
                  성별 — <span className="text-pink-600">여 {pct(di.convByGender.f)}</span> ·{' '}
                  <span className="text-blue-600">남 {pct(di.convByGender.m)}</span>
                </div>
                <div>
                  누구와 — 동성 {pct(di.convByComfort.same)} · 이성 {pct(di.convByComfort.opp)} · 결 {pct(di.convByComfort.any)}
                </div>
              </div>
            </div>
            {/* top 결유형 */}
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="mb-2 text-xs font-semibold text-gray-500">다운클릭자 결 유형 top</div>
              {di.types.length === 0 ? (
                <p className="text-xs text-gray-400">—</p>
              ) : (
                <div className="space-y-1">
                  {di.types.map((t) => (
                    <div key={t.type} className="flex justify-between text-sm">
                      <span className="mr-2 truncate text-gray-700">{gyeolTypeLabel(t.type)}</span>
                      <span className="text-gray-500">{t.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* top 유입원 */}
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="mb-2 text-xs font-semibold text-gray-500">다운클릭자 유입원 top</div>
              <div className="space-y-1">
                {di.sources.map((s) => (
                  <div key={s.source} className="flex justify-between text-sm">
                    <span className="mr-2 truncate text-gray-700">{s.source}</span>
                    <span className="text-gray-500">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 퍼널 (상세 타일) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">퍼널 상세 (이벤트 수 기준)</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Tile label="테스트 시작" value={t.start} strong />
          <Tile label="완료" value={t.complete} strong />
          <Tile label="완료율" value={pct(stats.completionRate)} hint="완료 / 시작" />
          <Tile label="결과 공유" value={t.share} />
          <Tile label="다운로드 클릭" value={t.download} />
          <Tile label="다운 전환율" value={pct(stats.downloadRate)} hint="다운클릭 / 완료" />
        </div>
      </section>

      {/* 유형 분포 */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">어떤 결 유형이 많이 나오나</h2>
        <p className="mb-3 text-xs text-gray-400">완료 기준 · 어떤 결의 사람들이 관심 갖는지</p>
        {stats.typeDistribution.length === 0 ? (
          <p className="text-sm text-gray-400">아직 완료 데이터가 없어요.</p>
        ) : (
          <div className="space-y-2">
            {stats.typeDistribution.map((d) => (
              <Bar key={d.type} label={gyeolTypeLabel(d.type)} count={d.count} max={typeMax} />
            ))}
          </div>
        )}
      </section>

      {/* 성비 + 편안함 (여성-우선 핵심 지표) */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">성별 · 누구와 편한지</h2>
        <p className="mb-3 text-xs text-gray-400">
          완료 시점 선택(익명·선택) · 여성-우선 성비와 매칭 필터 근거
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-medium text-gray-500">성별</span>
              <span className="text-sm font-semibold text-green-700 tabular-nums">
                여성 {genderKnown > 0 ? `${Math.round(stats.femaleShare * 100)}%` : '—'}
                <span className="ml-1 text-xs font-normal text-gray-400">(응답 {genderKnown})</span>
              </span>
            </div>
            {stats.genderDistribution.length === 0 ? (
              <p className="text-sm text-gray-400">아직 응답이 없어요.</p>
            ) : (
              <div className="space-y-2">
                {stats.genderDistribution.map((d) => (
                  <Bar key={d.gender} label={GYEOL_GENDER_LABELS[d.gender] ?? d.gender} count={d.count} max={genderMax} />
                ))}
              </div>
            )}
          </div>
          <div>
            <span className="mb-2 block text-xs font-medium text-gray-500">누구와 함께가 편한지</span>
            {stats.comfortDistribution.length === 0 ? (
              <p className="text-sm text-gray-400">아직 응답이 없어요.</p>
            ) : (
              <div className="space-y-2">
                {stats.comfortDistribution.map((d) => (
                  <Bar key={d.comfort} label={GYEOL_COMFORT_LABELS[d.comfort] ?? d.comfort} count={d.count} max={comfortMax} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 유입 소스 */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">어디서 왔나 (유입 채널)</h2>
        <p className="mb-3 text-xs text-gray-400">완료 기준 · utm_source → 없으면 유입 도메인</p>
        {stats.bySource.length === 0 ? (
          <p className="text-sm text-gray-400">아직 데이터가 없어요.</p>
        ) : (
          <div className="space-y-2">
            {stats.bySource.slice(0, 12).map((d) => (
              <Bar key={d.source} label={d.source} count={d.count} max={srcMax} />
            ))}
          </div>
        )}
      </section>

      {/* 일별 추이 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">최근 14일 추이</h2>
        {stats.daily.length === 0 ? (
          <p className="text-sm text-gray-400">아직 데이터가 없어요.</p>
        ) : (
          <div className="flex gap-1.5 rounded-lg border border-gray-100 bg-gray-50/50 p-3" style={{ height: 150 }}>
            {stats.daily.map((d) => {
              const barH = (v: number) =>
                `${Math.min(100, (v / dayMax) * 100)}%`;
              return (
                <div
                  key={d.date}
                  className="flex flex-1 flex-col gap-1"
                  title={`${d.date} · 시작 ${d.start} / 완료 ${d.complete}`}
                >
                  <div className="relative w-full flex-1">
                    {/* 연한 넓은 막대 = 시작, 진한 좁은 막대 = 완료 (둘 다 바닥 정렬) */}
                    <div
                      className="absolute bottom-0 left-0 w-full rounded-t bg-green-200"
                      style={{ height: barH(d.start) }}
                    />
                    <div
                      className="absolute bottom-0 left-1/2 w-1/2 -translate-x-1/2 rounded-t bg-green-600"
                      style={{ height: barH(d.complete) }}
                    />
                  </div>
                  <div className="text-center text-[9px] text-gray-400">
                    {d.date.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-gray-400">진한 막대 = 완료, 연한 막대 = 시작</p>
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
                <th className="px-3 py-2 text-left font-medium">결 유형</th>
                <th className="px-3 py-2 text-left font-medium">유입</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{r.createdAt ? r.createdAt.toLocaleString('ko-KR') : '—'}</td>
                  <td className="px-3 py-2">{{ start: '시작', complete: '완료', share: '공유', download: '다운클릭' }[r.phase] ?? r.phase}</td>
                  <td className="px-3 py-2 text-gray-700">{r.type ? gyeolTypeLabel(r.type) : '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-gray-400">
        {stats.capped && '최근 2,000건 기준 집계. '}
        테스트는 무가입이라 개인 신원은 저장하지 않아요. 실시간 이벤트는 GA4에서도 볼 수 있어요.
      </p>
    </div>
  );
}
