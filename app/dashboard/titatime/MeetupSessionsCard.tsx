'use client';

// 티타임 모집 세션 관리 — 웹 모집 페이지(tita-app.com/titatime)와 앱이 보여주는
// "이번 주 자리"의 단일 출처. 코드에 날짜를 하드코딩하지 않고 여기서 세팅한다.
// 게시(published)하면 웹이 즉시 읽고, "이 모임으로 공지 발송"으로 전체 푸시까지.
//
// 22일처럼 미뤄야 하면: 해당 세션을 '게시 해제'하거나 status를 '편성예정'으로.
// 게시된 open/almost 세션이 하나도 없으면 웹은 자동으로 "편성 예정"만 보여준다.

import { useCallback, useEffect, useRef, useState } from 'react';
import ExcludeMembers from './ExcludeMembers';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '@/lib/firebase';

type Status = 'open' | 'almost' | 'closed' | 'planning' | 'cancelled';

interface Session {
  /** 이 자리에서 뺀 회원. 서버가 목록에서 걸러 준다. */
  excludeUids?: string[];
  /** 회원 제안으로 만들어진 초안. 장소를 넣고 공개해야 자리가 된다. */
  needsVenue?: boolean;
  leaderName?: string;
  cardTitle?: string;
  cardColor?: string;
  cardImageUrl?: string;
  id: string;
  district: string;
  dateLabel: string;
  spotsLabel: string;
  status: Status;
  description: string | null;
  published: boolean;
  sortOrder: number;
  // 앱 신청 시트가 보여주는 것들. 예전엔 목록이 이걸 안 내려줘서 어드민에서
  // 고칠 수가 없었고, minToOpen 하나 바꾸는 데 스크립트를 써야 했다.
  startAt?: string | null;
  venue?: string | null;
  mapUrl?: string | null;
  region?: string | null;
  city?: string | null;
  activity?: string | null;
  topic?: string | null;
  capacity?: number | null;
  minToOpen?: number | null;
  genderPref?: string | null;
  agePref?: string | null;
  minBirthYear?: number | null;
  maxBirthYear?: number | null;
  costNote?: string | null;
  linkUrl?: string | null;
  linkLabel?: string | null;
  photoUrls?: string[] | null;
  lat?: number | null;
  lng?: number | null;
  signupCount?: number;
}

const STATUS_LABEL: Record<Status, string> = {
  open: '모집 중',
  almost: '마감 임박',
  closed: '모집 마감',
  planning: '편성 예정',
  cancelled: '접음',
};

const STATUS_CLASS: Record<Status, string> = {
  open: 'bg-emerald-100 text-emerald-700',
  almost: 'bg-amber-100 text-amber-700',
  closed: 'bg-gray-200 text-gray-600',
  planning: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-rose-100 text-rose-700',
};

const EMPTY_FORM = {
  district: '',
  dateLabel: '',
  spotsLabel: '정원 4~6명 · 선착순 모집',
  status: 'open' as Status,
  description: '',
  published: true,
  sortOrder: 0,
  // 홈 카드 겉모습(선택). 비우면 앱 기본(찻잔 아이콘·기본 초록·날짜 제목).
  cardTitle: '',
  cardColor: '',
  cardImageUrl: '',
  // 언제·어디서. startAt은 datetime-local 값("2026-09-12T14:00")으로 들고
  // 저장할 때 +09:00을 붙인다 — 앱의 '캘린더에 추가'가 이 값을 쓴다.
  startAt: '',
  venue: '',
  mapUrl: '',
  region: '서울',
  city: '서울',
  // 무엇을 하는 자리인가. 채워진 자리 넷 중 둘이 미술관이었고, 지역만 적힌
  // 자리는 대부분 0명이었다(2026-09-07 실측). 동네보다 이게 신청을 가른다.
  activity: '',
  // 인원. capacity는 실제 예약 인원과 맞춘다. minToOpen을 못 채우면
  // cancelUnderfilledSeats가 이틀 전에 자리를 접는다.
  capacity: '' as number | '',
  minToOpen: '' as number | '',
  genderPref: 'any',
  agePref: 'any',
  // 비용은 카드에 미리 밝힌다. 비우면 앱이 "각자 주문하고 각자 계산"을 띄우는데,
  // 참가비를 미리 내는 자리에서는 그 문장이 거짓말이 된다.
  costNote: '',
  linkUrl: '',
  linkLabel: '',
  photoUrls: [] as string[],
};

