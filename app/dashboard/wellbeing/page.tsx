'use client';

/**
 * 웰빙 확인 — 안부 체크에서 신호가 뜬 회원.
 *
 * 알림 본문에는 일부러 이름을 안 담는다(민감정보 최소화). 그래서 푸시만으로는
 * 누구인지 알 수 없고, 이 화면이 유일한 확인 경로다. 2026-08-08에 알림을 받고도
 * 대상을 못 찾아 스크립트로 캐낸 뒤 만들었다.
 *
 * 이 화면은 '판단'하는 곳이 아니라 '챙겼는지 기억하는' 곳이다. PHQ-2는 선별
 * 도구지 진단이 아니고, 여기 뜬다고 그 사람이 아프다는 뜻이 아니다.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  getWellbeingAlerts,
  resolveAlert,
  type WellbeingAlert,
} from '@/lib/firestore';
import { useAuth } from '@/lib/auth-context';

const SIGNAL_KO: Record<string, string> = {
  phq2_positive: 'PHQ-2 선별 양성',
};

const fmt = (d: Date | null) =>
  d ? new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '—';

const daysAgo = (d: Date | null) =>
  d ? Math.floor((Date.now() - d.getTime()) / 86400_000) : null;

export default function WellbeingPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<WellbeingAlert[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await getWellbeingAlerts());
    } catch (e) {
      setErr(e instanceof Error ? e.message : '불러오기 실패');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markDone(a: WellbeingAlert) {
    setBusy(a.id);
    try {
      await resolveAlert(a.id, '안부 확인함', user?.uid);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setBusy(null);
    }
  }

  const open = rows?.filter((r) => !r.resolved) ?? [];
  const done = rows?.filter((r) => r.resolved) ?? [];

  return (
    <div className="max-w-4xl space-y-6 p-6">
      <Header
        title="웰빙 확인"
        subtitle="안부 체크에서 신호가 뜬 분들. 챙겼는지 기억하려고 두는 화면입니다."
      />

      {/* 이 화면을 처음 보는 사람이 오해하지 않게. 선별과 진단은 다르다. */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
        <p className="font-semibold">읽는 법</p>
        <p className="mt-1">
          PHQ-2는 <b>선별 도구지 진단이 아닙니다.</b> 최근 2주간 기분과 흥미를 묻는
          두 문항이고, 양성이라고 우울증인 것도 위기 상황인 것도 아닙니다.
          그날 컨디션이 나빴을 수도 있습니다.
        </p>
        <p className="mt-2">
          당사자에게는 <b>이미 상담 창구가 자동으로 안내</b>됐습니다
          (1577-0199 · 1393). 여기서 할 일은 평소처럼 안부를 묻는 정도입니다.
        </p>
        <p className="mt-2">
          <b>검사 결과를 언급하지 마세요.</b> 본인은 그 결과가 관리자에게 간 줄
          모릅니다. 알게 되면 다음부터 솔직하게 답하지 않고, 감시당한 느낌만
          남습니다.
        </p>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {err}
        </div>
      )}

      {!rows ? (
        <div className="p-6"><LoadingSpinner /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
          아직 신호가 뜬 분이 없습니다.
        </p>
      ) : (
        <>
          <Section
            title="아직 안 챙긴 분"
            rows={open}
            emptyText="모두 확인하셨습니다."
            onDone={markDone}
            busy={busy}
          />
          {done.length > 0 && (
            <Section title="확인한 분" rows={done} emptyText="" onDone={null} busy={null} />
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  rows,
  emptyText,
  onDone,
  busy,
}: {
  title: string;
  rows: WellbeingAlert[];
  emptyText: string;
  onDone: ((a: WellbeingAlert) => void) | null;
  busy: string | null;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-gray-900">
        {title}
        <span className="ml-2 tabular-nums text-gray-400">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((a) => {
            const gap = daysAgo(a.lastActiveAt);
            return (
              <div
                key={a.id}
                className={`rounded-xl border bg-white p-4 ${
                  a.resolved ? 'border-gray-200' : 'border-amber-300'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-gray-900">{a.name}</span>
                      {a.region && (
                        <span className="text-xs text-gray-500">{a.region}</span>
                      )}
                      {!a.verified && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                          미인증
                        </span>
                      )}
                      {a.backfilled && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                          나중에 기록
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {SIGNAL_KO[a.signal] ?? a.signal} · {fmt(a.createdAt)}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      마지막 활동 {fmt(a.lastActiveAt)}
                      {gap !== null && gap >= 3 && (
                        <b className="ml-1 text-amber-700">· {gap}일째 안 들어옴</b>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {a.targetId && (
                      <Link
                        href={`/dashboard/users/view?id=${a.targetId}`}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        프로필
                      </Link>
                    )}
                    <Link
                      href="/dashboard/admin-dms"
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      말 걸기
                    </Link>
                    {onDone && (
                      <button
                        type="button"
                        onClick={() => onDone(a)}
                        disabled={busy === a.id}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busy === a.id ? '처리 중' : '챙겼어요'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
