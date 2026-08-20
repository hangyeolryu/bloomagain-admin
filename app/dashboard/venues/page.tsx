'use client';

/**
 * 장소 대장 — 자리를 여는 재료.
 *
 * 왜 필요한가. 자리를 열 때마다 네이버에서 장소를 찾고, 링크를 풀어 좌표를
 * 뽑고, 안내문을 처음부터 다시 썼다. 같은 곳을 두 번째 쓸 때도 그랬다.
 * 여기에 한 번 적어두면 다음 자리는 "장소 고르고 날짜 넣기"로 끝난다.
 *
 * 예약이 필요한 곳인지, 1인 얼마인지, 정원은 몇이 적당한지 — 이런 게 머릿속에만
 * 있으면 자동화할 수 없다. 자동화는 코드보다 이 표가 먼저다.
 */

import { useCallback, useEffect, useState } from 'react';
import { getVenues, saveVenue, type Venue } from '@/lib/firestore';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const TYPE_KO: Record<string, string> = {
  exhibition: '전시',
  brunch: '브런치',
  cafe: '카페',
  walk: '산책',
  movie: '영화',
};

const EMPTY: Omit<Venue, 'id'> = {
  name: '',
  area: '',
  type: 'cafe',
  needsReservation: false,
  suggestedCapacity: 6,
  visited: false,
};


/**
 * 장소 + 날짜 → 자리 안내문 초안.
 *
 * 매번 처음부터 쓰던 글을 장소 정보로 조립한다. 약속 네 줄과 세 명 규칙은
 * 자리마다 같아야 하는 것들이라 여기에 못 박는다 — 빠뜨리면 현장에서 문제가
 * 되는 항목들이다(각자 계산·호칭·돈 얘기·연락처).
 */
