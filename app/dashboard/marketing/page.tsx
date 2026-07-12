'use client';

// 마케팅 운영 프로그램 — 매일/매주 체크리스트 + 상황별 플레이북
// ──────────────────────────────────────────────────────────────────────────
// "이럴 땐 이러고 저럴 땐 저러고"를 판단 없이 실행할 수 있게 만든 운영 화면.
// - 매일 체크리스트: 날짜별 localStorage 저장(자정 지나면 새 리스트)
// - 매주 체크리스트: ISO 주차별 저장(월요일 리셋)
// - 플레이북: 지표가 이상할 때 찾아보는 if→then 표 (임계값은 실측 기반,
//   ad-content-plan-v2 · carousel-content-plan · 스레드 실측 데이터 출처)
// 데이터 조회 없음(정적) — 체크 상태만 이 브라우저에 저장된다.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';

// ── 체크리스트 정의 ────────────────────────────────────────────────────────
// tip은 항목 아래 작은 글씨 — "어디서/어떻게"를 바로 알려준다.
interface CheckItem {
  id: string;
  label: string;
  tip?: string;
  link?: { href: string; label: string };
}

const DAILY: CheckItem[] = [
  {
    id: 'ads',
    label: '광고 3숫자 확인 — 지출 · 랜딩 조회 · 조회당 비용',
    tip: '조회당 $0.15↓ 좋음(예산 증액 후보) · $0.15~0.30 정상 · $0.30↑ 플레이북 P1',
    link: { href: 'https://adsmanager.facebook.com', label: 'Ads Manager' },
  },
  {
    id: 'freq',
    label: '광고 빈도(Frequency) 확인 — 3.0 넘으면 소재 교체 예약',
    tip: '같은 사람에게 3번 이상 노출되면 피로 → 무시당하기 시작 (플레이북 P5)',
  },
  {
    id: 'funnel',
    label: '결 테스트 퍼널 확인 — 완료 · 공유 · 다운클릭',
    tip: '완료는 늘어나는데 다운클릭 0이면 플레이북 P3',
    link: { href: '/dashboard/gyeol', label: '결 테스트 지표' },
  },
  {
    id: 'signups',
    label: '신규 가입 확인 — 환영 DM은 공식 티타 계정으로',
    tip: '특히 여성 신규의 "첫 10분"이 비지 않게 — 온보딩 드롭 위치도 함께',
    link: { href: '/dashboard/onboarding', label: '온보딩 드롭오프' },
  },
  {
    id: 'threads',
    label: '스레드 15분 — 원글(주 3~4회) 또는 답글 5개',
    tip: '원글은 얼굴·개인 스토리 각도(도달 30배 실측). 답글은 콘텐츠 뱅크에서. 링크는 첫 댓글에만',
  },
  {
    id: 'moim',
    label: '결모임 자리표 확인 — 대기 3장 이상이면 편성 검토',
    tip: '자동 조립이 못 묶은 조합은 찻자리 편성(QA)에서 수동으로',
    link: { href: '/dashboard/moim', label: '자리표 현황' },
  },
];

const WEEKLY: CheckItem[] = [
  {
    id: 'ab',
    label: 'A/B 판정 — 표본 찼으면 승자 선언, 패자 OFF, 도전자 1개 투입',
    tip: '판정 기준: 소재별 랜딩 조회 30+ 또는 지출 $15+ · 지표는 랜딩 조회당 비용. 표본 미달이면 판정 미루기 (성급한 판정이 최악)',
  },
  {
    id: 'budget',
    label: '예산 결정 — 지난주 조회당 비용 기준',
    tip: '$0.15 미만 → 일예산 +50% · $0.15~0.30 → 유지 · $0.30 초과 → 증액 금지, 소재부터 (P1)',
  },
  {
    id: 'funnelweek',
    label: '퍼널 주간 리뷰 — 완료→다운클릭→가입 전환율 · 여성 비율 · W1',
    tip: '각 단계 전환율을 지난주와 비교 — 떨어진 "한 단계"만 골라 이번 주에 고친다',
    link: { href: '/dashboard/stats', label: '통계 오버뷰' },
  },
  {
    id: 'content',
    label: '콘텐츠 준비 — 원글 3~4개 초안 + 카드 1~2장',
    tip: '원글은 threads-content-bank에서, 카드는 카드 스튜디오에서',
    link: { href: 'https://card-studio-ochre.vercel.app', label: '카드 스튜디오' },
  },
  {
    id: 'inst',
    label: '기관 트랙 후속 — 50플러스 · 마포가족 · 은평1인가구',
    tip: '메일 무응답 영업일 5~7일 → 후속 메일 1회(Re:로) → 그래도 무응답이면 전화',
  },
  {
    id: 'retarget',
    label: '리타게팅 모수 확인 — 픽셀 Lead 누적 100+ 되면 개설',
    tip: 'Lead(테스트 완료자) 오디언스로 다운로드 광고세트 — 콜드보다 단가가 확실히 낮다 (P8)',
  },
  {
    id: 'audit',
    label: '전략 문서 갱신 — 이번 주 배운 것 한 줄이라도',
    tip: 'Strategy Audit에 훅 학습·채널 학습을 기록해야 다음 판단이 빨라진다',
  },
];

