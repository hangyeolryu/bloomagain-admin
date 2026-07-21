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
}: {
  title: string;
  icon: string;
  count?: number;
  href: string;
  cta: string;
  items: CardItem[];
  empty: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 p-4">
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
        subtitle="신고·알림·의심 메시지·보안 이벤트를 한 곳에서 — 처리 필요한 건 먼저 보입니다"
      />

      <h2 className="mb-3 mt-2 text-sm font-bold text-gray-900">처리 필요</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <SafetyCard
          title="신고"
          icon="🚨"
          count={data.pendingReports}
          href="/dashboard/reports"
          cta="신고 관리 →"
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

      <h2 className="mb-3 mt-6 text-sm font-bold text-gray-900">최근 활동 (자동 탐지 로그)</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <SafetyCard
          title="의심 메시지"
          icon="🚫"
          href="/dashboard/messages"
          cta="의심 메시지 →"
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
