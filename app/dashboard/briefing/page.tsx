'use client';

// 사업계획·IP 브리핑 (초기창업패키지 / 7-8 멘토링용)
// ──────────────────────────────────────────────────────────────────────────
// 어드민에서 바로 펼쳐 화면공유·낭독할 수 있는 브리핑 페이지.
// 특히 IP(특허) 파트를 상세히 — 멘토가 인텔렉추얼디스커버리(IP 전문)라
// 특허가 대화 중심이 될 가능성이 크다. 정적 콘텐츠(데이터 조회 없음).
// 원문 문서: bloomagain-korea/docs/finance/사업계획_티타_2026_07.md,
//            mentoring_prep_2026_07_08.md, chochangpackage_plan_2026_07.md

import Header from '@/components/layout/Header';

function SectionCard({
  id,
  title,
  accent,
  children,
}: {
  id?: string;
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
      <h2 className={`text-base font-bold ${accent ?? 'text-gray-900'} mb-3`}>{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

function Pill({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'green' | 'amber' | 'blue' }) {
  const tones: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-700',
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

const NAV = [
  { id: 'talk', label: '입 풀기(소개)' },
  { id: 'ip', label: '⭐ IP 전략' },
  { id: 'ip-qa', label: '⭐ 특허 예상 Q&A' },
  { id: 'ask', label: '멘토에게 물을 것' },
  { id: 'qa', label: '예상 Q&A' },
  { id: 'traction', label: '트랙션' },
  { id: 'plan', label: '사업계획 요약' },
  { id: 'checklist', label: '오늘 밤 준비물' },
];

// 특허 전문 멘토(인텔렉추얼디스커버리)가 파고들 만한 실무 IP 질문 + 정직·단단한 답변.
// 원칙: 약점을 먼저 인정하고 자문을 구한다("→ 되물을 것"). 방어 X, 코칭 O.
const PATENT_QA: { q: string; tag: string; a: React.ReactNode; ask?: string }[] = [
  {
    q: '이미 본인인증 + AI 위험탐지 하는 서비스 많은데, 뭐가 신규성인가요?',
    tag: '신규성',
    a: (
      <>개별 요소(본인인증/위험탐지/신고)가 아니라, <b>4계층이 하나의 파이프라인으로 결합</b>돼
        위험점수가 <b>UI 상태와 매칭 그래프에 되먹임되는 폐루프</b> 구조가 신규점입니다. 요소의
        존재가 아니라 <b>신호 결합 방식·데이터 흐름·상태 전이</b>를 청구항으로 한정합니다.</>
    ),
    ask: '독립항을 이 "결합·피드백" 구성으로 좁게 가는 게 맞을까요, 아니면 더 넓혀야 할까요?',
  },
  {
    q: '선행기술 조사는 했나요? 데이팅앱(틴더·범블), 금융 FDS가 인용될 텐데요.',
    tag: '선행기술',
    a: (
      <>우선심사 청구하며 검토했습니다. <b>데이팅앱</b>은 본인인증·신고는 있으나 위험점수→UI
        적응→매칭 피드백의 <b>결합 폐루프가 아니고</b>, <b>금융 FDS</b>는 거래 도메인이라 대인관계
        안전 신호(대화패턴·외부채널 유도·프로필-행동 불일치)와 <b>UI 적응이 없습니다</b>. 이
        차별점을 종속항으로 두껍게 깔았습니다.</>
    ),
    ask: '추가로 봐야 할 선행기술 군(예: 온라인 안전·모더레이션 특허)이 있을까요?',
  },
  {
    q: '"안전 방법"이면 BM(영업방법) 특허라 발명 적격성 거절 리스크 있지 않나요?',
    tag: '적격성',
    a: (
      <>단순 영업방법이 아니라 <b>위험점수 산출 알고리즘 · UI 상태 전이 엔진 · 매칭 그래프
        갱신</b> 같은 <b>기술적 수단</b>으로 구현·기재했습니다. 데이터 처리·시스템 구성으로 청구해
        "컴퓨터로 구현된 기술적 과제 해결"로 포지셔닝합니다.</>
    ),
    ask: '최근 심사기준상 AI/소프트웨어 발명 적격성을 확실히 넘기려면 명세서에 뭘 더 넣어야 하나요?',
  },
  {
    q: '독립항이 소프트웨어 기능 나열이면 거절되기 쉬운데, 범위는 어떤가요?',
    tag: '청구항 범위',
    a: (
      <>기능 나열이 아니라 <b>신호 결합 + 위험도-연동 상태 전이 + 신고 피드백 루프</b>라는 기술적
        구성으로 한정했습니다. 너무 넓으면 선행기술로 거절, 너무 좁으면 회피가 쉬워 <b>독립항
        범위 최적점</b>을 멘토께 자문하려 합니다.</>
    ),
    ask: '독립항 범위 vs 회피가능성, 어디에 선을 긋는 게 이 분야에서 유리할까요?',
  },
  {
    q: '경쟁사가 4계층 중 하나만 빼면 회피(design-around)되지 않나요?',
    tag: '회피설계',
    a: (
      <>그래서 <b>독립항은 최소 필수 결합</b>으로, <b>종속항으로 두껍게</b> 깔고, 어느 계층을 빼도
        <b>안전성이 붕괴되도록 상호의존적</b>으로 청구하는 방향입니다. 이게 청구항 강화 <b>1순위</b>
        자문 주제입니다.</>
    ),
    ask: '상호의존 구조를 청구항에 녹여 회피를 어렵게 하는 좋은 작성 패턴이 있을까요?',
  },
  {
    q: '청구항을 명세서가 충분히 뒷받침하나요? 실제 구현돼 있나요?',
    tag: '실시가능성',
    a: (
      <>네 — <b>4계층 전부 앱에 구현·운영 중</b>입니다(정식 출시). 실행 증거가 곧 실시예라, 명세서
        뒷받침·기재요건 측면에서 유리합니다. <b>청구항–명세서 정합 점검</b>을 멘토께 부탁드립니다.</>
    ),
    ask: '실제 운영 로그·구현 스크린샷을 명세서 보정에 활용할 수 있을까요?',
  },
  {
    q: '소프트웨어 특허는 침해 입증이 어려운데, 진짜 방어 실효성이 있나요?',
    tag: '엔포스먼트',
    a: (
      <>특허 <b>단독</b>이 아니라 <b>특허 + 영업비밀(위험점수 가중치·임계값) + 데이터 종단성 +
        커뮤니티 신뢰</b>의 결합 해자로 봅니다. 특허의 실효는 소송보다 <b>투자 실사·B2G 협상·
        라이선싱 지렛대</b>에서 더 큽니다(금융권 안전모듈 라이선스 등).</>
    ),
    ask: '소프트웨어 특허를 협상·투자 자산으로 극대화하려면 어떻게 문서화·평가받아야 하나요?',
  },
  {
    q: '발명자·권리 귀속은 정리됐나요? 1인 기업이라 회사 승계 처리가 됐나요?',
    tag: '권리귀속',
    a: (
      <>발명자는 저(대표), 권리는 <b>법인 ㈜이프이프로 승계</b>하는 구조입니다. 1인이라 이해상충은
        없지만, <b>직무발명 규정·양도 서류</b>를 정식으로 갖춰두는 게 향후 실사에 유리한지 확인하려
        합니다.</>
    ),
    ask: '투자·M&A 실사를 대비해 지금 정비해둘 IP 서류(직무발명·양도·계약)는 뭘까요?',
  },
  {
    q: 'PA260003 하나로 충분한가요? 포트폴리오 전략은?',
    tag: '포트폴리오',
    a: (
      <><b>2축 포트폴리오</b>입니다 — PA260003(안전·방어) + PA260006(고립 조기 시그널, 제품·B2G
        확장). <b>분할·연속 출원</b>으로 청구범위를 다층화할지 검토 중입니다.</>
    ),
    ask: 'PA260003에서 분할출원으로 청구항을 나눠 담는 게 유리한 시점일까요?',
  },
  {
    q: '1인 기업이 PCT·해외출원 비용을 감당되나요? 어느 국가로?',
    tag: 'PCT·비용',
    a: (
      <>초기창업패키지 IP 예산 <b>15–20%</b>를 특허에 배정합니다. 글로벌은 <b>미국(재외동포 최다)</b>
        중심으로 보고, <b>PCT로 국가 결정을 유예</b>하며 우선일 12개월 내 판단하려 합니다.</>
    ),
    ask: 'PCT vs 개별국 직접출원, 이 단계 스타트업엔 어느 쪽이 비용 대비 실익이 큰가요?',
  },
];

export default function BriefingPage() {
  return (
    <div>
      <Header
        title="사업계획·IP 브리핑"
        subtitle="초기창업패키지 · 7/8(수) 11:00 멘토링 — 멘토: 김한솔 팀장(인텔렉추얼디스커버리, IP 전문)"
        action={
          <button
            onClick={() => window.print()}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            🖨️ 인쇄 / PDF
          </button>
        }
      />

      {/* 앵커 네비 */}
      <nav className="mb-5 flex flex-wrap gap-2">
        {NAV.map((n) => (
          <a
            key={n.id}
            href={`#${n.id}`}
            className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            {n.label}
          </a>
        ))}
      </nav>

      {/* 마음가짐 배너 */}
      <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <b>자리 성격:</b> 평가가 아니라 <b>사업계획서 고도화 코칭</b>. 방어하지 말고 <b>약점을 먼저 꺼내
        자문을 구한다</b>(리텐션·성비·본인인증 전환). 멘토가 <b>IP 전문가</b>다 → <b>특허로 대화를 열고</b>,
        고급 자문을 뽑아내는 자리. 1인 파운더가 이미 <b>정식 출시·운영 중</b> = 실행력의 직접 증거(반복 강조).
        · 5분 전 입장(10:55), 조용한 곳·헤드셋.
      </div>

      <div className="space-y-4">
        {/* 입 풀기 */}
        <SectionCard id="talk" title="1. 입 풀기 — 회사 소개 (외워두기)">
          <p className="rounded-xl bg-gray-50 p-3">
            <b>[30초]</b> "티타는 만 45세 이상이 <b>사기 걱정 없이 결(성향)이 맞는 친구</b>를 만나는
            앱입니다. NICE 본인인증과 <b>특허 출원한 4계층 안전 시스템</b>으로 여성이 가장 안심하는 구조를
            만들고, <b>매일 한 질문(결큐)</b>으로 결이 맞는 사람을 찾아줍니다. App Store·Google Play 정식
            출시·운영 중이고, <b>1인 풀스택</b>으로 개발·운영합니다."
          </p>
          <p>
            <b>[2분]</b> 왜(어머니 케이스 · 한국 60대+ 외로움 OECD 2배) → 차별화(시놀 9만·남성 70%·데이팅
            톤 / 우리는 <b>여성 신뢰 병목을 안전 특허로 정조준</b>) → BM(B2C 구독 + B2G·데이터 4레이어) →
            트랙션(스레드 획득 검증 · 결 테스트 상시 유입 · 데이터 인프라) → 글로벌(해외 한인 Sumsub) 방향.
          </p>
        </SectionCard>

        {/* ⭐ IP 전략 — 상세 */}
        <SectionCard id="ip" title="2. ⭐ IP 전략 — 특허 (이 자리의 중심)" accent="text-green-700">
          <div className="flex flex-wrap gap-2">
            <Pill tone="green">PA260003 · 4계층 안전 (우선심사)</Pill>
            <Pill tone="blue">PA260006 · 고립 조기 시그널 (준비)</Pill>
            <Pill tone="amber">PCT / 해외출원 (글로벌 대비)</Pill>
          </div>

          {/* PA260003 */}
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="mb-2 font-semibold text-gray-900">PA260003 — 4계층 안전 시스템 <span className="text-gray-400 font-normal">(핵심 해자)</span></h3>
            <p className="mb-2">
              구조: <b>① NICE 본인인증(CI)</b> → <b>② AI 위험 점수</b> → <b>③ 적응형 UI</b> → <b>④ 멤버
              상호 보호</b>. 각 계층이 독립이 아니라 <b>하나의 파이프라인으로 결합</b>되어 있다는 점이
              발명의 핵심.
            </p>
            <p className="mb-1 font-medium text-gray-800">청구항 강화 방향 (회피설계를 어렵게):</p>
            <ol className="ml-4 list-decimal space-y-1.5">
              <li>
                <b>독립항 = 복수 신호원 결합.</b> "본인인증만" "AI 점수만" 같은 <b>단일 신호로는 회피
                불가</b>하도록, CI + 행동 위험점수 + 적응형 UI 상태 + 멤버 신고를 <b>하나의 결합 청구항</b>으로.
              </li>
              <li>
                <b>AI 위험 점수 입력 피처를 종속항으로 촘촘히.</b> 결제·송금 유도 언어, 외부 채널 유도,
                프로필-행동 불일치, 대화 속도·패턴 등 <b>구체 피처를 fallback 종속항</b>으로 깔아 우회 지점 봉쇄.
              </li>
              <li>
                <b>적응형 UI = 위험도-연동 상태 전이.</b> 위험 점수에 따라 노출/경고/차단으로 <b>인터페이스가
                동적으로 바뀌는</b> 것을 "위험도 연동 UI 상태 전이"로 청구(단순 차단과 구분되는 신규성).
              </li>
              <li>
                <b>멤버 상호 보호 = 피드백 루프.</b> 신고·차단이 <b>매칭 그래프·추천에 되먹임</b>되어 위험
                사용자의 노출이 시스템 차원에서 축소되는 루프를 청구.
              </li>
              <li>
                <b>결큐(성향 매칭) + 안전 결합.</b> 성향 임베딩과 위험 점수를 <b>함께 쓰는 매칭</b>으로,
                제품 실체(결큐)와 청구항을 정렬 → 명세서-청구항 정합성 확보.
              </li>
            </ol>
            <p className="mt-2 rounded-lg bg-green-50 p-2.5 text-green-800">
              <b>멘토 활용 1순위:</b> ① 독립항 범위 vs 회피가능성 진단 ② 종속항 fallback 설계 ③ 청구항–명세서
              정합 점검 ④ 선행기술·FTO(freedom to operate) 대비. <b>우선심사 진행 중</b>이라 지금이 보정 타이밍.
            </p>
          </div>

          {/* PA260006 */}
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="mb-2 font-semibold text-gray-900">PA260006 — 사회적 고립 조기 시그널 <span className="text-gray-400 font-normal">(포트폴리오 확장)</span></h3>
            <p>
              결큐 응답 패턴·활동 빈도·웰빙 측정(PHQ-2·Cantril) <b>변화로 고립 위험을 조기 감지</b>해 개입을
              트리거하는 발명. <b>B2G·보험 자산화에 직접 연결</b>(외로움 ↓ 근거) → L2/L4 매출 레이어의 IP 근거.
              멘토에게 <b>출원 방향·우선순위·PA260003과의 포트폴리오 배치</b>를 자문.
            </p>
          </div>

          {/* PCT */}
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="mb-2 font-semibold text-gray-900">PCT / 해외출원 <span className="text-gray-400 font-normal">(글로벌 방향이라 타이밍이 중요)</span></h3>
            <p>
              해외 한인(diaspora)으로 확장하므로 <b>우선일로부터 12개월 내 PCT 여부</b>를 결정해야 함. 진입
              후보국: <b>미국</b>(재외동포 최다) 등 한인 밀집국. 멘토에게 <b>PCT 타이밍·국가전략·비용 규모·
              초기창업패키지 IP 예산과의 정합</b>을 자문(§ 사업비 15–20% 특허 배정).
            </p>
          </div>

          {/* 자산화 */}
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="mb-2 font-semibold text-gray-900">특허 자산화 <span className="text-gray-400 font-normal">(투자·B2G 지렛대)</span></h3>
            <p>
              특허를 <b>투자 실사의 IP 가치 · B2G 협상 지렛대 · IP 가치평가(기술보증기금 등)</b>로 활용.
              멘토에게 <b>IP 실사 대비 문서화·가치평가 루트</b>를 자문. "코드가 아니라 검증된 45+ 네트워크 +
              특허 해자 + 종단 데이터를 산다"는 exit 논리의 한 축.
            </p>
          </div>
        </SectionCard>

        {/* 특허 예상 Q&A */}
        <SectionCard id="ip-qa" title="2-B. ⭐ 특허 예상 Q&A (전문 멘토 대비)" accent="text-green-700">
          <p className="text-gray-600">
            멘토가 IP 전문가라 <b>신규성·선행기술·적격성·회피설계</b>를 파고들 수 있음. 방어하지 말고
            <b> 약점을 먼저 인정하며 자문을 구하는</b> 톤으로. 각 답변 아래 <span className="text-green-700 font-medium">→ 되물을 것</span>을 던지면 코칭이 나온다.
          </p>
          <div className="space-y-3">
            {PATENT_QA.map((item, i) => (
              <div key={i} className="rounded-xl border border-gray-200 p-4">
                <div className="mb-1.5 flex items-start gap-2">
                  <Pill tone="amber">{item.tag}</Pill>
                  <p className="font-semibold text-gray-900">Q{i + 1}. {item.q}</p>
                </div>
                <p className="text-gray-700">{item.a}</p>
                {item.ask && (
                  <p className="mt-2 rounded-lg bg-green-50 p-2.5 text-green-800">
                    <b>→ 되물을 것:</b> {item.ask}
                  </p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 물어볼 것 */}
        <SectionCard id="ask" title="3. 멘토에게 물어볼 것 (수동청취 X, 자문 요청 O)">
          <p className="font-medium text-gray-800">A. IP 전략 (최우선 — 멘토 전공)</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>4계층 안전 특허(PA260003) <b>청구항을 어떻게 강화</b>해야 해자가 단단해질까요?</li>
            <li>PA260006(고립 조기 시그널) <b>추가 출원 방향·우선순위</b>는?</li>
            <li>글로벌 확장 계획이라 <b>PCT·해외출원 타이밍</b>은 언제가 좋을까요?</li>
            <li>특허를 <b>투자·B2G 협상 자산</b>으로 어떻게 활용/평가받나요? (IP 실사·가치평가)</li>
          </ol>
          <p className="mt-2 font-medium text-gray-800">B. 사업계획서 고도화</p>
          <ol className="ml-4 list-decimal space-y-1" start={5}>
            <li>B2C 외 <b>B2G·데이터 4레이어</b> 중 심사·투자 설득력엔 <b>뭘 1순위</b>로?</li>
            <li>획득(스레드)은 되는데 <b>리텐션·본인인증 전환이 병목</b>. <b>KPI로 어떤 지표</b>를 잡아야 하나요?</li>
            <li><b>사업비 배분</b>(개발/마케팅/특허/운영) 권장 비율은?</li>
          </ol>
        </SectionCard>

        {/* 예상 Q&A */}
        <SectionCard id="qa" title="4. 예상 질문 → 답변 요지">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-3 font-medium">질문</th>
                  <th className="py-2 font-medium">답변 요지</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 align-top">
                {[
                  ['경쟁·차별화?', '시놀(9만·남성 70%·데이팅 톤). 우리는 여성 신뢰 병목을 특허 안전기술 + 그룹우선·본인인증으로 정조준'],
                  ['타깃?', '만 45세 이상, 특히 자녀 독립한 여성. 해외 한인까지 확장(Sumsub 2트랙)'],
                  ['매출/BM?', 'Plus 19,900/월 + 창립멤버 + B2G·데이터 4레이어. 5년 65~90억(Mon Ami 시간선 정합)'],
                  ['트랙션?', '정식 출시·운영 중. 스레드 창업스토리 7,000뷰→인증가입, 첫 코호트 91%가 45+. 무가입 결 테스트 상시 유입(완료 44+)·실시간 대시보드'],
                  ['팀?', '1인 풀스택(엔지니어 10년+·실리콘밸리 경력). 시니어 운영 인력 채용 계획'],
                  ['해자?', 'NICE + 4계층 안전 특허(PA260003) + 종단 웰빙 데이터(외로움/PHQ)'],
                  ['리스크?', '성비(남초 경향)·리텐션(본인인증 벽)·밀도 — 대응책 보유(여성각도·연속성·기관파일럿)'],
                  ['마일스톤?', '여성 W4 잔존 · 본인인증 전환율 · B2G 파일럿(은평·마포·50플러스 제안 발송)'],
                ].map(([q, a]) => (
                  <tr key={q}>
                    <td className="py-2 pr-3 font-medium text-gray-800 whitespace-nowrap">{q}</td>
                    <td className="py-2 text-gray-700">{a}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* 트랙션 */}
        <SectionCard id="traction" title="5. 최신 트랙션 (말할 거리 — 오늘 기준)">
          <ul className="ml-4 list-disc space-y-1">
            <li>App Store·Google Play <b>정식 출시·운영 중</b></li>
            <li>스레드 획득 검증: 창업스토리 <b>7,000뷰 → 인증가입</b>, 첫 코호트 <b>91%가 45+</b> (얼굴·개인서사가 제품 카드뉴스 대비 약 30배 도달)</li>
            <li>무가입 <b>결 유형 테스트</b>(획득 훅): 완료 44·공유 9, 상시 유입 + 실시간 어드민 집계</li>
            <li>데이터 인프라: <b>BigQuery 파이프라인</b>, 온보딩 드롭오프 분석</li>
            <li><b>B2G 진행:</b> 은평·마포 1인가구센터·50플러스재단 파일럿 제안 발송</li>
            <li><b>글로벌:</b> Sumsub 비즈니스 리뷰·토큰 발급 완료, 2트랙(NICE+글로벌) 착수</li>
            <li>특허: <b>PA260003</b> 4계층 안전(우선심사), <b>PA260006</b> 준비</li>
          </ul>
        </SectionCard>

        {/* 사업계획 요약 */}
        <SectionCard id="plan" title="6. 사업계획 요약 (4레이어 BM · 5년 재무)">
          <p>
            <b>한 줄:</b> 만 45세 이상(해외 한인 포함)이 사기 걱정 없이 결이 맞는 친구를 만나는 앱. NICE +
            특허 4계층 위에 매일 한 질문(결큐)으로 "나와 결 맞는 사람이 어딘가 있을까?"를 풀어준다.
          </p>
          <div className="rounded-xl bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-700">
            L4 (3–5년) 임상·정책 검증 — 건보·심평원 시범, 보험 부가급여{'\n'}
            L3 (2–3년) 제휴 로열티 (AARP 모델){'\n'}
            L2 (1–2년) 리서치 패널 + 데이터 라이센싱 (한국 유일 45+ 종단 코호트){'\n'}
            L1 (메인)   B2G/B2B SaaS + B2C 구독
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-3 font-medium">시나리오</th>
                  <th className="py-2 pr-3 font-medium">Y1</th>
                  <th className="py-2 pr-3 font-medium">Y3</th>
                  <th className="py-2 font-medium">Y5</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr><td className="py-2 pr-3 font-medium">베이스</td><td className="py-2 pr-3">약 1.5억</td><td className="py-2 pr-3">약 22억</td><td className="py-2 font-semibold text-green-700">약 65억</td></tr>
                <tr><td className="py-2 pr-3 font-medium">낙관</td><td className="py-2 pr-3">약 2억</td><td className="py-2 pr-3">약 33억</td><td className="py-2 font-semibold text-green-700">약 90억</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">
            벤치마크: Mon Ami $5.9M(≈80억)·5년차 / AARP 로열티 $1.1B(회원비 3.8배) / 시놀 9만·남성 70%·2030 목표 100억.
            원문: <code>bloomagain-korea/docs/finance/사업계획_티타_2026_07.md</code>
          </p>
        </SectionCard>

        {/* 체크리스트 */}
        <SectionCard id="checklist" title="7. 오늘 밤 준비물">
          <ul className="ml-1 space-y-1.5">
            {[
              '초기창업패키지 협약 사업계획서 최신본 열어두기 (멘토가 섹션별로 볼 것)',
              'IR deck — "다시봄"→"티타" 최신화 확인 (옛 이름 남아있으면 어색). 없으면 이 브리핑으로 대체 가능',
              '특허 출원번호 PA260003 메모 (IP 질문 대비)',
              '§3 질문 3~4개 프린트/메모',
              'Zoom 링크 테스트 → 10:55 입장, 조용한 곳·헤드셋',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <span className="mt-0.5 text-gray-400">☐</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-xl bg-green-50 p-3 text-green-800">
            <b>한 줄:</b> 멘토가 IP 전문가다 → <b>특허로 대화를 열고, 리텐션·본인인증 전환 약점을 먼저 꺼내
            자문을 받아라.</b> 방어 말고 코칭을 뽑아내는 자리.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
