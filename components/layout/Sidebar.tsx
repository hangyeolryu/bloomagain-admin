'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { type Permission, ADMIN_ROLE_LABELS } from '@/types';
import clsx from 'clsx';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission?: Permission;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: '대시보드', icon: '📊' },
  { href: '/dashboard/users', label: '사용자 관리', icon: '👥', permission: 'viewUsers' },
  { href: '/dashboard/circles', label: '모임 관리', icon: '🌿' },
  { href: '/dashboard/reports', label: '신고 관리', icon: '🚨' },
  { href: '/dashboard/alerts', label: '관리자 알림', icon: '🔔' },
  { href: '/dashboard/waves', label: '웨이브', icon: '👋' },
  { href: '/dashboard/conversations', label: '대화', icon: '💬' },
  { href: '/dashboard/security', label: '보안 이벤트', icon: '🛡️' },
  { href: '/dashboard/messages', label: '의심 메시지', icon: '🚫' },
  { href: '/dashboard/delete-requests', label: '계정 삭제 요청', icon: '🗑️' },
  { href: '/dashboard/announcements', label: '공지사항', icon: '📢', permission: 'manageCircles' },
  { href: '/dashboard/admins', label: '관리자 계정', icon: '🔑', permission: 'manageAdmins' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { signOut, user, role, can } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const visibleItems = navItems.filter((item) =>
    !item.permission || can(item.permission)
  );

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col min-h-screen">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <span className="text-xl">🌸</span>
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">다시, 봄</p>
            <p className="text-xs text-gray-500">관리자 대시보드</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {visibleItems.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive
                  ? 'bg-green-50 text-green-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">
            {user?.email?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">{user?.email}</p>
            <p className="text-xs text-gray-500">{role ? ADMIN_ROLE_LABELS[role] : '관리자'}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors"
        >
          <span>🚪</span>
          로그아웃
        </button>
      </div>
    </aside>
  );
}
