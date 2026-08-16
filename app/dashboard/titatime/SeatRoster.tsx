'use client';

/**
 * 자리 하나의 명단 — 참석 체크 + 확인 문자.
 *
 * 왜 필요한가. 신청은 참석이 아니다. 무료에 보증금도 없어서 신청하고 안 오는
 * 게 자연스럽다. 8/19 자리도 신청 6명 중 1명은 탈퇴했고 1명은 확인 문자에
 * 답이 없다. 그런데 "몇 분이 실제로 오셨나"를 남기는 자리가 어디에도 없어서,
 * 다음 자리 정원을 계속 추측으로 정하고 있었다.
 *
 * 문자는 **자동으로 나가지 않는다.** 화면이 문구를 만들어 보여주고, 받는 분
 * 목록을 보여주고, 버튼을 눌러야 나간다. 사람에게 가는 말은 사람이 정한다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  setSignupAttendance,
  markConfirmSent,
  type TeatimeSignup,
  type AttendanceStatus,
} from '@/lib/firestore';
import { useAuth } from '@/lib/auth-context';

type Session = {
  id: string;
  district?: string;
  dateLabel?: string;
  spotsLabel?: string;
  status?: string;
};

const ATT: { key: AttendanceStatus; label: string; tone: string }[] = [
  { key: 'coming', label: '온다고 함', tone: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  { key: 'cant', label: '못 온다고 함', tone: 'bg-gray-100 text-gray-600 border-gray-300' },
  { key: 'attended', label: '왔음', tone: 'bg-blue-50 text-blue-800 border-blue-300' },
  { key: 'noshow', label: '안 왔음', tone: 'bg-red-50 text-red-700 border-red-300' },
];

const fmt = (d?: Date) =>
  d ? new Date(d.getTime() + 9 * 3600_000).toISOString().slice(5, 16).replace('T', ' ') : '';

function genderKo(g?: string): string {
  const v = (g ?? '').toLowerCase().trim();
  if (['female', 'f', '여', '여성', 'woman'].includes(v)) return '여성';
  if (['male', 'm', '남', '남성', 'man'].includes(v)) return '남성';
  return '미상';
}

/**
 * 확인 문자 기본 문구. 자리 정보를 넣어 만들되 **편집할 수 있게** 둔다 —
 * 자리마다 사정이 다르고, 마지막에 사람 눈으로 읽고 고치는 게 맞다.
 *
 * "네"라고만 답해 달라고 청한다. 열린 질문을 던지면 답이 안 온다. 그리고
 * 못 오신다는 답도 환영한다고 분명히 적는다 — 그래야 미리 알려주신다.
 */
function defaultConfirmText(s: Session): string {
  const when = s.dateLabel ?? '';
  const where = s.district ?? '';
  return [
    '안녕하세요, 티타입니다.',
    '',
    `${when} 자리 안내드립니다.`,
    '',
    `${where}에서 만납니다. 자세한 만나는 곳은 앱의 자리 안내에 적어두었어요.`,
    '',
    '오실 수 있으면 이 문자에 "네"라고만 답해 주세요. 사정이 생기셨으면 편하게 말씀해 주시면 됩니다. 미리 알려주시면 다른 분께 자리를 드릴 수 있어요.',
  ].join('\n');
}

