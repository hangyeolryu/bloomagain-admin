'use client';

// 티타임 모집 세션 관리 — 웹 모집 페이지(tita-app.com/titatime)와 앱이 보여주는
// "이번 주 자리"의 단일 출처. 코드에 날짜를 하드코딩하지 않고 여기서 세팅한다.
// 게시(published)하면 웹이 즉시 읽고, "이 모임으로 공지 발송"으로 전체 푸시까지.
//
// 22일처럼 미뤄야 하면: 해당 세션을 '게시 해제'하거나 status를 '편성예정'으로.
// 게시된 open/almost 세션이 하나도 없으면 웹은 자동으로 "편성 예정"만 보여준다.

import { useCallback, useEffect, useState } from 'react';

type Status = 'open' | 'almost' | 'closed' | 'planning';

interface Session {
  id: string;
  district: string;
  dateLabel: string;
  spotsLabel: string;
  status: Status;
  description: string | null;
  published: boolean;
  sortOrder: number;
}

const STATUS_LABEL: Record<Status, string> = {
  open: '모집 중',
  almost: '마감 임박',
  closed: '모집 마감',
  planning: '편성 예정',
};

const STATUS_CLASS: Record<Status, string> = {
  open: 'bg-emerald-100 text-emerald-700',
  almost: 'bg-amber-100 text-amber-700',
  closed: 'bg-gray-200 text-gray-600',
  planning: 'bg-gray-100 text-gray-500',
};

const EMPTY_FORM = {
  district: '',
  dateLabel: '',
  spotsLabel: '정원 4~6명 · 선착순 모집',
  status: 'open' as Status,
  description: '',
  published: true,
  sortOrder: 0,
};

type FormState = typeof EMPTY_FORM;

export default function MeetupSessionsCard() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // null=닫힘, ''=새로만들기
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
      spotsLabel: s.spotsLabel ?? '',
      status: s.status,
      description: s.description ?? '',
      published: s.published,
      sortOrder: s.sortOrder ?? 0,
    });
    setEditingId(s.id);
    setNotice(null);
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
          body: JSON.stringify({ ...form, description: form.description.trim() || null }),
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
  async function announce(s: Session) {
    const defaultTitle = '🍵 이번 주 티타임 열렸어요';
    const defaultBody = `${s.district} · ${s.dateLabel}\n${s.spotsLabel}${s.description ? `\n${s.description}` : ''}`;
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
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
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

      {/* 목록 */}
      <div className="mt-4 space-y-2">
        {sessions === null ? (
          <div className="py-6 text-center text-sm text-gray-400">불러오는 중…</div>
        ) : sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
            아직 세션이 없어요. “+ 새 모임”으로 이번 주 자리를 만들어 주세요.
            <br />
            (세션이 없으면 웹은 “편성 예정”만 보여줍니다.)
          </div>
        ) : (
          sessions.map((s) => (
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
                  {!s.published && (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">숨김</span>
                  )}
                </div>
                <div className="mt-0.5 text-sm text-gray-700">{s.dateLabel || '날짜 미정'}</div>
                <div className="text-xs text-gray-500">{s.spotsLabel}</div>
                {s.description && <div className="mt-0.5 text-xs text-gray-400">{s.description}</div>}
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
