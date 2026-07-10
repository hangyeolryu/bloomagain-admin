'use client';

// Admin Data Collection Dashboard
// ----------------------------------
// Single-page overview of where data is flowing in the 다시봄 system. This is
// the operator's view answering questions like:
//   • How many users are actively answering daily questions?
//   • Are tags propagating to embeddings (the matching pipeline)?
//   • Where do we sit on each licensing track for survey instruments?
//   • Which data-pipeline integrations are healthy vs broken?
//
// Created 2026-05-13 alongside the Daily Question v2 / Mini Pulse rollout.
// All charts are inline SVG (no chart library dep) — admin already pulls
// firebase + tailwind, and a single dashboard doesn't need recharts/chart.js.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDataCollectionStats } from '@/lib/firestore';
import type { DataCollectionStats } from '@/lib/firestore';
import StatsCard from '@/components/ui/StatsCard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import questionMeta from '@/lib/gyeolq-questions.json';

// 결큐 문항 메타 (앱 assets/json/questions.json에서 생성한 슬림 사본).
// id → { t: 질문, o: {A: 보기, B: 보기}, c: 카테고리 }
const QUESTIONS = questionMeta as Record<string, { t: string; o: Record<string, string>; c: string }>;

// 온보딩 가입 경로 값 → 라벨 (앱 acquisition_channels.dart와 동일 어휘)
const ACQ_LABELS: Record<string, string> = {
  band: '🟢 네이버 밴드',
  kakao: '💬 카카오톡',
  danggeun: '🥕 당근',
  youtube: '▶️ 유튜브',
  instagram: '📷 인스타그램',
  threads: '🧵 스레드',
  search: '🔍 검색 (네이버·구글)',
  friend: '🤝 지인 추천',
  offline: '📍 오프라인 (강연·모임)',
  other: '✨ 기타',
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
      {children}
    </h2>
  );
}

type LicenseStatus = 'public' | 'received' | 'pending' | 'blocked';

interface LicenseRow {
  tool: string;
  source: string;
  status: LicenseStatus;
  note: string;
}

const LICENSE_TABLE: LicenseRow[] = [
  { tool: 'PHQ-2 / PHQ-9', source: 'Kroenke 2003 (Pfizer public domain)', status: 'public', note: '상업 사용 자유' },
  { tool: 'Cantril Ladder (1-item)', source: 'Gallup World Poll, public', status: 'public', note: 'Mini Pulse 사용 중' },
  { tool: 'Single-item Loneliness', source: 'ONS / 자체 한국 우회 표현', status: 'public', note: 'Daily Q35 우회 측정' },
  { tool: 'LSIS-6', source: 'Hwang et al. 2021, NMHSK 표준', status: 'pending', note: '홍진표 교수 메일 발송 — 회신 대기 (공공누리 4유형 NC-ND)' },
  { tool: 'WHO-5 Wellbeing Index', source: 'WHO 1998, Kim 2010 한국 번역', status: 'pending', note: '⚠ WHO 허가 ✅ (Catalina 2026-05-14). 한국어 verbatim 미확보 — 트립 후 처리 예정 (Kim 2010 paper 구매 또는 Moon 교수 컨택). 현재 PHQ-2 + Cantril로 baseline 운영 충분.' },
  { tool: 'UCLA-3 Loneliness', source: 'Hughes 2004, 김옥수 1997 한국 lineage', status: 'pending', note: 'Russell (Iowa State) 메일 발송' },
  { tool: 'SWLS', source: 'Diener 1985, Lee 2024 IRT 검증', status: 'pending', note: 'Diener Education Fund (info@nobascholar.com) 메일 발송' },
];

