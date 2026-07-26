'use client';

// 티타 인사이트 (관계수업 시리즈) — 인스타 캐러셀 카드 미리보기·제작 화면
// ──────────────────────────────────────────────────────────────────────────
// 게시용 카드를 어드민에서 바로 넘겨보고, 한 장씩 화면 캡처(4:5, 1080×1350)해
// 인스타/스레드에 올린다. 데이터 조회 없음(정적) — 카피·출처는 이 파일에 정의.
//
// 디자인 원본: 인사이트 #01(외로움=담배 15개비) 표지 톤을 그대로 따른다.
//   블러시 배경 · 진초록/테라코타 로고 · 굵은 헤드라인(핵심어만 주황) ·
//   하단 '출처' + '넘겨보세요 ›' + 페이지 점.
//
// 카피 원칙(마케팅 운영 페이지 고정원칙과 동일):
//   · 겁주기 금지 — 잔잔한 자각 + 출구  · 성사 보장 금지  · 여성 전용 표현 금지
//   · 근거는 정직하게(출처 연도·기관 표기)  · 독자 라벨('중년/시니어') 대신 '5060'·행동 묘사
//
// 인사이트 #03 '5060의 주말' 근거:
//   · 서울시 1인가구 실태조사(서울연구원, 2022): 중장년(40~64세) 1인가구 외로움 65.4%
//     — 청년 59.0%·노년 64.7%보다 높아 '가장 외로운 세대'.
//   · 1인가구 여가는 주로 '혼자·미디어(TV·스마트폰)'에 치우침(국민여가활동·중고령 여가유형 연구).

import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/layout/Header';

// ── 디자인 토큰 (원본 표지에서 추출) ──────────────────────────────────────
const C = {
  blush: '#F6E4E2', // 카드 배경(블러시 핑크)
  ink: '#26221F', // 헤드라인(거의 검정)
  orange: '#C15A3C', // 강조·CTA(테라코타)
  forest: '#35503F', // 로고 진초록
  sub: '#8C807E', // 부제 회색
  source: '#9A8F8D', // 출처 회색
  badgeBg: '#EAD7D5', // 배지 배경
  badgeText: '#7C6F6D', // 배지 글씨
  dotOn: '#C15A3C',
  dotOff: '#D9C7C5',
};

// ── 데이터 모델 ────────────────────────────────────────────────────────────
type Seg = { t: string; hl?: boolean }; // 헤드라인 조각(hl이면 주황 강조)
interface Slide {
  head: Seg[][]; // 줄 단위 → 조각 단위
  sub?: string;
  source?: string;
  footer?: 'next' | 'cta';
  cta?: string;
}
interface Insight {
  no: string;
  series: string; // 배지 문구
  title: string; // 어드민 표시용 제목
  caption: string; // 인스타 본문
  hashtags: string;
  sources: { label: string; url?: string }[];
  posted?: boolean; // 이미 게시된 시리즈(참고용)
  note?: string;
  slides: Slide[];
}

const h = (...segs: Seg[]) => segs; // 줄 헬퍼
const t = (s: string): Seg => ({ t: s });
const o = (s: string): Seg => ({ t: s, hl: true });

