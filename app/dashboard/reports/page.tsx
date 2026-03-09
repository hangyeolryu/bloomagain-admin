'use client';

import { useEffect, useState } from 'react';
import { getReports, resolveReport, dismissReport } from '@/lib/firestore';
import { useAuth } from '@/lib/auth-context';
import type { Report } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import Header from '@/components/layout/Header';

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getStatusBadge(status: string) {
  const map: Record<string, { variant: 'gray' | 'green' | 'orange' | 'red' | 'yellow' | 'blue'; label: string }> = {
    pending: { variant: 'orange', label: '대기중' },
    reviewed: { variant: 'blue', label: '검토중' },
    resolved: { variant: 'green', label: '처리완료' },
    dismissed: { variant: 'gray', label: '기각' },
  };
  const item = map[status] || { variant: 'gray', label: status };
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export default function ReportsPage() {
  const { user: adminUser, can } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [modal, setModal] = useState<{ report: Report; type: 'resolve' | 'dismiss' } | null>(null);
  const [resolution, setResolution] = useState('');
  const [acting, setActing] = useState(false);

  const fetchReports = (status: string) => {
    setLoading(true);
    getReports(status).then((r) => {
      setReports(r);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchReports(statusFilter);
  }, [statusFilter]);

  const handleAction = async () => {
    if (!modal || !adminUser) return;
    setActing(true);
    try {
      if (modal.type === 'resolve') {
        await resolveReport(modal.report.id, resolution, adminUser.uid);
      } else {
        await dismissReport(modal.report.id, adminUser.uid);
      }
      setReports((prev) => prev.filter((r) => r.id !== modal.report.id));
      setModal(null);
      setResolution('');
    } finally {
      setActing(false);
    }
  };

  return (
    <div>
      <Header title="신고 관리" subtitle="사용자 및 모임 신고 처리" />

      {/* Status Filter */}
      <div className="flex gap-2 mb-6">
        {['pending', 'reviewed', 'resolved', 'dismissed', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-green-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s === 'pending' ? '대기중' : s === 'reviewed' ? '검토중' : s === 'resolved' ? '처리완료' : s === 'dismissed' ? '기각' : '전체'}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {reports.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-2">✅</p>
              <p>해당 신고 없음</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {reports.map((r) => (
                <div key={r.id} className="px-6 py-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {getStatusBadge(r.status)}
                        <Badge variant={r.type === 'user' ? 'blue' : 'green'}>
                          {r.type === 'user' ? '사용자' : '모임'}
                        </Badge>
                        <span className="text-xs text-gray-400">{formatDate(r.createdAt)}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 mb-1">{r.reason}</p>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <p>대상 ID: <span className="font-mono">{r.targetId.slice(0, 16)}...</span></p>
                        <p>신고자 ID: <span className="font-mono">{r.reportedBy.slice(0, 16)}...</span></p>
                        {r.resolution && <p>처리 결과: {r.resolution}</p>}
                      </div>
                    </div>
                    {r.status === 'pending' && can('resolveReports') && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => setModal({ report: r, type: 'resolve' })}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                        >
                          처리
                        </button>
                        <button
                          onClick={() => setModal({ report: r, type: 'dismiss' })}
                          className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                        >
                          기각
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="px-6 py-3 border-t border-gray-50 text-xs text-gray-400">
            {reports.length}건의 신고
          </div>
        </div>
      )}

      <Modal
        isOpen={!!modal}
        onClose={() => { setModal(null); setResolution(''); }}
        title={modal?.type === 'resolve' ? '신고 처리' : '신고 기각'}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">이 신고를 {modal?.type === 'resolve' ? '처리' : '기각'}하시겠습니까?</p>
          {modal?.type === 'resolve' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">처리 결과 메모</label>
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="처리 결과를 입력하세요..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => { setModal(null); setResolution(''); }}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleAction}
              disabled={acting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              {acting ? '처리 중...' : '확인'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
