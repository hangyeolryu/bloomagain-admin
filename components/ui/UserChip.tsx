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
  showActivity = false,
}: {
  uid: string;
  user?: UserProfile | null;
  size?: number;
  showActivity?: boolean;
}) {
  const name = user?.displayName || `${uid.slice(0, 6)}…`;
  const year = user?.legalBirthYear ?? user?.yearOfBirth;
  const age = year ? new Date().getFullYear() - Number(year) : null;
  const g = user?.gender;
  const genderLabel = g === 'female' ? '여' : g === 'male' ? '남' : null;
  const initial = (user?.displayName || '?').trim().charAt(0);

  // 성별은 색으로도 구분한다. 명단을 훑을 때 글자를 하나씩 읽지 않아도
  // 남녀 구성이 한눈에 보여야 한다 — 자리가 한쪽 성별로 쏠렸는지가
  // 운영에서 제일 자주 보는 것이다.
  const genderColor =
    g === 'female' ? 'text-rose-600' : g === 'male' ? 'text-sky-700' : 'text-gray-400';
  const ringColor =
    g === 'female' ? 'ring-rose-300' : g === 'male' ? 'ring-sky-300' : 'ring-gray-200';

  // 활성도 — 마지막 접속. 대화가 이어질 수 있는 사이인지 판단하려면
  // 지금도 앱에 들어오시는 분인지가 먼저다.
  const seen = user?.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
  const days = seen ? Math.floor((Date.now() - seen) / 86400000) : null;
  const activity =
    days === null
      ? { label: '기록 없음', cls: 'bg-gray-100 text-gray-400' }
      : days <= 1
        ? { label: '오늘', cls: 'bg-green-50 text-green-700' }
        : days <= 7
          ? { label: `${days}일 전`, cls: 'bg-lime-50 text-lime-700' }
          : days <= 30
            ? { label: `${days}일 전`, cls: 'bg-amber-50 text-amber-700' }
            : { label: `${days}일 전`, cls: 'bg-gray-100 text-gray-500' };

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
          className={`rounded-full object-cover bg-gray-100 shrink-0 ring-2 ${ringColor}`}
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          className={`rounded-full bg-gray-100 text-gray-500 grid place-items-center shrink-0 font-semibold ring-2 ${ringColor}`}
          style={{ width: size, height: size, fontSize: size * 0.42 }}
        >
          {initial}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-sm text-gray-900 group-hover:underline truncate">
          {name}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] tabular-nums">
          {(age || genderLabel) && (
            <span className={genderColor}>
              {[age ? `${age}세` : null, genderLabel].filter(Boolean).join(' ')}
            </span>
          )}
          {showActivity && (
            <span className={`px-1.5 rounded ${activity.cls}`}>{activity.label}</span>
          )}
        </span>
      </span>
    </Link>
  );
}