const INSIGHTS: Insight[] = [
  {
    no: '03',
    series: '티타 인사이트 · 관계수업',
    title: '5060의 주말 — 가장 외로운 나이',
    caption:
      "주말이 유난히 길게 느껴진 적, 있으세요?\n\n" +
      '혼자 사는 5060, 3명 중 2명이 외로움을 느낀다고 해요. ' +
      '청년도 노년도 아닌 지금이, 실은 가장 외로운 나이예요.\n\n' +
      '친구가 없어서가 아니에요. 주말에 편하게 만날 친구가 없는 거죠.\n\n' +
      '티타는 결이 맞는 사람과 가까운 동네에서 차 한 잔 나누는 ‘주말 약속’을 만들어요.',
    hashtags: '#티타 #관계수업 #5060 #주말 #외로움 #1인가구 #동네친구 #차한잔',
    sources: [
      {
        label: '서울시 1인가구 실태조사 · 서울연구원 (2022) — 중장년(40~64세) 외로움 65.4%',
        url: 'https://eiec.kdi.re.kr/policy/domesticView.do?ac=0000168453',
      },
      {
        label: '중장년 1인가구 사회적 관계망 형성 지원 방안 · 서울시50플러스재단 (2021)',
        url: 'https://www.50plus.or.kr/upload/im/2021/11/c8b0aa4c-a133-4e52-840a-dc50bcef1b40.pdf',
      },
    ],
    slides: [
      {
        head: [h(t('외로움이 가장 큰')), h(t('나이는 ‘노년’이')), h(o('아니에요.'))],
        sub: '혼자인 주말, 지금이 가장 외로운 나이예요.',
        source: '서울시 1인가구 실태조사 · 서울연구원 (2022)',
        footer: 'next',
      },
      {
        head: [h(t('혼자 사는 5060,')), h(o('3명 중 2명'), t('이')), h(t('외로움을 느껴요.'))],
        sub: '청년 59.0% · 노년 64.7%보다 높은 65.4% — 가장 외로운 세대예요.',
        source: '서울시 1인가구 실태조사 (2022)',
        footer: 'next',
      },
      {
        head: [h(t('평일은 일이')), h(t('채워줘요. 하지만')), h(o('주말'), t('은 관계가.'))],
        sub: '약속이 없으면, 주말 하루가 통째로 비어요.',
        footer: 'next',
      },
      {
        head: [h(t('친구가 없는 게')), h(t('아니에요. ')), h(o('주말에 만날')), h(t('친구가 없는 거예요.'))],
        sub: '관계는 ‘몇 명’이 아니라 ‘언제 만나느냐’의 문제예요.',
        footer: 'next',
      },
      {
        head: [h(t('이번 주말,')), h(o('차 한 잔'), t(' 어때요?'))],
        sub: '결이 맞는 사람과 가까운 동네에서. 티타가 주말 약속을 만들어요.',
        footer: 'cta',
        cta: 'my.tita.app',
      },
    ],
  },
  {
    no: '01',
    series: '티타 인사이트 · 관계수업',
    title: '외로움 = 담배 15개비 (게시됨 · 디자인 원본)',
    posted: true,
    note: '이미 게시된 시리즈. 표지만 넣어 뒀어요 — #03이 이 톤을 그대로 따릅니다.',
    caption:
      "외로움이 ‘건강 문제’라는 말, 들어보셨어요?\n\n" +
      '사회적으로 고립되면 더 일찍 사망할 위험이 커진다고 해요.',
    hashtags: '#티타 #관계수업 #외로움 #사회적고립 #건강',
    sources: [{ label: 'Holt-Lunstad 외 · 30만 명 메타분석 (2010)' }],
    slides: [
      {
        head: [h(t('외로움의 사망 위험이')), h(t('담배 하루 '), o('15개비'), t('와')), h(t('맞먹어요.'))],
        sub: '사회적 고립은 이른 사망 위험을 크게 높여요.',
        source: 'Holt-Lunstad 외 · 30만 명 메타분석 (2010)',
        footer: 'next',
      },
    ],
  },
];

// ── 로고 (진초록 + 테라코타 겹친 원 + '티타') ─────────────────────────────
function TitaLogo() {
  return (
    <div className="flex items-center gap-2">
      <span className="relative inline-block" style={{ width: 34, height: 22 }}>
        <span
          className="absolute rounded-full"
          style={{ width: 22, height: 22, left: 0, background: C.orange }}
        />
        <span
          className="absolute rounded-full"
          style={{ width: 22, height: 22, left: 12, background: C.forest }}
        />
      </span>
      <span className="text-[19px] font-extrabold tracking-tight" style={{ color: C.ink }}>
        티타
      </span>
    </div>
  );
}

