'use client';

import Link from 'next/link';
import type { UserProfile } from '@/types';

/** 티타 공식 계정 — 목록에서 사람으로 세지 않는다. */
export const OFFICIAL_UID = 'aET2dLHaDkgZkX6fXa9Ui7W7OS53';

/**
 * 회원 한 명을 얼굴·이름·나이·성별로 보여준다.
 *
 * uid 여덟 자만 떠 있으면 누구인지 알 수 없어서, 웨이브 한 건을 보려고
 * 매번 회원 상세로 들어갔다 나와야 했다. 대화가 오갔는지 판단하려면
 * 나이·성별이 같이 보여야 한다.
 */
export default function UserChip({
  uid,
  user,
  size = 28,
}: {
  uid: string;
  user?: UserProfile | null;
  size?: number;
}) {
  const name = user?.displayName || `${uid.slice(0, 6)}…`;
  const year = user?.legalBirthYear ?? user?.yearOfBirth;
  const age = year ? new Date().getFullYear() - Number(year) : null;
  const g = user?.gender;
  const genderLabel = g === 'female' ? '여' : g === 'male' ? '남' : null;
  const initial = (user?.displayName || '?').trim().charAt(0);

  return (
    <Link
      href={`/dashboard/users/view?id=${uid}`}
      className="inline-flex items-center gap-2 group"
      title={uid}
    >
      {user?.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.photoUrl}
          alt=""
          width={size}
          height={size}
          className="rounded-full object-cover bg-gray-100 shrink-0"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          className="rounded-full bg-gray-100 text-gray-500 grid place-items-center shrink-0 font-semibold"
          style={{ width: size, height: size, fontSize: size * 0.42 }}
        >
          {initial}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-sm text-gray-900 group-hover:underline truncate">
          {name}
        </span>
        {(age || genderLabel) && (
          <span className="block text-[11px] text-gray-400 tabular-nums">
            {[age ? `${age}세` : null, genderLabel].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
    </Link>
  );
}
