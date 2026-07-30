/**
 * 집계 부분 실패 배너.
 *
 * 어드민 통계는 집계 하나가 실패해도 페이지를 죽이지 않으려고 try/catch로
 * 감싸고 0/빈 배열을 반환한다. 그런데 실패를 console.warn만 남기면 "권한 없음"과
 * "데이터 없음"이 화면에서 똑같이 0으로 보인다.
 *
 * 실제로 2026-06~07에 users/*\/analytics_milestones 룰 누락으로 가입경로 집계가
 * permission-denied였는데 6주간 "응답 0명"으로만 보였고, 그 사이 245명분 온보딩
 * 응답이 유실됐다. 같은 사고가 getActivityPatterns·결큐 카운트에서도 있었다.
 *
 * 그래서 집계 함수는 실패를 warnings[]에 담고, 페이지는 이 배너로 드러낸다.
 */

export interface StatWarning {
  /** 사람이 읽는 집계 이름 (예: '가입 경로 집계') */
  label: string;
  /** 원문 오류 메시지. 인덱스 누락이면 콘솔 생성 링크가 들어 있다. */
  message: string;
}

export default function StatWarnings({
  warnings,
  className = '',
}: {
  warnings: StatWarning[];
  className?: string;
}) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className={`rounded-2xl border border-amber-300 bg-amber-50 p-5 ${className}`}>
      <p className="font-semibold text-amber-900">
        일부 집계를 불러오지 못했어요 ({warnings.length}건)
      </p>
      <p className="mt-1 text-sm text-amber-800">
        아래 항목은 <strong>0이 아니라 &ldquo;알 수 없음&rdquo;</strong>입니다. 수치를 그대로 믿지 마세요.
      </p>
      <ul className="mt-3 space-y-2">
        {warnings.map((w) => {
          const url = w.message.match(/https?:\/\/\S+/)?.[0];
          return (
            <li key={`${w.label}:${w.message}`} className="rounded-lg border border-amber-200 bg-white p-3">
              <p className="text-sm font-medium text-amber-900">{w.label}</p>
              <p className="mt-1 break-all whitespace-pre-wrap font-mono text-xs text-amber-700">
                {w.message}
              </p>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-semibold text-emerald-700 underline"
                >
                  콘솔에서 인덱스 만들기 →
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
