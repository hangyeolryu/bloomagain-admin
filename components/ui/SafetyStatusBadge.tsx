import Badge from './Badge';

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