// ── 플레이북 (이럴 땐 이렇게) ──────────────────────────────────────────────
interface Play {
  id: string;
  when: string;
  then: string;
  why?: string;
}

const PLAYBOOK: Play[] = [
  {
    id: 'P1',
    when: '랜딩 조회당 비용이 $0.30을 넘는다',
    then: '광고를 끄지 말고 도전자 소재 투입 → 3일 나란히 비교. 훅을 공허·설렘 축("친구는 있는데 겉돈다" / "설레는 일이 언제였더라")으로 교체.',
    why: '부재 훅("친구가 없으신가요")은 실측으로 약함 — 타깃은 친구가 없는 게 아니다',
  },
  {
    id: 'P2',
    when: '링크 클릭은 있는데 랜딩 조회가 60% 미만이다',
    then: '소재가 아니라 연결 문제 — 광고의 URL이 tita-app.com/gyeol인지, 페이지 로딩 속도, 픽셀 PageView 발화 확인.',
  },
  {
    id: 'P3',
    when: '테스트 완료는 쌓이는데 다운로드 클릭이 0이다',
    then: '결과 페이지 점검 — 완료자에게 다운로드 히어로가 뜨는지(수용자 분기), CTA 문구 실험. 광고 문제가 아니다.',
    why: '실제로 겪은 버그 패턴 — 완료자/방문자 분기가 핵심이었음',
  },
  {
    id: 'P4',
    when: '광고 도달의 여성 비율이 80% 아래로 내려온다',
    then: '광고세트 타게팅에서 성별=여성 지정 확인 → 유지하되, 소재가 남성을 부르는 표현(크리덴셜·성공 서사 강조)인지 점검.',
    why: '첫 코호트 68% 남성 사고의 재발 방지 — 성비는 매일 보는 지표',
  },
  {
    id: 'P5',
    when: '빈도(Frequency)가 3.0을 넘는다',
    then: '소재 피로 — 새 커버로 교체하거나 유사 타깃(Lookalike/관심사 확장)으로 모수를 넓힌다.',
  },
  {
    id: 'P6',
    when: '이번 주 결과 공유가 0건이다',
    then: '결과 페이지 공유 버튼 동선 확인(카카오/링크) + 스레드에서 "내 결 유형 인증" 유도 원글 1개.',
  },
  {
    id: 'P7',
    when: '여성 신규 가입이 일주일째 0명이다',
    then: '광고 중지가 아니라 온보딩부터 — NICE 인증 벽 드롭 확인, 가입 직후 첫 화면이 비어 보이는지(이런 분들이 계세요) 확인.',
    why: '여성 이탈은 밀도 탓만이 아니라 깨진 문으로 샌 전례가 있음(환영 DM 버그)',
  },
  {
    id: 'P8',
    when: '픽셀 Lead(테스트 완료)가 100명 이상 쌓였다',
    then: '리타게팅 광고세트 개설 — 오디언스=Lead 이벤트, 목표=앱 다운로드, 소재=결과 유형 이어받는 카피("내 결에 맞는 분들이 기다려요").',
  },
  {
    id: 'P9',
    when: '광고가 심의 거절됐다',
    then: '문구에서 성사 보장("찾아드려요")·건강 효능 뉘앙스 제거 후 재심 요청. 레드라인: 여성 전용 표현도 금지(여성 우선 O).',
  },
  {
    id: 'P10',
    when: '스레드 원글 조회수가 500 아래다',
    then: '각도 점검 — 얼굴·개인 스토리인가? 카드뉴스/제품 홍보 글은 스레드에서 죽는다(실측 68뷰 vs 7,000뷰). 질문으로 끝나는가?',
  },
];

