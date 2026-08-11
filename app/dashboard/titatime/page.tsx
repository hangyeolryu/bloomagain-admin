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
import { getTeatimeSignups, type TeatimeSignup } from '@/lib/firestore';

type Session = {
  id: string;
  district?: string;
  dateLabel?: string;
  spotsLabel?: string;
  status?: string;
  published?: boolean;
};

const STATUS_KO: Record<string, string> = {
  open: '모집 중',
  almost: '마감 임박',
  closed: '마감',
  planning: '편성 예정',
};

// spotsLabel은 자유 문자열("정원 4명 · 선착순 모집")이라 정원을 여기서 캐낸다.
// 못 찾으면 목표선 없이 인원만 보여준다 — 없는 숫자를 지어내지 않는다.
function capacityOf(s: Session): number | null {
  const m = (s.spotsLabel ?? '').match(/(\d+)\s*명/);
  return m ? Number(m[1]) : null;
}

function genderKo(g?: string): string {
  const v = (g ?? '').toLowerCase().trim();
  if (['female', 'f', '여', '여성', 'woman'].includes(v)) return '여성';
  if (['male', 'm', '남', '남성', 'man'].includes(v)) return '남성';
  return '미상';
}

const fmt = (d?: Date) =>
  d ? new Date(d.getTime() + 9 * 3600_000).toISOString().slice(5, 16).replace('T', ' ') : '—';

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
    <div className="max-w-5xl space-y-8 p-6">
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
        <SignupSummary sessions={sessions} signups={signups} />
      )}

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
}: {
  sessions: Session[];
  signups: TeatimeSignup[];
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
      {live.map((s) => {
        const rows = signups.filter((g) => g.eventId === s.id);
        const cap = capacityOf(s);
        const pct = cap ? Math.min(100, Math.round((rows.length / cap) * 100)) : 0;
        const full = cap !== null && rows.length >= cap;

        return (
          <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="text-base font-bold text-gray-900">{s.dateLabel || '(날짜 미정)'}</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {s.district || '(지역 미정)'} · {STATUS_KO[s.status ?? ''] ?? s.status}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-3xl font-bold tabular-nums ${full ? 'text-emerald-600' : 'text-gray-900'}`}>
                  {rows.length}
                  {cap !== null && <span className="text-lg font-semibold text-gray-400">/{cap}</span>}
                </div>
                <div className="text-xs text-gray-400">신청</div>
              </div>
            </div>

            {cap !== null && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${full ? 'bg-emerald-500' : 'bg-emerald-300'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}

            {full && (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                자리가 찼습니다. 신청하신 분들께 만나는 곳을 알려주세요.
              </p>
            )}

            {rows.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">아직 신청이 없어요.</p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
                {rows.map((g) => (
                  <li key={g.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-gray-800">
                      {g.name || '이름없음'}
                      <span className="ml-2 text-xs text-gray-400">
                        {genderKo(g.gender)} · {g.region || '지역미상'}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-gray-400">{fmt(g.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