const PIPELINE_STATUS: Array<{ name: string; status: 'ok' | 'warn' | 'todo'; detail: string }> = [
  { name: 'Daily Question → Firestore', status: 'ok', detail: 'users/{uid}/dailyQuestions/{qid} 작성 + 태그 누적' },
  { name: 'Mini Pulse → Firestore', status: 'ok', detail: 'users/{uid}/mini_pulses + 태그 merge' },
  { name: 'Tag propagation → embedding 트리거', status: 'ok', detail: 'embeddingUpdatePending: true 플래그 작동' },
  { name: 'Cloud Function getUserEmbeddingHttp', status: 'ok', detail: 'Vertex AI text-embedding-005 호출, 768d 생성' },
  { name: 'Riverpod matchedUsersProvider 새로고침', status: 'ok', detail: '답변 후 즉시 invalidate' },
  { name: '모임 추천 (Firestore tags 직접)', status: 'ok', detail: '_userDailyQuestionTags overlap weight 1' },
  { name: 'Backend /api/v1/matching/embedding 동기화', status: 'ok', detail: '✅ 768d 정렬 완료 (Alembic 021, 2026-07) — dim mismatch 해소, 자동 결모임이 이 임베딩을 사용' },
  { name: '자동 결모임 조립 (/moim/assemble)', status: 'ok', detail: '자리표 → 상호 top-K + 결 임계값 조립 → 제안 → 티타지기 방. ⚠ Cloud Scheduler 잡 등록 확인 필요 (수동 트리거는 가능)' },
  { name: '결큐 질문 원격화 (gyeolQuestionBank)', status: 'warn', detail: '코드 완료 — rules 배포 + 앱 v3.0.9 출시 후 활성. 그때까지 번들 질문만 사용' },
  { name: 'BigQuery export (Firestore + GA4 + PG)', status: 'ok', detail: 'bloomagain_raw (Seoul) 라이브 2026-05-17~ — GA4 + Firestore + Cloud SQL federated' },
  { name: 'Looker Studio 대시보드', status: 'todo', detail: '보류 — 어드민 인사이트가 운영 질문을 대체. B2G 분기 리포트 단계에서 재평가' },
  { name: 'survey_responses 테이블 (Postgres)', status: 'todo', detail: 'LSIS-6 라이센스 회신 대기 (외부 블로커) — 회신 후 마이그레이션 생성 (021은 embedding에 사용됨, 다음 번호로)' },
];

