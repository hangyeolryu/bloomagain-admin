'use client';

// 대화 — "이 방에 말이 오갔는가".
//
// 예전엔 마지막 메시지와 시각만 보여줬다. 그래서 정작 매일 묻는 것에 답이
// 없었다: 이 방은 살아 있나, 한 사람만 말하고 있나, 며칠째 조용한가.
//
// 세는 규칙 하나가 이 화면의 전부다 — **티타 관리자와 시스템 안내는 회원의
// 말로 세지 않는다**. 이걸 섞으면 티타지기가 인사만 남긴 빈 방이 활발한 방으로
// 보인다. 실제로 침묵률을 76%로 진단했던 근거가 이 구분이다.
//
// 321개 전부를 한 번에 받아 온다(백엔드가 100개씩 준다). 요약 숫자가 "지금
// 화면에 뜬 것만"이면 아무 뜻이 없어서다.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';
import { getUsersByIds } from '@/lib/firestore';
import UserChip, { OFFICIAL_UID } from '@/components/ui/UserChip';
import type { UserProfile } from '@/types';

const PAGE_SIZE = 100;
const MAX_PAGES = 12;
const DAY = 86400000;

type Conv = {
  id: string;
  participants: string[];
  lastMessage?: string | null;
  lastMessageAt: number | null;
  createdAt: number | null;
  conversationType: string;
  isActive: boolean;
  blockedParticipants: string[];
  suspiciousMessageCount: number;
  groupName?: string | null;
  origin?: string | null;
  archivedReason?: string | null;
  messageCount: number;
  memberMessages: number;
  speakerUids: string[];
  lastMemberAt: number | null;
  lastMemberBy: string | null;
  firstMemberAt: number | null;
};

async function fetchAll(): Promise<Conv[]> {
  const out: Conv[] = [];
  let cursor: number | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor != null) qs.set('cursor', String(cursor));
    const res = await fetch(`/api/backend/conversations?${qs}`, { cache: 'no-store' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    out.push(...((body.items ?? []) as Conv[]));
    cursor = body.nextCursor ?? null;
    if (cursor == null) break;
  }
  return out;
}

// ── 방 성격 ───────────────────────────────────────────────────────────────
// 자동 편성된 결 대화방과, 자리에 나오기로 한 분들의 방과, 인사에서 시작된
// 1:1은 기대치가 전혀 다르다. 같은 침묵이라도 뜻이 다르니 갈라 본다.
function kindOf(c: Conv): { label: string; cls: string } {
  if (c.conversationType === 'bot') return { label: '문의', cls: 'bg-gray-100 text-gray-500' };
  if (c.conversationType === 'wave') return { label: '인사', cls: 'bg-violet-50 text-violet-700' };
  const meta = `${c.origin ?? ''} ${c.groupName ?? ''}`;
  if (/seat|titatime|자리/i.test(meta)) return { label: '자리방', cls: 'bg-emerald-50 text-emerald-700' };
  if (c.conversationType === 'group') return { label: '결 대화방', cls: 'bg-sky-50 text-sky-700' };
  return { label: '1:1', cls: 'bg-gray-100 text-gray-600' };
}

// 말이 오갔는가 — 이 화면의 핵심 판정.
type Flow = 'talking' | 'oneSided' | 'silent';
function flowOf(c: Conv, members: string[]): Flow {
  const memberSpeakers = c.speakerUids.filter((u) => members.includes(u));
  if (memberSpeakers.length >= 2) return 'talking';
  if (memberSpeakers.length === 1) return 'oneSided';
  return 'silent';
}

const FLOW_META: Record<Flow, { label: string; badge: string; hint: string }> = {
  talking:  { label: '말 오감',  badge: 'bg-green-100 text-green-700', hint: '두 분 이상이 말했습니다' },
  oneSided: { label: '한쪽만',   badge: 'bg-amber-100 text-amber-700', hint: '한 분만 말하고 답이 없습니다' },
  silent:   { label: '침묵',     badge: 'bg-gray-100 text-gray-500',   hint: '회원이 한마디도 안 했습니다' },
};

