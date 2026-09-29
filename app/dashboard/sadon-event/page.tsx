'use client';

/**
 * 10월 31일 자리 신청 — 초대장(tita-app.com/sadon)으로 들어온 명단.
 *
 * 신청하신 분께 **이틀 안에 전화드리겠다고 적어 뒀다.** 그래서 이 화면의
 * 첫 번째 일은 "아직 연락 안 한 분"을 맨 위로 올리는 것이다.
 *
 * 두 번째는 성비다. 아드님 측 여섯 · 따님 측 여섯이 이 자리의 1번 지표고,
 * 한쪽이 차면 초대를 다른 쪽으로 돌려야 한다(일본 실측 42 대 22).
 *
 * 쓰는 쪽은 백엔드뿐이다(/gyeol/sadon-event-signup). 여기서는 읽고,
 * 연락 여부(status)만 바꾼다.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  collection, doc, getDocs, orderBy, query, Timestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface Signup {
  id: string;
  name: string;
  contact: string;
  childSide?: string | null;
  childAge?: string | null;
  childJob?: string | null;
  matchPref?: string | null;
  referral?: string | null;
  note?: string | null;
  status: string;
  createdAt: Date | null;
}

const STATUS: { key: string; label: string; tone: string }[] = [
  { key: 'new', label: '연락 전', tone: 'bg-amber-100 text-amber-800' },
  { key: 'called', label: '통화함', tone: 'bg-blue-100 text-blue-800' },
  { key: 'confirmed', label: '오시기로', tone: 'bg-emerald-100 text-emerald-800' },
  { key: 'next', label: '다음 자리로', tone: 'bg-slate-200 text-slate-700' },
];

const CAP = 6; // 한쪽당 여섯 분

export default function SadonEventPage() {
  const [rows, setRows] = useState<Signup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(() => {
    getDocs(query(
      collection(db, 'sadon_event_signups'),
      orderBy('createdAt', 'desc'),
    )).then((snap) => {
      setRows(snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          name: (x.name as string) ?? '?',
          contact: (x.contact as string) ?? '',
          childSide: (x.childSide as string | null) ?? null,
          childAge: (x.childAge as string | null) ?? null,
          childJob: (x.childJob as string | null) ?? null,
          matchPref: (x.matchPref as string | null) ?? null,
          referral: (x.referral as string | null) ?? null,
          note: (x.note as string | null) ?? null,
          status: (x.status as string) ?? 'new',
          createdAt: x.createdAt instanceof Timestamp ? x.createdAt.toDate() : null,
        };
      }));
      setError(null);
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: string) {
    setSaving(id);
    try {
      await updateDoc(doc(db, 'sadon_event_signups', id), { status });
      setRows((cur) => cur?.map((r) => (r.id === id ? { ...r, status } : r)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  if (error) {
    return (
      <div>
        <Header title="10월 31일 자리 신청" />
        <div className="p-6">
          <p className="text-red-600">명단을 불러오지 못했습니다 — {error}</p>
        </div>
      </div>
    );
  }
  if (!rows) return <LoadingSpinner />;

  // 아직 연락 안 한 분을 맨 위로. 그 안에서는 먼저 신청하신 분 순서.
  const sorted = [...rows].sort((a, b) => {
    const an = a.status === 'new' ? 0 : 1;
    const bn = b.status === 'new' ? 0 : 1;
    if (an !== bn) return an - bn;
    return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
  });

  // 성비는 "다음 자리로" 미룬 분을 빼고 센다 — 이번 자리에 앉으실 분만.
  const counting = rows.filter((r) => r.status !== 'next');
  const son = counting.filter((r) => r.childSide === '아드님').length;
  const dau = counting.filter((r) => r.childSide === '따님').length;
  const waiting = rows.filter((r) => r.status === 'new').length;

  return (
    <div>
      <Header title="10월 31일 자리 신청" />
      <div className="p-6 space-y-6">

        {/* 성비 — 이 화면에서 제일 먼저 보여야 할 숫자 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card label="아드님 측" value={`${son} / ${CAP}`} full={son >= CAP} />
          <Card label="따님 측" value={`${dau} / ${CAP}`} full={dau >= CAP} />
          <Card
            label="연락 안 한 분"
            value={`${waiting}명`}
            warn={waiting > 0}
          />
        </div>

        {dau < son && (
          <p className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
            따님 측이 {son - dau}명 적습니다. 초대를 그쪽으로 돌릴 때예요.
          </p>
        )}
        {waiting > 0 && (
          <p className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
            신청서에 <b>이틀 안에 전화드린다</b>고 적어 두었습니다. 연락 전인
            분이 맨 위에 있습니다.
          </p>
        )}

        {sorted.length === 0 && (
          <p className="text-slate-500">아직 신청이 없습니다.</p>
        )}

        <div className="space-y-3">
          {sorted.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border p-4 ${
                r.status === 'new' ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-lg font-bold text-slate-900">{r.name}</span>
                <a
                  href={`tel:${r.contact.replace(/[^0-9+]/g, '')}`}
                  className="text-slate-700 underline decoration-slate-300"
                >
                  {r.contact}
                </a>
                <span className="text-xs text-slate-400">
                  {r.createdAt
                    ? r.createdAt.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '-'}
                </span>
              </div>

              <div className="mt-2 text-sm text-slate-700">
                자녀분 — {[r.childSide, r.childAge, r.childJob].filter(Boolean).join(' · ') || '적지 않으심'}
              </div>
              {r.matchPref && (
                <div className="mt-1 text-sm text-slate-600">
                  바라시는 것 — {r.matchPref}
                </div>
              )}
              {r.referral && (
                <div className="mt-1 text-sm text-slate-600">소개 — {r.referral}</div>
              )}
              {r.note && (
                <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {r.note}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {STATUS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    disabled={saving === r.id}
                    onClick={() => setStatus(r.id, s.key)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      r.status === s.key ? s.tone : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, full, warn }: {
  label: string; value: string; full?: boolean; warn?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${
      full ? 'border-emerald-300 bg-emerald-50'
        : warn ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
    }`}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
