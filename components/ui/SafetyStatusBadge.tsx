import Badge from './Badge';

// 신뢰·안전 전 표면의 처리 상태를 한 어휘로 통일한다.
// 미처리(노랑) → 처리완료(초록) / 기각(회색). 각 페이지의 제각각이던
// pending/unresolved/open, resolved, dismissed를 이 셋에 매핑.
type Variant = 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'orange';

const STATUS: Record<string, { label: string; variant: Variant }> = {
  pending: { label: '미처리', variant: 'yellow' },
  open: { label: '미처리', variant: 'yellow' },
  unresolved: { label: '미처리', variant: 'yellow' },
  reviewed: { label: '검토중', variant: 'blue' },
  resolved: { label: '처리완료', variant: 'green' },
  dismissed: { label: '기각', variant: 'gray' },
};

export default function SafetyStatusBadge({ status }: { status?: string }) {
  const s = STATUS[status ?? ''] ?? { label: status || '—', variant: 'gray' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
