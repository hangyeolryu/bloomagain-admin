'use client';

// 안전 센터 — 신뢰·안전 4개 표면을 한 화면에.
// ──────────────────────────────────────────────────────────────────────────
// 처리 필요(신고 pending · 알림 unresolved): 건수 + 상위 항목 + 관리 바로가기.
// 최근 활동(의심 메시지 · 보안 이벤트): 자동 탐지 로그 최근분 + 전체 보기.
// 관리자가 "지금 뭘 봐야 하나"를 4곳 안 돌아다니고 여기서 판단한다.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSafetyOverview, type SafetyOverview } from '@/lib/firestore';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Badge from '@/components/ui/Badge';
import SafetyStatusBadge from '@/components/ui/SafetyStatusBadge';

function fmt(d?: Date) {
  return d
    ? d.toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}

const SEC_LABEL: Record<string, { label: string; variant: 'red' | 'orange' }> = {
  account_lock: { label: 'L3 계정 잠금', variant: 'red' },
  shadow_ban: { label: 'L2 그림자 차단', variant: 'orange' },
};

interface CardItem {
  id: string;
  primary: string;
  secondary?: string;
  at?: Date;
  right?: React.ReactNode;
}

function SafetyCard({
  title,
  icon,
  count,
  href,
  cta,
  items,
  empty,
  caption,
}: {
  title: string;
  icon: string;
  count?: number;
  href: string;
  cta: string;
  items: CardItem[];
  empty: string;
  caption?: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <h3 className="font-bold text-gray-900">{title}</h3>
            {count !== undefined && count > 0 && (
              <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold tabular-nums text-red-700">
                {count}
              </span>
            )}
          </div>
          <Link href={href} className="shrink-0 text-xs font-medium text-green-700 hover:underline">
            {cta}
          </Link>
        </div>
        {caption && <p className="mt-1 text-xs text-gray-400">{caption}</p>}
      </div>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-gray-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-gray-800">{it.primary || '—'}</p>
                {it.secondary && <p className="truncate text-xs text-gray-500">{it.secondary}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {it.right}
                <span className="text-xs tabular-nums text-gray-400">{fmt(it.at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function SafetyCenterPage() {
  const [data, setData] = useState<SafetyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getSafetyOverview()
      .then(setData)
      .catch((e) => setErr(e?.message ?? '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (err) return <div className="p-6 text-sm text-red-600">에러: {err}</div>;
  if (!data) return null;

  return (
    <div>
      <Header
        title="안전 센터"
        subtitle="평소엔 여기만 보세요 — '처리 필요'에 뜬 것만 손보면 됩니다"
      />

      {/* 오늘 할 일 — 사람이 판단해야 하는 건 '신고'뿐. 0이면 안심 배너. */}
      {data.pendingReports === 0 ? (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <span className="text-2xl">✅</span>
          <div>
            <p className="text-sm font-bold text-green-900">오늘 처리할 신고가 없어요</p>
            <p className="text-xs text-green-700">
              아래 알림·로그는 시스템이 이미 처리한 것이라, 급히 볼 것 없습니다.
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="text-sm font-bold text-amber-900">
              처리할 신고 {data.pendingReports}건
            </p>
            <p className="text-xs text-amber-700">
              사람이 직접 신고한 건이에요. 아래에서 AI 초안을 보고 조치/기각을 정해주세요.
            </p>
          </div>
        </div>
      )}

      <h2 className="mb-3 text-sm font-bold text-gray-900">처리 필요 (사람이 판단)</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <SafetyCard
          title="신고"
          icon="🚨"
          count={data.pendingReports}
          href="/dashboard/reports"
          cta="신고 관리 →"
          caption="사람이 신고함 — AI 초안 보고 조치/기각 결정"
          empty="대기 중인 신고가 없어요."
          items={data.topReports.map((r) => ({
            id: r.id,
            primary: r.reason || '신고',
            secondary: `${r.type === 'circle' ? '모임' : '사용자'} · 대상 ${(r.targetId ?? '').slice(0, 6)}…`,
            at: r.createdAt,
            right: <SafetyStatusBadge status={r.status} />,
          }))}
        />
        <SafetyCard
          title="관리자 알림"
          icon="🔔"
          count={data.unresolvedAlerts}
          href="/dashboard/alerts"
          cta="알림 관리 →"
          caption="시스템 알림 — 대부분 훑어보기, 이미지 차단만 가끔 확인"
          empty="미해결 알림이 없어요."
          items={data.topAlerts.map((a) => ({
            id: a.id,
            primary: a.type || '알림',
            secondary: a.userDisplayName ?? a.reason,
            at: a.timestamp,
            right: (
              <Badge
                variant={
                  a.severity === 'high' ? 'red' : a.severity === 'medium' ? 'orange' : 'yellow'
                }
              >
                {a.severity === 'high' ? '높음' : a.severity === 'medium' ? '보통' : '낮음'}
              </Badge>
            ),
          }))}
        />
      </div>

      <h2 className="mb-1 mt-6 text-sm font-bold text-gray-900">자동 처리됨 · 확인용</h2>
      <p className="mb-3 text-xs text-gray-500">
        아래 둘은 시스템이 <b>이미 조치한</b> 기록이에요. 급히 볼 것 없고, AI가
        제대로 거르는지 가끔 감사하거나 특정 유저를 조사할 때만 봅니다.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <SafetyCard
          title="의심 메시지"
          icon="🚫"
          href="/dashboard/messages"
          cta="의심 메시지 →"
          caption="AI가 이미 차단/경고함 — 과·소차단 감사용"
          empty="최근 의심 메시지가 없어요."
          items={data.recentMessages.map((m) => ({
            id: m.id,
            primary: (m.content ?? '').slice(0, 40) || m.reason || '메시지',
            secondary: m.reason,
            at: m.timestamp,
            right: (
              <Badge variant={m.action === 'blocked' ? 'red' : 'yellow'}>
                {m.action === 'blocked' ? '차단' : '경고'}
              </Badge>
            ),
          }))}
        />
        <SafetyCard
          title="보안 이벤트"
          icon="🛡️"
          href="/dashboard/security"
          cta="보안 이벤트 →"
          caption="보안 엔진이 이미 조치함 — 조사할 때만 확인"
          empty="최근 고위험 보안 이벤트가 없어요."
          items={data.recentSecurity.map((s) => {
            const meta = SEC_LABEL[s.action] ?? { label: s.action, variant: 'orange' as const };
            return {
              id: s.id,
              primary: meta.label,
              secondary: s.userId ? `사용자 ${s.userId.slice(0, 6)}…` : s.reason,
              at: s.createdAt,
              right: <Badge variant={meta.variant}>{s.action === 'account_lock' ? 'L3' : 'L2'}</Badge>,
            };
          })}
        />
      </div>
    </div>
  );
}
