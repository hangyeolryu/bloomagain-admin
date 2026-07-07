'use client';

/**
 * AI 검수 — LLM 파이프라인 자동 진단 + 봇/안전도우미 대화형 검수.
 *
 * 서버 상대는 Cloud Functions 두 개 (둘 다 admins/{email} 권한 확인):
 *  - runLlmDiagnostics: 배포 후 일괄 검증 8종 (판정 정확도·캐시·chat·접수·scam-check)
 *  - runLlmPlayground:  드라이런 검수 — bot_reply(실제 프롬프트, [문의접수] 발행돼도
 *    실제 접수·알림 없음) / scam_check / get_bot_prompt
 */

import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '@/lib/firebase';
import Header from '@/components/layout/Header';

const fns = () => getFunctions(app, 'asia-northeast3');

interface DiagCheck {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  latencyMs: number;
  detail: string;
}

interface BotTurn {
  role: 'user' | 'assistant';
  content: string;
  escalated?: boolean;
  latencyMs?: number;
}

interface ScamVerdict {
  risk: string;
  likely_intent: string;
  reasons: string[];
  actions: string[];
  needs_more_info: boolean;
  cached: boolean;
}

const BOT_PRESETS = [
  '구독 환불하고 싶어요',
  '친구 추천이 잘 안 나와요',
  '본인인증이 자꾸 실패해요',
  '오늘 좀 외롭네요',
  '어떤 분이 카톡으로 옮겨서 얘기하자는데 괜찮을까요?',
];

const SCAM_PRESETS = [
  '고객님 계좌가 범죄에 연루되었습니다. 검찰청입니다. 안전계좌로 이체하세요.',
  '어머님 저 폰 고장나서 그런데 이 번호로 문자주세요. 급해요.',
  '안녕하세요, 등산 모임에서 뵀던 김영수입니다. 다음 모임에도 나오시나요?',
  '요즘 코인으로 월 500씩 벌고 있어요. 소액으로 시작해보실래요?',
];

export default function AiReviewPage() {
  return (
    <div className="space-y-6">
      <Header
        title="AI 검수"
        subtitle="LLM 파이프라인 자동 진단과 봇·안전 도우미 대화형 검수. 검수는 드라이런 — 실제 문의 접수·알림이 발생하지 않습니다."
      />
      <DiagnosticsSection />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <BotReviewSection />
        <ScamReviewSection />
      </div>
      <PromptSection />
    </div>
  );
}

// ── 1. 자동 진단 ─────────────────────────────────────────────────────────

function DiagnosticsSection() {
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<DiagCheck[] | null>(null);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const call = httpsCallable<Record<string, never>, {
        passed: number; failed: number; skipped: number; checks: DiagCheck[];
      }>(fns(), 'runLlmDiagnostics', { timeout: 180_000 });
      const r = await call({});
      setChecks(r.data.checks);
      setSummary(`통과 ${r.data.passed} · 실패 ${r.data.failed} · 건너뜀 ${r.data.skipped}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900">🩺 파이프라인 자동 진단</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            배포 후 게이트웨이·사기 판정·캐시·봇 채팅·CS 접수·안전 도우미 8종을 일괄 검증합니다. (실제 AI 호출 6~7회)
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {running ? '진단 실행 중... (최대 1분)' : '전체 진단 실행'}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">❌ 실행 실패: {error}</p>
      )}

      {checks && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-gray-800 mb-2">{summary}</p>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
            {checks.map((c) => (
              <div key={c.name} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <span>{c.status === 'pass' ? '✅' : c.status === 'skip' ? '⚪' : '❌'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">
                    {c.name}
                    <span className="ml-2 text-xs text-gray-400">{c.latencyMs}ms</span>
                  </p>
                  {c.detail && (
                    <p className={`text-xs mt-0.5 break-all ${c.status === 'fail' ? 'text-red-600' : 'text-gray-500'}`}>
                      {c.detail}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── 2. 티타 도우미 검수 ──────────────────────────────────────────────────

function BotReviewSection() {
  const [turns, setTurns] = useState<BotTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: 'user', content: message }]);
    setInput('');
    setSending(true);
    try {
      const call = httpsCallable<
        { action: string; message: string; history: { role: string; content: string }[] },
        { reply: string; escalated: boolean; latencyMs: number }
      >(fns(), 'runLlmPlayground', { timeout: 60_000 });
      const r = await call({ action: 'bot_reply', message, history });
      setTurns((prev) => [...prev, {
        role: 'assistant',
        content: r.data.reply,
        escalated: r.data.escalated,
        latencyMs: r.data.latencyMs,
      }]);
    } catch (e) {
      setTurns((prev) => [...prev, {
        role: 'assistant',
        content: `⚠️ 오류: ${e instanceof Error ? e.message : e}`,
      }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">🤖 티타 도우미 검수</h2>
        {turns.length > 0 && (
          <button onClick={() => setTurns([])} className="text-xs text-gray-500 hover:text-gray-800">
            대화 초기화
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mt-0.5">
        실서비스와 같은 프롬프트로 답합니다. 접수 발행 시 배지로 표시됩니다.
      </p>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {BOT_PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => send(p)}
            disabled={sending}
            className="px-2.5 py-1 text-xs bg-teal-50 text-teal-800 rounded-full hover:bg-teal-100 disabled:opacity-50 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                t.role === 'user' ? 'bg-teal-100 text-teal-900' : 'bg-gray-100 text-gray-800'
              } ${t.escalated ? 'ring-2 ring-orange-400' : ''}`}
            >
              {t.content}
              {t.escalated && (
                <p className="mt-1.5 text-[11px] font-bold text-orange-600">
                  🔔 문의접수 발행됨 — 실제 대화라면 어드민 알림 + inquiries 기록
                </p>
              )}
              {t.latencyMs != null && (
                <p className="mt-1 text-[10px] text-gray-400">{t.latencyMs}ms</p>
              )}
            </div>
          </div>
        ))}
        {sending && <p className="text-xs text-gray-400">도우미가 답변 중...</p>}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="테스트 메시지 입력..."
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
        />
        <button
          type="submit"
          disabled={sending}
          className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          보내기
        </button>
      </form>
    </section>
  );
}

