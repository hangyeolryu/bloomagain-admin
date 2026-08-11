'use client';

/**
 * 회원 자리 제안 — 승인해서 자리로 열거나, 접는다.
 *
 * 티타가 여는 자리는 한 달에 한두 개다. 그래서 회원 제안이 사실상 주 공급인데,
 * 제안이 곧바로 공개되면 유인·스캠의 통로가 되고 아무도 안 모인 제안은 낸 분을
 * 민망하게 만든다. 그 사이에 이 화면이 선다 — 여기서 승인한 것만 자리가 된다.
 *
 * [자리 초안 만들기]는 published=false·planning 상태의 초안을 만든다. 앱에는
 * 아직 안 보인다. 아래 자리 목록에서 날짜·장소·설명을 채워 게시하면 그때 뜬다.
 * 제안자는 초안의 첫 신청자로 자동 등록된다 — 열리면 본인 자리부터 있다.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getSeatProposals,
  decideSeatProposal,
  addProposerSignup,
  type SeatProposal,
} from '@/lib/firestore';

const SLOT_KO: Record<string, string> = {
  day: '평일 낮',
  evening: '평일 저녁',
  weekend: '주말',
};

const fmt = (d?: Date) =>
  d ? new Date(d.getTime() + 9 * 3600_000).toISOString().slice(5, 16).replace('T', ' ') : '—';

export default function ProposalsCard({ onSessionCreated }: { onSessionCreated: () => void }) {
  const [rows, setRows] = useState<SeatProposal[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await getSeatProposals());
    } catch (e) {
      setErr(e instanceof Error ? e.message : '불러오기 실패');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function accept(p: SeatProposal) {
    setBusy(p.id);
    setErr(null);
    try {
      const res = await fetch('/api/backend/titatime-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district: p.region ?? '',
          dateLabel: '', // 날짜는 아래 자리 목록에서 채운다. 비면 앱에 안 뜬다.
          spotsLabel: '정원 4~6명 · 선착순 모집',
          status: 'planning',
          published: false,
          sortOrder: 9,
          description:
            `[회원 제안] ${p.activity ?? ''} · ${p.region ?? ''} · ` +
            `${p.timeSlots.map((s) => SLOT_KO[s] ?? s).join('·')}\n` +
            (p.note ? `제안한 분의 말: ${p.note}\n` : '') +
            `제안: ${p.nickname ?? p.uid.slice(0, 8)}\n\n` +
            `(게시 전에 이 안내문을 실제 자리 설명으로 바꿔주세요)`,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '자리 생성 실패');
      const sessionId: string = json.id;
      // 제안자를 첫 신청자로. 실패해도 초안은 살아 있으므로 막지 않는다.
      try {
        await addProposerSignup(sessionId, p.uid);
      } catch {
        /* 명단에서 수동으로 추가 가능 */
      }
      await decideSeatProposal(p.id, 'accepted', sessionId);
      await load();
      onSessionCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '승인 실패');
    } finally {
      setBusy(null);
    }
  }

  async function decline(p: SeatProposal) {
    setBusy(p.id);
    setErr(null);
    try {
      await decideSeatProposal(p.id, 'declined');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setBusy(null);
    }
  }

  const pending = rows?.filter((r) => r.status === 'pending') ?? [];
  const decided = rows?.filter((r) => r.status !== 'pending') ?? [];

  // 제안이 하나도 없으면 카드 자체를 접는다 — 빈 틀은 자리만 차지한다.
  if (rows !== null && rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          회원 자리 제안
          <span className="ml-2 tabular-nums text-gray-400">{pending.length}</span>
        </h2>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        승인하면 <b>안 보이는 초안</b>이 만들어지고 제안한 분이 첫 신청자로 올라갑니다.
        아래 자리 목록에서 날짜·설명을 채워 게시하면 그때 앱에 뜹니다.
        접어도 회원에게 자동 안내는 가지 않아요 — 필요하면 직접 말을 걸어주세요.
      </p>

      {err && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>
      )}

      {pending.length === 0 ? (
        <p className="mt-3 text-sm text-gray-400">기다리는 제안이 없어요.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {pending.map((p) => (
            <li key={p.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <Link
                    href={`/dashboard/users/view?id=${p.uid}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {p.nickname || p.uid.slice(0, 8)}
                  </Link>
                  <span className="ml-2 font-semibold text-gray-900">{p.activity}</span>
                  <span className="ml-2 text-gray-600">
                    {p.region} · {p.timeSlots.map((s) => SLOT_KO[s] ?? s).join('·')}
                  </span>
                  {p.note && (
                    <p className="mt-1 text-xs leading-relaxed text-gray-600">“{p.note}”</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-gray-400">{fmt(p.createdAt)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => accept(p)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {busy === p.id ? '만드는 중…' : '자리 초안 만들기'}
                  </button>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => decline(p)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    접기
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-gray-400">
            처리한 제안 {decided.length}건
          </summary>
          <ul className="mt-2 space-y-1">
            {decided.map((p) => (
              <li key={p.id} className="text-xs text-gray-500">
                {p.nickname || p.uid.slice(0, 8)} · {p.activity} · {p.region} —{' '}
                {p.status === 'accepted' ? '자리로 만듦' : '접음'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
