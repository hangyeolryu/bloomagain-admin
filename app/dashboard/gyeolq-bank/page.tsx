'use client';

// 결큐 질문 관리 — 앱 배포 없이 질문 추가·수정·은퇴
// ──────────────────────────────────────────────────────────────────────────
// 앱은 번들 questions.json(165개)을 베이스로 쓰고, Firestore
// `gyeolQuestionBank`에 같은 id의 문서가 있으면 그걸로 덮어쓴다
// (retired:true면 노출 제외). 즉 이 페이지에서 저장한 것만 원격 오버레이로
// 올라가고, 손대지 않은 질문은 번들 그대로다. 반영 시점: 앱 다음 실행.
//
// 운영 시나리오:
//  • 결큐 인사이트에서 "쏠림 80%+" 경고가 붙은 질문 → 여기서 문구 수정 or 은퇴
//  • 새 질문 실험 → 추가 (id는 기존 최대+1 자동)
//  • 태그는 매칭 신호의 원료 — 옵션당 쉼표로 입력 (기존 태그 어휘와 일치 권장)

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import bundled from '@/lib/gyeolq-questions-full.json';

interface QOption {
  id: string;
  text: string;
  tags: string[];
}
interface Question {
  id: number;
  category: string;
  question_text: string;
  options: QOption[];
  condition?: { required_tag: string };
  retired?: boolean;
  _source: 'bundle' | 'remote';
}

const BUNDLED = (bundled as Array<Omit<Question, '_source'>>).map((q) => ({
  ...q,
  _source: 'bundle' as const,
}));

