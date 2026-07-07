'use client';

/**
 * 문서 허브 — 전략 아티팩트·사업계획·제품 스펙·GTM 문서를 한 곳에서.
 * 아티팩트는 claude.ai 링크, 마크다운은 GitHub(main) 링크 — 항상 최신본을
 * 가리키도록 사본을 두지 않는다.
 */

import Header from '@/components/layout/Header';

interface DocLink {
  title: string;
  desc: string;
  href: string;
  badge?: string;
}

const GH = 'https://github.com/hangyeolryu/bloomagain-korea/blob/main';

const GROUPS: { name: string; icon: string; docs: DocLink[] }[] = [
  {
    name: '전략 (아티팩트)',
    icon: '🧭',
    docs: [
      {
        title: 'Rev 3.1 — 무엇을 더 지어야 하고, 돈은 어떻게 흐르는가',
        desc: '마케팅 자동화 툴 7종 · 5개년 재무(스트레스 시나리오·민감도) · 사업계획서(PSST) 전문',
        href: 'https://claude.ai/code/artifact/e426c39f-554a-4c07-9a7f-2415b17c0daa',
        badge: '최신',
      },
      {
        title: 'Rev 2.1 — 어디까지 왔고, 어떻게 exit까지 가는가',
        desc: '전략 감사 · 벤치마크(Timeleft·Peanut·Mon Ami·오뉴) · 게이트 로드맵 · Plan-B 트리',
        href: 'https://claude.ai/code/artifact/7e64189e-e533-4fb1-a5e5-b6524d48fd27',
      },
    ],
  },
  {
    name: '사업·재무',
    icon: '💼',
    docs: [
      {
        title: '초기창업패키지 멘토링 준비 (7/8)',
        desc: 'IP 전문 멘토 대응 — 특허 질문 리스트 · 예상 Q&A · 최신 트랙션',
        href: `${GH}/docs/finance/mentoring_prep_2026_07_08.md`,
      },
      {
        title: '시니어 임팩트 펠로우십 사업계획서 (05월)',
        desc: '4레이어 BM · 소셜미션 · 임팩트 벤치마크 원문',
        href: `${GH}/docs/finance/dasibom_business_plan_2026_05.md`,
      },
      {
        title: '은평·50플러스 파일럿 1-pager',
        desc: 'B2G 파일럿 제안서 (7/14 후속 예정)',
        href: `${GH}/docs/finance/pilot_1pager_eunpyeong_50plus_2026_07.md`,
      },
      {
        title: 'IR 덱 (05월)',
        desc: '투자자용 — 다음 개정 때 티타 리브랜드 반영 필요',
        href: `${GH}/docs/finance/dasibom_ir_deck_2026_05.md`,
      },
    ],
  },
  {
    name: '제품·LLM',
    icon: '🤖',
    docs: [
      {
        title: 'TITA LLM 로드맵',
        desc: 'Phase 0~4 · 데이터 트랙 · 진행 현황 / 기능 백로그 — LLM 작업의 단일 진실',
        href: `${GH}/docs/product/llm_roadmap.md`,
        badge: '핵심',
      },
      {
        title: 'LLM 관찰 체크리스트',
        desc: '데이터 쌓인 뒤 판단할 것 — 매주/2주/4주 주기. AI 검수 페이지와 함께 사용',
        href: `${GH}/docs/product/llm_observation_checklist.md`,
      },
      {
        title: '의도·안전 도우미 스펙 (이 메시지 봐드릴게요)',
        desc: '3블록 카드 · 보수 판정 원칙 · MVP 컷라인',
        href: `${GH}/docs/product/scam_intent_helper_spec.md`,
      },
      {
        title: '티타임 스펙',
        desc: '3–4인 동성 결모임 — 밀도 게이트 뒤에서 대기 중',
        href: `${GH}/docs/product/TITATIME_SPEC.md`,
      },
      {
        title: '수익화 원칙',
        desc: '무엇을 영원히 무료로 두는가 (모임 참여·안전)',
        href: `${GH}/docs/MONETIZATION_PRINCIPLES.md`,
      },
    ],
  },
  {
    name: '마케팅·GTM',
    icon: '📣',
    docs: [
      {
        title: 'GTM 플랜',
        desc: '전체 go-to-market 골격',
        href: `${GH}/docs/GTM_PLAN.md`,
      },
      {
        title: 'ASO (07월)',
        desc: '스토어 검색 최적화 — "중년" 낙인 회피 원칙 포함',
        href: `${GH}/docs/marketing/ASO_2026_07.md`,
      },
      {
        title: '결 유형 테스트 소셜 카피',
        desc: '스레드·인스타 게시글 (무가입 획득 훅)',
        href: `${GH}/docs/marketing/GYEOL_TEST_SOCIAL_2026_07.md`,
      },
      {
        title: '기관 채널 (07월)',
        desc: '복지관·50플러스 등 institutional 아웃리치 채널 목록',
        href: `${GH}/docs/marketing/INSTITUTIONAL_CHANNELS_2026_07.md`,
      },
      {
        title: '스레드 페이스 시리즈',
        desc: '파운더 콘텐츠 앵글 시리즈 (성비 레버)',
        href: `${GH}/docs/marketing/THREADS_FACE_SERIES_2026_07.md`,
      },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <Header
        title="문서"
        subtitle="전략·사업·제품·마케팅 문서 모음. 마크다운은 GitHub main 브랜치를 직접 가리켜 항상 최신본입니다."
      />
      {GROUPS.map((g) => (
        <section key={g.name} className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">
            {g.icon} {g.name}
          </h2>
          <div className="divide-y divide-gray-50">
            {g.docs.map((d) => (
              <a
                key={d.href}
                href={d.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 py-3 group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 group-hover:text-green-700">
                    {d.title}
                    {d.badge && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold bg-green-100 text-green-800 rounded">
                        {d.badge}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{d.desc}</p>
                </div>
                <span className="text-gray-300 group-hover:text-green-600 text-sm mt-0.5">↗</span>
              </a>
            ))}
          </div>
        </section>
      ))}
      <p className="text-xs text-gray-400">
        GitHub 링크는 로그인된 계정에 저장소 접근 권한이 있어야 열립니다. 아티팩트는 claude.ai 로그인 필요.
      </p>
    </div>
  );
}
