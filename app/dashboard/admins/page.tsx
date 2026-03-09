"use client";

import {useEffect, useState} from "react";
import {
  getAdmins,
  addAdmin,
  updateAdminRole,
  deactivateAdmin,
  reactivateAdmin,
  removeAdmin,
  type AdminRecord,
} from "@/lib/firestore";
import {useAuth} from "@/lib/auth-context";
import {type AdminRole, ADMIN_ROLE_LABELS} from "@/types";
import Header from "@/components/layout/Header";
import Badge from "@/components/ui/Badge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";

const ROLES: AdminRole[] = ["super_admin", "admin", "moderator", "viewer"];

const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: "모든 권한 + 관리자 계정 관리",
  admin: "사용자·모임·신고·알림 관리",
  moderator: "신고·알림 처리 (사용자 관리 불가)",
  viewer: "조회만 가능 (모든 수정 불가)",
};

function RoleBadge({role}: {role: AdminRole}) {
  const colors: Record<AdminRole, string> = {
    super_admin: "bg-purple-100 text-purple-700 border-purple-200",
    admin: "bg-blue-100 text-blue-700 border-blue-200",
    moderator: "bg-orange-100 text-orange-700 border-orange-200",
    viewer: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full border ${colors[role]}`}
    >
      {ADMIN_ROLE_LABELS[role]}
    </span>
  );
}

function formatDate(date?: Date) {
  if (!date) return "-";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminsPage() {
  const {user, role: myRole} = useAuth();
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<AdminRole>("admin");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Only super_admin can access this page
  if (myRole !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="text-5xl mb-4">🔒</span>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">
          접근 권한 없음
        </h2>
        <p className="text-sm text-gray-500">
          관리자 계정 관리는 최고 관리자만 가능합니다.
        </p>
      </div>
    );
  }

  const load = () => {
    setLoading(true);
    getAdmins().then((a) => {
      setAdmins(
        a.sort((x, y) => (x.active === y.active ? 0 : x.active ? -1 : 1)),
      );
      setLoading(false);
    });
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    if (!newEmail.trim() || !user?.email) return;
    setError("");
    setSaving(true);
    try {
      await addAdmin(
        newEmail.trim(),
        newRole,
        user.email,
        newName.trim() || undefined,
      );
      setAddModal(false);
      setNewEmail("");
      setNewName("");
      setNewRole("admin");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "추가 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (email: string, role: AdminRole) => {
    await updateAdminRole(email, role);
    setAdmins((prev) =>
      prev.map((a) => (a.email === email ? {...a, role} : a)),
    );
  };

  const handleDeactivate = async (email: string) => {
    if (email === user?.email)
      return alert("본인 계정은 비활성화할 수 없습니다.");
    await deactivateAdmin(email);
    setAdmins((prev) =>
      prev.map((a) => (a.email === email ? {...a, active: false} : a)),
    );
  };

  const handleReactivate = async (email: string) => {
    await reactivateAdmin(email);
    setAdmins((prev) =>
      prev.map((a) => (a.email === email ? {...a, active: true} : a)),
    );
  };

  const handleRemove = async (email: string) => {
    if (email === user?.email) return alert("본인 계정은 삭제할 수 없습니다.");
    if (!confirm(`${email} 관리자를 완전히 삭제하시겠습니까?`)) return;
    await removeAdmin(email);
    setAdmins((prev) => prev.filter((a) => a.email !== email));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-3xl">
      <Header
        title="관리자 계정 관리"
        subtitle="admins/{email} Firestore 컬렉션"
        action={
          <button
            onClick={() => setAddModal(true)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            + 관리자 추가
          </button>
        }
      />

      {/* Role guide */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {ROLES.map((r) => (
          <div
            key={r}
            className="bg-white border border-gray-100 rounded-xl p-3 text-sm"
          >
            <div className="mb-1">
              <RoleBadge role={r} />
            </div>
            <p className="text-xs text-gray-500">{ROLE_DESCRIPTIONS[r]}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {admins.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-3xl mb-2">🔑</p>
            <p>등록된 관리자 없음</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  이메일
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  역할
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  상태
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  추가된 날
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {admins.map((a) => (
                <tr key={a.email} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900">{a.email}</p>
                    {a.displayName && (
                      <p className="text-xs text-gray-400">{a.displayName}</p>
                    )}
                    {a.email === user?.email && (
                      <span className="text-xs text-green-600 font-medium">
                        (본인)
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {a.email === user?.email ? (
                      <RoleBadge role={a.role} />
                    ) : (
                      <select
                        value={a.role}
                        onChange={(e) =>
                          handleRoleChange(a.email, e.target.value as AdminRole)
                        }
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ADMIN_ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {a.active ? (
                      <Badge variant="green">활성</Badge>
                    ) : (
                      <Badge variant="gray">비활성</Badge>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-500 text-xs">
                    {formatDate(a.addedAt)}
                  </td>
                  <td className="px-5 py-4">
                    {a.email !== user?.email && (
                      <div className="flex gap-2">
                        {a.active ? (
                          <button
                            onClick={() => handleDeactivate(a.email)}
                            className="text-xs text-orange-600 hover:underline font-medium"
                          >
                            비활성화
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(a.email)}
                            className="text-xs text-blue-600 hover:underline font-medium"
                          >
                            재활성화
                          </button>
                        )}
                        <button
                          onClick={() => handleRemove(a.email)}
                          className="text-xs text-red-600 hover:underline font-medium"
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Modal */}
      <Modal
        isOpen={addModal}
        onClose={() => {
          setAddModal(false);
          setNewEmail("");
          setNewName("");
          setNewRole("admin");
          setError("");
        }}
        title="관리자 추가"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이메일 *
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="admin@example.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이름 (선택)
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="홍길동"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              역할 *
            </label>
            <div className="space-y-2">
              {ROLES.map((r) => (
                <label
                  key={r}
                  className="flex items-start gap-3 cursor-pointer group"
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={newRole === r}
                    onChange={() => setNewRole(r)}
                    className="mt-0.5 accent-green-600"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-800">
                      {ADMIN_ROLE_LABELS[r]}
                    </span>
                    <p className="text-xs text-gray-400">
                      {ROLE_DESCRIPTIONS[r]}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => {
                setAddModal(false);
                setNewEmail("");
                setNewName("");
                setNewRole("admin");
                setError("");
              }}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !newEmail.trim()}
              className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium"
            >
              {saving ? "추가 중..." : "추가"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
