'use client';

/// 데이터 유지보수 — 정기적으로 사람 손으로 실행하는 정리 작업 모음.
///
/// 두 개의 sweep 작업이 있어요:
///   1. **고아 사용자 게시물** — users/{uid}/posts 의 부모 user doc이 없는 것.
///      앱 "내 주변에서" 피드에서 "탈퇴한 회원"으로 표시되는 잔재.
///   2. **고아 모임 게시물** — circles/{cid}/posts 의 부모 circle doc이 없는 것.
///      모임이 삭제된 뒤 남은 글. 같은 collectionGroup 피드에 섞여 들어옴.
///
/// 두 케이스 모두 정상 경로 (앱 in-app 삭제 + admin 모임 삭제 버튼)는
/// cascade가 들어가 있으니 앞으로는 누적되지 않아요. 이 페이지는 그 이전
/// 데이터 / Firebase Console 직접 삭제 / 구버전 코드의 잔재를 청소합니다.
///
/// 권한: manageUsers (super_admin · admin).

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  sweepOrphanPosts,
  sweepOrphanCirclePosts,
  type OrphanPostSweepResult,
} from '@/lib/firestore';
import Header from '@/components/layout/Header';

function formatDate(d?: Date | null) {
  if (!d) return '-';
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DataMaintenancePage() {
  const { can } = useAuth();

  if (!can('manageUsers')) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="text-4xl mb-2">🔒</div>
        <p className="font-semibold text-gray-800">권한이 없어요</p>
        <p className="text-sm text-gray-500 mt-1">
          이 기능은 슈퍼 관리자 · 관리자만 사용할 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        title="데이터 유지보수"
        subtitle="정기적으로 손으로 실행하는 정리 작업. 베타 동안 한 달에 한 번 정도면 충분합니다."
      />

      <SweepSection
        icon="🧹"
        title="고아 사용자 게시물 정리"
        description={
          <>
            작성자(<code>users/&#123;uid&#125;</code>)가 없어진 게시물을
            찾아 영구 삭제합니다. 앱 "내 주변에서" 피드에서{' '}
            <em>탈퇴한 회원</em>으로 표시되는 잔여 데이터의 원인이에요.
          </>
        }
        sampleLabel={(s) => `users/${s.uid}/posts/${s.postId}`}
        runSweep={sweepOrphanPosts}
      />

      <SweepSection
        icon="🌿"
        title="고아 모임 게시물 정리"
        description={
          <>
            삭제된 모임(<code>circles/&#123;cid&#125;</code>)에 남아있는
            게시물과 그 댓글을 영구 삭제합니다. 모임이 사라진 뒤에도
            게시글이 공개 피드에 나타나는 잔재를 청소해요.
          </>
        }
        sampleLabel={(s) => `circles/${s.uid}/posts/${s.postId}`}
        runSweep={sweepOrphanCirclePosts}
      />
    </div>
  );
}

// ─── Reusable sweep section ──────────────────────────────────────────────
//
// Each sweep follows the same UX: explainer → dry-run / live buttons →
// result panel. The only thing that changes is the function called and
// the sample label format. Splitting it out keeps both sections in lock-
// step — a tweak to the layout (e.g. adding an "abort" button later)
// happens in one place.

interface SweepSectionProps {
  icon: string;
  title: string;
  description: React.ReactNode;
  sampleLabel: (s: OrphanPostSweepResult['sample'][number]) => string;
  runSweep: (opts: { dryRun: boolean }) => Promise<OrphanPostSweepResult>;
}

function SweepSection({
  icon,
  title,
  description,
  sampleLabel,
  runSweep,
}: SweepSectionProps) {
  const [running, setRunning] = useState<'dry' | 'live' | null>(null);
  const [result, setResult] = useState<OrphanPostSweepResult | null>(null);
  const [lastMode, setLastMode] = useState<'dry' | 'live' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onRun = async (mode: 'dry' | 'live') => {
    if (mode === 'live') {
      const ok = confirm(
        `${title}: 영구 삭제합니다. 되돌릴 수 없어요.\n` +
          '먼저 "미리보기"로 어떤 것들이 지워질지 확인하셨나요?\n\n' +
          '계속하려면 확인을 눌러주세요.'
      );
      if (!ok) return;
    }
    setRunning(mode);
    setError(null);
    try {
      const r = await runSweep({ dryRun: mode === 'dry' });
      setResult(r);
      setLastMode(mode);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              {description}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 bg-amber-50/40 border-b border-amber-100">
        <div className="text-xs text-amber-900 space-y-1">
          <p className="font-semibold">실행 전 확인</p>
          <ul className="list-disc list-inside space-y-1 text-amber-800">
            <li>
              <strong>미리보기</strong>를 먼저 실행해 몇 개·어떤 게시물이
              대상인지 확인하세요.
            </li>
            <li>
              정상 삭제 경로는 자동 cascading 되므로 결과가 0개여도 정상입니다.
            </li>
            <li>대량(수천 개)이 나오면 한 번 더 점검 후 진행하세요.</li>
          </ul>
        </div>
      </div>

      <div className="p-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onRun('dry')}
          disabled={running !== null}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running === 'dry' ? '🔍 스캔 중…' : '🔍 미리보기 (삭제 없이 스캔)'}
        </button>
        <button
          type="button"
          onClick={() => onRun('live')}
          disabled={running !== null}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running === 'live' ? '🗑️ 삭제 중…' : '🗑️ 영구 삭제 실행'}
        </button>
      </div>

      {error && (
        <div className="px-5 pb-5">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            실행 중 오류가 발생했어요:{' '}
            <code className="font-mono">{error}</code>
          </div>
        </div>
      )}

      {result && (
        <div className="border-t border-gray-100 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span
              className={
                'px-2 py-0.5 rounded-md text-xs font-bold ' +
                (lastMode === 'dry'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-green-100 text-green-700')
              }
            >
              {lastMode === 'dry' ? '미리보기 결과' : '삭제 완료'}
            </span>
            <span className="text-xs text-gray-500">
              {(result.elapsedMs / 1000).toFixed(1)}초 소요
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="전체 스캔" value={result.scanned} />
            <Stat label="고아 발견" value={result.orphans} tone="warning" />
            <Stat
              label={lastMode === 'dry' ? '삭제 예정' : '삭제됨'}
              value={lastMode === 'dry' ? result.orphans : result.deleted}
              tone="danger"
            />
            <Stat
              label="오류"
              value={result.errors}
              tone={result.errors > 0 ? 'danger' : 'muted'}
            />
          </div>

          {result.sample.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">
                샘플 ({result.sample.length}건 표시)
              </p>
              <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-100">
                {result.sample.map((s) => (
                  <div
                    key={`${s.uid}-${s.postId}`}
                    className="px-3 py-2 text-xs font-mono text-gray-700 flex items-center justify-between gap-3"
                  >
                    <span className="truncate">{sampleLabel(s)}</span>
                    <span className="shrink-0 text-gray-400">
                      {formatDate(s.createdAt ?? null)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.orphans === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              🌱 깨끗합니다. 정리할 항목이 없어요.
            </div>
          )}

          {lastMode === 'dry' && result.orphans > 0 && (
            <p className="text-xs text-gray-500">
              실제 삭제하려면 위의 <strong>영구 삭제 실행</strong> 버튼을
              눌러주세요.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning' | 'danger' | 'muted';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-700'
      : tone === 'warning'
      ? 'text-amber-700'
      : tone === 'muted'
      ? 'text-gray-400'
      : 'text-gray-900';
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${toneClass}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}
