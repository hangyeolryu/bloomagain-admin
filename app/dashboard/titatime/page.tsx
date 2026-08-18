'use client';

// 티타임 자리 관리 — 열린 자리와 신청 현황을 한 화면에서 본다.
// ──────────────────────────────────────────────────────────────────────────
// 가격 실험(fake-door)은 걷어냈다. titatime_events가 총 2건이라 화면이 스스로
// 요구한 "암당 view 30+"에 영원히 못 닿았다 — 시작조차 안 된 실험을 대시보드에
// 띄워두면 매번 눈이 가고 매번 판단이 안 된다. 다시 하려면 그때 되살린다.
//
// 대신 실제로 필요한 걸 올린다: 지금 열린 자리에 **몇 명이 신청했나**.
// 자리를 만드는 곳과 신청을 보는 곳이 갈려 있어서(titatime / teatime) 8/8에
// 전시 자리를 열고도 결과를 못 찾았다.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import MeetupSessionsCard from './MeetupSessionsCard';
import SeatRoster from './SeatRoster';
import ProposalsCard from './ProposalsCard';
import { getTeatimeSignups, type TeatimeSignup } from '@/lib/firestore';

type Session = {
  id: string;
  district?: string;
  dateLabel?: string;
  spotsLabel?: string;
  status?: string;
  published?: boolean;
};

export default function TitatimePage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [signups, setSignups] = useState<TeatimeSignup[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [res, s] = await Promise.all([
        fetch('/api/backend/titatime-sessions', { cache: 'no-store' }),
        getTeatimeSignups(),
      ]);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '세션 불러오기 실패');
      setSessions(json.items ?? []);
      setSignups(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '불러오기 실패');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-5xl space-y-6 p-0 sm:space-y-8 sm:p-6">
      <Header
        title="티타임 자리 관리"
        subtitle="날짜·장소가 정해진 자리를 열고, 몇 명이 신청했는지 봅니다."
      />

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {err}
        </div>
      ) : !sessions || !signups ? (
        <div className="p-6"><LoadingSpinner /></div>
      ) : (
        <SignupSummary sessions={sessions} signups={signups} onChanged={load} />
      )}

      {/* 회원 제안 → 승인 → 초안. 자리 목록보다 위 — 새로 온 것부터. */}
      <ProposalsCard onSessionCreated={load} />

      <MeetupSessionsCard />

      <p className="text-xs text-gray-500">
        전체 신청 이력은{' '}
        <Link href="/dashboard/teatime" className="font-medium text-emerald-700 underline">
          티타임 신청 명단
        </Link>
        에서 봅니다.
      </p>
    </div>
  );
}

function SignupSummary({
  sessions,
  signups,
  onChanged,
}: {
  sessions: Session[];
  signups: TeatimeSignup[];
  onChanged: () => void;
}) {
  const live = sessions.filter((s) => s.published !== false && s.status !== 'closed');

  if (live.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <p className="text-sm text-gray-600">
          지금 열린 자리가 없습니다. 아래에서 새 자리를 만드세요.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {live.map((s) => (
        <SeatRoster
          key={s.id}
          session={s}
          rows={signups.filter((g) => g.eventId === s.id)}
          onChanged={onChanged}
        />
      ))}
    </section>
  );
}
