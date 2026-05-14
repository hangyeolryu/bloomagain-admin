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
  { tool: 'WHO-5 Wellbeing Index', source: 'WHO 1998, Moon 2014 한국 검증', status: 'pending', note: 'WHO permissions form 제출 완료 — 1-3주 대기' },
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
  { name: 'Backend /api/v1/matching/embedding 동기화', status: 'warn', detail: '⚠ Pre-existing dim mismatch: Cloud Func 768d ↔ Backend Vector(384d) — silent fail' },
  { name: 'BigQuery export (Firestore + GA4 + PG)', status: 'todo', detail: '셋업 가이드 작성 완료 — 콘솔 활성화 필요 (bigquery_setup_guide.md)' },
  { name: 'Looker Studio 대시보드', status: 'todo', detail: 'BQ 활성화 후 5개 view 기반 대시보드 생성' },
  { name: 'survey_responses 테이블 (Postgres)', status: 'todo', detail: 'Alembic 021 — LSIS-6 라이센스 회신 후 생성' },
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
        <h1 className="text-2xl font-bold text-gray-900">데이터 수집 현황</h1>
        <p className="text-gray-500 text-sm mt-1">
          Daily Question · Mini Pulse · 라이센스 · 파이프라인 헬스 한눈에 보기
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
        </div>
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
