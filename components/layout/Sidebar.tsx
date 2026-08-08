'use client';

import { useState } from 'react';
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
  /** 묶음 이름. 없으면 맨 위 고정(대시보드·통계). */
  section?: string;
}

// 메뉴가 38개까지 늘면서 한 줄로 세워두면 찾을 수가 없었다. 하는 일로 묶고,
// 지금 보고 있는 묶음만 펼친다 — 나머지는 헤더만 남아 사이드바가 짧아진다.
//
// 묶는 기준은 화면 이름이 아니라 **언제 쓰는가**다. 자리를 열 때, 사람을
// 볼 때, 사고가 났을 때가 각각 다른 묶음이어야 손이 덜 간다.

const navItems: NavItem[] = [
  // 맨 위 고정 — 매일 여는 두 개.
  { href: '/dashboard', label: '대시보드', icon: '📊' },
  { href: '/dashboard/stats', label: '통계 오버뷰', icon: '📈' },

  // 사람을 데려오는 일.
  { href: '/dashboard/needs', label: '니즈 설문 (5060)', icon: '🧭', section: '모으기' },
  { href: '/dashboard/marketing', label: '마케팅 운영', icon: '📣', section: '모으기' },
  { href: '/dashboard/gyeol', label: '결 유형 테스트', icon: '🍵', section: '모으기' },
  { href: '/dashboard/onboarding', label: '온보딩 드롭오프', icon: '🪜', section: '모으기' },
  { href: '/dashboard/identity', label: 'NICE 본인확인', icon: '🪪', section: '모으기' },

  // 실제로 만나게 하는 일 — 이 앱의 본론.
  { href: '/dashboard/titatime', label: '티타임 자리 관리', icon: '🫖', section: '만나기' },
  { href: '/dashboard/teatime', label: '티타임 신청 명단', icon: '📋', section: '만나기' },
  { href: '/dashboard/moim', label: '결모임 자리표', icon: '🎟️', section: '만나기' },
  { href: '/dashboard/moim-builder', label: '티타임 편성 (QA)', icon: '🪑', section: '만나기' },
  { href: '/dashboard/matching', label: '매칭 모니터링', icon: '💞', section: '만나기' },
  { href: '/dashboard/district-density', label: '지역 밀집도', icon: '🗺️', section: '만나기' },

  // 누가 있고 무엇을 올렸나.
  { href: '/dashboard/users', label: '사용자 관리', icon: '👥', section: '사람·콘텐츠', permission: 'viewUsers' },
  { href: '/dashboard/circles', label: '모임 관리', icon: '🌿', section: '사람·콘텐츠' },
  { href: '/dashboard/posts', label: '전체 게시물', icon: '📸', section: '사람·콘텐츠' },
  { href: '/dashboard/stories', label: '사연 투고', icon: '✍️', section: '사람·콘텐츠' },
  { href: '/dashboard/waves', label: '웨이브', icon: '👋', section: '사람·콘텐츠' },
  { href: '/dashboard/conversations', label: '대화', icon: '💬', section: '사람·콘텐츠' },

  // 사고가 났을 때 여는 곳. 안전 센터가 첫 줄이어야 한다.
  { href: '/dashboard/safety', label: '안전 센터', icon: '🛟', section: '신뢰·안전' },
  { href: '/dashboard/reports', label: '신고 관리', icon: '🚨', section: '신뢰·안전' },
  { href: '/dashboard/messages', label: '의심 메시지', icon: '🚫', section: '신뢰·안전' },
  { href: '/dashboard/ai-review', label: 'AI 검수', icon: '🧠', section: '신뢰·안전' },
  { href: '/dashboard/alerts', label: '관리자 알림', icon: '🔔', section: '신뢰·안전' },
  { href: '/dashboard/security', label: '보안 이벤트', icon: '🛡️', section: '신뢰·안전' },

  // 사용자에게 답하는 일.
  { href: '/dashboard/support', label: '고객 문의', icon: '🎧', section: '응대' },
  { href: '/dashboard/admin-dms', label: '어드민 DM 관리', icon: '✉️', section: '응대' },
  { href: '/dashboard/announcements', label: '공지사항', icon: '📢', section: '응대', permission: 'manageCircles' },
  { href: '/dashboard/delete-requests', label: '계정 삭제 요청', icon: '🗑️', section: '응대' },
  { href: '/dashboard/churn-surveys', label: '탈퇴 사유', icon: '🚪', section: '응대' },

  // 결큐(일일 질문) 운영.
  { href: '/dashboard/data-collection', label: '결큐 인사이트', icon: '🌱', section: '결큐' },
  { href: '/dashboard/gyeolq-bank', label: '결큐 질문 관리', icon: '📝', section: '결큐' },

  // 평소엔 볼 일 없는 것들.
  { href: '/dashboard/health', label: '백엔드 상태', icon: '💚', section: '시스템' },
  { href: '/dashboard/sync-failures', label: '싱크 실패', icon: '🔁', section: '시스템' },
  { href: '/dashboard/data-maintenance', label: '데이터 유지보수', icon: '🧹', section: '시스템', permission: 'manageUsers' },
  { href: '/dashboard/admins', label: '관리자 계정', icon: '🔑', section: '시스템', permission: 'manageAdmins' },
  { href: '/dashboard/docs', label: '문서', icon: '📚', section: '시스템' },
  { href: '/dashboard/briefing', label: '사업계획·IP 브리핑', icon: '📑', section: '시스템' },
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

  // 신뢰·안전 세부 4개는 평소 접혀 있고, 그 페이지에 있으면 자동으로 펼친다.
  // 지금 보고 있는 묶음은 저절로 펼친다. 나머지는 접혀 있고, 눌러서 편 건
  // 기억한다 — 매번 같은 곳을 다시 펴게 하면 접는 의미가 없다.
  const activeSection = visibleItems.find((x) =>
    x.href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(x.href)
  )?.section;
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const secOpen = (sec: string) => opened[sec] ?? sec === activeSection;
  const toggle = (sec: string) =>
    setOpened((o) => ({ ...o, [sec]: !(o[sec] ?? sec === activeSection) }));

  const content = (
    <aside className="w-64 bg-white flex flex-col h-full border-r border-gray-200">
      {/* Logo */}
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
            <span className="text-lg">🍵</span>
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">티타</p>
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
        {visibleItems.map((item, i) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
          const sec = item.section;
          // 접힌 묶음은 숨긴다. 단 지금 그 페이지면 언제나 보여준다 —
          // 내가 어디 있는지 사라지면 길을 잃는다.
          if (sec && !secOpen(sec) && !isActive) return null;
          const showHeader = !!sec && sec !== visibleItems[i - 1]?.section;
          const count = sec
            ? visibleItems.filter((x) => x.section === sec).length
            : 0;
          return (
            <div key={item.href}>
              {showHeader && sec && (
                <button
                  type="button"
                  onClick={() => toggle(sec)}
                  className="mt-3 flex w-full items-center justify-between px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600"
                >
                  <span>{sec}</span>
                  <span className="flex items-center gap-1 font-medium normal-case tracking-normal">
                    {!secOpen(sec) && <span className="tabular-nums">{count}</span>}
                    <span>{secOpen(sec) ? '▴' : '▾'}</span>
                  </span>
                </button>
              )}
              <Link
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
            </div>
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
