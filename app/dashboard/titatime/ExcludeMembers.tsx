'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * 자리별 제외 회원.
 *
 * 왜 나이 문으로 안 하나: 한 분을 막으려고 minBirthYear를 좁히면 상관없는
 * 수십 명이 같이 막힌다. 2026-08-21에 실제로 그랬다 — 1977년생 한 분 때문에
 * 범위를 1978~1982로 줄였고, 1973~1977년생 28명이 함께 안 보이게 됐다.
 *
 * 제외 명단은 앱으로 내려가지 않는다. 서버가 "묻는 사람 것만" 걸러서 주기
 * 때문에, 빠진 분에게는 그 자리가 처음부터 없었던 것처럼 보인다.
 */
type Person = { uid: string; name: string; year?: number };

export default function ExcludeMembers({
  sessionId,
  excludeUids,
  onSaved,
}: {
  sessionId: string;
  excludeUids: string[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || people.length) return;
    (async () => {
      const snap = await getDocs(query(collection(db, 'users')));
      const rows: Person[] = [];
      snap.forEach((d) => {
        const x = d.data() as Record<string, unknown>;
        if (x.isDeleted === true) return;
        const name = (x.displayName as string) || '';
        if (!name) return;
        rows.push({
          uid: d.id,
          name,
          year: (x.legalBirthYear as number) || (x.yearOfBirth as number) || undefined,
        });
      });
      rows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      setPeople(rows);
    })().catch((e) => setErr(String(e)));
  }, [open, people.length]);

  const byUid = useMemo(
    () => Object.fromEntries(people.map((p) => [p.uid, p])),
    [people],
  );

  const matches = useMemo(() => {
    const t = q.trim();
    if (!t) return [];
    return people
      .filter((p) => p.name.includes(t) && !excludeUids.includes(p.uid))
      .slice(0, 6);
  }, [q, people, excludeUids]);

  async function save(next: string[]) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/backend/titatime-sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludeUids: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '저장 실패');
      setQ('');
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-gray-500 underline hover:text-gray-800"
      >
        제외 회원 {excludeUids.length > 0 ? `${excludeUids.length}명` : '관리'}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-700">
          이 자리에서 뺄 회원
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-gray-400 hover:text-gray-700"
        >
          닫기
        </button>
      </div>

      {excludeUids.length === 0 ? (
        <p className="text-[11px] text-gray-400">없어요. 모두에게 보입니다.</p>
      ) : (
        <div className="mb-1 flex flex-wrap gap-1">
          {excludeUids.map((uid) => (
            <span
              key={uid}
              className="flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-800"
            >
              {byUid[uid]?.name ?? uid.slice(0, 8)}
              <button
                type="button"
                disabled={busy}
                onClick={() => save(excludeUids.filter((u) => u !== uid))}
                className="font-bold hover:text-rose-950"
                title="다시 보이게"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={people.length ? '닉네임으로 찾기' : '회원 불러오는 중…'}
        disabled={busy || !people.length}
        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
      />
      {matches.map((p) => (
        <button
          key={p.uid}
          type="button"
          disabled={busy}
          onClick={() => save([...excludeUids, p.uid])}
          className="mt-1 block w-full rounded px-2 py-1 text-left text-xs hover:bg-white"
        >
          {p.name}
          {p.year ? <span className="ml-1 text-gray-400">{p.year}년생</span> : null}
        </button>
      ))}
      {err && <p className="mt-1 text-[11px] text-rose-600">{err}</p>}
      <p className="mt-1 text-[11px] text-gray-400">
        뺀 분에게는 이 자리가 목록에 아예 안 보여요. 이유는 표시되지 않습니다.
      </p>
    </div>
  );
}