// 앱 팔레트에서 고른 프리셋 — 자유 hex도 되지만, 아무 색이나 고르면 브랜드가
// 흩어진다. 광고 캐러셀(블러시)과 앱 테마(크림·세이지)에서만 뽑았다.
const CARD_COLORS: { hex: string; label: string }[] = [
  { hex: '', label: '기본(초록)' },
  { hex: '#F7E4E1', label: '블러시' },
  { hex: '#F2EDE3', label: '크림' },
  { hex: '#D6E2D8', label: '세이지' },
];

type FormState = typeof EMPTY_FORM;

/**
 * 폼 값 → 백엔드 페이로드.
 *
 * 빈 문자열을 그대로 보내면 안 된다. 백엔드는 "보낸 필드만 갱신"이라
 * `venue: ''`는 "장소를 지워라"가 되고, 숫자 칸의 ''는 타입 오류가 된다.
 * 비운 칸은 아예 안 보내고, 지우고 싶을 때는 null을 명시적으로 보낸다.
 */
function toPayload(form: FormState): Record<string, unknown> {
  const out: Record<string, unknown> = {
    district: form.district.trim(),
    dateLabel: form.dateLabel.trim(),
    spotsLabel: form.spotsLabel.trim(),
    status: form.status,
    published: form.published,
    sortOrder: form.sortOrder,
    description: form.description.trim() || null,
    // 사진은 배열 통째로 보낸다 — 지운 것도 반영되어야 한다.
    photoUrls: form.photoUrls,
  };
  // 문자열: 비었으면 null(지우기), 있으면 다듬어서.
  for (const k of ['cardTitle', 'cardColor', 'cardImageUrl', 'venue', 'mapUrl',
    'region', 'city', 'costNote', 'linkUrl', 'linkLabel'] as const) {
    const v = String(form[k] ?? '').trim();
    out[k] = v || null;
  }
  // 활동은 topic에도 같은 값을 넣는다 — 앱과 편성이 둘 다 본다.
  const activity = form.activity.trim();
  out.activity = activity || null;
  out.topic = activity || null;
  // 숫자: 비었으면 null.
  out.capacity = form.capacity === '' ? null : Number(form.capacity);
  out.minToOpen = form.minToOpen === '' ? null : Number(form.minToOpen);
  // 조건은 'any'가 기본. 좁혀진 자리는 이야기 피드에 안 나간다(publishSeatToStories).
  out.genderPref = form.genderPref || 'any';
  out.agePref = form.agePref || 'any';
  // datetime-local("2026-09-12T14:00") → ISO(+09:00). 앱의 '캘린더에 추가'가 쓴다.
  out.startAt = form.startAt ? `${form.startAt}:00+09:00` : null;
  // 장소를 넣었으면 '장소 미정' 표시를 끈다.
  if (out.venue) out.needsVenue = false;
  return out;
}

