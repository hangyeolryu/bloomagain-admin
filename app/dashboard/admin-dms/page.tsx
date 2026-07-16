'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  collection,
  query,
  where,
  orderBy,
  limit as fLimit,
  getDocs,
  getDoc,
  doc,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getOfficialAdminUid } from '@/lib/firestore';
import Header from '@/components/layout/Header';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// One row per admin-initiated conversation. Read status is derived from the
// most recent admin-authored message in the thread (isRead flag flipped by
// the recipient's chat client). Kept intentionally coarse — per-message
// receipts live on the thread detail page.
interface DmSummary {
  conversationId: string;
  targetUid: string;
  targetDisplayName: string;
  targetPhotoUrl?: string;
  lastMessagePreview: string;
  lastMessageAt?: Date;
  lastAdminMessageRead: boolean | null; // null = no admin message yet
  totalAdminMessages: number;
  templateKey?: string;
}

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDate(v: unknown): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return undefined;
}

async function loadAdminDms(adminUid: string): Promise<DmSummary[]> {
  // Only DMs the admin initiated via the send-message flow carry
  // metadata.source === 'admin_dm'. Filtering server-side keeps this page
  // scoped to admin outreach instead of surfacing the admin's personal chats.
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', adminUid),
    where('metadata.source', '==', 'admin_dm'),
    orderBy('lastMessageAt', 'desc'),
    fLimit(100),
  );

  const snap = await getDocs(q);
  const summaries: DmSummary[] = [];

  for (const convDoc of snap.docs) {
    const data = convDoc.data();
    const participants = (data.participants as string[]) ?? [];
    const targetUid = participants.find((p) => p !== adminUid);
    if (!targetUid) continue;

    // Lookup recipient profile for the row's name/avatar.
    let targetDisplayName = '이름 없음';
    let targetPhotoUrl: string | undefined;
    try {
      const userSnap = await getDoc(doc(db, 'users', targetUid));
      if (userSnap.exists()) {
        const u = userSnap.data();
        targetDisplayName = (u.displayName as string) || '이름 없음';
        targetPhotoUrl = u.photoUrl as string | undefined;
      }
    } catch {
      /* best-effort — leave placeholder */
    }

    // Grab the most recent admin-authored message to derive read state and
    // a running count for the summary badge.
    let lastAdminMessageRead: boolean | null = null;
    let totalAdminMessages = 0;
    try {
      const msgSnap = await getDocs(
        query(
          collection(db, 'conversations', convDoc.id, 'messages'),
          where('senderId', '==', adminUid),
          orderBy('sentAt', 'desc'),
          fLimit(20),
        ),
      );
      totalAdminMessages = msgSnap.size;
      if (msgSnap.size > 0) {
        lastAdminMessageRead =
          (msgSnap.docs[0].data().isRead as boolean | undefined) ?? false;
      }
    } catch {
      /* subcollection query may need an index — non-fatal */
    }

    summaries.push({
      conversationId: convDoc.id,
      targetUid,
      targetDisplayName,
      targetPhotoUrl,
      lastMessagePreview: (data.lastMessage as string) ?? '',
      lastMessageAt: toDate(data.lastMessageAt),
      lastAdminMessageRead,
      totalAdminMessages,
      templateKey: (data.metadata as { templateKey?: string } | undefined)
        ?.templateKey,
    });
  }
  return summaries;
}

// ─── Broadcast push ──────────────────────────────────────────────────────
// 전체/필터 대상 FCM 브로드캐스트. teatime·promo는 앱이 티타임 시트를 열고,
// notice는 딥링크 없이 앱만 열린다(공지·업데이트용). 발송 전 필터로 대상을
// 좁히고 "대상 미리보기"로 누가 받는지 확인할 수 있다.
const PUSH_TYPES: { value: string; label: string; hint: string }[] = [
  { value: 'teatime', label: '티타임 자리 열림', hint: '탭하면 자리 예약 시트가 열림' },
  { value: 'promo', label: '이벤트·프로모', hint: '탭하면 자리 예약 시트가 열림' },
  { value: 'notice', label: '공지·업데이트', hint: '딥링크 없이 앱만 열림' },
];

const GENDERS: { value: string; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'f', label: '여성' },
  { value: 'm', label: '남성' },
];

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
  audience?: { only_admins?: boolean; gender?: string | null; region?: string | null };
  sentAt: string | null;
}

interface PreviewResult {
  matched: number;
  recipients: number;
  opted_out: number;
  sample: { name: string; region: string; gender: string }[];
}