function licenseBadge(status: LicenseStatus) {
  const map = {
    public: { label: 'Public', cls: 'bg-emerald-100 text-emerald-800' },
    received: { label: '허가 완료', cls: 'bg-blue-100 text-blue-800' },
    pending: { label: '회신 대기', cls: 'bg-amber-100 text-amber-800' },
    blocked: { label: '차단', cls: 'bg-red-100 text-red-800' },
  } as const;
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function pipelineDot(status: 'ok' | 'warn' | 'todo') {
  const cls =
    status === 'ok' ? 'bg-emerald-500' :
    status === 'warn' ? 'bg-amber-500' :
    'bg-gray-300';
  return <span className={`inline-block w-2 h-2 rounded-full ${cls} mr-2 flex-shrink-0`} aria-hidden />;
}

// Pure SVG horizontal bar chart — categories sorted by count, bar lengths
// scaled to the largest value. Senior-friendly readability (large labels,
// numeric value visible at end of bar).
function CategoryBarChart({ data }: { data: Record<string, number> }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <div className="space-y-2">
      {rows.map(([cat, count]) => (
        <div key={cat} className="flex items-center gap-3">
          <span className="text-sm text-gray-700 w-32 truncate" title={cat}>{cat}</span>
          <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all"
              style={{ width: `${(count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-gray-700 w-12 text-right tabular-nums">{count}</span>
        </div>
      ))}
    </div>
  );
}

// 최근 14일 답변 추이 — 세로 미니 바. 요일 리듬(주말↑?)과 침묵 구간이
// 한눈에 보이는 게 목적이라 축·그리드 없이 막대+날짜만.
function TrendChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-1.5 h-32">
      {data.map((d) => {
        const day = d.date.slice(8);
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span className="text-[10px] text-gray-500 tabular-nums">{d.count > 0 ? d.count : ''}</span>
            <div
              className="w-full rounded-t bg-gradient-to-t from-emerald-500 to-green-400"
              style={{ height: `${Math.max(2, (d.count / max) * 88)}px` }}
              title={`${d.date}: ${d.count}건`}
            />
            <span className="text-[10px] text-gray-400 tabular-nums">{day}</span>
          </div>
        );
      })}
    </div>
  );
}

// 질문 하나의 선택지 분포 — A/B 스택 바 + 쏠림 표시.
// 80% 이상 쏠리면 변별력이 낮다(모두가 같은 답 → 매칭 신호 0)는 경고 뱃지.
function QuestionSplitRow({ q }: { q: { id: string; total: number; options: Record<string, number> } }) {
  const meta = QUESTIONS[q.id];
  const entries = Object.entries(q.options).sort((a, b) => a[0].localeCompare(b[0]));
  const colors = ['bg-emerald-500', 'bg-amber-400', 'bg-sky-400', 'bg-rose-400'];
  const topShare = Math.max(...entries.map(([, c]) => c)) / Math.max(1, q.total);
  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <p className="text-sm font-medium text-gray-800 min-w-0">
          <span className="text-gray-400 font-mono text-xs mr-1.5">#{q.id}</span>
          {meta?.t ?? '(문항 정보 없음)'}
        </p>
        <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">{q.total}명</span>
      </div>
      <div className="flex h-5 rounded overflow-hidden bg-gray-100">
        {entries.map(([opt, count], i) => (
          <div
            key={opt}
            className={`${colors[i % colors.length]} flex items-center justify-center text-[10px] font-bold text-white`}
            style={{ width: `${(count / Math.max(1, q.total)) * 100}%` }}
            title={`${opt}: ${meta?.o?.[opt] ?? ''} — ${count}명`}
          >
            {count / Math.max(1, q.total) >= 0.18 ? `${opt} ${Math.round((count / q.total) * 100)}%` : ''}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
        {entries.map(([opt]) => (
          <span key={opt} className="text-[11px] text-gray-500 truncate max-w-full">
            <b className="text-gray-600">{opt}</b> {meta?.o?.[opt] ?? '?'}
          </span>
        ))}
        {topShare >= 0.8 && q.total >= 5 && (
          <span className="text-[11px] font-semibold text-amber-600">⚠ 쏠림 {Math.round(topShare * 100)}% — 변별력 낮음</span>
        )}
      </div>
    </div>
  );
}

function TagCloud({ tags }: { tags: Array<{ tag: string; count: number }> }) {
  if (tags.length === 0) {
    return <p className="text-sm text-gray-400 italic">아직 수집된 태그가 없습니다.</p>;
  }
  const max = tags[0]?.count ?? 1;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(({ tag, count }) => {
        const scale = 0.85 + (count / max) * 0.5;
        return (
          <span
            key={tag}
            className="inline-flex items-center bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md border border-emerald-100"
            style={{ fontSize: `${scale}rem`, lineHeight: 1.2 }}
            title={`${count}회`}
          >
            <code className="font-mono">{tag}</code>
            <span className="ml-1.5 text-emerald-900 font-semibold tabular-nums">{count}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function DataCollectionPage() {
  const [stats, setStats] = useState<DataCollectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDataCollectionStats()
      .then((s) => setStats(s))
      .catch((e) => {
        console.error('[data-collection] load error:', e);
        setError((e as Error).message ?? '로드 실패');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner message="데이터 수집 현황 로딩 중..." />;
  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
      <p className="text-red-800 font-semibold">데이터 로드 실패</p>
      <p className="text-sm text-red-600 mt-1">{error}</p>
    </div>
  );
  if (!stats) return null;

  const tagPropagationRate =
    stats.totalUsers > 0 ? Math.round((stats.usersWithTags / stats.totalUsers) * 100) : 0;
  const embeddingCoverage =
    stats.usersWithTags > 0 ? Math.round((stats.usersWithEmbedding / stats.usersWithTags) * 100) : 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">결큐 인사이트</h1>
        <p className="text-gray-500 text-sm mt-1">
          결큐 답변·추이·질문별 분포·가입 경로 · Mini Pulse · 라이센스 · 파이프라인
        </p>
        <p className="text-xs text-gray-400 mt-1">
          참고 문서:&nbsp;
          <a href="https://github.com/" className="text-emerald-600 hover:underline">data_flow_map.md</a>,&nbsp;
          <a href="https://github.com/" className="text-emerald-600 hover:underline">survey_definitions_v2.md</a>
        </p>
      </div>

      {/* ── 사용자 참여 현황 ── */}
      <div className="mb-6">
        <SectionHeading>사용자 참여</SectionHeading>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            label="총 사용자"
            value={stats.totalUsers}
            icon="👥"
            color="bg-blue-50"
          />
          <StatsCard
            label="태그 보유 사용자"
            value={stats.usersWithTags}
            icon="🏷️"
            color="bg-emerald-50"
            delta={`${tagPropagationRate}% 참여율`}
          />
          <StatsCard
            label="Embedding 보유"
            value={stats.usersWithEmbedding}
            icon="🧠"
            color="bg-indigo-50"
            delta={`${embeddingCoverage}% coverage (태그 보유자 중)`}
          />
          <StatsCard
            label="오늘 캡 도달"
            value={stats.usersAtDailyCap}
            icon="🎯"
            color="bg-amber-50"
            delta="8개 답변 완료"
          />
        </div>
      </div>

      {/* ── Daily Question ── */}
      <div className="mb-6">
        <SectionHeading>Daily Question</SectionHeading>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatsCard
            label="전체 답변 누적"
            value={stats.totalDailyAnswers}
            icon="🌸"
            color="bg-rose-50"
          />
          <StatsCard
            label="오늘 답변"
            value={stats.todaysDailyAnswers}
            icon="📅"
            color="bg-pink-50"
          />
          <StatsCard
            label="사용자 평균 답변"
            value={stats.avgAnswersPerUser}
            icon="📊"
            color="bg-fuchsia-50"
            delta="태그 보유 사용자 기준"
          />
          <StatsCard
            label="결 게이트 통과"
            value={stats.gateEligible}
            icon="🚪"
            color="bg-teal-50"
            delta="답변 3개 이상 — 사람 리스트 열림"
          />
          <StatsCard
            label="결모임 자격"
            value={stats.moimEligible}
            icon="🫖"
            color="bg-emerald-50"
            delta="답변 7개 이상 — 자동 조립 풀 입장"
          />
        </div>
      </div>

      {/* ── 결큐 인사이트: 추이 · 깊이 ── */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <SectionHeading>최근 14일 답변 추이</SectionHeading>
          <TrendChart data={stats.dailyTrend} />
          <p className="text-xs text-gray-400 mt-2">
            결큐가 매일의 습관이 되고 있는지 — 빈 날이 이어지면 푸시·배너 점검.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <SectionHeading>답변 깊이 분포 (사용자 수)</SectionHeading>
          <CategoryBarChart data={Object.fromEntries(stats.depthBuckets.map((b) => [b.label, b.count]))} />
          <p className="text-xs text-gray-400 mt-2">
            제품 임계값 기준: 3답 = 결 게이트 통과 · 7답 = 결모임 조립 자격.
            &ldquo;1~2&rdquo; 구간이 두터우면 게이트 직전 이탈 — 첫 3문항 흐름 점검.
          </p>
        </div>
      </div>

      {/* ── 결큐 인사이트: 질문별 분포 ── */}
      <div className="mb-6 bg-white rounded-2xl border border-gray-200 p-5">
        <SectionHeading>질문별 응답 분포 (답변 많은 순 상위 20)</SectionHeading>
        {stats.questionStats.length === 0 ? (
          <p className="text-sm text-gray-400 italic">아직 답변 데이터가 없습니다.</p>
        ) : (
          <div>
            {stats.questionStats.map((q) => (
              <QuestionSplitRow key={q.id} q={q} />
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">
          고르게 갈리는 질문(50:50에 가까움)이 매칭 신호가 강한 질문.
          ⚠ 쏠림 표시가 붙은 질문은 변별력이 낮으니 문항 교체·표현 수정 후보.
        </p>
      </div>

      {/* ── 가입 경로 (온보딩 "어디서 알게 되셨어요?") ── */}
      <div className="mb-6 bg-white rounded-2xl border border-gray-200 p-5">
        <SectionHeading>
          가입 경로 — 온보딩 &ldquo;어디서 알게 되셨어요?&rdquo; ({stats.acquisitionAnswered}명 응답)
        </SectionHeading>
        {stats.acquisitionChannels.length === 0 ? (
          <p className="text-sm text-gray-400 italic">아직 응답이 없습니다 (선택 단계라 스킵 가능).</p>
        ) : (
          <CategoryBarChart
            data={Object.fromEntries(
              stats.acquisitionChannels.map((c) => [ACQ_LABELS[c.channel] ?? `✨ ${c.channel}`, c.count]),
            )}
          />
        )}
        <p className="text-xs text-gray-400 mt-2">
          채널별 유입 → 어느 채널에 콘텐츠·광고를 더 실을지의 근거.
          W4 리텐션을 채널별로 가르는 게 다음 단계 (GTM 대시보드 문서 참조).
        </p>
      </div>

      {/* ── Mini Pulse ── */}
      <div className="mb-6">
        <SectionHeading>Mini Pulse (격주 안부 체크)</SectionHeading>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatsCard
            label="총 응답"
            value={stats.totalMiniPulseResponses}
            icon="🌿"
            color="bg-violet-50"
          />
          <StatsCard
            label="외로움 양성 (lonely_high)"
            value={stats.miniPulsesWithLonelyHigh}
            icon="🌷"
            color="bg-rose-50"
            delta="최근 200건 sample"
          />
          <StatsCard
            label="응답률 (참고)"
            value={
              stats.totalMiniPulseResponses > 0 && stats.totalUsers > 0
                ? Math.round((stats.totalMiniPulseResponses / stats.totalUsers) * 100)
                : 0
            }
            icon="✅"
            color="bg-teal-50"
            delta="총응답/총사용자 (%)"
          />
        </div>
      </div>

      {/* ── 카테고리 분포 + Top Tags 두 컬럼 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-1">카테고리별 답변 분포</h3>
          <p className="text-xs text-gray-500 mb-4">3-Layer 구조 (성향 · 한국 문화 · 2026 트렌드)</p>
          <CategoryBarChart data={stats.categoryCounts} />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-1">Top 15 태그</h3>
          <p className="text-xs text-gray-500 mb-4">가장 많이 누적된 사용자 태그 (매칭 embedding source)</p>
          <TagCloud tags={stats.topTags} />
        </div>
      </div>

      {/* ── 라이센스 ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-900">측정 도구 라이센스</h3>
            <p className="text-xs text-gray-500 mt-1">상업 사용 허가 진행 상태 — 회신 대기 도구는 spec에만 정의, production 배포 보류</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium">도구</th>
                <th className="text-left px-3 py-2 font-medium">출처</th>
                <th className="text-left px-3 py-2 font-medium">상태</th>
                <th className="text-left px-3 py-2 font-medium">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {LICENSE_TABLE.map((row) => (
                <tr key={row.tool}>
                  <td className="px-3 py-3 font-medium text-gray-800">{row.tool}</td>
                  <td className="px-3 py-3 text-gray-600">{row.source}</td>
                  <td className="px-3 py-3">{licenseBadge(row.status)}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 파이프라인 헬스 ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-1">데이터 파이프라인 헬스</h3>
        <p className="text-xs text-gray-500 mb-4">
          🟢 정상 · 🟡 이슈 (작동 가능하나 개선 필요) · ⚪ 미설정 (계획됨)
        </p>
        <ul className="space-y-2.5">
          {PIPELINE_STATUS.map((item) => (
            <li key={item.name} className="flex items-start">
              {pipelineDot(item.status)}
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{item.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* ── 데이터 흐름 다이어그램 (텍스트 ASCII art alternative) ── */}
      <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-1">데이터 흐름 (한눈에 보기)</h3>
        <p className="text-xs text-gray-500 mb-4">사용자 답변 → 매칭 추천까지 데이터 경로</p>
        <pre className="text-[11px] leading-tight font-mono text-slate-700 overflow-x-auto bg-white rounded p-4 border border-slate-100">
{`사용자가 Daily Question 1개 답변
  ↓
Firestore: users/{uid}/dailyQuestions/{qid}
         + users/{uid}.dailyQuestionTags  (누적 태그)
         + users/{uid}.dailyAnswerCount   (오늘 카운트)
         + users/{uid}.embeddingUpdatePending: true
  ↓
Cloud Function: getUserEmbeddingHttp (디바운싱, 24h 또는 5+ 답변)
  ↓
Vertex AI text-embedding-005 → 768d 벡터
  ↓
Firestore: users/{uid}.embedding  (30일 캐시)
  ↓
┌──────────────────────────┬──────────────────────────┐
│ Flutter Discovery        │ Flutter Circle Discovery │
│ ───────────────────      │ ───────────────────────  │
│ Riverpod invalidate      │ _userDailyQuestionTags   │
│ matchedUsersProvider     │ overlap weight 1         │
│ → backend /matching/find │ → 새 모임 추천 즉시 OK ✅│
│                          │                          │
│ ⚠ backend embedding sync │                          │
│   768→384 mismatch       │                          │
└──────────────────────────┴──────────────────────────┘`}
        </pre>
      </div>

      {/* ── 알려진 이슈 ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-6">
        <h3 className="font-semibold text-amber-900 mb-3">알려진 이슈 · TODO</h3>
        <ul className="space-y-2 text-sm text-amber-800">
          <li>
            <strong>🟡 Backend embedding dim mismatch</strong> (사전 이슈, 오늘 작업 무관) —
            Cloud Function 768d ↔ Backend <code className="bg-amber-100 px-1 rounded">Vector(384)</code>.
            Backend `/matching/embedding` 호출이 silent fail. 사용자 추천이 backend embedding 부재 시 빈 응답 가능.
            <br />
            <span className="text-xs text-amber-700">옵션: (A) Alembic migration Vector(768) (B) Cloud Func outputDim=384 (C) Cloud Func에서 truncation</span>
          </li>
          <li>
            <strong>⏳ 4개 측정 도구 라이센스 회신 대기</strong> — WHO-5, UCLA-3, SWLS, LSIS-6. 회신 후 배포.
          </li>
          <li>
            <strong>📦 BigQuery 활성화 미완료</strong> — 셋업 가이드 작성 완료, 콘솔에서 GA4 + Firestore Extension + Cloud SQL federated 활성화 필요.
          </li>
          <li>
            <strong>🗄️ <code>survey_responses</code> Postgres 테이블 미생성</strong> — Alembic 021 마이그레이션 미작성. LSIS-6 라이센스 회신 후 한 번에 생성 예정.
          </li>
        </ul>
      </div>

      {/* ── 빠른 진단 링크 ── */}
      <div className="text-xs text-gray-500 mt-4">
        💡 <strong>빠른 진단</strong>:&nbsp;
        <Link href="/dashboard/health" className="text-emerald-600 hover:underline">백엔드 상태</Link> ·&nbsp;
        <Link href="/dashboard/sync-failures" className="text-emerald-600 hover:underline">싱크 실패</Link> ·&nbsp;
        <Link href="/dashboard/users" className="text-emerald-600 hover:underline">사용자 관리</Link>
      </div>
    </div>
  );
}