// ── 3. 의도·안전 도우미 검수 ─────────────────────────────────────────────

function ScamReviewSection() {
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [verdict, setVerdict] = useState<ScamVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async (text: string) => {
    const message = text.trim();
    if (!message || checking) return;
    setChecking(true);
    setError(null);
    setVerdict(null);
    try {
      const call = httpsCallable<{ action: string; message: string }, ScamVerdict>(
        fns(), 'runLlmPlayground', { timeout: 60_000 });
      const r = await call({ action: 'scam_check', message });
      setVerdict(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const riskStyle: Record<string, { badge: string; cls: string }> = {
    위험: { badge: '🔴 위험', cls: 'border-red-400 text-red-700' },
    주의: { badge: '🟡 수상 / 주의', cls: 'border-orange-400 text-orange-700' },
    평범: { badge: '🟢 평범해 보임', cls: 'border-green-400 text-green-700' },
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900">🛡️ 의도·안전 도우미 검수</h2>
      <p className="text-sm text-gray-500 mt-0.5">
        의심 문자를 넣으면 사용자에게 보여줄 판정 카드를 그대로 확인합니다.
      </p>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {SCAM_PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => {
              setInput(p);
              check(p);
            }}
            disabled={checking}
            className="px-2.5 py-1 text-xs bg-orange-50 text-orange-800 rounded-full hover:bg-orange-100 disabled:opacity-50 transition-colors"
            title={p}
          >
            {p.length > 26 ? `${p.slice(0, 26)}...` : p}
          </button>
        ))}
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={3}
        placeholder="검사할 문자 내용 붙여넣기..."
        className="mt-3 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
      />
      <button
        onClick={() => check(input)}
        disabled={checking}
        className="mt-2 w-full px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
      >
        {checking ? '판정 중...' : '판정하기'}
      </button>

      {error && <p className="mt-3 text-sm text-red-600">❌ {error}</p>}

      {verdict && (
        <div className={`mt-4 border-2 rounded-xl p-4 ${riskStyle[verdict.risk]?.cls ?? 'border-gray-300'}`}>
          <p className="font-bold">{riskStyle[verdict.risk]?.badge ?? verdict.risk}</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">🧭 {verdict.likely_intent}</p>
          <p className="mt-2 text-xs text-gray-500">왜 그렇게 봤나</p>
          <ul className="text-sm text-gray-800">
            {verdict.reasons.map((r) => <li key={r}>· {r}</li>)}
          </ul>
          <p className="mt-2 text-xs text-gray-500">지금 하실 일</p>
          <ul className="text-sm text-gray-800">
            {verdict.actions.map((a) => <li key={a}>· {a}</li>)}
          </ul>
          {verdict.cached && <p className="mt-2 text-[11px] text-gray-400">캐시된 판정</p>}
        </div>
      )}
    </section>
  );
}

// ── 4. 라이브 프롬프트(FAQ) 열람 ─────────────────────────────────────────

function PromptSection() {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const call = httpsCallable<{ action: string }, { prompt: string }>(
        fns(), 'runLlmPlayground', { timeout: 30_000 });
      const r = await call({ action: 'get_bot_prompt' });
      setPrompt(r.data.prompt);
    } catch (e) {
      setPrompt(`불러오기 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-gray-900">📄 현재 도우미 프롬프트 (FAQ 검수용)</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            지금 배포돼 있는 봇의 지시문·FAQ 원문입니다. 틀린 사실이 있으면 수정 요청하세요.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {loading ? '불러오는 중...' : prompt ? '새로고침' : '불러오기'}
        </button>
      </div>
      {prompt && (
        <pre className="mt-4 p-4 bg-gray-50 rounded-lg text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
          {prompt}
        </pre>
      )}
    </section>
  );
}
