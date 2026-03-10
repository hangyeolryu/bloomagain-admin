export const metadata = {
  title: '계정 삭제 요청 | 다시, 봄',
  description: '다시, 봄 계정 삭제 안내',
};

export default function DeleteAccountPage() {
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

      {/* Main Content */}
      <main className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">계정 삭제 요청</h1>

          <div className="prose prose-lg max-w-none">
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-8">
              <div className="flex">
                <span className="text-red-400 text-xl flex-shrink-0">⚠️</span>
                <p className="ml-3 text-red-700">
                  <strong>주의:</strong> 계정 삭제는 되돌릴 수 없는 작업입니다.
                  삭제 후에는 모든 데이터가 영구적으로 제거됩니다.
                </p>
              </div>
            </div>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">계정 삭제 방법</h2>
              <div className="space-y-4">
                <div className="bg-blue-50 p-6 rounded-lg">
                  <h3 className="text-lg font-medium text-blue-900 mb-3">방법 1: 앱 내에서 삭제 (권장)</h3>
                  <ol className="list-decimal list-inside text-blue-800 space-y-2">
                    <li>다시, 봄 (Dasi, Bom) 앱을 실행합니다</li>
                    <li>하단 메뉴에서 마이페이지를 선택합니다</li>
                    <li>설정 → 개인정보 → 계정 삭제를 선택합니다</li>
                    <li>삭제 확인 절차를 완료합니다</li>
                  </ol>
                </div>

                <div className="bg-green-50 p-6 rounded-lg">
                  <h3 className="text-lg font-medium text-green-900 mb-3">방법 2: 이메일로 요청</h3>
                  <p className="text-green-800 mb-3">
                    앱을 사용할 수 없는 경우, 다음 정보와 함께 이메일로 삭제를 요청할 수 있습니다:
                  </p>
                  <ul className="list-disc list-inside text-green-800 space-y-1">
                    <li>등록된 이메일 주소 또는 전화번호</li>
                    <li>앱에서 사용하던 이름</li>
                    <li>계정 삭제 요청 사유</li>
                  </ul>
                  <p className="text-green-800 mt-3">
                    <strong>이메일:</strong>{' '}
                    <a href="mailto:hangyeolryu@gmail.com" className="underline">hangyeolryu@gmail.com</a>
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">삭제되는 데이터</h2>
              <div className="bg-gray-50 p-6 rounded-lg">
                <p className="text-gray-700 mb-4">계정 삭제 시 다음 데이터가 영구적으로 삭제됩니다:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">프로필 정보</h4>
                    <ul className="list-disc list-inside text-gray-600 space-y-1">
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
                    <ul className="list-disc list-inside text-gray-600 space-y-1">
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
                <p className="text-yellow-800 mb-4">
                  법적 의무 및 보안을 위해 다음 데이터는 일정 기간 보존될 수 있습니다:
                </p>
                <ul className="list-disc list-inside text-yellow-800 space-y-2">
                  <li><strong>안전 관련 기록:</strong> 신고 및 차단 기록 (90일)</li>
                  <li><strong>계정 삭제 요청 로그:</strong> 삭제 요청 및 처리 기록 (1년)</li>
                  <li><strong>법적 요구사항:</strong> 법원 명령이나 수사기관 요청이 있는 경우</li>
                  <li><strong>익명화된 통계:</strong> 개인을 식별할 수 없는 형태의 서비스 개선 데이터</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">처리 기간</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-indigo-600 text-xl flex-shrink-0">📱</span>
                  <div>
                    <h3 className="font-medium text-gray-900">앱 내 삭제 요청</h3>
                    <p className="text-gray-600">즉시 처리 (실시간)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-indigo-600 text-xl flex-shrink-0">📧</span>
                  <div>
                    <h3 className="font-medium text-gray-900">이메일 삭제 요청</h3>
                    <p className="text-gray-600">영업일 기준 3-5일 내 처리</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">삭제 전 확인사항</h2>
              <div className="bg-red-50 border border-red-200 p-6 rounded-lg">
                <h3 className="font-medium text-red-900 mb-3">계정 삭제 전에 다음을 확인해 주세요:</h3>
                <ul className="list-disc list-inside text-red-800 space-y-2">
                  <li>중요한 대화나 정보를 백업했는지 확인</li>
                  <li>서클에서의 역할이나 책임을 다른 멤버에게 이관했는지 확인</li>
                  <li>진행 중인 이벤트나 약속이 있는지 확인</li>
                  <li>다른 사용자와의 중요한 연결이 있는지 확인</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">문의 및 지원</h2>
              <div className="bg-blue-50 p-6 rounded-lg">
                <p className="text-blue-800 mb-4">
                  계정 삭제와 관련하여 궁금한 점이 있으시면 언제든지 문의해 주세요.
                </p>
                <div className="space-y-2">
                  <p className="text-blue-800">
                    <strong>계정 삭제 전용 이메일:</strong>{' '}
                    <a href="mailto:hangyeolryu@gmail.com" className="underline">hangyeolryu@gmail.com</a>
                  </p>
                  <p className="text-blue-800">
                    <strong>일반 고객지원:</strong>{' '}
                    <a href="mailto:hangyeolryu@gmail.com" className="underline">hangyeolryu@gmail.com</a>
                  </p>
                  <p className="text-blue-800">
                    <strong>운영시간:</strong> 평일 09:00 - 18:00 (한국시간)
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">계정 재가입</h2>
              <div className="bg-gray-50 p-6 rounded-lg">
                <p className="text-gray-700">
                  계정을 삭제한 후에도 언제든지 다시 가입할 수 있습니다.
                  다만, 이전의 데이터는 복구되지 않으며,
                  새로운 계정으로 처음부터 시작해야 합니다.
                </p>
              </div>
            </section>

            <div className="border-t pt-8 mt-8 text-center">
              <p className="text-sm text-gray-500 mb-6">
                <strong>최종 업데이트:</strong> 2026년 01월 01일
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href="mailto:hangyeolryu@gmail.com"
                  className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                >
                  계정 삭제 요청하기
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
