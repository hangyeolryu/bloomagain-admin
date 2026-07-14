'use client';

// Onboarding 드롭오프 모니터링
// ──────────────────────────────────────────────────────────────────────────
// "Where are people stopping during onboarding?" — answered from the
// Firestore-visible state of each user doc. For pre-NICE step-level
// resolution (font size → intro → features → photo → terms), use the GA4
// funnel report on `onboarding_page_view` events instead — those steps
// don't write anything to Firestore.
//
// Created 2026-05-17. Read-only.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getOnboardingFunnel, getActivationFunnel } from '@/lib/firestore';
import type {
  OnboardingAttemptHint,
  OnboardingDropoff,
  OnboardingFunnel,
  OnboardingStage,
  ActivationFunnel,
} from '@/lib/firestore';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// 인증 시도 추정 라벨. Phase 2에서 verification_attempts 실제 로그가
// 들어오면 이 라벨은 확정 사유로 교체됩니다.
const attemptHintLabels: Record<OnboardingAttemptHint, { label: string; color: string; hint: string }> = {
  failed_recorded: {
    label: '본인인증 실패 (기록됨)',
    color: '#DC2626',
    hint: 'identityVerificationStatus === "failed"',
  },
  likely_attempted: {
    label: '시도 후 실패 (추정)',
    color: '#EA580C',
    hint: '가입 후 앱을 여러 번 열었음 — NICE 실패 · 이탈 가능성',
  },
  never_attempted_signal: {
    label: '시도 안 함 (추정)',
    color: '#6B7280',
    hint: '가입 직후 lastActiveAt 이 거의 안 움직임 — 본인인증 화면 보고 이탈',
  },
  unknown: {
    label: '판단 불가',
    color: '#9CA3AF',
    hint: 'lastActiveAt 없음',
  },
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
      {children}
    </h2>
  );
}

