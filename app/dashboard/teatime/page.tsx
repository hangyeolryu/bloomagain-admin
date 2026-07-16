'use client';

/**
 * 티타임 신청 명단 — 앱의 teatime_signup_sheet가 teatime_signups에 쓴 예약.
 * 이벤트별로 누가 신청했는지 보고, 장소 확정·문자 안내에 쓴다.
 * (열린 자리표=대기 중 블랙홀과 달리, 날짜가 확정된 자리의 실제 참석 명단)
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getTeatimeSignups } from '@/lib/firestore';
import type { TeatimeSignup } from '@/lib/firestore';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function genderKo(g?: string): string {
  const v = (g ?? '').toLowerCase().trim();
  if (['female', 'f', '여', '여성', 'woman'].includes(v)) return '여성';
  if (['male', 'm', '남', '남성', 'man'].includes(v)) return '남성';
  return '미상';
}

// 발송 종류. teatime·promo는 앱이 티타임 자리 예약 시트를 연다(딥링크 동일).
// notice는 별도 딥링크 없이 앱만 열림 → 순수 공지/업데이트 안내용.
const PUSH_TYPES: { value: string; label: string; hint: string }[] = [
  { value: 'teatime', label: '티타임 자리 열림', hint: '탭하면 자리 예약 시트가 열림' },
  { value: 'promo', label: '이벤트·프로모', hint: '탭하면 자리 예약 시트가 열림' },
  { value: 'notice', label: '공지·업데이트', hint: '딥링크 없이 앱만 열림' },
];

// 자주 쓰는 발송 문구. 클릭하면 제목·내용·종류가 한 번에 채워진다.
// 본문은 딥링크(자동 시트 열림)가 안 먹는 구버전에서도 알아먹도록,
// "마이페이지 → 티타임"으로 직접 찾아갈 수 있게 자기완결형으로 쓴다.
const PRESETS: { name: string; title: string; body: string; type: string }[] = [
  {
    name: '새 티타임 열림',
    title: '🍵 낮에, 결이 맞는 또래와',
    body: '새 티타임이 열렸어요. 앱을 열고 마이페이지 → 티타임에서 자리를 신청하세요.',
    type: 'teatime',
  },
  {
    name: '자리 마감 임박',
    title: '🍵 자리가 곧 마감돼요',
    body: '이번 티타임, 몇 자리 안 남았어요. 마이페이지 → 티타임에서 지금 신청하세요.',
    type: 'teatime',
  },
  {
    name: '결테스트 권유',
    title: '🌱 오늘의 결, 확인해볼까요',
    body: '한 문항이면 충분해요. 앱을 열고 결테스트로 나와 결이 맞는 또래를 만나보세요.',
    type: 'promo',
  },
  {
    name: '앱 업데이트 안내',
    title: '🌱 티타 새 버전 안내',
    body: '새 버전이 나왔어요. 스토어에서 티타를 최신으로 업데이트해 주세요.',
    type: 'notice',
  },
];

interface HistoryItem {
  id: string;
  title: string;
  body: string;
  type: string;
  recipients: number;
  sent: number;
  failed: number;
  opted_out: number;
  sentAt: string | null;
}

// 전체 사용자에게 브로드캐스트 푸시. type에 따라 앱 딥링크가 달라진다.
function BroadcastPushCard() {
  const [title, setTitle] = useState('🍵 낮에, 결이 맞는 또래와');
  const [body, setBody] = useState('새 티타임이 열렸어요. 앱을 열고 마이페이지 → 티타임에서 자리를 신청하세요.');
  const [type, setType] = useState('teatime');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);

  async function loadHistory() {
    try {
      const res = await fetch('/api/backend/broadcast-push', { method: 'GET' });
      const json = await res.json();
      if (res.ok) setHistory(json.items ?? []);
    } catch { /* 이력 조회 실패는 조용히 무시 */ }
  }

  useEffect(() => { loadHistory(); }, []);

  function applyPreset(p: (typeof PRESETS)[number]) {
    setTitle(p.title);
    setBody(p.body);
    setType(p.type);
  }

  async function send() {
    if (!title.trim() || !body.trim()) { setErr('제목과 내용을 입력하세요'); return; }
    const typeLabel = PUSH_TYPES.find((t) => t.value === type)?.label ?? type;
    if (!confirm(`⚠️ 전체 사용자에게 푸시를 보냅니다.\n\n종류: ${typeLabel}\n제목: ${title}\n내용: ${body}\n\n정말 보낼까요?`)) return;
    setSending(true); setErr(null); setResult(null);
    try {
      const res = await fetch('/api/backend/broadcast-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '발송 실패');
      setResult(`발송 완료 · 대상 ${json.recipients}명 · 성공 ${json.sent} · 실패 ${json.failed} · 알림거부 제외 ${json.opted_out}`);
      loadHistory();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const activeType = PUSH_TYPES.find((t) => t.value === type);

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">브로드캐스트 푸시 (전체 발송)</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          전체 사용자에게 한 번에 발송. 알림 끈 사용자는 자동 제외됩니다.
        </p>
      </div>

      {/* 프리셋 */}
      <div>
        <div className="text-xs font-semibold text-gray-500 mb-1.5">문구 프리셋</div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className="px-3 py-1.5 rounded-full border border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* 발송 종류 */}
      <div>
        <div className="text-xs font-semibold text-gray-500 mb-1.5">발송 종류</div>
        <div className="flex flex-wrap gap-2">
          {PUSH_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                type === t.value
                  ? 'border-green-700 bg-green-50 text-green-800'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {activeType && <p className="text-xs text-gray-400 mt-1">{activeType.hint}</p>}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="내용"
        rows={2}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={send}
          disabled={sending}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-700 hover:bg-green-800 disabled:opacity-50"
        >
          {sending ? '발송 중…' : '전체에게 발송'}
        </button>
        {result && <span className="text-sm text-green-700">{result}</span>}
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
      <p className="text-xs text-amber-600">
        ⚠️ 실제 전체 발송입니다. 보내기 전 본인 계정으로 먼저 확인하고, 앱 배포 후 1~2일 지나 자동 업데이트가 퍼진 뒤 보내는 걸 권장해요.
      </p>

      {/* 발송 이력 */}
      {history && history.length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <div className="text-xs font-semibold text-gray-500 mb-2">최근 발송 이력</div>
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="text-xs text-gray-600 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-medium text-gray-800">{h.title}</span>
                  <span className="text-gray-400"> · {PUSH_TYPES.find((t) => t.value === h.type)?.label ?? h.type}</span>
                  <div className="text-gray-500 truncate">{h.body}</div>
                </div>
                <div className="text-right whitespace-nowrap text-gray-400">
                  <div>대상 {h.recipients} · 성공 {h.sent}</div>
                  <div>{h.sentAt ? new Date(h.sentAt).toLocaleString('ko-KR') : '—'}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function TeatimePage() {
  const [rows, setRows] = useState<TeatimeSignup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTeatimeSignups()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  // 이벤트별 그룹 (최신 이벤트가 위로)
  const byEvent = useMemo(() => {
    const m = new Map<string, TeatimeSignup[]>();
    for (const r of rows ?? []) {
      (m.get(r.eventId) ?? m.set(r.eventId, []).get(r.eventId)!).push(r);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  return (
    <div className="space-y-6">
      <Header
        title="티타임 신청 명단"
        subtitle="날짜가 확정된 티타임에 실제로 신청한 분들. 장소 확정·문자 안내에 쓰세요."
      />

      <BroadcastPushCard />

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          불러오기 실패: {error}
        </div>
      ) : rows === null ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          아직 신청자가 없습니다.
        </div>
      ) : (
        byEvent.map(([eventId, list]) => {
          const f = list.filter((r) => genderKo(r.gender) === '여성').length;
          const m = list.filter((r) => genderKo(r.gender) === '남성').length;
          const na = list.length - f - m;
          return (
            <section key={eventId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-gray-900">
                  {eventId}
                  <span className="ml-3 text-sm font-normal text-gray-500">
                    총 {list.length}명 · 여성 {f} · 남성 {m} · 미상 {na}
                  </span>
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-5 py-2.5">이름</th>
                    <th className="text-left px-5 py-2.5">지역</th>
                    <th className="text-left px-5 py-2.5">성별</th>
                    <th className="text-left px-5 py-2.5">상태</th>
                    <th className="text-right px-5 py-2.5">신청 시각</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-5 py-2.5">
                        <Link href={`/dashboard/users/${r.uid}`} className="text-blue-600 hover:underline font-medium">
                          {r.name || '(이름 없음)'}
                        </Link>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">{r.uid.slice(0, 10)}…</div>
                      </td>
                      <td className="px-5 py-2.5 text-gray-700">{r.region || '—'}</td>
                      <td className="px-5 py-2.5 text-gray-700">{genderKo(r.gender)}</td>
                      <td className="px-5 py-2.5 text-gray-600">{r.status}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-gray-500 whitespace-nowrap">
                        {r.createdAt ? r.createdAt.toLocaleString('ko-KR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })
      )}
    </div>
  );
}
