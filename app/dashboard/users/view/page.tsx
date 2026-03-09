'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import UserDetailClient from '../UserDetailClient';

export default function UserViewPage() {
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
