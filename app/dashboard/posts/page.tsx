'use client';

// 전체 게시물 — 파운더가 모든 사용자 글을 한 곳에서 본다(읽기 전용 모니터링).
// users/{uid}/posts·circles/{cid}/posts·루트 posts 를 최신순으로 모아 보여준다.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getAllPosts, setTitaPick, type AdminPost } from '@/lib/firestore';

function fmt(d: Date | null) {
  if (!d) return '—';
  return d.toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function PostsPage() {
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [region, setRegion] = useState<string>('전체');
  const [q, setQ] = useState('');
  const [busyPath, setBusyPath] = useState<string | null>(null);

  // 티타픽 토글 — 성공하면 목록의 그 글만 갱신한다(전체 재조회는 느리다).
  async function togglePick(p: AdminPost) {
    setBusyPath(p.path);
    try {
      await setTitaPick(p.path, !p.titaPick);
      setPosts((prev) => prev?.map((x) =>
        x.path === p.path ? { ...x, titaPick: !p.titaPick } : x) ?? prev);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPath(null);
    }
  }

  useEffect(() => {
    getAllPosts()
      .then(setPosts)
      .catch((e) => setErr(e?.message ?? '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  const regions = useMemo(() => {
    const s = new Set<string>();
    (posts ?? []).forEach((p) => p.region && s.add(p.region));
    return ['전체', ...[...s].sort()];
  }, [posts]);

  const filtered = useMemo(() => {
    return (posts ?? []).filter((p) => {
      if (region !== '전체' && p.region !== region) return false;
      if (q && !`${p.content} ${p.authorName}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [posts, region, q]);

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (err) return <div className="p-6 text-sm text-red-600">에러: {err}</div>;

  const withImage = filtered.filter((p) => p.imageUrl).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="전체 게시물" subtitle="모든 사용자 글을 최신순으로 · 티타픽 선정" />
      <main className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs text-gray-500">불러온 게시물</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{posts?.length ?? 0}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs text-gray-500">필터 결과</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{filtered.length}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs text-gray-500">사진 있는 글</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{withImage}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            {regions.map((r) => (
              <option key={r} value={r}>{r === '전체' ? '지역 전체' : r}</option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="내용·작성자 검색"
            className="flex-1 min-w-[180px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            게시물이 없어요.
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((p) => (
              <li
                key={`${p.authorUid}-${p.postId}`}
                className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4"
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-20 w-20 flex-none rounded-lg object-cover"
                    style={{ background: '#f1f1f1' }}
                  />
                ) : (
                  <div className="flex h-20 w-20 flex-none items-center justify-center rounded-lg bg-gray-50 text-xs text-gray-300">
                    사진 없음
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Link
                      href={`/dashboard/users/view?id=${p.authorUid}`}
                      className="font-semibold text-gray-900 hover:underline"
                    >
                      {p.authorName}
                    </Link>
                    {p.region && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{p.region}</span>
                    )}
                    {p.source === 'circle' && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">모임 글</span>
                    )}
                    {p.titaPick && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">티타픽</span>
                    )}
                    <span className="ml-auto text-xs text-gray-400">{fmt(p.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-gray-800 line-clamp-4">
                    {p.content || <span className="text-gray-300">(내용 없음)</span>}
                  </p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                    <span className="tabular-nums">♥ {p.likes}</span>
                    <span className="tabular-nums">💬 {p.comments}</span>
                    {/* 티타픽 — 앱 카드에 '티타픽' 필이 뜬다. 내용은 못 고친다(룰). */}
                    <button
                      type="button"
                      disabled={busyPath === p.path}
                      onClick={() => togglePick(p)}
                      className={`ml-auto rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                        p.titaPick
                          ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {p.titaPick ? '티타픽 해제' : '티타픽으로'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-400">
          최신 {posts?.length ?? 0}건까지 불러와요. 더 필요하면 getAllPosts(max) 상향.
        </p>
      </main>
    </div>
  );
}
