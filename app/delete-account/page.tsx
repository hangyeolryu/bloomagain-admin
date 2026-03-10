'use client';

import { useState } from 'react';
import { submitDeleteRequest } from '@/lib/firestore';

export default function DeleteAccountPage() {
  const [name, setName]               = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [reason, setReason]           = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [error, setError]             = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contactInfo.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await submitDeleteRequest({ name: name.trim(), contactInfo: contactInfo.trim(), reason: reason.trim() });
      setSubmitted(true);
    } catch {
      setError('요청 전송 중 오류가 발생했습니다. 이메일로 직접 문의해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-3">
            <span className="text-xl">🌸</span>
            <span className="text-lg font-bold text-gray-900">다시, 봄</span>
            <span className="text-sm text-gray-400">Dasi, Bom</span>
          </div>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">계정 삭제 요청</h1>

          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-8">
            <div className="flex">
              <span className="text-red-400 text-xl flex-shrink-0">⚠️</span>
              <p className="ml-3 text-red-700">
                <strong>주의:</strong> 계정 삭제는 되돌릴 수 없는 작업입니다.
                삭제 후에는 모든 데이터가 영구적으로 제거됩니다.
              </p>
            </div>
          </div>

          {/* Request Form */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">삭제 요청하기</h2>
            {submitted ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <p className="text-4xl mb-3">✅</p>
                <p className="text-lg font-medium text-green-800">요청이 접수되었습니다.</p>
                <p className="text-green-700 mt-2">영업일 기준 3-5일 이내에 처리됩니다.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    이름 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="앱에서 사용하던 이름"
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    이메일 또는 전화번호 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    placeholder="등록된 이메일 주소 또는 전화번호"
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    삭제 사유 <span className="text-gray-400">(선택)</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="계정 삭제를 원하시는 이유를 알려주세요"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 text-sm resize-none"
                  />
                </div>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting || !name.trim() || !contactInfo.trim()}
                  className="w-full py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? '처리 중...' : '계정 삭제 요청 제출'}
                </button>
              </form>
            )}
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">앱 내에서 직접 삭제</h2>
            <div className="bg-blue-50 p-6 rounded-lg">
              <ol className="list-decimal list-inside text-blue-800 space-y-2">
                <li>다시, 봄 (Dasi, Bom) 앱을 실행합니다</li>
                <li>하단 메뉴에서 마이페이지를 선택합니다</li>
                <li>설정 → 개인정보 → 계정 삭제를 선택합니다</li>
                <li>삭제 확인 절차를 완료합니다</li>
              </ol>
              <p className="text-blue-700 text-sm mt-3">앱 내 삭제는 즉시 처리됩니다.</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">삭제되는 데이터</h2>
            <div className="bg-gray-50 p-6 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">프로필 정보</h4>
                  <ul className="list-disc list-inside text-gray-600 space-y-1 text-sm">
                    <li>이름 및 닉네임</li>
                    <li>출생년도</li>
                    <li>거주지 정보</li>
                    <li>관심사 및 취미</li>
                    <li>자기소개</li>
                    <li>프로필 사진</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">활동 데이터</h4>
                  <ul className="list-disc list-inside text-gray-600 space-y-1 text-sm">
                    <li>모든 메시지 및 대화</li>
                    <li>음성 메시지</li>
                    <li>서클 참여 기록</li>
                    <li>이벤트 참여 기록</li>
                    <li>친구 목록</li>
                    <li>차단/신고 기록</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">보존되는 데이터</h2>
            <div className="bg-yellow-50 p-6 rounded-lg">
              <ul className="list-disc list-inside text-yellow-800 space-y-2 text-sm">
                <li><strong>안전 관련 기록:</strong> 신고 및 차단 기록 (90일)</li>
                <li><strong>계정 삭제 요청 로그:</strong> 삭제 요청 및 처리 기록 (1년)</li>
                <li><strong>법적 요구사항:</strong> 법원 명령이나 수사기관 요청이 있는 경우</li>
                <li><strong>익명화된 통계:</strong> 개인을 식별할 수 없는 형태의 서비스 개선 데이터</li>
              </ul>
            </div>
          </section>

          <div className="border-t pt-6 mt-6 text-center text-sm text-gray-400">
            최종 업데이트: 2026년 01월 01일 ·{' '}
            <a href="mailto:hangyeolryu@gmail.com" className="underline">hangyeolryu@gmail.com</a>
          </div>
        </div>
      </main>
    </div>
  );
}
