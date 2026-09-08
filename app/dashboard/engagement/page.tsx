'use client';

// 참여도 — "누가 눈팅만 하고, 누가 나오시나".
//
// 2026-09-08. 대화 목록이 '언제 누가 말했나'만 보여줘서, 매일 묻는 질문에
// 답이 안 됐다: 지금 안 나오고 있는 분은 누구고, 왜 안 나오는가.
//
// 판정 기준은 **밖으로 닿는 행동** 하나다 — 메시지·자리 신청·인사·글. 결큐를
// 아무리 풀어도, 자리 카드를 아무리 열어봐도 그건 혼자 하는 일이라 눈팅이다.
// 이 구분이 중요한 이유는 눈팅 상위권이 무관심한 분들이 아니기 때문이다:
// 결큐 40~60개를 풀고 자리를 20~40번 열어보고도 신청을 안 누른 분들이다.
// 관심의 문제가 아니라 마지막 한 걸음의 문제다.
//
// 성향 비교는 **같은 질문에 답한 사람끼리만** 한다(백엔드 _trait_lift). 처음엔
// 전체 태그 빈도로 비교했다가 x6.9짜리 가짜 신호가 줄줄이 나왔다 — 적극적인
// 분은 결큐를 평균 68개, 눈팅은 5.5개 푸니 '많이 푼 사람의 태그'가 전부
// 위로 올라왔던 것이다. 질문별로 나누면 배율이 1.1~1.7로 내려앉는다.

import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import UserChip from '@/components/ui/UserChip';
import type { UserProfile } from '@/types';
import QUESTIONS from '@/lib/gyeolq-questions-full.json';

type Row = {
  uid: string;
  name?: string | null;
  photoUrl?: string | null;
  gender?: string | null;
  birthYear?: number | null;
  city?: string | null;
  district?: string | null;
  verified: boolean;
  lastActiveDays: number | null;
  joinedDays: number | null;
  segment: 'engaged' | 'tried' | 'lurker' | 'dormant';
  msgs: number;
  rooms: number;
  spokeRooms: number;
  waves: number;
  wavesGot: number;
  signups: number;
  posts: number;
  seatViews: number;
  gyeolq: number;
};

type Trait = {
  tag: string;
  questionId: string;
  lift: number;
  hit: number;
  total: number;
  base: number;
};

type Segment = {
  key: Row['segment'];
  label: string;
  count: number;
  avgGyeolq: number;
  avgSeatViews: number;
  avgRooms: number;
  avgMsgs: number;
  avgJoinedDays: number;
};

type Payload = {
  computedAt: number;
  dormantDays: number;
  total: number;
  segments: Segment[];
  traits: Partial<Record<Row['segment'], Trait[]>>;
  users: Row[];
};

// ── 태그를 사람 말로 ───────────────────────────────────────────────────────
// slug(`solo_household`)만 띄우면 읽을 수가 없다. 태그가 나온 질문과 실제
// 선택지 문장을 찾아 그대로 보여준다.
type Bank = { id: number; question_text: string; options: { text: string; tags: string[] }[] }[];

function answerText(questionId: string, tag: string): { q: string; a: string } | null {
  const q = (QUESTIONS as Bank).find((x) => String(x.id) === String(questionId));
  if (!q) return null;
  const opt = q.options.find((o) => (o.tags ?? []).includes(tag));
  if (!opt) return null;
  return { q: q.question_text, a: opt.text };
}

// ── 작은 조각들 ───────────────────────────────────────────────────────────

const SEG_STYLE: Record<Row['segment'], { ring: string; dot: string; text: string }> = {
  engaged: { ring: 'border-green-200 bg-green-50', dot: 'bg-green-500', text: 'text-green-800' },
  tried:   { ring: 'border-lime-200 bg-lime-50',   dot: 'bg-lime-500',  text: 'text-lime-800' },
  lurker:  { ring: 'border-amber-200 bg-amber-50', dot: 'bg-amber-500', text: 'text-amber-800' },
  dormant: { ring: 'border-gray-200 bg-gray-50',   dot: 'bg-gray-400',  text: 'text-gray-600' },
};

