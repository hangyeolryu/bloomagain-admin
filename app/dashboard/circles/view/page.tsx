'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import CircleDetailClient from '../CircleDetailClient';

export default function CircleViewPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get('id');

  useEffect(() => {
    if (!id) {
      router.replace('/dashboard/circles');
    }
  }, [id, router]);

  if (!id) {
    return null; // redirecting
  }

  return <CircleDetailClient id={id} />;
}
