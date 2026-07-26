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

// ─── 인사이트 엔진 ──────────────────────────────────────────────────────────
// 이미 받아온 stats 하나에서 '무엇이 문제이고 무엇을 하면 되는지'를 파생한다.
// 백엔드/파이어스토어 추가 읽기 없음 — 순수 계산. 우선순위(action>watch>good)로
// 정렬해 운영자가 위에서부터 처리하면 되는 리스트가 되도록 했다.
type Severity = 'good' | 'watch' | 'action';

interface Insight {
  id: string;
  severity: Severity;
  icon: string;
  title: string;
  metric: string;      // 핵심 숫자/비율
  reading: string;     // 해석 — 이 숫자가 의미하는 것
  action: string;      // 다음 액션 — 무엇을 하면 되는지
}

const SEV_ORDER: Record<Severity, number> = { action: 0, watch: 1, good: 2 };

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function buildInsights(s: DataCollectionStats): Insight[] {
  const out: Insight[] = [];
  const answeredUsers =
    s.totalUsers - (s.depthBuckets.find((b) => b.label.startsWith('0'))?.count ?? 0);

  // 1) 참여율 — 가입자 중 결큐를 실제로 답한 비율
  if (s.totalUsers > 0) {
    const partRate = s.usersWithTags / s.totalUsers;
    out.push(
      partRate >= 0.5
        ? {
            id: 'participation',
            severity: 'good',
            icon: '🌱',
            title: '결큐 참여율',
            metric: pct(partRate),
            reading: `가입자 ${s.totalUsers}명 중 ${s.usersWithTags}명이 태그를 쌓았습니다. 매칭 엔진이 굴러갈 최소 연료가 확보된 상태.`,
            action: '현 수준 유지. 참여자를 게이트(3답)·결모임(7답) 쪽으로 밀어 올리는 데 집중.',
          }
        : {
            id: 'participation',
            severity: partRate < 0.25 ? 'action' : 'watch',
            icon: '🌱',
            title: '결큐 참여율 낮음',
            metric: pct(partRate),
            reading: `가입자 ${s.totalUsers}명 중 ${s.usersWithTags}명만 답변을 시작했습니다. 나머지는 태그가 0이라 추천 대상에서 사실상 제외됩니다.`,
            action:
              '온보딩 직후 첫 결큐 1문항을 강제 노출(스킵 불가) 또는 홈 상단 고정 배너. "3개만 답하면 사람이 보여요" 카피로 게이트 보상을 미리 알리기.',
          },
    );
  }

  // 2) 게이트 전환 — 답변 시작자 중 3답(사람 리스트 열림)까지 간 비율
  if (answeredUsers >= 5) {
    const gateConv = s.gateEligible / answeredUsers;
    const stuck = answeredUsers - s.gateEligible;
    out.push(
      gateConv >= 0.6
        ? {
            id: 'gate',
            severity: 'good',
            icon: '🚪',
            title: '결 게이트 전환',
            metric: pct(gateConv),
            reading: `답변 시작자 ${answeredUsers}명 중 ${s.gateEligible}명이 3답을 넘겨 사람 리스트가 열렸습니다.`,
            action: '문제 없음. 다음 병목은 게이트→결모임(7답) 구간을 확인.',
          }
        : {
            id: 'gate',
            severity: gateConv < 0.4 ? 'action' : 'watch',
            icon: '🚪',
            title: '게이트 직전 이탈',
            metric: `${stuck}명 정체`,
            reading: `1~2답에서 멈춘 사용자가 ${stuck}명. 결 게이트(3답) 보상을 보기 직전에 빠져나가고 있습니다 — 가장 아까운 구간.`,
            action:
              '첫 3문항을 가장 가볍고 재미있는 질문으로 재배치(무거운 정서 문항은 뒤로). 2답 완료 시 "1개만 더!" 마이크로 넛지 푸시 A/B 테스트.',
          },
    );
  }

  // 3) 결모임 자격 전환 — 게이트 통과자 중 7답까지
  if (s.gateEligible >= 5) {
    const moimConv = s.moimEligible / s.gateEligible;
    out.push({
      id: 'moim',
      severity: moimConv >= 0.5 ? 'good' : moimConv < 0.25 ? 'watch' : 'watch',
      icon: '🫖',
      title: '결모임 조립 풀',
      metric: `${s.moimEligible}명`,
      reading: `게이트 통과자 ${s.gateEligible}명 중 ${s.moimEligible}명(${pct(moimConv)})이 7답을 채워 자동 조립 풀에 들어왔습니다. 이 숫자가 곧 결모임 공급량입니다.`,
      action:
        moimConv >= 0.5
          ? '풀 충분. /moim/assemble 스케줄러 잡이 실제로 도는지 확인해 공급을 실현.'
          : '7답 도달을 돕는 "이번 주 결큐 3개 남았어요" 진행바 UI로 마지막 구간을 당기기.',
    });
  }

  // 4) Embedding coverage — 태그 보유자 중 벡터 생성 완료 비율
  if (s.usersWithTags >= 5) {
    const embCov = s.usersWithEmbedding / s.usersWithTags;
    if (embCov < 0.9) {
      out.push({
        id: 'embedding',
        severity: embCov < 0.7 ? 'action' : 'watch',
        icon: '🧠',
        title: 'Embedding 미생성',
        metric: pct(embCov),
        reading: `태그 보유 ${s.usersWithTags}명 중 ${s.usersWithTags - s.usersWithEmbedding}명이 아직 벡터가 없습니다. 이 사용자들은 디스커버리 추천에서 빠집니다.`,
        action:
          'getUserEmbeddingHttp 백필 1회 실행(reconcileEmbeddings 트리거). BACKEND_API_URL env 주입 여부부터 확인 — 과거 누락으로 매일 skip한 이력 있음.',
      });
    } else {
      out.push({
        id: 'embedding',
        severity: 'good',
        icon: '🧠',
        title: 'Embedding 커버리지',
        metric: pct(embCov),
        reading: `태그 보유자 대부분(${s.usersWithEmbedding}/${s.usersWithTags})이 벡터를 갖고 있어 매칭 파이프라인이 정상 공급됩니다.`,
        action: '유지. 백엔드 768d 정렬 완료로 backend /matching 동기화도 정상.',
      });
    }
  }

  // 5) 모멘텀 — 최근 7일 vs 직전 7일 답변량
  const last7 = s.dailyTrend.slice(-7).reduce((a, d) => a + d.count, 0);
  const prev7 = s.dailyTrend.slice(0, 7).reduce((a, d) => a + d.count, 0);
  const zeroDays = s.dailyTrend.slice(-7).filter((d) => d.count === 0).length;
  if (last7 + prev7 >= 10) {
    const delta = prev7 > 0 ? (last7 - prev7) / prev7 : 1;
    out.push(
      delta >= -0.1
        ? {
            id: 'momentum',
            severity: 'good',
            icon: '📈',
            title: '답변 모멘텀',
            metric: `${delta >= 0 ? '+' : ''}${pct(delta)}`,
            reading: `최근 7일 ${last7}건 vs 직전 7일 ${prev7}건. 습관 형성이 유지/상승 중입니다.`,
            action: '현 리듬 유지. 빈 날이 생기면 즉시 푸시 점검.',
          }
        : {
            id: 'momentum',
            severity: delta < -0.3 || zeroDays >= 3 ? 'action' : 'watch',
            icon: '📉',
            title: '답변 모멘텀 하락',
            metric: pct(delta),
            reading: `최근 7일 ${last7}건으로 직전 7일(${prev7}건) 대비 감소${zeroDays > 0 ? `, 빈 날 ${zeroDays}일` : ''}. 결큐가 습관에서 이탈하는 신호.`,
            action:
              '결큐 리마인드 푸시 발송 시각·문구 점검. 홈 배너 노출 여부 확인. 며칠째 0이면 알림 파이프라인(FCM) 자체를 의심.',
          },
    );
  }

  // 6) 질문 변별력 — 80%+ 쏠린 문항은 매칭 신호가 0에 가깝다
  const lowDisc = s.questionStats.filter((q) => {
    const top = Math.max(1, ...Object.values(q.options));
    return q.total >= 5 && top / q.total >= 0.8;
  });
  if (s.questionStats.some((q) => q.total >= 5)) {
    out.push(
      lowDisc.length === 0
        ? {
            id: 'discrimination',
            severity: 'good',
            icon: '🎯',
            title: '질문 변별력 양호',
            metric: '쏠림 0개',
            reading: '표본이 쌓인 문항 중 한쪽으로 80% 이상 쏠린 질문이 없습니다. 문항들이 사용자를 잘 가르고 있어 매칭 신호가 살아있습니다.',
            action: '유지. 새 문항 추가 시에도 50:50에 가까운지 이 표에서 계속 모니터링.',
          }
        : {
            id: 'discrimination',
            severity: lowDisc.length >= 3 ? 'action' : 'watch',
            icon: '🎯',
            title: '변별력 낮은 문항',
            metric: `${lowDisc.length}개`,
            reading: `#${lowDisc.slice(0, 3).map((q) => q.id).join(', #')}${lowDisc.length > 3 ? ' 외' : ''} — 모두가 같은 답을 골라 매칭에 기여하지 못하는 '죽은 문항'입니다.`,
            action:
              '해당 문항을 표현 수정(중립적 대립 구도로) 또는 교체. 원격 문항 뱅크(gyeolQuestionBank) 활성 후 앱 재배포 없이 교체 가능.',
          },
    );
  }

  // 7) 외로움 신호 — 안전/미션 지표. 표본(최근 200건) 기준
  const sampleN = Math.min(200, s.totalMiniPulseResponses);
  if (sampleN >= 10) {
    const lonelyRate = s.miniPulsesWithLonelyHigh / sampleN;
    out.push({
      id: 'loneliness',
      severity: lonelyRate >= 0.3 ? 'action' : lonelyRate >= 0.15 ? 'watch' : 'good',
      icon: '🌷',
      title: '외로움 양성률',
      metric: pct(lonelyRate),
      reading: `최근 Mini Pulse ${sampleN}건 중 ${s.miniPulsesWithLonelyHigh}건이 lonely_high. ${lonelyRate >= 0.15 ? '제품이 필요한 사람에게 닿고 있다는 증거이자, 돌봐야 할 신호.' : '표본상 심각한 고립 밀도는 낮은 편.'}`,
      action:
        lonelyRate >= 0.15
          ? '이 코호트를 우선 결모임/안부 매칭 대상으로. B2G 리포트의 핵심 임팩트 지표로도 이 수치를 트래킹(외로움 개선 = 계약 근거).'
          : '유지 관찰. 표본이 커지면 추세로 다시 판단.',
    });
  }

  // 8) 획득 채널 집중도 — 한 채널 의존 리스크
  const totalAcq = s.acquisitionChannels.reduce((a, c) => a + c.count, 0);
  if (totalAcq >= 10 && s.acquisitionChannels[0]) {
    const top = s.acquisitionChannels[0];
    const conc = top.count / totalAcq;
    if (conc >= 0.6) {
      out.push({
        id: 'acquisition',
        severity: conc >= 0.8 ? 'watch' : 'watch',
        icon: '📥',
        title: '유입 채널 편중',
        metric: `${pct(conc)} 한 채널`,
        reading: `유입의 ${pct(conc)}이 '${ACQ_LABELS[top.channel] ?? top.channel}' 한 곳에 몰려 있습니다. 이 채널이 막히면 신규가 급감하는 단일 실패점.`,
        action:
          '2순위 채널에 콘텐츠·예산을 의도적으로 배분해 리스크 분산. 채널별 W4 리텐션을 갈라 "잘 남는 채널"에 재투자(현재는 유입만 보이고 리텐션 미분리).',
      });
    }
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

const SEV_STYLE: Record<Severity, { card: string; chip: string; label: string }> = {
  action: { card: 'border-rose-200 bg-rose-50/60', chip: 'bg-rose-100 text-rose-700', label: '지금 조치' },
  watch: { card: 'border-amber-200 bg-amber-50/60', chip: 'bg-amber-100 text-amber-700', label: '관찰' },
  good: { card: 'border-emerald-200 bg-emerald-50/50', chip: 'bg-emerald-100 text-emerald-700', label: '양호' },
};

function InsightCard({ i }: { i: Insight }) {
  const st = SEV_STYLE[i.severity];
  return (
    <div className={`rounded-2xl border p-4 flex flex-col ${st.card}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0" aria-hidden>{i.icon}</span>
          <span className="text-sm font-semibold text-gray-800 truncate">{i.title}</span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${st.chip}`}>{st.label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none mb-2">{i.metric}</p>
      <p className="text-xs text-gray-600 leading-relaxed mb-2">{i.reading}</p>
      <p className="text-xs text-gray-700 leading-relaxed mt-auto pt-2 border-t border-black/5">
        <span className="font-semibold text-gray-500">→ 액션&nbsp;</span>{i.action}
      </p>
    </div>
  );
}

// 참여 퍼널 — 가입 → 답변 시작 → 게이트(3답) → 결모임(7답). 각 단계 전환율을
// 붙여 '어디서 새는지'가 한 줄로 보이게. depthBuckets에서 파생.
function ParticipationFunnel({ s }: { s: DataCollectionStats }) {
  const answered = s.totalUsers - (s.depthBuckets.find((b) => b.label.startsWith('0'))?.count ?? 0);
  const stages = [
    { label: '가입', value: s.totalUsers, color: 'from-blue-400 to-blue-500' },
    { label: '답변 시작 (≥1)', value: answered, color: 'from-teal-400 to-emerald-500' },
    { label: '결 게이트 (≥3)', value: s.gateEligible, color: 'from-emerald-400 to-green-500' },
    { label: '결모임 자격 (≥7)', value: s.moimEligible, color: 'from-green-500 to-emerald-600' },
  ];
  const max = Math.max(1, s.totalUsers);
  return (
    <div className="space-y-2.5">
      {stages.map((st, idx) => {
        const prev = idx > 0 ? stages[idx - 1].value : null;
        const conv = prev && prev > 0 ? Math.round((st.value / prev) * 100) : null;
        return (
          <div key={st.label} className="flex items-center gap-3">
            <span className="text-sm text-gray-700 w-32 flex-shrink-0">{st.label}</span>
            <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
              <div
                className={`h-full bg-gradient-to-r ${st.color} rounded-lg flex items-center justify-end pr-2`}
                style={{ width: `${Math.max(6, (st.value / max) * 100)}%` }}
              >
                <span className="text-xs font-bold text-white tabular-nums drop-shadow">{st.value}</span>
              </div>
            </div>
            <span className="text-xs text-gray-400 w-16 text-right tabular-nums flex-shrink-0">
              {conv !== null ? `↓ ${conv}%` : ''}
            </span>
          </div>
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
  const insights = buildInsights(stats);
  const actionCount = insights.filter((i) => i.severity === 'action').length;
  const watchCount = insights.filter((i) => i.severity === 'watch').length;

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

      {/* ── 핵심 인사이트 & 액션 (stats에서 파생) ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <SectionHeading>핵심 인사이트 &amp; 다음 액션</SectionHeading>
          <div className="flex items-center gap-2 text-xs">
            {actionCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold">
                지금 조치 {actionCount}
              </span>
            )}
            {watchCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                관찰 {watchCount}
              </span>
            )}
          </div>
        </div>
        {insights.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 text-sm text-gray-400 italic">
            아직 인사이트를 낼 만큼 데이터가 쌓이지 않았습니다. 답변이 누적되면 자동으로 채워집니다.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insights.map((i) => (
              <InsightCard key={i.id} i={i} />
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">
          위 카드는 아래 원자료에서 자동 계산됩니다 — 빨강(지금 조치) → 노랑(관찰) → 초록(양호) 순.
          매칭·리텐션·안전·성장 각 축에서 &ldquo;무엇을 하면 되는지&rdquo;까지 붙였습니다.
        </p>
      </div>

      {/* ── 참여 퍼널 ── */}
      <div className="mb-6 bg-white rounded-2xl border border-gray-200 p-5">
        <SectionHeading>참여 퍼널 — 가입에서 결모임 자격까지</SectionHeading>
        <ParticipationFunnel s={stats} />
        <p className="text-xs text-gray-400 mt-3">
          각 단계 사이 전환율(↓%)이 가장 낮은 지점이 지금 손봐야 할 병목입니다.
          제품 임계값: 3답=사람 리스트 열림 · 7답=결모임 자동 조립 풀 입장.
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
          <div className="flex items-center justify-between mb-3">
            <SectionHeading>최근 14일 답변 추이</SectionHeading>
            {(() => {
              const last7 = stats.dailyTrend.slice(-7).reduce((a, d) => a + d.count, 0);
              const prev7 = stats.dailyTrend.slice(0, 7).reduce((a, d) => a + d.count, 0);
              const delta = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;
              const up = delta !== null && delta >= 0;
              return (
                <span className={`text-xs font-semibold tabular-nums ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
                  최근 7일 {last7}건 {delta !== null && `(${up ? '▲' : '▼'} ${Math.abs(delta)}% vs 직전 7일)`}
                </span>
              );
            })()}
          </div>
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
│ ✅ backend embedding sync│                          │
│   768d 정렬 완료 (021)   │                          │
└──────────────────────────┴──────────────────────────┘`}
        </pre>
      </div>

      {/* ── 알려진 이슈 ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-6">
        <h3 className="font-semibold text-amber-900 mb-3">알려진 이슈 · TODO</h3>
        <ul className="space-y-2 text-sm text-amber-800">
          <li>
            <strong>⏳ 4개 측정 도구 라이센스 회신 대기</strong> — WHO-5, UCLA-3, SWLS, LSIS-6. 회신 후 배포.
            <span className="text-xs text-amber-700"> (외부 블로커 — 현재 PHQ-2 + Cantril로 baseline 운영 중이라 제품엔 미영향)</span>
          </li>
          <li>
            <strong>📦 BigQuery 활성화 미완료</strong> — 셋업 가이드 작성 완료, 콘솔에서 GA4 + Firestore Extension + Cloud SQL federated 활성화 필요.
          </li>
          <li>
            <strong>🗄️ <code>survey_responses</code> Postgres 테이블 미생성</strong> — 다음 Alembic 번호(029, 현재 최신은 028)로 생성 예정. 021은 embedding 768d 정렬에 사용됨. LSIS-6 라이센스 회신 후 한 번에 생성.
          </li>
        </ul>
        <div className="mt-4 pt-3 border-t border-amber-200/60">
          <p className="text-xs font-semibold text-emerald-700 mb-1">✅ 최근 해결</p>
          <p className="text-xs text-emerald-800">
            <strong>Backend embedding dim mismatch</strong> — Backend <code className="bg-emerald-100 px-1 rounded">Vector(768)</code> 정렬 완료
            (Alembic 021, <code className="bg-emerald-100 px-1 rounded">EMBEDDING_DIM=768</code>). Cloud Function 768d ↔ Backend 차원 일치 →
            <code className="bg-emerald-100 px-1 rounded">/matching/embedding</code> 정상, 자동 결모임이 이 임베딩을 사용.
          </p>
        </div>
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