function mergeBank(remote: Map<number, Partial<Question>>): Question[] {
  const byId = new Map<number, Question>(BUNDLED.map((q) => [q.id, { ...q }]));
  for (const [id, r] of remote) {
    const base = byId.get(id);
    byId.set(id, {
      ...(base ?? { id, category: '', question_text: '', options: [] }),
      ...r,
      id,
      _source: 'remote',
    } as Question);
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

// Firestore에 쓰는 문서 형태 — 앱 DailyQuestion.fromJson과 동일 스키마 + retired
function toDocData(q: Question) {
  return {
    id: q.id,
    category: q.category,
    question_text: q.question_text,
    options: q.options.map((o) => ({ id: o.id, text: o.text, tags: o.tags })),
    ...(q.condition ? { condition: q.condition } : {}),
    retired: !!q.retired,
    updatedAt: new Date().toISOString(),
  };
}

function Editor({
  q,
  onSave,
  onClose,
  saving,
}: {
  q: Question;
  onSave: (q: Question) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [text, setText] = useState(q.question_text);
  const [category, setCategory] = useState(q.category);
  const [options, setOptions] = useState(
    q.options.map((o) => ({ ...o, tagsStr: o.tags.join(', ') })),
  );
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">질문</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 p-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">카테고리</label>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-gray-300 p-2 text-sm"
        />
      </div>
      {options.map((o, i) => (
        <div key={o.id} className="grid grid-cols-[36px_1fr] gap-2 items-start">
          <span className="mt-2 text-center text-sm font-bold text-emerald-700">{o.id}</span>
          <div className="space-y-1.5">
            <input
              value={o.text}
              onChange={(e) => {
                const next = [...options];
                next[i] = { ...o, text: e.target.value };
                setOptions(next);
              }}
              className="w-full rounded-lg border border-gray-300 p-2 text-sm"
              placeholder="보기 문구"
            />
            <input
              value={o.tagsStr}
              onChange={(e) => {
                const next = [...options];
                next[i] = { ...o, tagsStr: e.target.value };
                setOptions(next);
              }}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs font-mono"
              placeholder="태그 (쉼표 구분) — 매칭 신호의 원료"
            />
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() =>
            onSave({
              ...q,
              question_text: text.trim(),
              category: category.trim(),
              options: options.map((o) => ({
                id: o.id,
                text: o.text.trim(),
                tags: o.tagsStr.split(',').map((t) => t.trim()).filter(Boolean),
              })),
            })
          }
          disabled={saving || !text.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장 (원격 반영)'}
        </button>
        <button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600">
          닫기
        </button>
      </div>
    </div>
  );
}

export default function GyeolQBankPage() {
  const [remote, setRemote] = useState<Map<number, Partial<Question>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'gyeolQuestionBank'));
      const m = new Map<number, Partial<Question>>();
      for (const d of snap.docs) {
        const data = d.data() as Partial<Question>;
        const id = Number(data.id ?? d.id);
        if (Number.isFinite(id)) m.set(id, data);
      }
      setRemote(m);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const bank = useMemo(() => mergeBank(remote), [remote]);
  const shown = useMemo(() => {
    const f = filter.trim();
    if (!f) return bank;
    return bank.filter(
      (q) =>
        String(q.id) === f ||
        q.question_text.includes(f) ||
        q.category.includes(f) ||
        q.options.some((o) => o.text.includes(f) || o.tags.some((t) => t.includes(f))),
    );
  }, [bank, filter]);

  const save = async (q: Question) => {
    setSavingId(q.id);
    try {
      await setDoc(doc(db, 'gyeolQuestionBank', String(q.id)), toDocData(q));
      setRemote((prev) => new Map(prev).set(q.id, { ...toDocData(q) }));
      setEditing(null);
    } catch (e) {
      alert('저장 실패: ' + (e as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  const toggleRetire = async (q: Question) => {
    const next = { ...q, retired: !q.retired };
    if (
      next.retired &&
      !confirm(`#${q.id} "${q.question_text}"\n\n이 질문을 은퇴시킬까요? 앱에서 더 이상 노출되지 않습니다 (기존 답변 데이터는 유지).`)
    )
      return;
    await save(next);
  };

  const addNew = () => {
    const nextId = Math.max(...bank.map((q) => q.id)) + 1;
    const blank: Question = {
      id: nextId,
      category: '취향',
      question_text: '',
      options: [
        { id: 'A', text: '', tags: [] },
        { id: 'B', text: '', tags: [] },
      ],
      _source: 'remote',
    };
    setRemote((prev) => new Map(prev).set(nextId, blank));
    setEditing(nextId);
    setFilter(String(nextId));
  };

  // 번들 165개 전체를 원격 뱅크로 시드 — 이후 모든 질문이 원격에서 관리됨.
  // (선택 사항: 시드 안 해도 수정한 질문만 오버레이로 올라간다)
  const seedAll = async () => {
    if (!confirm(`번들 질문 ${BUNDLED.length}개를 전부 원격 뱅크에 업로드할까요?\n이후 질문 관리의 단일 출처가 Firestore가 됩니다.`)) return;
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      for (const q of BUNDLED) {
        batch.set(doc(db, 'gyeolQuestionBank', String(q.id)), toDocData({ ...q, retired: false }));
      }
      await batch.commit();
      await load();
    } catch (e) {
      alert('시드 실패: ' + (e as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  if (loading) return <LoadingSpinner message="질문 뱅크 로딩 중..." />;
  if (error)
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <p className="text-red-800 font-semibold">로드 실패</p>
        <p className="text-sm text-red-600 mt-1">{error} — firestore.rules의 gyeolQuestionBank 배포 여부 확인</p>
      </div>
    );

  const remoteCount = [...remote.values()].length;
  const retiredCount = bank.filter((q) => q.retired).length;

  return (
    <div className="space-y-5">
      <Header
        title="결큐 질문 관리"
        subtitle={`총 ${bank.length}개 (원격 오버레이 ${remoteCount} · 은퇴 ${retiredCount}) — 저장하면 앱 배포 없이 다음 실행부터 반영`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="검색 — 질문·보기·태그·카테고리·id"
          className="flex-1 min-w-56 rounded-xl border border-gray-300 bg-white p-2.5 text-sm"
        />
        <button onClick={addNew} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">
          + 새 질문
        </button>
        {remoteCount === 0 && (
          <button
            onClick={seedAll}
            disabled={seeding}
            className="rounded-xl bg-gray-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {seeding ? '업로드 중…' : `번들 ${BUNDLED.length}개 시드`}
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
        {shown.map((q) => (
          <div key={q.id} className={`p-4 ${q.retired ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  <span className="font-mono text-xs text-gray-400 mr-1.5">#{q.id}</span>
                  {q.question_text || <em className="text-gray-400">(새 질문 — 편집해서 저장)</em>}
                  {q.retired && <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">은퇴</span>}
                  {q._source === 'remote' && !q.retired && (
                    <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">원격</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5">{q.category}</span>
                  {q.options.map((o) => `${o.id}. ${o.text}`).join('  ·  ')}
                </p>
                {q.condition && (
                  <p className="mt-0.5 text-[11px] text-amber-600">조건부: {q.condition.required_tag} 태그 보유자에게만</p>
                )}
              </div>
              <div className="flex flex-shrink-0 gap-1.5">
                <button
                  onClick={() => setEditing(editing === q.id ? null : q.id)}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-200"
                >
                  편집
                </button>
                <button
                  onClick={() => void toggleRetire(q)}
                  disabled={savingId === q.id}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                    q.retired ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-600 hover:bg-red-100'
                  }`}
                >
                  {q.retired ? '복구' : '은퇴'}
                </button>
              </div>
            </div>
            {editing === q.id && (
              <Editor q={q} onSave={(v) => void save(v)} onClose={() => setEditing(null)} saving={savingId === q.id} />
            )}
          </div>
        ))}
        {shown.length === 0 && <p className="p-6 text-sm text-gray-400 italic">검색 결과 없음</p>}
      </div>

      <p className="text-xs text-gray-400">
        💡 어떤 질문을 고칠지는 <b>결큐 인사이트</b>의 &ldquo;질문별 응답 분포&rdquo;에서 — 쏠림 80%+ 질문이 수정·은퇴 1순위.
        은퇴해도 기존 답변·태그는 유지되고 새 노출만 멈춥니다.
      </p>
    </div>
  );
}
