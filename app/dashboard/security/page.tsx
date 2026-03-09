'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Badge from '@/components/ui/Badge';
import Header from '@/components/layout/Header';

interface SecurityEvent {
  id: string;
  userId: string;
  scoreTotal?: number;
  action?: string;
  reasonCode?: string;
  cCog?: number;
  createdAt?: Date;
  source?: string;
}

function getActionBadge(action?: string) {
  if (action === 'account_lock') return <Badge variant="red">L3: 계정 잠금</Badge>;
  if (action === 'shadow_ban') return <Badge variant="orange">L2: 그림자 차단</Badge>;
  if (action === 'warning') return <Badge variant="yellow">L1: 경고</Badge>;
  if (action === 'allow') return <Badge variant="green">허용</Badge>;
  return <Badge variant="gray">{action || '-'}</Badge>;
}

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ScoreBar({ score }: { score?: number }) {
  if (score === undefined) return <span className="text-gray-400">-</span>;
  const color = score >= 90 ? 'bg-red-500' : score >= 70 ? 'bg-orange-500' : score >= 50 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-sm font-mono font-medium text-gray-700">{score.toFixed(1)}</span>
    </div>
  );
}

export default function SecurityPage() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Read from interaction_logs subcollection via users (fallback: read top-level)
    const fetchEvents = async () => {
      try {
        const q = query(
          collection(db, 'interaction_logs'),
          orderBy('created_at', 'desc'),
          limit(100)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs.map((d) => {
            const raw = d.data();
            return {
              id: d.id,
              userId: raw.user_id || raw.userId || '',
              scoreTotal: raw.score_total,
              action: raw.action,
              reasonCode: raw.reason_code,
              cCog: raw.c_cog,
              createdAt: raw.created_at?.toDate?.() || raw.createdAt?.toDate?.(),
              source: raw.source,
            } as SecurityEvent;
          });
          setEvents(data);
        }
      } catch {
        // Collection may not exist or not accessible — show empty state
      }
      setLoading(false);
    };
    fetchEvents();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <Header
        title="보안 이벤트"
        subtitle="Dasibom 보안 시스템 로그 (L1/L2/L3)"
      />

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-4 py-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          <span className="text-gray-600">허용 (0–49)</span>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-4 py-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
          <span className="text-gray-600">L1 경고 (50–69)</span>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-4 py-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
          <span className="text-gray-600">L2 그림자 차단 (70–89)</span>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-4 py-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          <span className="text-gray-600">L3 계정 잠금 (90+)</span>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">🛡️</p>
          <p className="mb-1">보안 이벤트 기록 없음</p>
          <p className="text-xs">백엔드 PostgreSQL에서 interaction_logs를 관리합니다</p>
          <p className="text-xs mt-1">Firestore에 동기화된 이벤트가 있을 때 표시됩니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">사용자</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">조치</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">위험 점수</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">C_cog</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">사유 코드</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">일시</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">{e.userId.slice(0, 12)}...</td>
                    <td className="px-6 py-4">{getActionBadge(e.action)}</td>
                    <td className="px-6 py-4"><ScoreBar score={e.scoreTotal} /></td>
                    <td className="px-6 py-4"><ScoreBar score={e.cCog} /></td>
                    <td className="px-6 py-4 text-xs text-gray-500">{e.reasonCode || '-'}</td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