// ── 카드 한 장 (4:5, 인스타 1080×1350 비율) ───────────────────────────────
function Card({
  slide,
  index,
  total,
  series,
}: {
  slide: Slide;
  index: number;
  total: number;
  series: string;
}) {
  return (
    <div
      className="relative mx-auto flex w-full max-w-[420px] flex-col overflow-hidden rounded-[28px] px-8 py-9 shadow-sm"
      style={{ aspectRatio: '4 / 5', background: C.blush }}
    >
      {/* 상단: 로고 + 시리즈 배지 */}
      <div className="flex items-start justify-between">
        <TitaLogo />
        <span
          className="rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{ background: C.badgeBg, color: C.badgeText }}
        >
          {series}
        </span>
      </div>

      {/* 중앙: 헤드라인 + 부제 */}
      <div className="flex flex-1 flex-col justify-center">
        <h3 className="text-[30px] font-extrabold leading-[1.22] tracking-tight" style={{ color: C.ink }}>
          {slide.head.map((line, li) => (
            <span key={li} className="block">
              {line.map((seg, si) => (
                <span key={si} style={seg.hl ? { color: C.orange } : undefined}>
                  {seg.t}
                </span>
              ))}
            </span>
          ))}
        </h3>
        {slide.sub && (
          <p className="mt-4 text-[15px] font-medium leading-relaxed" style={{ color: C.sub }}>
            {slide.sub}
          </p>
        )}
      </div>

      {/* 하단: 출처 / CTA + 넘겨보세요 + 페이지 점 */}
      <div className="flex items-end justify-between">
        <div className="min-w-0">
          {slide.source && (
            <p className="text-[12px]" style={{ color: C.source }}>
              <span className="font-bold">출처</span> {slide.source}
            </p>
          )}
          {slide.footer === 'cta' ? (
            <p className="mt-2 text-[15px] font-extrabold" style={{ color: C.orange }}>
              {slide.cta} ↓
            </p>
          ) : (
            <p className="mt-2 text-[14px] font-bold" style={{ color: C.orange }}>
              넘겨보세요 ›
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-[13px] font-semibold" style={{ color: C.source }}>
            {index + 1}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className="h-[6px] w-[6px] rounded-full"
                style={{ background: i === index ? C.dotOn : C.dotOff }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 페이지 ─────────────────────────────────────────────────────────────────
export default function TitaInsightPage() {
  const [insightIdx, setInsightIdx] = useState(0);
  const [slideIdx, setSlideIdx] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  const insight = INSIGHTS[insightIdx];
  const total = insight.slides.length;

  const go = useCallback(
    (d: number) => setSlideIdx((s) => Math.min(total - 1, Math.max(0, s + d))),
    [total]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard 미지원 */
    }
  };

  const fullCaption = `${insight.caption}\n\n${insight.hashtags}`;

  return (
    <div className="space-y-5">
      <Header
        title="티타 인사이트"
        subtitle="관계수업 시리즈 — 인스타 캐러셀 카드를 넘겨보고 한 장씩 캡처(4:5)해서 게시"
      />

      {/* 인사이트 선택 탭 */}
      <div className="flex flex-wrap gap-2">
        {INSIGHTS.map((ins, i) => (
          <button
            key={ins.no}
            onClick={() => {
              setInsightIdx(i);
              setSlideIdx(0);
            }}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              i === insightIdx
                ? 'border-green-600 bg-green-50 text-green-700'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            #{ins.no}
            {ins.posted && <span className="ml-1 text-xs font-medium text-gray-400">게시됨</span>}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,440px)_1fr]">
        {/* 왼쪽: 카드 미리보기 + 네비 */}
        <div>
          <Card slide={insight.slides[slideIdx]} index={slideIdx} total={total} series={insight.series} />

          {/* 네비게이션 */}
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => go(-1)}
              disabled={slideIdx === 0}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40 hover:bg-gray-50"
            >
              ‹ 이전
            </button>
            <div className="flex items-center gap-2">
              {insight.slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSlideIdx(i)}
                  aria-label={`슬라이드 ${i + 1}`}
                  className="h-2.5 w-2.5 rounded-full transition-colors"
                  style={{ background: i === slideIdx ? C.orange : '#D8D8D8' }}
                />
              ))}
            </div>
            <button
              onClick={() => go(1)}
              disabled={slideIdx === total - 1}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40 hover:bg-gray-50"
            >
              다음 ›
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-gray-400">
            슬라이드 {slideIdx + 1} / {total} · ← → 방향키로도 넘길 수 있어요
          </p>
        </div>

        {/* 오른쪽: 본문/해시태그/출처 */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">{insight.title}</h2>
              {insight.posted && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                  게시 완료
                </span>
              )}
            </div>
            {insight.note && <p className="mb-3 text-xs text-amber-700">💡 {insight.note}</p>}

            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">인스타 본문</span>
              <button
                onClick={() => copy(fullCaption, 'caption')}
                className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-100"
              >
                {copied === 'caption' ? '복사됨 ✓' : '본문+태그 복사'}
              </button>
            </div>
            <p className="whitespace-pre-line rounded-xl bg-gray-50 p-3 text-sm leading-relaxed text-gray-700">
              {insight.caption}
            </p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-green-700">{insight.hashtags}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-bold text-gray-900">출처 (정직 원칙 — 연도·기관 표기)</h2>
            <ul className="space-y-1.5 text-sm text-gray-700">
              {insight.sources.map((s) => (
                <li key={s.label} className="flex gap-1.5">
                  <span className="text-gray-400">·</span>
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-green-700 hover:underline"
                    >
                      {s.label} ↗
                    </a>
                  ) : (
                    <span>{s.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-bold text-gray-900">게시 팁</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-600">
              <li>카드는 인스타 세로형 <b>4:5 (1080×1350)</b> 비율 — 한 장씩 화면 캡처해서 캐러셀로 올려요.</li>
              <li>순서: 훅(표지) → 숫자 → 왜 주말 → 재해석 → 차 한 잔(CTA). 마지막 장에 앱 주소.</li>
              <li>링크는 본문이 아니라 <b>프로필 링크/첫 댓글</b>에 — 인스타 본문 링크는 클릭이 안 돼요.</li>
              <li>스레드용은 <b>표지 한 장 + 글</b>로 변형(마케팅 운영 페이지 리듬과 동일).</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