const SEG_HINT: Record<Row['segment'], string> = {
  engaged: '말하거나 신청하거나 인사한 분',
  tried: '한두 번 해보고 멈춘 분',
  lurker: '들어오시는데 아무것도 안 누른 분',
  dormant: '한동안 안 들어오심',
};

function SegmentCard({
  seg, selected, onClick,
}: { seg: Segment; selected: boolean; onClick: () => void }) {
  const s = SEG_STYLE[seg.key];
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border p-4 transition-all ${s.ring} ${
        selected ? 'ring-2 ring-offset-1 ring-gray-400' : 'hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
        <span className={`text-xs font-semibold ${s.text}`}>{seg.label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{seg.count}명</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{SEG_HINT[seg.key]}</p>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-gray-500 tabular-nums">
        <dt>결큐</dt><dd className="text-right text-gray-700">{seg.avgGyeolq}개</dd>
        <dt>자리 열어봄</dt><dd className="text-right text-gray-700">{seg.avgSeatViews}번</dd>
        <dt>가입 후</dt><dd className="text-right text-gray-700">{seg.avgJoinedDays}일</dd>
      </dl>
    </button>
  );
}

function TraitList({ traits, title, hint, direction }: {
  traits: Trait[]; title: string; hint: string; direction: 'up' | 'down';
}) {
  // 한 선택지에 태그가 서너 개씩 붙어 있어, 그대로 두면 같은 답이 세 줄로
  // 반복된다("정든 곳, 오래 살고 싶다"가 settle_mindset·local_oriented·
  // neighborhood_anchor로 세 번). 화면에 보이는 문장 기준으로 한 번만 띄운다.
  const seen = new Set<string>();
  const rows = traits
    .filter((t) => (direction === 'up' ? t.lift > 1.08 : t.lift < 0.93))
    .filter((t) => {
      const txt = answerText(t.questionId, t.tag);
      const key = txt ? `${t.questionId}|${txt.a}` : t.tag;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
  if (rows.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        <p className="text-xs text-gray-400 mt-2">뚜렷한 차이 없음</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      <p className="text-[11px] text-gray-400 mt-0.5 mb-2">{hint}</p>
      <ul className="space-y-2">
        {rows.map((t) => {
          const txt = answerText(t.questionId, t.tag);
          const times = direction === 'up' ? t.lift : 1 / t.lift;
          return (
            <li key={`${t.questionId}-${t.tag}`} className="flex items-start gap-2.5">
              <span
                className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                  direction === 'up' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {times.toFixed(1)}배
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] text-gray-800 leading-snug">
                  {txt ? `“${txt.a}”` : t.tag}
                </span>
                <span className="block text-[11px] text-gray-400 truncate">
                  {txt ? txt.q : '질문 미상'} · {t.hit}/{t.total}명 (전체 {Math.round(t.base * 100)}%)
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── 페이지 ────────────────────────────────────────────────────────────────

type SortKey = 'nearest' | 'gyeolq' | 'seatViews' | 'recent';

export default function EngagementPage() {
  const [data, setData]       = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [seg, setSeg]         = useState<Row['segment']>('lurker');
  const [sort, setSort]       = useState<SortKey>('nearest');

  useEffect(() => {
    fetch('/api/backend/engagement', { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData(body as Payload);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const list = data.users.filter((u) => u.segment === seg);
    // '가까운 순' — 안에서는 열심인데 밖으로 한 걸음을 안 뗀 분이 위로.
    // 눈팅 목록에서 제일 자주 보는 정렬이라 기본값으로 둔다.
    const score = (u: Row) => u.gyeolq + u.seatViews * 2 + u.rooms * 3;
    const by: Record<SortKey, (a: Row, b: Row) => number> = {
      nearest: (a, b) => score(b) - score(a),
      gyeolq: (a, b) => b.gyeolq - a.gyeolq,
      seatViews: (a, b) => b.seatViews - a.seatViews,
      recent: (a, b) => (a.lastActiveDays ?? 9999) - (b.lastActiveDays ?? 9999),
    };
    return [...list].sort(by[sort]);
  }, [data, seg, sort]);

  const asProfile = (u: Row): UserProfile =>
    ({
      id: u.uid,
      displayName: u.name ?? undefined,
      photoUrl: u.photoUrl ?? undefined,
      gender: u.gender ?? undefined,
      legalBirthYear: u.birthYear ?? undefined,
    }) as UserProfile;

  return (
    <div>
      <Header
        title="참여도"
        subtitle={
          data
            ? `회원 ${data.total}명 · ${data.dormantDays}일 넘게 안 들어오시면 휴면으로 셉니다`
            : '눈팅만 하는 분과 나오시는 분'
        }
      />

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="text-center py-16 text-red-500 bg-white rounded-2xl border border-red-100">
          <p className="font-semibold">불러오지 못했어요</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
        </div>
      ) : !data ? null : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {data.segments.map((s) => (
              <SegmentCard
                key={s.key}
                seg={s}
                selected={seg === s.key}
                onClick={() => setSeg(s.key)}
              />
            ))}
          </div>

          {/* 성향 — 결큐 답이 갈리는 지점 */}
          {(data.traits.lurker?.length || data.traits.engaged?.length) ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-base font-bold text-gray-800">두 무리는 어디서 갈리나</h2>
              <p className="text-xs text-gray-400 mt-0.5 mb-4">
                같은 결큐 질문에 답한 분들끼리만 비교했습니다. 표본이 얇으니
                (한 항목당 열 명 안팎) 방향만 보고 단정하지는 마세요.
              </p>
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
                <TraitList
                  title="나오시는 분에게 더 많은 답"
                  hint="같은 질문에 답한 사람 대비"
                  traits={data.traits.engaged ?? []}
                  direction="up"
                />
                <TraitList
                  title="눈팅만 하시는 분에게 더 많은 답"
                  hint="같은 질문에 답한 사람 대비"
                  traits={data.traits.lurker ?? []}
                  direction="up"
                />
              </div>
            </div>
          ) : null}

          {/* 명단 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-gray-800">
                  {data.segments.find((s) => s.key === seg)?.label} {rows.length}명
                </h2>
                <p className="text-[11px] text-gray-400">{SEG_HINT[seg]}</p>
              </div>
              <div className="flex gap-1">
                {([
                  ['nearest', '가까운 순'],
                  ['gyeolq', '결큐 많은 순'],
                  ['seatViews', '자리 많이 본 순'],
                  ['recent', '최근 접속 순'],
                ] as [SortKey, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setSort(k)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                      sort === k
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">회원</th>
                    <th className="text-right px-3 py-2.5">결큐</th>
                    <th className="text-right px-3 py-2.5">자리 열어봄</th>
                    <th className="hidden sm:table-cell text-right px-3 py-2.5">방</th>
                    <th className="hidden sm:table-cell text-right px-3 py-2.5">말함</th>
                    <th className="hidden md:table-cell text-right px-3 py-2.5">신청</th>
                    <th className="hidden md:table-cell text-right px-3 py-2.5">인사</th>
                    <th className="text-right px-4 py-2.5">접속</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((u) => (
                    <tr key={u.uid} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2">
                        <UserChip uid={u.uid} user={asProfile(u)} />
                        {(u.city || u.district) && (
                          <span className="block text-[11px] text-gray-400 mt-0.5 pl-9">
                            {[u.city, u.district].filter(Boolean).join(' ')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{u.gyeolq || '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{u.seatViews || '-'}</td>
                      <td className="hidden sm:table-cell px-3 py-2 text-right tabular-nums text-gray-500">{u.rooms || '-'}</td>
                      <td className="hidden sm:table-cell px-3 py-2 text-right tabular-nums">
                        {u.msgs ? (
                          <span className="text-gray-800">{u.msgs}</span>
                        ) : (
                          <span className="text-gray-300">0</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-3 py-2 text-right tabular-nums text-gray-500">{u.signups || '-'}</td>
                      <td className="hidden md:table-cell px-3 py-2 text-right tabular-nums text-gray-500">{u.waves || '-'}</td>
                      <td className="px-4 py-2 text-right text-[11px] text-gray-400 tabular-nums whitespace-nowrap">
                        {u.lastActiveDays === null
                          ? '기록 없음'
                          : u.lastActiveDays <= 0
                            ? '오늘'
                            : `${u.lastActiveDays}일 전`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