// Stacked-segment funnel bar. Width is proportional to count vs total.
function FunnelRow({
  label,
  count,
  total,
  pct,
  color,
  caption,
}: {
  label: string;
  count: number;
  total: number;
  pct: number;
  color: string;
  caption?: string;
}) {
  const widthPct = total > 0 ? Math.max((count / total) * 100, count > 0 ? 6 : 0) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-gray-700">
          {label}
          {caption && <span className="ml-2 text-xs text-gray-400">{caption}</span>}
        </span>
        <span className="tabular-nums">
          <span className="font-bold text-gray-900">{count.toLocaleString()}</span>
          <span className="text-xs text-gray-500 ml-2">({pct}%)</span>
        </span>
      </div>
      <div className="h-7 bg-gray-100 rounded-md overflow-hidden">
        <div
          className="h-full transition-all rounded-md"
          style={{ width: `${widthPct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

const stageLabels: Record<OnboardingStage, { label: string; color: string }> = {
  signed_up: { label: '가입만 함 (NICE 전 이탈)', color: '#EF4444' },
  nice_done: { label: 'NICE 통과, 프로필 시작 전', color: '#F59E0B' },
  profile_partial: { label: '프로필 작성 중 중단', color: '#FBBF24' },
  completed: { label: '완료 ✓', color: '#10B981' },
};

type DeviceFilter = 'all' | 'ios' | 'android' | 'other';

export default function OnboardingFunnelPage() {
  const [data, setData] = useState<OnboardingFunnel | null>(null);
  const [activation, setActivation] = useState<ActivationFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stats = await getOnboardingFunnel();
        if (!cancelled) setData(stats);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // 활성화 퍼널은 별도 로드 — 느려도(유저별 카운트) 위 드롭오프를 막지 않게.
    (async () => {
      try {
        const act = await getActivationFunnel();
        if (!cancelled) setActivation(act);
      } catch {
        /* 활성화 섹션은 실패해도 조용히 숨김 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (err) {
    return (
      <div className="p-6 max-w-3xl">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          데이터 로딩 실패: {err}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">온보딩 드롭오프</h1>
        <p className="text-sm text-gray-500 mt-1">
          가입한 사용자가 어느 단계에서 멈추는지. Firestore에서 보이는 상태만.
          단계별 (폰트크기 → intro → features → photo → terms) 세분화는{' '}
          <span className="font-mono text-xs bg-gray-100 px-1 rounded">
            onboarding_page_view
          </span>{' '}
          GA4 funnel을 보세요.
        </p>
      </div>

      {/* Headline */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-sm text-gray-500 font-medium">총 가입자 (users 컬렉션)</div>
        <div className="text-4xl font-bold tabular-nums mt-1">
          {data.totalSignedUp.toLocaleString()}
        </div>
      </div>

      {/* Funnel */}
      <div>
        <SectionHeading>단계별 분포</SectionHeading>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <FunnelRow
            label={stageLabels.signed_up.label}
            count={data.bySignedUp}
            total={data.totalSignedUp}
            pct={data.pctSignedUp}
            color={stageLabels.signed_up.color}
            caption="가입 직후 본인인증 안 함"
          />
          <FunnelRow
            label={stageLabels.nice_done.label}
            count={data.byNiceDone}
            total={data.totalSignedUp}
            pct={data.pctNiceDone}
            color={stageLabels.nice_done.color}
            caption="본인인증은 통과, 이름·관심사 비어있음"
          />
          <FunnelRow
            label={stageLabels.profile_partial.label}
            count={data.byProfilePartial}
            total={data.totalSignedUp}
            pct={data.pctProfilePartial}
            color={stageLabels.profile_partial.color}
            caption="이름 또는 관심사/지역 중 일부 미입력"
          />
          <FunnelRow
            label={stageLabels.completed.label}
            count={data.byCompleted}
            total={data.totalSignedUp}
            pct={data.pctCompleted}
            color={stageLabels.completed.color}
            caption="이름 + 관심사/지역 모두 있음"
          />
        </div>
      </div>

      {/* 가입 후 활성화(0일차) — 온보딩을 끝낸 사람이 실제로 '쓰기' 시작하나 */}
      <ActivationSection data={activation} />

      {/* Attempt hint summary + device filter (signed_up 단계만) */}
      <DropoffTable
        rows={data.recentDropoffs}
        deviceFilter={deviceFilter}
        onDeviceFilter={setDeviceFilter}
      />

      {/* Footer hint */}
      <div className="text-xs text-gray-400 leading-relaxed">
        Tip: 표에서 <span className="font-mono">시도 후 실패 (추정)</span> 라벨은
        가입 후 앱을 여러 번 열었지만 아직 인증 못 한 사람을 보여드립니다.
        확정된 실패 사유는 NICE Cloud Function에 attempt 로깅을 붙이면
        보이도록 준비 중입니다 (Phase 2). NICE 이전 세부 단계는 Firebase
        Console → Analytics → Funnel Exploration에서{' '}
        <span className="font-mono">onboarding_page_view</span> events로 구성.
      </div>
    </div>
  );
}

// ── 활성화(0일차) 퍼널 ──────────────────────────────────────────────────
// 온보딩을 '완료'한 다음이 진짜 승부처. 탈퇴 설문은 삭제한 사람만 잡지만,
// 이 퍼널은 조용히 안 돌아오는 사람까지 행동으로 드러낸다.

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function ActivationSection({ data }: { data: ActivationFunnel | null }) {
  if (!data) {
    return (
      <div>
        <SectionHeading>가입 후 활성화 (0일차)</SectionHeading>
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-400">
          불러오는 중…
        </div>
      </div>
    );
  }

  const steps = [
    { label: '가입', count: data.signups, color: '#6366F1',
      caption: `최근 ${data.windowDays}일` },
    { label: '결큐 첫 답변', count: data.answered1, color: '#8B5CF6',
      caption: '질문 1개 이상' },
    { label: '게이트 통과 (사람이 보임)', count: data.gateCleared, color: '#0EA5E9',
      caption: '질문 3개 이상' },
  ];

  return (
    <div>
      <SectionHeading>가입 후 활성화 (0일차)</SectionHeading>

      {/* 한 줄 진단 */}
      <div className="mb-3 bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm text-indigo-900">
        온보딩 완료 후 <b>결큐를 한 개도 안 답한 사람</b>이{' '}
        <b>{data.signups - data.answered1}명</b>{' '}
        (가입 {data.signups}명 중 {pct(data.signups - data.answered1, data.signups)}%).
        {' '}재방문(가입 다음날 이후 접속)은 기회가 있던{' '}
        {data.returnedEligible}명 중 <b>{data.returned}명</b>{' '}
        ({pct(data.returned, data.returnedEligible)}%).
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {steps.map((s) => (
          <FunnelRow
            key={s.label}
            label={s.label}
            count={s.count}
            total={data.signups}
            pct={pct(s.count, data.signups)}
            color={s.color}
            caption={s.caption}
          />
        ))}
        {/* 재방문은 분모가 다르므로(기회 있던 사람) 따로 표시 */}
        <FunnelRow
          label="재방문 (다른 날 다시 옴)"
          count={data.returned}
          total={data.returnedEligible}
          pct={pct(data.returned, data.returnedEligible)}
          color="#10B981"
          caption={`기회 있던 ${data.returnedEligible}명 기준`}
        />
      </div>

      {/* 일별 코호트 */}
      {data.daily.length > 0 && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2.5">가입일</th>
                <th className="text-right px-4 py-2.5">가입</th>
                <th className="text-right px-4 py-2.5">첫 답변</th>
                <th className="text-right px-4 py-2.5">게이트 통과</th>
                <th className="text-right px-4 py-2.5">재방문</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((d) => (
                <tr key={d.date} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 tabular-nums text-gray-700">{d.date}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{d.signups}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                    {d.answered1} <span className="text-xs text-gray-400">({pct(d.answered1, d.signups)}%)</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                    {d.gateCleared} <span className="text-xs text-gray-400">({pct(d.gateCleared, d.signups)}%)</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                    {d.eligible > 0
                      ? <>{d.returned} <span className="text-xs text-gray-400">({pct(d.returned, d.eligible)}%)</span></>
                      : <span className="text-xs text-gray-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-xs text-gray-400 leading-relaxed">
        재방문 = 가입일보다 뒤 날짜에 <span className="font-mono">activity_daily</span> 기록이 있는 사람.
        오늘 가입자는 아직 재방문 기회가 없어 분모에서 제외됩니다.
      </p>
    </div>
  );
}

// ── Dropoff table (extracted for readability) ───────────────────────────

function DropoffTable({
  rows,
  deviceFilter,
  onDeviceFilter,
}: {
  rows: OnboardingDropoff[];
  deviceFilter: DeviceFilter;
  onDeviceFilter: (f: DeviceFilter) => void;
}) {
  const filtered = useMemo(() => {
    if (deviceFilter === 'all') return rows;
    return rows.filter((u) => {
      const p = (u.device?.platform ?? '').toLowerCase();
      if (deviceFilter === 'ios') return p.includes('ios');
      if (deviceFilter === 'android') return p.includes('android');
      return !p.includes('ios') && !p.includes('android');
    });
  }, [rows, deviceFilter]);

  // Signed_up 단계 안에서 인증 시도 추정 분포
  const hintBreakdown = useMemo(() => {
    const b = { failed_recorded: 0, likely_attempted: 0, never_attempted_signal: 0, unknown: 0 };
    for (const u of rows) {
      if (u.stage === 'signed_up' && u.attemptHint) b[u.attemptHint] += 1;
    }
    return b;
  }, [rows]);

  return (
    <div>
      <div className="mb-3 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            최근 7일 미완료 사용자 ({rows.length}명)
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            가장 오래된 순. 며칠째 멈춰있는지 + 어느 기기·어떤 상태인지 한눈에.
          </p>
        </div>
        <div className="flex gap-1 text-xs">
          {(['all', 'ios', 'android', 'other'] as DeviceFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => onDeviceFilter(f)}
              className={`px-3 py-1.5 rounded-md border transition-colors ${
                deviceFilter === f
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? '전체' : f === 'ios' ? 'iOS' : f === 'android' ? 'Android' : '기타'}
            </button>
          ))}
        </div>
      </div>

      {/* signed_up 상태의 이유 분포 요약 */}
      {rows.some((u) => u.stage === 'signed_up' && u.attemptHint) && (
        <div className="mb-3 bg-white rounded-lg border border-gray-100 p-3 flex flex-wrap gap-4 text-xs">
          <span className="text-gray-500 font-semibold">본인인증 못한 사용자 왜?</span>
          {(Object.entries(hintBreakdown) as [OnboardingAttemptHint, number][])
            .filter(([, n]) => n > 0)
            .map(([hint, n]) => (
              <span key={hint} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: attemptHintLabels[hint].color }}
                />
                <span className="text-gray-700">{attemptHintLabels[hint].label}</span>
                <span className="font-semibold tabular-nums text-gray-900">{n}</span>
              </span>
            ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            {deviceFilter !== 'all'
              ? '이 필터에 해당하는 사용자 없음.'
              : '최근 7일 내 미완료 사용자 없음 — 깔끔합니다 ✨'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">사용자</th>
                <th className="text-left px-4 py-3">단계 · 인증 상태</th>
                <th className="text-left px-4 py-3">기기</th>
                <th className="text-right px-4 py-3">가입 후 · 마지막 접속</th>
                <th className="text-left px-4 py-3 pl-6">이메일</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.uid} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/users/${u.uid}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {u.displayName || '(이름 없음)'}
                    </Link>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">
                      {u.uid.slice(0, 12)}…
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block px-2 py-1 rounded-md text-xs font-medium"
                      style={{
                        backgroundColor: `${stageLabels[u.stage].color}20`,
                        color: stageLabels[u.stage].color,
                      }}
                    >
                      {stageLabels[u.stage].label}
                    </span>
                    {u.stage === 'signed_up' && u.attemptHint && (
                      <div className="mt-1.5 space-y-1">
                        <div
                          className="text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: `${attemptHintLabels[u.attemptHint].color}15`,
                            color: attemptHintLabels[u.attemptHint].color,
                          }}
                          title={attemptHintLabels[u.attemptHint].hint}
                        >
                          {attemptHintLabels[u.attemptHint].label}
                        </div>
                        {u.attemptSummary && u.attemptSummary.lastAt && (
                          <div className="text-[10px] text-gray-500 leading-tight">
                            시도 {u.attemptSummary.attemptCount}회
                            {u.attemptSummary.failureCount > 0 &&
                              ` · 실패 ${u.attemptSummary.failureCount}회`}
                            {u.attemptSummary.lastErrorReason && (
                              <div
                                className="font-mono text-red-600 truncate max-w-[220px]"
                                title={u.attemptSummary.lastErrorReason}
                              >
                                {u.attemptSummary.lastErrorReason}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {u.device ? (
                      <>
                        <div className="font-medium text-gray-800">
                          {u.device.platform ?? '—'}
                          {u.device.osVersion ? ` ${u.device.osVersion}` : ''}
                        </div>
                        {u.device.model && (
                          <div className="text-gray-500 truncate max-w-[180px]">{u.device.model}</div>
                        )}
                        {u.device.appVersion && (
                          <div className="text-gray-400 mt-0.5 font-mono">
                            앱 v{u.device.appVersion}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400">기록 없음</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600 whitespace-nowrap">
                    <div>{u.daysSinceCreated}일 전 가입</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {u.minutesSinceLastActive === undefined
                        ? '접속 기록 없음'
                        : u.minutesSinceLastActive < 60
                        ? `${u.minutesSinceLastActive}분 전 접속`
                        : u.minutesSinceLastActive < 24 * 60
                        ? `${Math.floor(u.minutesSinceLastActive / 60)}시간 전 접속`
                        : `${Math.floor(u.minutesSinceLastActive / (24 * 60))}일 전 접속`}
                    </div>
                  </td>
                  <td className="px-4 py-3 pl-6 text-gray-500 truncate max-w-[220px]">
                    {u.email || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
