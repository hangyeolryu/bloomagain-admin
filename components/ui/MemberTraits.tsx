'use client';

// 이 회원은 어떤 분인가 — 결큐 답을 문장으로 되돌려 보여준다.
//
// 자리에 누구를 부를지 고를 때 필요한 건 `e_low`, `deep_talk` 같은 slug가
// 아니라 "조용한 카페가 편하다고 하신 분"이다.
//
// 답변 원문(users/{uid}/dailyQuestions)은 룰상 본인만 읽을 수 있어 어드민이
// 못 본다. 대신 루트 문서에 쌓이는 dailyQuestionTags로 되짚는다 — 선택지마다
// 태그가 서너 개씩 붙어 있어서, 한 질문의 어느 선택지 태그가 다 들어 있으면
// 그 답을 고르신 것이다. 태그가 겹쳐 두 선택지가 다 맞으면 판단을 접고
// 그 질문은 건너뛴다(틀린 문장을 보여주느니 안 보여주는 게 낫다).

import { useMemo, useState } from 'react';
import QUESTIONS from '@/lib/gyeolq-questions-full.json';

type Bank = {
  id: number;
  category: string;
  question_text: string;
  options: { id: string; text: string; tags: string[] }[];
}[];

function reconstruct(tags: string[]) {
  const has = new Set(tags);
  const byCategory = new Map<string, { q: string; a: string }[]>();
  let matched = 0;
  for (const q of QUESTIONS as Bank) {
    const hits = q.options.filter(
      (o) => (o.tags ?? []).length > 0 && (o.tags ?? []).every((t) => has.has(t)),
    );
    if (hits.length !== 1) continue; // 0개=안 푸심, 2개 이상=구분 불가
    matched++;
    const cat = (q.category || '기타').replace(/^성향\s*-\s*/, '').replace(/^트렌드\s*-\s*/, '');
    const list = byCategory.get(cat) ?? [];
    list.push({ q: q.question_text, a: hits[0].text });
    byCategory.set(cat, list);
  }
  return { byCategory: [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length), matched };
}

export default function MemberTraits({ tags }: { tags?: string[] | null }) {
  const [open, setOpen] = useState(false);
  const { byCategory, matched } = useMemo(() => reconstruct(tags ?? []), [tags]);

  if (!tags || tags.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-1">결큐로 본 성향</h2>
        <p className="text-sm text-gray-400">아직 결큐를 푸신 적이 없습니다.</p>
      </div>
    );
  }

  const shown = open ? byCategory : byCategory.slice(0, 4);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="font-semibold text-gray-900">결큐로 본 성향</h2>
      <p className="text-xs text-gray-400 mt-0.5 mb-4">
        본인이 고르신 답 {matched}개를 그대로 옮겼습니다. 해석이 아니라 답변입니다.
      </p>

      {byCategory.length === 0 ? (
        <p className="text-sm text-gray-400">
          태그 {tags.length}개가 있는데 어느 답이었는지 되짚지 못했습니다.
        </p>
      ) : (
        <div className="space-y-4">
          {shown.map(([cat, rows]) => (
            <div key={cat}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                {cat}
              </p>
              <ul className="space-y-1.5">
                {rows.map((r) => (
                  <li key={r.q} className="text-sm leading-snug">
                    <span className="text-gray-800">“{r.a}”</span>
                    <span className="block text-[11px] text-gray-400">{r.q}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {byCategory.length > 4 && (
            <button
              onClick={() => setOpen(!open)}
              className="text-xs font-semibold text-green-600 hover:text-green-700"
            >
              {open ? '접기' : `${byCategory.length - 4}개 분야 더 보기`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
