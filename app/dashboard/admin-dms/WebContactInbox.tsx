'use client';

// 웹 문의함 — tita-app.com 랜딩(무가입)에서 온 문의. 앱 CS(봇 대화)와 달리
// 계정이 없어 답장할 연락처가 함께 온다(유일한 PII 컬렉션이라 읽기는 어드민만).
// 회신은 이메일/문자로 직접 하고, 여기선 처리 완료만 표시한다.

import { useCallback, useEffect, useState } from 'react';
import {
  collection, query, orderBy, limit as fLimit, getDocs,
  updateDoc, doc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface ContactMsg {
  id: string;
  name?: string;
  contact: string;
  message: string;
  source?: string;
  status?: string;
  createdAt?: Date;
}

function fmt(d?: Date) {
  if (!d) return '';
  return d.toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function WebContactInbox() {
  const [items, setItems] = useState<ContactMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'web_contact_messages'),
          orderBy('createdAt', 'desc'),
          fLimit(50),
        ),
      );
      setItems(
        snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            name: x.name as string | undefined,
            contact: (x.contact as string) ?? '',
            message: (x.message as string) ?? '',
            source: x.source as string | undefined,
            status: (x.status as string) ?? 'new',
            createdAt: x.createdAt instanceof Timestamp ? x.createdAt.toDate() : undefined,
          };
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markHandled(id: string) {
    try {
      await updateDoc(doc(db, 'web_contact_messages', id), {
        status: 'handled',
        handledAt: serverTimestamp(),
      });
      await load();
    } catch (e) {
      alert(`처리 표시 실패: ${e instanceof Error ? e.message : e}`);
    }
  }

  const newCount = items.filter((i) => i.status !== 'handled').length;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4 mb-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">
          웹 문의함 {newCount > 0 && <span className="text-red-600">({newCount})</span>}
        </h2>
        <button onClick={() => void load()} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
          새로고침
        </button>
      </div>
      <p className="text-xs text-gray-400">
        tita-app.com 문의 폼(무가입). 적어주신 이메일·문자로 <b>직접 회신</b>한 뒤 처리 완료를 눌러주세요.
      </p>

      {error && <p className="text-sm text-red-600">쿼리 오류: {error}</p>}
      {loading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">아직 문의가 없어요.</p>
      ) : (
        <div className="space-y-2">
          {items.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl border p-3.5 ${m.status === 'handled' ? 'border-gray-100 bg-gray-50' : 'border-amber-200 bg-amber-50/40'}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-gray-900">{m.name || '이름 없음'}</span>
                <a href={m.contact.includes('@') ? `mailto:${m.contact}` : `sms:${m.contact}`} className="text-sm text-blue-700 underline">
                  {m.contact}
                </a>
                <span className="ml-auto text-xs tabular-nums text-gray-400">{fmt(m.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{m.message}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{m.source ?? '—'}</span>
                {m.status === 'handled' ? (
                  <span className="text-xs font-medium text-green-700">처리 완료</span>
                ) : (
                  <button
                    onClick={() => void markHandled(m.id)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs hover:bg-white"
                  >
                    처리 완료로 표시
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