function BroadcastPushCard() {
  const [title, setTitle] = useState('🍵 낮에, 결이 맞는 또래와');
  const [body, setBody] = useState('새 티타임이 열렸어요. 앱을 열고 마이페이지 → 티타임에서 자리를 신청하세요.');
  const [type, setType] = useState('teatime');
  const [gender, setGender] = useState('');
  const [region, setRegion] = useState('');
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/backend/broadcast-push', { method: 'GET' });
      const json = await res.json();
      if (res.ok) setHistory(json.items ?? []);
    } catch { /* 이력 조회 실패는 조용히 무시 */ }
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  function applyPreset(p: (typeof PRESETS)[number]) {
    setTitle(p.title);
    setBody(p.body);
    setType(p.type);
  }

  function audienceLabel(onlyAdmins: boolean): string {
    const parts: string[] = [];
    if (onlyAdmins) parts.push('관리자만');
    const g = GENDERS.find((x) => x.value === gender);
    if (gender && g) parts.push(g.label);
    if (region.trim()) parts.push(`지역 “${region.trim()}”`);
    return parts.length ? parts.join(' · ') : '전체 사용자';
  }

  async function doPreview(onlyAdmins: boolean) {
    setPreviewing(true); setErr(null); setResult(null);
    try {
      const res = await fetch('/api/backend/broadcast-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true, only_admins: onlyAdmins, gender, region: region.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '미리보기 실패');
      setPreview(json as PreviewResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(false);
    }
  }

  async function send(onlyAdmins: boolean) {
    if (!title.trim() || !body.trim()) { setErr('제목과 내용을 입력하세요'); return; }
    const typeLabel = PUSH_TYPES.find((t) => t.value === type)?.label ?? type;
    const who = audienceLabel(onlyAdmins);
    if (!confirm(`⚠️ 푸시를 보냅니다.\n\n대상: ${who}\n종류: ${typeLabel}\n제목: ${title}\n내용: ${body}\n\n정말 보낼까요?`)) return;
    setSending(true); setErr(null); setResult(null);
    try {
      const res = await fetch('/api/backend/broadcast-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), body: body.trim(), type,
          only_admins: onlyAdmins, gender, region: region.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '발송 실패');
      let msg = `발송 완료 (${who}) · 대상 ${json.recipients}명 · 성공 ${json.sent} · 실패 ${json.failed} · 알림거부 제외 ${json.opted_out}`;
      if (json.pruned > 0) {
        msg += ` · 죽은 토큰 ${json.pruned}개 정리`;
      }
      if (json.sent === 0 && json.failed > 0 && Array.isArray(json.errors) && json.errors.length > 0) {
        msg += `\n실패 원인(샘플): ${json.errors[0]}`;
      }
      setResult(msg);
      void loadHistory();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const activeType = PUSH_TYPES.find((t) => t.value === type);
  const busy = sending || previewing;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4 mb-5">
      <div>
        <h2 className="font-semibold text-gray-900">브로드캐스트 푸시 (단체 발송)</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          전체 또는 필터 대상에게 한 번에 발송. 알림 끈 사용자는 자동 제외됩니다.
          발송 전 <b>관리자에게 테스트 발송</b>으로 먼저 확인하세요.
        </p>
      </div>

      {/* 프리셋 */}
      <div>
        <div className="text-xs font-semibold text-gray-500 mb-1.5">문구 프리셋</div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.name} onClick={() => applyPreset(p)}
              className="px-3 py-1.5 rounded-full border border-gray-300 text-xs text-gray-700 hover:bg-gray-50">
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
            <button key={t.value} onClick={() => setType(t.value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                type === t.value ? 'border-green-700 bg-green-50 text-green-800'
                                 : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {activeType && <p className="text-xs text-gray-400 mt-1">{activeType.hint}</p>}
      </div>

      {/* 대상 필터 */}
      <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-2">
        <div className="text-xs font-semibold text-gray-500">대상 필터 (비우면 전체)</div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">성별</span>
            {GENDERS.map((g) => (
              <button key={g.value} onClick={() => { setGender(g.value); setPreview(null); }}
                className={`px-2.5 py-1 rounded-lg border text-xs ${
                  gender === g.value ? 'border-green-700 bg-green-50 text-green-800'
                                     : 'border-gray-300 text-gray-600 hover:bg-white'}`}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">지역</span>
            <input value={region} onChange={(e) => { setRegion(e.target.value); setPreview(null); }}
              placeholder="예: 서울 (부분일치)"
              className="border border-gray-300 rounded-lg px-2.5 py-1 text-xs w-40" />
          </div>
          <button onClick={() => void doPreview(false)} disabled={busy}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-white disabled:opacity-50">
            {previewing ? '조회 중…' : '대상 미리보기'}
          </button>
        </div>
        {preview && (
          <div className="text-xs text-gray-600 pt-1">
            <div className="font-medium text-gray-800">
              대상 {preview.recipients}명 발송 예정
              <span className="text-gray-400 font-normal"> · 조건 매칭 {preview.matched} · 알림거부 {preview.opted_out} 제외</span>
            </div>
            {preview.sample.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {preview.sample.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-white border border-gray-200 text-[11px] text-gray-600">
                    {s.name}{s.region ? ` · ${s.region}` : ''}
                  </span>
                ))}
                {preview.recipients > preview.sample.length && (
                  <span className="text-[11px] text-gray-400 self-center">
                    외 {preview.recipients - preview.sample.length}명
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="내용" rows={2}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => void send(true)} disabled={busy}
          className="px-4 py-2 rounded-lg text-sm font-semibold border border-green-700 text-green-700 hover:bg-green-50 disabled:opacity-50">
          관리자에게 테스트 발송
        </button>
        <button onClick={() => void send(false)} disabled={busy}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-700 hover:bg-green-800 disabled:opacity-50">
          {sending ? '발송 중…' : `${audienceLabel(false)}에게 발송`}
        </button>
        {result && <span className="text-sm text-green-700 whitespace-pre-line">{result}</span>}
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
      <p className="text-xs text-amber-600">
        ⚠️ 실제 발송입니다. <b>관리자에게 테스트 발송</b>으로 먼저 본인 확인 후, 조건을 확인하고 보내세요.
      </p>

      {/* 발송 이력 */}
      {history && history.length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <div className="text-xs font-semibold text-gray-500 mb-2">최근 발송 이력</div>
          <ul className="space-y-2">
            {history.map((h) => {
              const a = h.audience;
              const who = a && (a.only_admins || a.gender || a.region)
                ? [a.only_admins ? '관리자만' : null,
                   a.gender ? (GENDERS.find((g) => g.value === a.gender)?.label ?? a.gender) : null,
                   a.region ? `지역 ${a.region}` : null].filter(Boolean).join(' · ')
                : '전체';
              return (
                <li key={h.id} className="text-xs text-gray-600 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-800">{h.title}</span>
                    <span className="text-gray-400"> · {PUSH_TYPES.find((t) => t.value === h.type)?.label ?? h.type} · {who}</span>
                    <div className="text-gray-500 truncate">{h.body}</div>
                  </div>
                  <div className="text-right whitespace-nowrap text-gray-400">
                    <div>대상 {h.recipients} · 성공 {h.sent}</div>
                    <div>{h.sentAt ? new Date(h.sentAt).toLocaleString('ko-KR') : '—'}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function AdminDmsPage() {
  const [items, setItems] = useState<DmSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  // Auth state comes in asynchronously — wait for the first non-null user,
  // then resolve the OFFICIAL account uid (app_config/official_account).
  // 어떤 어드민 세션으로 로그인했든 대화는 공식 계정 기준으로 모여 보인다.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAdminEmail(u?.email ?? null);
      if (!u) {
        setAdminUid(null);
        return;
      }
      void getOfficialAdminUid().then((official) => {
        setAdminUid(official ?? u.uid);
      });
    });
    return () => unsub();
  }, []);

  const refresh = useCallback(async () => {
    if (!adminUid) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await loadAdminDms(adminUid);
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [adminUid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const readCount = items.filter((i) => i.lastAdminMessageRead === true).length;
  const unreadCount = items.filter((i) => i.lastAdminMessageRead === false).length;

  return (
    <div>
      <Header
        title="어드민 DM 관리"
        subtitle={`발신자: ${adminEmail ?? '(로그인 중...)'} · ${items.length}건 · 읽음 ${readCount} · 안읽음 ${unreadCount}`}
        action={
          <button
            onClick={() => void refresh()}
            className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
          >
            새로고침
          </button>
        }
      />

      <BroadcastPushCard />

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-5 text-sm text-blue-700">
        <span className="text-lg">ℹ️</span>
        <div>
          모든 어드민 DM은 공식 계정{' '}
          <code className="font-mono text-xs">{adminUid?.slice(0, 12) ?? '…'}</code>
          으로 발신·집계됩니다 — 어떤 계정으로 로그인해도 같은 목록이 보여요.
          (공식 계정 지정: Firestore <code className="font-mono text-xs">app_config/official_account</code>)
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
          쿼리 오류: {error}
          {error.includes('index') && (
            <p className="mt-1 text-xs">
              Firestore 콘솔에서 안내한 링크로 인덱스를 생성해주세요.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">📭</p>
          <p>아직 발송한 DM이 없어요.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    수신자
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    마지막 메시지
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    보낸 시간
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    상태
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    보낸 개수
                  </th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item) => (
                  <tr key={item.conversationId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center text-sm font-semibold text-green-700 shrink-0">
                          {item.targetDisplayName[0] ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {item.targetDisplayName}
                          </p>
                          <Link
                            href={`/dashboard/users/view?id=${item.targetUid}`}
                            className="font-mono text-xs text-blue-600 hover:underline"
                          >
                            {item.targetUid.slice(0, 12)}…
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <p className="text-xs text-gray-700 truncate">
                        {item.lastMessagePreview || (
                          <span className="text-gray-400 italic">미리보기 없음</span>
                        )}
                      </p>
                      {item.templateKey && item.templateKey !== 'custom' && (
                        <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                          {item.templateKey}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(item.lastMessageAt)}
                    </td>
                    <td className="px-4 py-3">
                      {item.lastAdminMessageRead === null ? (
                        <Badge variant="gray">-</Badge>
                      ) : item.lastAdminMessageRead ? (
                        <Badge variant="green">읽음</Badge>
                      ) : (
                        <Badge variant="orange">안읽음</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">
                      {item.totalAdminMessages}건
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/admin-dms/thread?id=${item.conversationId}`}
                        className="text-xs text-green-600 hover:text-green-700 font-medium"
                      >
                        메시지 내역 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