// ── 날짜 키 ────────────────────────────────────────────────────────────────
function dayKey(): string {
  const d = new Date();
  return `mkt-daily-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function weekKey(): string {
  // ISO 주차 — 월요일 시작
  const d = new Date();
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `mkt-weekly-${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function useChecklist(storageKey: string): [Set<string>, (id: string) => void] {
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setDone(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* 첫 방문 */
    }
  }, [storageKey]);
  const toggle = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  };
  return [done, toggle];
}

function Checklist({
  title,
  subtitle,
  items,
  storageKey,
}: {
  title: string;
  subtitle: string;
  items: CheckItem[];
  storageKey: string;
}) {
  const [done, toggle] = useChecklist(storageKey);
  const count = items.filter((i) => done.has(i.id)).length;
  const allDone = count === items.length;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            allDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {count}/{items.length}
        </span>
      </div>
      <ul className="space-y-1">
        {items.map((item) => {
          const checked = done.has(item.id);
          return (
            <li key={item.id} className="rounded-xl transition-colors hover:bg-gray-50">
              <label className="flex cursor-pointer items-start gap-3 p-2.5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item.id)}
                  className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-green-700"
                />
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-medium ${
                      checked ? 'text-gray-400 line-through' : 'text-gray-800'
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.tip && (
                    <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{item.tip}</span>
                  )}
                  {item.link &&
                    (item.link.href.startsWith('/') ? (
                      <Link
                        href={item.link.href}
                        className="mt-1 inline-block text-xs font-semibold text-green-700 hover:underline"
                      >
                        {item.link.label} →
                      </Link>
                    ) : (
                      <a
                        href={item.link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs font-semibold text-green-700 hover:underline"
                      >
                        {item.link.label} ↗
                      </a>
                    ))}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function MarketingOpsPage() {
  return (
    <div className="space-y-5">
      <Header
        title="마케팅 운영"
        subtitle="매일·매주 체크리스트와 상황별 플레이북 — 판단은 미리 해뒀고, 여기선 실행만"
      />

      {/* 북극성 — 매일 봐야 하는 두 숫자 */}
      <section className="rounded-2xl border border-green-200 bg-green-50 p-5">
        <h2 className="text-sm font-bold text-green-900">이 페이지의 목적은 두 숫자다</h2>
        <p className="mt-1 text-sm leading-relaxed text-green-800">
          <b>여성 W4 리텐션</b>(4주차에 남아 있는가)과 <b>동네 밀도</b>(한 자치구의 인증 여성 수).
          아래 모든 체크는 이 둘로 수렴한다 — 헷갈릴 땐 &ldquo;이 행동이 두 숫자를 움직이나?&rdquo;로 판단.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Checklist
          title="오늘 (아침 10~15분)"
          subtitle="매일 자정 리셋 — 순서대로 하면 됨"
          items={DAILY}
          storageKey={dayKey()}
        />
        <Checklist
          title="이번 주 (월요일 30분)"
          subtitle="월요일 리셋 — A/B 판정과 예산은 주 1회만 (매일 만지면 학습이 깨짐)"
          items={WEEKLY}
          storageKey={weekKey()}
        />
      </div>

      {/* 플레이북 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-base font-bold text-gray-900">플레이북 — 이럴 땐 이렇게</h2>
        <p className="mt-0.5 mb-4 text-xs text-gray-500">
          지표가 이상할 때 이 표부터. 임계값은 실측 기반이라 데이터가 쌓이면 갱신한다.
        </p>
        <div className="space-y-2">
          {PLAYBOOK.map((p) => (
            <details key={p.id} className="group rounded-xl border border-gray-200">
              <summary className="flex cursor-pointer items-center gap-3 p-3 text-sm font-semibold text-gray-800 [&::-webkit-details-marker]:hidden">
                <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800">
                  {p.id}
                </span>
                <span className="min-w-0">{p.when}</span>
                <span className="ml-auto text-gray-400 transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="border-t border-gray-100 p-3 pl-4 text-sm leading-relaxed text-gray-700">
                <p>
                  <b className="text-green-800">→ </b>
                  {p.then}
                </p>
                {p.why && <p className="mt-1.5 text-xs text-gray-500">근거: {p.why}</p>}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* 채널별 전략 — 2026-07 학습 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-base font-bold text-gray-900">채널별 전략 (뭐가 되고 안 되나)</h2>
        <p className="mb-3 text-xs text-gray-500">
          2026-07 실측 학습. 핵심: <b>인스타 인앱 브라우저가 스토어 설치 핸드오프를 깬다</b> —
          같은 결테스트 링크도 스레드에선 앱스토어 바로 열리고, 인스타 인앱에선 안 열린다.
        </p>
        <div className="space-y-2.5 text-sm leading-relaxed text-gray-700">
          <div className="rounded-xl bg-green-50 p-3">
            <b>🧵 스레드 (오가닉) — 최우선 · 무료 · 잘 됨</b>
            <br />파운더 스토리 글 도달 30배(7.1K뷰 · ❤️67 · 💬35 vs 제품홍보 60~260).
            링크가 기본 브라우저로 열려 <b>스토어 설치까지 매끄럽다</b>. 결테스트 링크 그대로 사용.
            <br /><span className="text-gray-500">→ 유료보다 여기 먼저. 파운더 글 앵글 바꿔가며 재발행.</span>
          </div>
          <div className="rounded-xl bg-red-50 p-3">
            <b>📸 인스타 유료 → 웹 결테스트 — 🔴 설치 누수</b>
            <br />인스타 인앱 브라우저에서 &ldquo;다운로드&rdquo;를 눌러도 스토어 앱으로 핸드오프가 깨진다.
            (다운클릭 16 → 실제 설치 소수). 웹이 문제가 아니라 <b>인앱 브라우저가 문제</b>.
            <br /><span className="text-gray-500">→ 반창고: 인앱 감지 시 &ldquo;⋯ → 외부 브라우저로 열기&rdquo; 안내(배포됨). 자동 탈출은 브라우저 보안상 불가.</span>
          </div>
          <div className="rounded-xl bg-blue-50 p-3">
            <b>📸 인스타 유료 → App Promotion — ✅ 근본 해법</b>
            <br />Meta 캠페인 목표를 <b>&ldquo;앱 홍보(App Promotion)&rdquo;</b>로 하면 웹·인앱브라우저를
            건너뛰고 <b>네이티브 스토어가 바로 열린다</b> → 핸드오프 문제 소멸. 목적이 &lsquo;설치&rsquo;면 결테스트 스킵.
            <br /><span className="text-gray-500">→ 유료 설치 예산 대부분 여기로. 소액만 결테스트(트래픽/전환)로 픽셀 리드 축적(100+ 시 리타게팅).</span>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <b>결테스트 링크의 자리</b> — 유료 &lsquo;설치&rsquo; 랜딩으로는 부적합(인앱브라우저 누수).
            <b>오가닉(스레드)·리타게팅·공유 루프</b>용으로 유지. 궁금증 훅 + 픽셀 씨앗 역할.
          </div>
        </div>
      </section>

      {/* 안전 수칙 시리즈 — 신뢰 콘텐츠 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-base font-bold text-gray-900">안전 수칙 시리즈 (신뢰 콘텐츠)</h2>
        <p className="mb-3 text-xs text-gray-500">
          계기: 스레드·인스타 댓글에서 <b>&ldquo;검증이 불확실해서 안 쓴다&rdquo;</b>,{" "}
          <b>&ldquo;다단계 권유·돈 빌리고 잠수&rdquo;</b> 우려가 반복. 신뢰 병목이 설치 병목의 뿌리다.
          정직하게 답하는 콘텐츠가 신뢰를 키운다 — 팔려는 게 아니라 지켜주려 한다는 인상.
        </p>
        <div className="space-y-2.5 text-sm leading-relaxed text-gray-700">
          <div className="rounded-xl bg-green-50 p-3">
            <b>🗓 운영 리듬</b>
            <br />주 1회(화·목 아침). <b>인스타 = 카드뉴스 5장</b>(넘김·저장 유도), <b>스레드 = 한 장 + 글</b>.
            진초록(forest) 테마로 시리즈 통일 + &ldquo;티타 안전 수칙 · 01/02…&rdquo; 번호. 10개면 2~3개월치.
            <br /><span className="text-gray-500">→ 지금은 #01만 올려 반응(저장·공유) 확인 후 잘 되는 주제부터 확장.</span>
          </div>
          <div className="rounded-xl bg-amber-50 p-3">
            <b>⚖️ 정직 원칙 (안전 콘텐츠 전용)</b>
            <br /><b>&ldquo;절대 안전&rdquo; 금지</b>(거짓말 + 법적 리스크). 지금 <b>실제 작동하는 3겹만</b> 표기 —
            ① NICE 본인인증 ② AI 의도 파악(위험 대화 필터 + 의도·안전 도우미) ③ 신고 시 관리자 직접 확인.
            <br /><span className="text-gray-500">
              → 적응형 UI(특허 4계층 중 ③)는 작동 미확인 → 공개 콘텐츠에 &ldquo;있다&rdquo; 표기 금지.
              특허 출원(PA260003)은 사실이라 배지 표기 OK. 반론 각도 = &ldquo;사기꾼이 제일 싫어하는 건 실명&rdquo;.
            </span>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <b>🖼 이미지 대원칙</b>
            <br /><b>공포 조장 이미지 금지</b>(후드·어두운 손·해골 → 45+ 타겟에 불쾌·오프브랜드).
            &ldquo;일상 + 잠깐 멈칫&rdquo; 톤(찻잔 든 손, 폰 보는 옆모습, 낮 카페) 또는 깔끔한 아이콘·일러스트.
            <br /><span className="text-gray-500">→ 텍스트 카드로 시작, 반응 좋은 주제만 나중에 사진 입혀 강화.</span>
          </div>
          <div className="rounded-xl bg-blue-50 p-3">
            <b>🛠 제작 도구</b> — 카드 스튜디오에 <b>&ldquo;안전수칙&rdquo; 프리셋 4개</b>(돈거래·타이밍·실명·신고 CTA) 추가.
            <b>배경 사진 업로드 + 자동 그라데이션</b>(사진 위 글씨 자동 가독성) 기능도 추가됨.
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-bold text-gray-500">로드맵 (주제 · 핵심 한 줄 · 포맷 · 나중에 이미지 느낌)</div>
          <ul className="space-y-1 text-xs leading-relaxed text-gray-700">
            <li><b className="text-green-700">01 ✅ 돈거래</b> — &ldquo;돈 얘기 나오면 멈춤&rdquo; · 한장+카드뉴스 · 찻잔 앞 두 손</li>
            <li><b>02 로맨스 스캠</b> — &ldquo;만난 적 없는데 사랑한대요?&rdquo; · 카드뉴스 · 폰 보는 옆모습, 창가 역광</li>
            <li><b>03 개인정보</b> — &ldquo;계좌·주민번호는 가족한테도&rdquo; · 한장 · 자물쇠/방패 아이콘</li>
            <li><b>04 첫 만남 안전</b> — &ldquo;낮에·사람 많은 곳·행선지 알리고&rdquo; · 카드뉴스 · 밝은 낮 카페 외부</li>
            <li><b>05 가짜 투자·코인</b> — &ldquo;원금 보장+고수익 = 사기&rdquo; · 한장 · 그래프/돈에 X</li>
            <li><b>06 사진·영상 요구</b> — &ldquo;찍어 보내달라면 차단&rdquo; · 한장 · 카메라 아이콘 금지선</li>
            <li><b>07 재촉 = 함정</b> — &ldquo;&lsquo;지금 아니면 안 된다&rsquo;는 다 함정&rdquo; · 한장 · 시계/모래시계</li>
            <li><b>08 신고 사용법</b> — &ldquo;이상하면 3초 신고&rdquo; · 카드뉴스 · 앱 신고 버튼 실제 스크린샷</li>
            <li><b>09 가족에게 공유</b> — &ldquo;혼자 판단 말고 한 명한테&rdquo; · 한장 · 두 사람 나란히</li>
            <li><b>10 건강한 관계 신호</b> — &ldquo;좋은 친구는 돈·서두름·비밀 요구 안 해요&rdquo; · 한장 · 웃으며 차 마시는 장면</li>
          </ul>
        </div>
      </section>

      {/* 고정 원칙 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-base font-bold text-gray-900">고정 원칙 (안 바뀌는 것)</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700">
          <li>
            <b>여성 우선 ≠ 여성 전용.</b> 티타는 여성이 편하게 느끼도록 설계할 뿐, 남녀 모두 가입·이용한다.
            카피에 &ldquo;여성 전용/여성만/여성 친구 매칭&rdquo; 금지 — &ldquo;여성 우선&rdquo; 또는 성별 언급 생략 + 본인인증.
          </li>
          <li>
            <b>성사 보장 금지.</b> &ldquo;찾아드려요/만나드려요&rdquo; ❌ → &ldquo;찾기/만나기/기회&rdquo; ✅ (환불·심의 리스크).
          </li>
          <li>
            <b>라벨 금지.</b> 중년·시니어·신중년 표현 사용 안 함. 데이팅 뉘앙스 금지.
          </li>
          <li>
            <b>한 번에 한 변수.</b> A/B에서 커버를 바꿨으면 헤드라인은 고정 — 다 바꾸면 뭐가 이겼는지 모른다.
          </li>
          <li>
            <b>표본 없이 판정 없음.</b> 소재당 랜딩 조회 30+ 또는 $15+ 전엔 승패 선언 금지.
          </li>
        </ul>
      </section>

      {/* 카피 심리 체크리스트 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-base font-bold text-gray-900">카피 심리 체크리스트 (새 소재마다)</h2>
        <p className="mb-3 text-xs text-gray-500">
          새 광고 카피는 아래 4원칙 중 <b>최소 1개</b>를 써야 한다. 어느 것도 안 쓰고 있으면 그냥 &ldquo;설명문&rdquo;이다 — 다시 쓴다.
          카드 스튜디오의 &ldquo;심리 훅 (4원칙)&rdquo; 프리셋 · &ldquo;훅 바로 뽑기&rdquo; 버튼과 짝을 이룬다.
        </p>
        <div className="space-y-2.5 text-sm leading-relaxed text-gray-700">
          <div className="rounded-xl bg-gray-50 p-3">
            <b>① 믿음 흔들기</b> — 타깃이 이미 하는 노력이 왜 안 통하는지 (&ldquo;러닝머신 1시간 해도 살 안 빠지는 이유&rdquo; 구조).
            <br /><span className="text-gray-500">티타: &ldquo;동호회 3년 다녀도 &lsquo;진짜 친구&rsquo;가 안 생기는 이유&rdquo; / &ldquo;모임엔 꼬박꼬박 나가는데, 왜 늘 겉돌까요&rdquo;</span>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <b>② 손실감 자극</b> — 조용히 지나가고 있는 것을 자각시킨다. 겁주기 금지, 잔잔한 자각 + 출구.
            <br /><span className="text-gray-500">티타: &ldquo;설레는 약속이 마지막으로 언제였나요&rdquo; / &ldquo;달력에 병원 말고, 기다려지는 약속 하나 있나요&rdquo;</span>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <b>③ 같은 사실 재해석</b> — 아는 사실을 새 시각으로 재정의. 문제 정의가 곧 카피.
            <br /><span className="text-gray-500">티타: &ldquo;친구가 없는 게 아니에요. 내 빈 시간에 만날 친구가 없는 거예요&rdquo; / &ldquo;카톡 친구 200명. 오늘 차 마실 사람은, 글쎄요&rdquo;</span>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <b>④ 리스크 장벽 제거</b> — 시작을 막는 걱정(이상한 사람·가입 부담·데이팅 오해)을 먼저 치운다.
            <br /><span className="text-gray-500">티타: &ldquo;가입 없이 3분, 내 결부터 확인&rdquo; / &ldquo;전원 본인인증 — 이상한 사람 걱정은 빼고 시작하세요&rdquo;</span>
          </div>
        </div>
      </section>

      {/* 바로가기 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-base font-bold text-gray-900">바로가기</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { href: 'https://adsmanager.facebook.com', label: '📣 Meta Ads Manager' },
            { href: 'https://business.facebook.com', label: '🏢 Meta Business Suite' },
            { href: 'https://card-studio-ochre.vercel.app', label: '🎨 카드 스튜디오' },
            { href: 'https://tita-app.com/gyeol', label: '🍵 결 테스트 (랜딩)' },
            { href: 'https://www.threads.net', label: '🧵 스레드' },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              {l.label}
            </a>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-400">
          체크 상태는 이 브라우저에만 저장됩니다 (날짜/주차가 바뀌면 자동으로 새 리스트).
        </p>
      </section>
    </div>
  );
}
