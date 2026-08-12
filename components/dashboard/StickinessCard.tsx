'use client';

/**
 * 고착도(DAU/MAU) 카드 — daily_stats 스냅샷을 읽어 추세를 보여준다.
 *
 * lastActiveAt은 마지막 접속만 덮어쓰기 때문에 과거를 되돌아볼 수 없다.
 * 그래서 크론(snapshotDailyActives, 매일 23:55 KST)이 하루 한 줄씩 남기고,
 * 이 카드는 그걸 그대로 그린다. 2026-08-12부터 쌓이기 시작 — 그 전 날짜는
 * 영원히 없다(만들 수도 없다).
 */

import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type Row = {
  date: string;
  dau: number;
  wau: number;
  mau: number;
  stickiness: number;
  partial?: boolean;
};

export default function StickinessCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // 문서 id가 YYYY-MM-DD라 documentId 정렬로도 되지만, date 필드가
    // 명시적이라 그걸 쓴다. 단일 필드 정렬 — 인덱스 추가 불필요.
    getDocs(query(collection(db, 'daily_stats'), orderBy('date', 'desc'), limit(30)))
      .then((snap) => {
        setRows(
          snap.docs
            .map((d) => d.data() as Row)
            .sort((a, b) => a.date.localeCompare(b.date)),
        );
      })
      .catch((e) => setErr(e instanceof Error ? e.message : '불러오기 실패'));
  }, []);

  if (err) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        고착도 데이터: {err}
      </div>
    );
  }
  if (!rows) return null;

  const last = rows[rows.length - 1];
  const maxDau = Math.max(...rows.map((r) => r.dau), 1);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">고착도 DAU/MAU</h3>
        {last && (
          <p className="text-sm text-gray-600">
            <b className="text-lg tabular-nums text-gray-900">{last.stickiness}%</b>
            <span className="ml-2 text-xs text-gray-400">
              DAU {last.dau} · WAU {last.wau} · MAU {last.mau}
              {last.partial && ' · 오늘 진행 중'}
            </span>
          </p>
        )}
      </div>

      {rows.length < 7 ? (
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          8월 12일부터 매일 밤 자동으로 쌓입니다. 일주일쯤 지나면 추세가
          보여요. 그 전 날짜는 기록이 없어 만들 수 없습니다.
        </p>
      ) : (
        <div className="mt-3 flex h-16 items-end gap-0.5">
          {rows.map((r) => (
            <div
              key={r.date}
              title={`${r.date} · DAU ${r.dau} · ${r.stickiness}%`}
              className={`flex-1 rounded-t ${r.partial ? 'bg-emerald-200' : 'bg-emerald-500'}`}
              style={{ height: `${Math.max((r.dau / maxDau) * 100, 4)}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
