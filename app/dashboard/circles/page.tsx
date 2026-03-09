'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCircles } from '@/lib/firestore';
import type { Circle } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function CirclesPage() {
  const router = useRouter();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [filtered, setFiltered] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getCircles(100).then((c) => {
      setCircles(c);
      setFiltered(c);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!search) {
      setFiltered(circles);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      circles.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.city?.toLowerCase().includes(q) ||
          (c.interests || []).some((i) => i.toLowerCase().includes(q))
      )
    );
  }, [search, circles]);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <Header
        title="모임 관리"
        subtitle={`총 ${circles.length}개의 모임`}
      />

      <div className="mb-6">
        <input
          type="text"
          placeholder="모임 이름, 도시, 관심사 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">🌿</p>
          <p>모임 없음</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((circle) => (
            <div
              key={circle.id}
              onClick={() => router.push(`/dashboard/circles/view?id=${circle.id}`)}
              className={`bg-white rounded-2xl border shadow-sm p-5 hover:shadow-md transition-all cursor-pointer hover:border-green-200 ${
                circle.isBlocked ? 'border-red-100 opacity-75' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
                  circle.isBlocked ? 'bg-red-50' : 'bg-green-100'
                }`}>
                  {circle.isBlocked ? '🚫' : '🌿'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 truncate">{circle.name}</h3>
                    {circle.isBlocked && (
                      <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full flex-shrink-0">차단</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {circle.city}{circle.district ? `, ${circle.district}` : ''}
                  </p>
                </div>
              </div>

              {circle.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{circle.description}</p>
              )}

              <div className="flex flex-wrap gap-1 mb-3">
                {(circle.interests || []).slice(0, 3).map((i) => (
                  <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-100">
                    {i}
                  </span>
                ))}
                {(circle.interests || []).length > 3 && (
                  <span className="text-xs text-gray-400">+{circle.interests!.length - 3}</span>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-50 pt-3">
                <span>
                  👥 {circle.memberCount ?? (circle.members || []).length} / {circle.maxMembers ?? 12}명
                </span>
                <span>{formatDate(circle.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
