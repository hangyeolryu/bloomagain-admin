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
  { href: '/dashboard/identity', label: 'NICE 본인확인', icon: '🪪' },
  { href: '/dashboard/security', label: '보안 이벤트', icon: '🛡️' },
  { href: '/dashboard/messages', label: '의심 메시지', icon: '🚫' },
  { href: '/dashboard/delete-requests', label: '계정 삭제 요청', icon: '🗑️' },
  { href: '/dashboard/announcements', label: '공지사항', icon: '📢', permission: 'manageCircles' },
  { href: '/dashboard/admins', label: '관리자 계정', icon: '🔑', permission: 'manageAdmins' },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
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

  const content = (
    <aside className="w-64 bg-white flex flex-col h-full border-r border-gray-200">
      {/* Logo */}
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
            <span className="text-lg">🌸</span>
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">다시, 봄</p>
            <p className="text-xs text-gray-500">관리자 대시보드</p>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="md:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          aria-label="메뉴 닫기"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive
                  ? 'bg-green-50 text-green-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-2.5 mb-2 px-2">
          <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700 flex-shrink-0">
            {user?.email?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">{user?.email}</p>
            <p className="text-xs text-gray-500">{role ? ADMIN_ROLE_LABELS[role] : '관리자'}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors"
        >
          <span>🚪</span>
          로그아웃
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile: backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile: slide-in drawer */}
      <div
        className={clsx(
          'fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out md:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {content}
      </div>

      {/* Desktop: static sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-shrink-0 md:flex-col md:min-h-screen">
        {content}
      </div>
    </>
  );
}
