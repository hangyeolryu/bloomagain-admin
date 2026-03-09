'use client';

import { useEffect, useState } from 'react';
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  toggleAnnouncementActive,
} from '@/lib/firestore';
import { useAuth } from '@/lib/auth-context';
import type { Announcement, AnnouncementType } from '@/types';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function typeInfo(type: AnnouncementType) {
  if (type === 'important') return { variant: 'red' as const, label: '중요', emoji: '📢' };
  if (type === 'warning') return { variant: 'yellow' as const, label: '주의', emoji: '⚠️' };
  return { variant: 'blue' as const, label: '정보', emoji: 'ℹ️' };
}

const EMPTY_FORM = {
  title: '',
  body: '',
  type: 'info' as AnnouncementType,
  isActive: true,
  isPinned: false,
  ctaText: '',
  ctaRoute: '',
  expiresAt: undefined as Date | undefined,
};

type FormState = typeof EMPTY_FORM;

export default function AnnouncementsPage() {
  const { user, can } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [expiryInput, setExpiryInput] = useState('');

  const canManage = can('manageCircles'); // admin+

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const data = await getAnnouncements();
    setAnnouncements(data);
    setLoading(false);
  }

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setExpiryInput('');
    setShowForm(true);
  }

  function openEdit(a: Announcement) {
    setEditTarget(a);
    setForm({
      title: a.title,
      body: a.body,
      type: a.type,
      isActive: a.isActive,
      isPinned: a.isPinned,
      ctaText: a.ctaText ?? '',
      ctaRoute: a.ctaRoute ?? '',
      expiresAt: a.expiresAt,
    });
    setExpiryInput(
      a.expiresAt ? a.expiresAt.toISOString().substring(0, 10) : ''
    );
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditTarget(null);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      const parsedExpiry = expiryInput ? new Date(expiryInput) : undefined;
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        type: form.type,
        isActive: form.isActive,
        isPinned: form.isPinned,
        ctaText: form.ctaText.trim() || undefined,
        ctaRoute: form.ctaRoute.trim() || undefined,
        expiresAt: parsedExpiry,
      };

      if (editTarget) {
        await updateAnnouncement(editTarget.id, payload);
        setAnnouncements((prev) =>
          prev.map((a) =>
            a.id === editTarget.id
              ? { ...a, ...payload, createdAt: a.createdAt }
              : a
          )
        );
      } else {
        const id = await createAnnouncement(
          { ...payload, createdBy: user?.email ?? '' },
          user?.email ?? ''
        );
        setAnnouncements((prev) => [
          {
            id,
            ...payload,
            createdBy: user?.email ?? '',
            createdAt: new Date(),
          },
          ...prev,
        ]);
      }
      closeForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(a: Announcement) {
    setToggling(a.id);
    await toggleAnnouncementActive(a.id, !a.isActive);
    setAnnouncements((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, isActive: !x.isActive } : x))
    );
    setToggling(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteAnnouncement(deleteTarget.id);
    setAnnouncements((prev) => prev.filter((a) => a.id !== deleteTarget.id));
    setDeleting(false);
    setDeleteTarget(null);
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <Header
        title="공지사항 관리"
        subtitle={`전체 ${announcements.length}건 · 활성 ${announcements.filter((a) => a.isActive).length}건`}
        action={
          canManage ? (
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition-colors"
            >
              + 새 공지
            </button>
          ) : null
        }
      />

      {announcements.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">📋</p>
          <p>등록된 공지사항이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const { variant, label, emoji } = typeInfo(a.type);
            const expired = a.expiresAt && a.expiresAt < new Date();
            return (
              <div
                key={a.id}
                className={`bg-white rounded-2xl border shadow-sm p-5 transition-opacity ${
                  !a.isActive || expired ? 'opacity-60 border-gray-100' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl flex-shrink-0">{emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant={variant}>{label}</Badge>
                      {a.isPinned && (
                        <span className="text-xs text-gray-500">📌 고정</span>
                      )}
                      {!a.isActive && <Badge variant="gray">비활성</Badge>}
                      {expired && <Badge variant="red">만료됨</Badge>}
                      <span className="text-sm font-semibold text-gray-800">
                        {a.title}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap mb-2">
                      {a.body}
                    </p>
                    {a.ctaText && a.ctaRoute && (
                      <p className="text-xs text-blue-600 mb-1">
                        버튼: &quot;{a.ctaText}&quot; → {a.ctaRoute}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                      <span>등록: {formatDate(a.createdAt)}</span>
                      {a.expiresAt && (
                        <span>만료: {formatDate(a.expiresAt)}</span>
                      )}
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleToggle(a)}
                        disabled={toggling === a.id}
                        className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors disabled:opacity-50 ${
                          a.isActive
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {toggling === a.id
                          ? '...'
                          : a.isActive
                          ? '비활성화'
                          : '활성화'}
                      </button>
                      <button
                        onClick={() => openEdit(a)}
                        className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => setDeleteTarget(a)}
                        className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showForm}
        onClose={closeForm}
        title={editTarget ? '공지사항 수정' : '새 공지사항'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="공지 제목"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              내용 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="공지 내용"
              rows={4}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                유형
              </label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value as AnnouncementType }))
                }
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="info">정보 (파란색)</option>
                <option value="warning">주의 (주황색)</option>
                <option value="important">중요 (빨간색)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                만료일
              </label>
              <input
                type="date"
                value={expiryInput}
                onChange={(e) => setExpiryInput(e.target.value)}
                min={new Date().toISOString().substring(0, 10)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              버튼 텍스트 (선택)
            </label>
            <input
              type="text"
              value={form.ctaText}
              onChange={(e) => setForm((f) => ({ ...f, ctaText: e.target.value }))}
              placeholder="예: 지금 인증하기"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              버튼 이동 경로 (선택)
            </label>
            <input
              type="text"
              value={form.ctaRoute}
              onChange={(e) => setForm((f) => ({ ...f, ctaRoute: e.target.value }))}
              placeholder="예: /settings/identity"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isActive: e.target.checked }))
                }
                className="w-4 h-4 accent-green-600"
              />
              <span className="text-sm text-gray-700">활성화</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isPinned}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isPinned: e.target.checked }))
                }
                className="w-4 h-4 accent-green-600"
              />
              <span className="text-sm text-gray-700">상단 고정</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={closeForm}
              disabled={saving}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim() || !form.body.trim()}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {saving ? '저장 중...' : editTarget ? '저장' : '등록'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="공지사항 삭제"
      >
        <p className="text-sm text-gray-600 mb-4">
          &quot;{deleteTarget?.title}&quot; 공지사항을 삭제하시겠습니까?
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