export default function SeatRoster({
  session,
  rows,
  onChanged,
}: {
  session: Session;
  rows: TeatimeSignup[];
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 자리별 운영 메모(테이블 배치 등). seat_table_plans/{sessionId} —
  // 당일 이 화면을 열고 참석 체크를 하므로, 배치도 여기 있어야 찾는다.
  const [plan, setPlan] = useState<string>('');
  const [planDirty, setPlanDirty] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'seat_table_plans', session.id))
      .then((d) => setPlan((d.data()?.text as string) ?? ''))
      .catch(() => {});
  }, [session.id]);

  async function savePlan() {
    setPlanSaving(true);
    try {
      await setDoc(doc(db, 'seat_table_plans', session.id), {
        sessionId: session.id,
        text: plan,
        updatedAt: serverTimestamp(),
      });
      setPlanDirty(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '메모 저장 실패');
    } finally {
      setPlanSaving(false);
    }
  }

  // 문자 준비 상태. 열기 전에는 아무 일도 일어나지 않는다.
  const [drafting, setDrafting] = useState(false);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const live = useMemo(() => rows.filter((r) => !r.withdrawn), [rows]);
  const coming = live.filter((r) => r.attendance === 'coming').length;
  const cant = live.filter((r) => r.attendance === 'cant').length;
  const attended = live.filter((r) => r.attendance === 'attended').length;
  const noshow = live.filter((r) => r.attendance === 'noshow').length;
  const asked = live.filter((r) => r.confirmSentAt).length;

  async function mark(r: TeatimeSignup, a: AttendanceStatus) {
    setBusy(r.id);
    setErr(null);
    try {
      // 같은 걸 다시 누르면 되돌린다 — 잘못 눌렀을 때 빠져나갈 길.
      await setSignupAttendance(r.id, r.attendance === a ? 'pending' : a, user?.uid);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusy(null);
    }
  }

  const openDraft = useCallback(() => {
    setText(defaultConfirmText(session));
    // 기본 대상: 못 온다고 하신 분과 이미 보낸 분을 뺀 나머지.
    setPicked(new Set(live.filter((r) => r.attendance !== 'cant' && !r.confirmSentAt).map((r) => r.id)));
    setResult(null);
    setDrafting(true);
  }, [session, live]);

  async function send() {
    const targets = live.filter((r) => picked.has(r.id));
    if (targets.length === 0 || !text.trim()) return;
    setSending(true);
    setErr(null);
    const ok: string[] = [];
    const bad: string[] = [];
    const fns = getFunctions(undefined, 'asia-northeast3');
    const sendDm = httpsCallable(fns, 'sendOfficialDm');
    for (const t of targets) {
      try {
        await sendDm({
          targetUserId: t.uid,
          title: '티타에서 안내드립니다',
          body: text.trim(),
          templateKey: `teatime_confirm_${session.id}`,
        });
        await markConfirmSent(t.id);
        ok.push(t.name || t.uid.slice(0, 6));
      } catch (e) {
        bad.push(`${t.name || t.uid.slice(0, 6)} (${e instanceof Error ? e.message : '실패'})`);
      }
    }
    setSending(false);
    setResult(
      `보냄 ${ok.length}명${ok.length ? ` — ${ok.join(', ')}` : ''}` +
        (bad.length ? ` / 실패 ${bad.length}명 — ${bad.join(', ')}` : ''),
    );
    onChanged();
    if (bad.length === 0) setDrafting(false);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-base font-bold text-gray-900">{session.dateLabel || '(날짜 미정)'}</div>
          <div className="mt-0.5 text-xs text-gray-500">
            {session.district || '(지역 미정)'} · {session.spotsLabel || ''}
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold tabular-nums text-gray-900">{live.length}</div>
          <div className="text-xs text-gray-400">신청</div>
        </div>
      </div>

      {/* 신청과 참석을 나란히 둔다. 이 둘의 차이가 다음 자리 정원의 근거다. */}
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Chip label="온다고 함" n={coming} tone="text-emerald-800 bg-emerald-50" />
        <Chip label="못 온다고 함" n={cant} tone="text-gray-600 bg-gray-100" />
        <Chip label="왔음" n={attended} tone="text-blue-800 bg-blue-50" />
        <Chip label="안 왔음" n={noshow} tone="text-red-700 bg-red-50" />
        <Chip label="문자 보냄" n={asked} tone="text-gray-600 bg-gray-100" />
      </div>

      {err && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>
      )}

      {live.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">아직 신청이 없어요.</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
          {live.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <Link
                  href={`/dashboard/users/view?id=${r.uid}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  {r.name || '이름없음'}
                </Link>
                <span className="ml-2 text-xs text-gray-400">
                  {genderKo(r.gender)} · {r.region || '지역미상'}
                </span>
                {r.compositionPref && (
                  <span
                    className={`ml-2 rounded-full border px-1.5 py-0.5 text-[11px] ${
                      r.compositionPref === 'same_gender'
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-gray-200 bg-gray-50 text-gray-500'
                    }`}
                  >
                    {r.compositionPref === 'same_gender' ? '같은 성별끼리' : '섞여도 좋아요'}
                  </span>
                )}
                {r.confirmSentAt && (
                  <span className="ml-2 text-[11px] text-gray-400">
                    문자 {fmt(r.confirmSentAt)}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                {ATT.map((a) => {
                  const on = r.attendance === a.key;
                  return (
                    <button
                      key={a.key}
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => mark(r, a.key)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40 ${
                        on ? a.tone : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── 운영 메모 (테이블 배치) ──────────────────────────────────────
          당일 참석 체크를 하는 화면이라 배치도 여기 있어야 찾는다. */}
      {(plan || planDirty) && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">운영 메모 · 테이블 배치</p>
            {planDirty && (
              <button
                type="button"
                disabled={planSaving}
                onClick={savePlan}
                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
              >
                {planSaving ? '저장 중…' : '메모 저장'}
              </button>
            )}
          </div>
          <textarea
            value={plan}
            onChange={(e) => { setPlan(e.target.value); setPlanDirty(true); }}
            rows={Math.max(4, plan.split('\n').length)}
            className="w-full rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs leading-relaxed text-gray-800"
          />
        </div>
      )}

      {/* ── 확인 문자 ─────────────────────────────────────────────────────
          정원을 늘리는 건 노쇼를 상쇄할 뿐이고, 확인 문자는 노쇼를 줄인다.
          그래서 명단 바로 아래에 둔다. */}
      {live.length > 0 && !drafting && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3">
          <p className="text-xs leading-relaxed text-gray-600">
            만나기 <b>이틀 전</b>에 확인 문자를 보내면 안 오실 분을 미리 알 수 있어요.
            문구를 만들어 보여드리고, <b>확인하신 뒤 눌러야</b> 나갑니다.
          </p>
          <button
            type="button"
            onClick={openDraft}
            className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            확인 문자 준비
          </button>
        </div>
      )}

      {drafting && (
        <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50/40 p-4">
          <p className="text-sm font-semibold text-gray-900">보내기 전에 확인해 주세요</p>

          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-gray-600">받는 분 ({picked.size}명)</p>
            <div className="flex flex-wrap gap-1.5">
              {live.map((r) => {
                const on = picked.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      on
                        ? 'border-emerald-500 bg-emerald-600 text-white'
                        : 'border-gray-300 bg-white text-gray-500'
                    }`}
                  >
                    {r.name || r.uid.slice(0, 6)}
                    {r.attendance === 'cant' && ' · 못 온다고 함'}
                    {r.confirmSentAt && ' · 보낸 적 있음'}
                  </button>
                );
              })}
            </div>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="mt-3 w-full rounded-lg border border-gray-300 bg-white p-3 text-sm leading-relaxed text-gray-800"
          />
          <p className="mt-1 text-[11px] text-gray-500">
            그대로 보내집니다. 이름은 넣지 않습니다 — 모든 분께 같은 문구가 갑니다.
          </p>

          {result && (
            <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-gray-700">{result}</p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              disabled={sending || picked.size === 0 || !text.trim()}
              onClick={send}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              {sending ? '보내는 중…' : `${picked.size}명에게 보내기`}
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => setDrafting(false)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700"
            >
              그만두기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 font-medium ${tone}`}>
      {label} <span className="tabular-nums">{n}</span>
    </span>
  );
}