function daysAgo(ms: number | null): number | null {
  if (!ms) return null;
  return Math.floor((Date.now() - ms) / DAY);
}

function agoLabel(ms: number | null): string {
  const d = daysAgo(ms);
  if (d === null) return '-';
  if (d <= 0) return '오늘';
  return `${d}일 전`;
}

export default function ConversationsPage() {
  const [convs, setConvs]     = useState<Conv[]>([]);
  const [users, setUsers]     = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState<'all' | Flow>('all');
  const [kind, setKind]       = useState<string>('all');

  useEffect(() => {
    fetchAll()
      .then(setConvs)
      .catch((e) => setError(e instanceof Error ? e.message : '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  // 티타 관리자가 낀 방은 뺀다 — 운영 안내와 문의라 회원끼리의 대화가 아니고,
  // 공식 계정 하나가 120건 넘게 갖고 있어 목록이 그걸로 덮인다.
  const rows = useMemo(
    () => convs.filter((c) => !(c.participants ?? []).includes(OFFICIAL_UID)),
    [convs],
  );
  const hidden = convs.length - rows.length;

  // 화면에 뜬 uid의 프로필을 채운다.
  useEffect(() => {
    const need = Array.from(new Set(rows.flatMap((c) => c.participants)))
      .filter((uid) => uid && !users[uid]);
    if (need.length === 0) return;
    let alive = true;
    getUsersByIds(need)
      .then((list) => {
        if (!alive) return;
        setUsers((prev) => {
          const next = { ...prev };
          list.forEach((u) => { next[u.id] = u; });
          return next;
        });
      })
      .catch((err) => console.error('[Conversations] 프로필 조회 실패:', err));
    return () => { alive = false; };
  }, [rows, users]);

  const enriched = useMemo(
    () => rows.map((c) => {
      const members = c.participants.filter((u) => u !== OFFICIAL_UID);
      return { c, members, flow: flowOf(c, members), kind: kindOf(c) };
    }),
    [rows],
  );

  const counts = useMemo(() => {
    const n = { talking: 0, oneSided: 0, silent: 0 };
    enriched.forEach((e) => { n[e.flow]++; });
    return n;
  }, [enriched]);

  const kinds = useMemo(() => {
    const set = new Map<string, number>();
    enriched.forEach((e) => set.set(e.kind.label, (set.get(e.kind.label) ?? 0) + 1));
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, [enriched]);

  const shown = enriched.filter(
    (e) => (filter === 'all' || e.flow === filter) && (kind === 'all' || e.kind.label === kind),
  );

  const silentPct = enriched.length
    ? Math.round((counts.silent / enriched.length) * 100)
    : 0;

  return (
    <div>
      <Header
        title="대화"
        subtitle={
          loading
            ? '불러오는 중'
            : `회원끼리 ${enriched.length}건 · 한마디도 안 나온 방 ${counts.silent}건 (${silentPct}%)` +
              (hidden ? ` · 티타 관리자 ${hidden}건 숨김` : '')
        }
      />

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="text-center py-16 text-red-500 bg-white rounded-2xl border border-red-100">
          <p className="font-semibold">대화를 불러오지 못했어요</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {(['talking', 'oneSided', 'silent'] as Flow[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(filter === f ? 'all' : f)}
                className={`text-left rounded-2xl border p-4 transition-all ${
                  filter === f ? 'border-gray-900 shadow-sm' : 'border-gray-100 hover:shadow-sm'
                } bg-white`}
              >
                <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${FLOW_META[f].badge}`}>
                  {FLOW_META[f].label}
                </span>
                <p className="text-2xl font-bold text-gray-900 mt-1.5 tabular-nums">
                  {counts[f]}
                  <span className="text-sm font-medium text-gray-400 ml-1">
                    {enriched.length ? Math.round((counts[f] / enriched.length) * 100) : 0}%
                  </span>
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">{FLOW_META[f].hint}</p>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setKind('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                kind === 'all' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500'
              }`}
            >
              전체 {enriched.length}
            </button>
            {kinds.map(([label, n]) => (
              <button
                key={label}
                onClick={() => setKind(kind === label ? 'all' : label)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                  kind === label ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500'
                }`}
              >
                {label} {n}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
              해당하는 방이 없습니다
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5">참여자</th>
                      <th className="text-left px-3 py-2.5">방</th>
                      <th className="text-left px-3 py-2.5">말</th>
                      <th className="hidden md:table-cell text-left px-3 py-2.5 max-w-[220px]">마지막 회원 메시지</th>
                      <th className="text-right px-3 py-2.5">조용해진 지</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {shown.map(({ c, members, flow, kind: k }) => {
                      const isBlocked = c.blockedParticipants.length > 0;
                      // 침묵 방은 만들어진 날부터, 말이 나온 방은 마지막 말부터 센다.
                      const quietFrom = c.lastMemberAt ?? c.createdAt;
                      const quiet = daysAgo(quietFrom);
                      return (
                        <tr key={c.id} className="hover:bg-gray-50 transition-colors align-top">
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-1.5">
                              {members.map((uid) => (
                                <div key={uid} className="flex items-center gap-1.5">
                                  <UserChip uid={uid} user={users[uid]} size={26} />
                                  {c.speakerUids.includes(uid) && (
                                    <span className="rounded bg-green-50 px-1 text-[10px] font-semibold text-green-700">
                                      말함
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${k.cls}`}>
                              {k.label}
                            </span>
                            {c.groupName && (
                              <span className="block text-[11px] text-gray-400 mt-0.5 truncate max-w-[100px]">
                                {c.groupName}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${FLOW_META[flow].badge}`}>
                              {FLOW_META[flow].label}
                            </span>
                            <span className="block text-[11px] text-gray-400 mt-0.5 tabular-nums">
                              회원 {c.memberMessages}개
                              {c.messageCount > c.memberMessages && (
                                <span className="text-gray-300"> / 전체 {c.messageCount}</span>
                              )}
                            </span>
                          </td>
                          <td className="hidden md:table-cell px-3 py-2.5 max-w-[220px]">
                            {c.lastMemberBy ? (
                              <>
                                <p className="text-xs text-gray-700 truncate">{c.lastMessage}</p>
                                <p className="text-[11px] text-gray-400 truncate">
                                  {users[c.lastMemberBy]?.displayName ?? c.lastMemberBy.slice(0, 6)} · {agoLabel(c.lastMemberAt)}
                                </p>
                              </>
                            ) : (
                              <span className="text-xs text-gray-300 italic">회원 발언 없음</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                            <span
                              className={`text-xs font-semibold ${
                                quiet === null ? 'text-gray-300'
                                  : quiet >= 7 ? 'text-red-500'
                                  : quiet >= 3 ? 'text-amber-600'
                                  : 'text-gray-500'
                              }`}
                            >
                              {quiet === null ? '-' : quiet <= 0 ? '오늘' : `${quiet}일`}
                            </span>
                            <span className="block text-[10px] text-gray-300">
                              {c.lastMemberAt ? '마지막 말' : '만든 날'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <div className="flex flex-col items-end gap-1">
                              <Link
                                href={`/dashboard/conversations/view?id=${c.id}`}
                                className="text-xs font-semibold text-green-600 hover:text-green-700 hover:underline"
                              >
                                대화 보기 →
                              </Link>
                              {isBlocked && <Badge variant="red">차단</Badge>}
                              {!c.isActive && <Badge variant="gray">보관됨</Badge>}
                              {c.suspiciousMessageCount > 0 && (
                                <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                  의심 {c.suspiciousMessageCount}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 border-t border-gray-50 text-[11px] text-gray-400">
                {shown.length}건 표시 · 티타 관리자와 시스템 안내는 회원의 말로 세지 않습니다
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