function draftDescription(v: Venue): string {
  const lines: string[] = [];
  if (v.notes) lines.push(v.notes, '');
  lines.push(
    '세 분 이상 모이면 열리는 자리예요. 그보다 적으면 다음 기회로 미루고 미리 알려드릴게요.',
    '',
    '이 자리의 약속',
    v.priceNote
      ? `- ${v.priceNote} — 각자 주문하고 각자 계산해요`
      : '- 식사·음료는 각자 주문하고 각자 계산해요',
    '- 부르고 싶은 호칭으로 편하게 불러요. 나이·직업을 묻지 않아도 됩니다',
    '- 돈·투자·물건 판매 이야기는 하지 않기로 해요',
    '- 연락처는 주고받지 않으셔도 돼요. 신청하시면 함께하실 분들의 대화방이 열려요',
    '',
    '자세한 위치는 신청하신 분께 안내드려요.',
  );
  if (v.needsReservation) {
    lines.push('', `(운영 메모 — 게시 전에 지울 것: ${v.reservationNote ?? '예약 필요'})`);
  }
  return lines.join('\n');
}

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Venue, 'id'>>(EMPTY);
  const [newId, setNewId] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setVenues(await getVenues());
    } catch (e) {
      setErr(e instanceof Error ? e.message : '불러오기 실패');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(v: Venue) {
    const { id, ...rest } = v;
    setEditing(id);
    setForm(rest);
  }

  async function save() {
    const id = editing ?? newId.trim();
    if (!id || !form.name.trim()) {
      setErr('아이디와 이름은 필요합니다');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await saveVenue(id, form);
      setEditing(null);
      setNewId('');
      setForm(EMPTY);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  /** 장소를 골라 자리 초안을 만든다. 날짜는 비워 두므로 앱에는 안 뜬다. */
  async function createSeat(v: Venue) {
    if (creating) return;
    setCreating(v.id);
    setErr(null);
    setCreated(null);
    try {
      const res = await fetch('/api/backend/titatime-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district: v.area || v.name,
          dateLabel: '', // 날짜를 채워야 앱에 뜬다
          spotsLabel: `정원 ${v.suggestedCapacity ?? 6}명 · 선착순 모집`,
          capacity: v.suggestedCapacity ?? 6,
          status: 'open',
          published: false,
          sortOrder: 5,
          description: draftDescription(v),
          cardTitle: v.name,
          mapUrl: v.mapUrl ?? null,
          lat: v.lat ?? null,
          lng: v.lng ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? '자리 생성 실패');
      setCreated(v.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '자리 생성 실패');
    } finally {
      setCreating(null);
    }
  }

  const input: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    fontSize: 14,
    border: '1px solid #d1d5db',
    borderRadius: 8,
  };

  return (
    <div className="max-w-5xl space-y-6 p-0 sm:space-y-8 sm:p-6">
      <Header
        title="Venues"
        subtitle="자리를 여는 재료. 한 번 적어두면 다음 자리는 날짜만 정하면 됩니다."
      />

      {err && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
      )}
      {created && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {created} 자리 초안을 만들었어요. <b>자리 관리</b>에서 날짜를 넣고 게시하세요 —
          날짜가 비어 있으면 앱에 뜨지 않습니다.
        </p>
      )}

      {!venues ? (
        <div className="p-6">
          <LoadingSpinner />
        </div>
      ) : (
        <ul className="space-y-3">
          {venues.map((v) => (
            <li key={v.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-gray-900">{v.name}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                      {TYPE_KO[v.type ?? ''] ?? v.type}
                    </span>
                    {v.needsReservation ? (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                        예약 필요
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">
                        예약 불필요
                      </span>
                    )}
                    {v.visited && (
                      <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800">
                        가본 곳
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {v.area}
                    {v.priceNote ? ` · ${v.priceNote}` : ''}
                    {v.suggestedCapacity ? ` · 권장 ${v.suggestedCapacity}명` : ''}
                    {v.lat ? ' · 좌표 있음' : ' · 좌표 없음(체크인 불가)'}
                  </div>
                  {v.reservationNote && (
                    <p className="mt-1 text-xs leading-relaxed text-gray-600">
                      {v.reservationNote}
                    </p>
                  )}
                  {v.notes && (
                    <p className="mt-1 text-xs leading-relaxed text-gray-500">{v.notes}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => createSeat(v)}
                    disabled={creating === v.id}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40"
                  >
                    {creating === v.id ? '만드는 중…' : '이 장소로 자리 만들기'}
                  </button>
                  <button
                    onClick={() => startEdit(v)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    고치기
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-gray-900">
          {editing ? `고치는 중 — ${editing}` : '새 장소 추가'}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!editing && (
            <label className="text-xs text-gray-600">
              아이디 (영문, 예: terrace-kukka)
              <input
                style={input}
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="terrace-kukka"
              />
            </label>
          )}
          <label className="text-xs text-gray-600">
            이름
            <input
              style={input}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="text-xs text-gray-600">
            동네 · 가까운 역
            <input
              style={input}
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
            />
          </label>
          <label className="text-xs text-gray-600">
            종류
            <select
              style={input}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {Object.entries(TYPE_KO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            지도 링크 (naver.me 단축 링크 권장)
            <input
              style={input}
              value={form.mapUrl ?? ''}
              onChange={(e) => setForm({ ...form, mapUrl: e.target.value })}
            />
          </label>
          <label className="text-xs text-gray-600">
            위도 (없으면 셀프 체크인 불가)
            <input
              style={input}
              value={form.lat ?? ''}
              onChange={(e) => setForm({ ...form, lat: Number(e.target.value) || undefined })}
            />
          </label>
          <label className="text-xs text-gray-600">
            경도
            <input
              style={input}
              value={form.lng ?? ''}
              onChange={(e) => setForm({ ...form, lng: Number(e.target.value) || undefined })}
            />
          </label>
          <label className="text-xs text-gray-600">
            1인 비용 안내
            <input
              style={input}
              value={form.priceNote ?? ''}
              onChange={(e) => setForm({ ...form, priceNote: e.target.value })}
              placeholder="해피아워 세트 9,900원"
            />
          </label>
          <label className="text-xs text-gray-600">
            권장 정원
            <input
              style={input}
              value={form.suggestedCapacity ?? ''}
              onChange={(e) =>
                setForm({ ...form, suggestedCapacity: Number(e.target.value) || undefined })
              }
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={!!form.needsReservation}
              onChange={(e) => setForm({ ...form, needsReservation: e.target.checked })}
            />
            예약이 필요한 곳
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={!!form.visited}
              onChange={(e) => setForm({ ...form, visited: e.target.checked })}
            />
            가본 곳
          </label>
          <label className="text-xs text-gray-600 sm:col-span-2">
            예약 방법 · 주의점
            <input
              style={input}
              value={form.reservationNote ?? ''}
              onChange={(e) => setForm({ ...form, reservationNote: e.target.value })}
              placeholder='전화 예약, 오후 2시까지. "티타" 이름으로.'
            />
          </label>
          <label className="text-xs text-gray-600 sm:col-span-2">
            메모 (어떤 곳인지, 다음에 주의할 점)
            <textarea
              style={{ ...input, minHeight: 70 }}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
          {editing && (
            <button
              onClick={() => {
                setEditing(null);
                setForm(EMPTY);
              }}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
            >
              취소
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
