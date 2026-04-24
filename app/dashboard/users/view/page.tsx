'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import UserDetailClient from '../UserDetailClient';

function UserViewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get('id');

  useEffect(() => {
    if (!id) {
      router.replace('/dashboard/users');
    }
  }, [id, router]);

  if (!id) {
    return null; // redirecting
  }

  return <UserDetailClient id={id} />;
}

export default function UserViewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">불러오는 중…</div>}>
      <UserViewContent />
    </Suspense>
  );
}