export default function MeetupSessionsCard() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // null=닫힘, ''=새로만들기
  const formRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  /**
   * 공간 사진 업로드.
   *
   * Storage 규칙이 seat_photos/{uid} 아래 **본인 uid 경로**만 쓰기를 허용한다
   * (앱의 seat_edit_sheet와 같은 규칙). 어드민도 자기 uid 아래에 올리면 되므로
   * 규칙을 건드릴 필요가 없다. 읽기는 로그인한 회원 누구나 되니 앱에서 보인다.
   *
   * 한 장이 실패해도 나머지는 올린다 — 다섯 장 중 하나 때문에 처음부터 다시
   * 고르게 하면 안 된다.
   */
  async function uploadPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const uid = auth.currentUser?.uid;
    if (!uid) { setNotice('로그인이 풀렸어요. 새로고침 후 다시 시도해주세요.'); return; }
    setUploading(true);
    const added: string[] = [];
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) { failed.push(`${file.name}(10MB 초과)`); continue; }
      try {
        const path = `seat_photos/${uid}/${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        const r = storageRef(storage, path);
        await uploadBytes(r, file);
        added.push(await getDownloadURL(r));
      } catch {
        failed.push(file.name);
      }
    }
    if (added.length) setForm((f) => ({ ...f, photoUrls: [...f.photoUrls, ...added] }));
    setNotice(failed.length ? `${failed.join(', ')} 은(는) 못 올렸어요.` : null);
    setUploading(false);
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/backend/titatime-sessions', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '불러오기 실패');
      setSessions(json.items ?? []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSessions([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setForm({ ...EMPTY_FORM, sortOrder: (sessions?.length ?? 0) });
    setEditingId('');
    setNotice(null);
  }

  function openEdit(s: Session) {
    setForm({
      district: s.district ?? '',
      dateLabel: s.dateLabel ?? '',
      cardTitle: s.cardTitle ?? '',
      cardColor: s.cardColor ?? '',
      cardImageUrl: s.cardImageUrl ?? '',
      spotsLabel: s.spotsLabel ?? '',
      status: s.status,
      description: s.description ?? '',
      published: s.published,
      sortOrder: s.sortOrder ?? 0,
      // ISO(+09:00)를 datetime-local이 읽는 "YYYY-MM-DDTHH:mm"으로 자른다.
      startAt: (s.startAt ?? '').slice(0, 16),
      venue: s.venue ?? '',
      mapUrl: s.mapUrl ?? '',
      region: s.region ?? '서울',
      city: s.city ?? '서울',
      activity: s.activity ?? s.topic ?? '',
      capacity: s.capacity ?? '',
      minToOpen: s.minToOpen ?? '',
      genderPref: s.genderPref ?? 'any',
      agePref: s.agePref ?? 'any',
      costNote: s.costNote ?? '',
      linkUrl: s.linkUrl ?? '',
      linkLabel: s.linkLabel ?? '',
      photoUrls: s.photoUrls ?? [],
    });
    setEditingId(s.id);
    setNotice(null);
    // 폼은 목록 **위**에 렌더된다 — 아래쪽 자리에서 수정을 누르면 화면 밖에
    // 열려 "안 눌리는 것"처럼 보인다. 끌어온다(2026-08-16).
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  async function save() {
    if (!form.district.trim() || !form.dateLabel.trim()) {
      setNotice('동네와 날짜는 필수예요.');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const isNew = editingId === '';
      const res = await fetch(
        isNew ? '/api/backend/titatime-sessions' : `/api/backend/titatime-sessions/${editingId}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toPayload(form)),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '저장 실패');
      setEditingId(null);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(s: Session) {
    setBusy(true);
    try {
      const res = await fetch(`/api/backend/titatime-sessions/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !s.published }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '변경 실패');
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Session) {
    if (!confirm(`"${s.district} · ${s.dateLabel}" 세션을 삭제할까요?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/backend/titatime-sessions/${s.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '삭제 실패');
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // 이 세션 내용으로 전체 알림 발송(+ 인앱함에 뜸). 문구는 세션에서 자동 구성하고,
  // 발송 전 수정 가능. type=teatime → 탭하면 앱이 티타임 화면으로 이동.
  // 톤은 admin-dms 프리셋과 동일한 '자기완결형' — 딥링크가 안 열려도 본문만 보고
  // 마이페이지 → 티타임으로 찾아갈 수 있게 이동 안내를 항상 붙인다.
  async function announce(s: Session) {
    const defaultTitle = '🍵 낮에, 결이 맞는 또래와';
    const defaultBody = [
      `${s.district} · ${s.dateLabel}`,
      s.spotsLabel,
      s.description || '',
      '앱을 열고 마이페이지 → 티타임에서 자리를 신청하세요.',
    ]
      .filter((line) => line.trim())
      .join('\n');
    const title = prompt('알림 제목', defaultTitle);
    if (title === null) return;
    const body = prompt('알림 내용', defaultBody);
    if (body === null) return;
    if (!confirm('전체 회원에게 지금 발송할까요? (알림 허용한 분들 + 인앱 알림함)')) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/backend/broadcast-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), type: 'teatime' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '발송 실패');
      setNotice(
        `발송 완료 · 대상 ${json.recipients}명 · 성공 ${json.sent} · 실패 ${json.failed} · 알림거부 제외 ${json.opted_out}`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const published = (sessions ?? []).filter((s) => s.published);

  // 접은 자리는 목록에서 빼고 개수만 남긴다. 토글로 다시 볼 수 있다.

  const cancelledCount =

    sessions?.filter((s) => s.status === 'cancelled').length ?? 0;

  const visibleSessions = (sessions ?? []).filter(

    (s) => showCancelled || s.status !== 'cancelled',

  );


  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">모집 세션 관리</h2>
          <p className="mt-1 text-sm text-gray-500">
            웹 모집 페이지 <span className="font-mono text-gray-600">tita-app.com/titatime</span>가
            보여주는 “이번 주 자리”. 여기서 세팅하면 코드 배포 없이 바로 반영돼요.
            게시된 자리가 없으면 웹은 “편성 예정”만 보여줍니다.
          </p>
        </div>
        <button
          onClick={openNew}
          className="shrink-0 rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          + 새 모임
        </button>
      </div>

      {err && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}
      {notice && (
        <div className="mt-3 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {notice}
        </div>
      )}

      {/* 편집 폼 */}
      {editingId !== null && (
        <div ref={formRef} className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">동네</span>
              <input
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                placeholder="종로·광화문 일대"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">날짜·시간 (그대로 표시됨)</span>
              <input
                value={form.dateLabel}
                onChange={(e) => setForm({ ...form, dateLabel: e.target.value })}
                placeholder="7월 30일 (수) 오전 11시"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">자리 안내</span>
              <input
                value={form.spotsLabel}
                onChange={(e) => setForm({ ...form, spotsLabel: e.target.value })}
                placeholder="정원 4~6명 · 선착순 모집"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">상태</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {(Object.keys(STATUS_LABEL) as Status[]).map((k) => (
                  <option key={k} value={k}>{STATUS_LABEL[k]}</option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-gray-700">모임 내용 (선택)</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="낮에 동네 카페에서 90분. 결이 맞는 3~4명과 차 한 잔."
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <div className="sm:col-span-2 rounded-lg border border-gray-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold text-gray-600">
                홈 카드 겉모습 (선택) — 비우면 기본 모양으로 나갑니다
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-700">카드 제목</span>
                  <input
                    value={form.cardTitle}
                    onChange={(e) => setForm({ ...form, cardTitle: e.target.value })}
                    placeholder="비우면 '날짜 티타임 · 동네'"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-700">카드 이미지 주소 (https)</span>
                  <input
                    value={form.cardImageUrl}
                    onChange={(e) => setForm({ ...form, cardImageUrl: e.target.value })}
                    placeholder="비우면 찻잔 아이콘"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </label>
                <div className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium text-gray-700">카드 색</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {CARD_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setForm({ ...form, cardColor: c.hex })}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                          form.cardColor === c.hex
                            ? 'border-emerald-600 ring-1 ring-emerald-600'
                            : 'border-gray-300'
                        }`}
                        style={c.hex ? { backgroundColor: c.hex } : undefined}
                      >
                        {c.label}
                      </button>
                    ))}
                    <input
                      value={form.cardColor}
                      onChange={(e) => setForm({ ...form, cardColor: e.target.value })}
                      placeholder="#RRGGBB 직접 입력"
                      className="w-36 rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                    />
                  </div>
                </div>
                {/* 미리보기 — 앱 카드와 같은 구성. 저장 전에 눈으로 확인한다. */}
                <div
                  className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-black/10 p-4"
                  style={{ backgroundColor: form.cardColor.match(/^#[0-9a-fA-F]{6}$/) ? form.cardColor : '#E4EAE6' }}
                >
                  {form.cardImageUrl.startsWith('https://') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.cardImageUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg">차</span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-extrabold text-gray-900">
                      {form.cardTitle || `${form.dateLabel || '날짜'} 티타임 · ${form.district || '동네'}`}
                    </p>
                    <p className="truncate text-xs text-gray-600">
                      {(form.description || '자리 안내 첫 줄이 여기 보여요').split('\n')[0]}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 앱 신청 시트에 보이는 것들 ─────────────────────────────
                지금까지 이 값들은 어드민에서 못 고쳐서, 장소가 빈 채로 공개된
                자리가 나오고("아직 망설여져요"로 취소한 분이 생겼다) 최소인원
                하나 바꾸는 데 스크립트를 써야 했다(2026-09-07). */}
            <div className="sm:col-span-2 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-500">앱 신청 시트에 보이는 것</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">시작 시각</span>
                  <input
                    type="datetime-local"
                    value={form.startAt}
                    onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-xs text-gray-400">
                    앱의 &lsquo;캘린더에 추가&rsquo;가 이 값을 써요. 위 날짜 문구와 따로예요.
                  </span>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">무엇을 하는 자리</span>
                  <input
                    value={form.activity}
                    onChange={(e) => setForm({ ...form, activity: e.target.value })}
                    placeholder="전시 · 공연 · 도예 · 차"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-xs text-gray-400">
                    동네보다 이게 신청을 가릅니다. 채워진 자리 넷 중 둘이 미술관이었어요.
                  </span>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">장소 이름</span>
                  <input
                    value={form.venue}
                    onChange={(e) => setForm({ ...form, venue: e.target.value })}
                    placeholder="테라스꾸까 (종로구 율곡로 1, 2층)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">지도 링크</span>
                  <input
                    value={form.mapUrl}
                    onChange={(e) => setForm({ ...form, mapUrl: e.target.value })}
                    placeholder="https://naver.me/..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-xs text-gray-400">
                    5060에게 &lsquo;어디&rsquo;는 글자 주소보다 지도가 답입니다.
                  </span>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">시·도</span>
                  <input
                    value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value, city: e.target.value })}
                    placeholder="서울"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">비용 안내</span>
                  <input
                    value={form.costNote}
                    onChange={(e) => setForm({ ...form, costNote: e.target.value })}
                    placeholder="해피아워 세트 9,900원 — 각자 주문하고 각자 계산해요."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-xs text-gray-400">
                    비우면 앱이 &lsquo;각자 주문하고 각자 계산&rsquo;을 띄워요. 미리 내는 자리면 꼭 적어주세요.
                  </span>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">정원</span>
                  <input
                    type="number" min={1}
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value === '' ? '' : Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">최소 인원</span>
                  <input
                    type="number" min={1}
                    value={form.minToOpen}
                    onChange={(e) => setForm({ ...form, minToOpen: e.target.value === '' ? '' : Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-xs text-gray-400">못 채우면 이틀 전에 자동으로 접혀요.</span>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">성별</span>
                  <select
                    value={form.genderPref}
                    onChange={(e) => setForm({ ...form, genderPref: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="any">상관없음</option>
                    <option value="women">여성만</option>
                    <option value="men">남성만</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">나이</span>
                  <select
                    value={form.agePref}
                    onChange={(e) => setForm({ ...form, agePref: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="any">상관없음</option>
                    <option value="near">비슷한 또래</option>
                  </select>
                </label>
              </div>

              {(form.genderPref !== 'any' || form.agePref !== 'any') && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  대상을 좁힌 자리는 <strong>이야기 목록에 올라가지 않습니다.</strong>
                  신청할 수 없는 분들에게까지 보이지 않게 하려는 거예요.
                </p>
              )}

              {/* 공간 사진 — 어디로 가는지가 신청을 가른다. */}
              <div className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">공간 사진</span>
                <div className="flex flex-wrap items-center gap-2">
                  {form.photoUrls.map((url) => (
                    <span key={url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, photoUrls: form.photoUrls.filter((u) => u !== url) })}
                        className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-gray-900 text-xs text-white"
                        aria-label="사진 빼기"
                      >×</button>
                    </span>
                  ))}
                  <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-400 text-xs text-gray-500">
                    {uploading ? '올리는 중' : '+ 사진'}
                    <input
                      type="file" accept="image/*" multiple hidden
                      disabled={uploading}
                      onChange={(e) => uploadPhotos(e.target.files)}
                    />
                  </label>
                </div>
                <span className="mt-1 block text-xs text-gray-400">
                  첫 장이 이야기 글의 대표 사진이 돼요. 한 장에 10MB까지.
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">바깥 링크</span>
                  <input
                    value={form.linkUrl}
                    onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">링크에 붙일 말</span>
                  <input
                    value={form.linkLabel}
                    onChange={(e) => setForm({ ...form, linkLabel: e.target.value })}
                    placeholder="공연 안내 보기"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center gap-4 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })}
                />
                웹에 게시 (체크 해제 = 숨김)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                정렬
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                  className="w-16 rounded-lg border border-gray-300 px-2 py-1"
                />
              </label>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {editingId === '' ? '만들기' : '저장'}
            </button>
            <button
              onClick={() => setEditingId(null)}
              disabled={busy}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 목록 — 접은 자리는 기본으로 감춘다.
          2026-08-31: 접은 자리가 status만 'cancelled'로 바뀌고 목록에는 그대로
          남아 있었다. Status 타입에 'cancelled'가 없어서 상태 뱃지도 빈 채로
          떠, 멀쩡한 자리와 구분이 안 됐다. 앱에는 안 보이는데 어드민에만
          남아 있으면 "왜 아직 있지"를 매번 다시 확인하게 된다. */}
      <div className="mt-4 space-y-2">
        {sessions === null ? (
          <div className="py-6 text-center text-sm text-gray-400">불러오는 중…</div>
        ) : visibleSessions.length === 0 && cancelledCount === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
            아직 세션이 없어요. “+ 새 모임”으로 이번 주 자리를 만들어 주세요.
            <br />
            (세션이 없으면 웹은 “편성 예정”만 보여줍니다.)
          </div>
        ) : (
          visibleSessions.map((s) => (
            <div
              key={s.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                s.published ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-70'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{s.district || '(동네 미정)'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[s.status]}`}>
                    {STATUS_LABEL[s.status]}
                  </span>
                  {!s.published && !s.needsVenue && (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">숨김</span>
                  )}
                  {/* 회원이 제안해서 생긴 초안. 장소만 넣으면 열 수 있다 —
                      '숨김'과 섞이면 손대야 할 것이 안 보인다. */}
                  {s.needsVenue && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      장소 필요{s.leaderName ? ` · ${s.leaderName}님 제안` : ''}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-sm text-gray-700">{s.dateLabel || '날짜 미정'}</div>
                <div className="text-xs text-gray-500">{s.spotsLabel}</div>
                {s.description && <div className="mt-0.5 text-xs text-gray-400">{s.description}</div>}
                <div className="mt-1">
                  <ExcludeMembers
                    sessionId={s.id}
                    excludeUids={s.excludeUids ?? []}
                    onSaved={load}
                  />
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <button
                  onClick={() => announce(s)}
                  disabled={busy}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  공지 발송
                </button>
                <button
                  onClick={() => togglePublish(s)}
                  disabled={busy}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {s.published ? '게시 해제' : '게시'}
                </button>
                <button
                  onClick={() => openEdit(s)}
                  disabled={busy}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  수정
                </button>
                <button
                  onClick={() => remove(s)}
                  disabled={busy}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
        {cancelledCount > 0 && (
          <button
            type="button"
            onClick={() => setShowCancelled((v) => !v)}
            className="w-full rounded-xl border border-dashed border-gray-300 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700"
          >
            {showCancelled
              ? `접은 자리 ${cancelledCount}개 숨기기`
              : `접은 자리 ${cancelledCount}개 보기`}
          </button>
        )}
      </div>

      {sessions && sessions.length > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          웹에 노출 중: {published.length}개 · “공지 발송”은 알림 허용한 전체 회원에게 즉시 전송 +
          인앱 알림함에 뜨고, 탭하면 티타임 화면으로 이동해요.
        </p>
      )}
    </section>
  );
}
