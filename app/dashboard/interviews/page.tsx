'use client';

// 길거리 인터뷰 — quick capture form for in-person field interviews.
//
// Design goal: a non-technical interviewer should be able to fill out a
// 7-question record while the respondent is still answering. Every input
// is a radio or checkbox so they tap-tap-tap, hit save, the form resets,
// and they move to the next person. Free-text comment is optional and
// captured last so the keyboard never blocks the flow.
//
// 2026-05-16: created for the May trip (May 17 ~ June 13). Lives at
// /dashboard/interviews under existing admin auth — partner just needs
// to log in once with their admin email.

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  saveStreetInterview,
  getRecentStreetInterviews,
  getStreetInterviewStats,
} from '@/lib/firestore';
import {
  APPS_KNOWN_OPTIONS,
  NON_USE_REASON_OPTIONS,
  DESIRED_FEATURE_OPTIONS,
  INTERVIEW_LOCATION_OPTIONS,
  type StreetInterview,
  type StreetInterviewAgeBand,
  type StreetInterviewGender,
  type StreetInterviewRegion,
  type StreetInterviewLocation,
  type AwarenessAnswer,
  type WillingnessAnswer,
} from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// ── Static option groups (radio) ────────────────────────────────────────────

const AGE_BAND_OPTIONS: Array<{ value: StreetInterviewAgeBand; label: string }> = [
  { value: '50s_early', label: '50대 초 (50~54)' },
  { value: '50s_late', label: '50대 후 (55~59)' },
  { value: '60s_early', label: '60대 초 (60~64)' },
  { value: '60s_late', label: '60대 후 (65~69)' },
  { value: '70_plus', label: '70대 이상' },
  { value: 'under_50', label: '50대 미만' },
  { value: 'unknown', label: '모름' },
];

const GENDER_OPTIONS: Array<{ value: StreetInterviewGender; label: string }> = [
  { value: 'female', label: '여' },
  { value: 'male', label: '남' },
  { value: 'undisclosed', label: '응답 X' },
];

const REGION_OPTIONS: Array<{ value: StreetInterviewRegion; label: string }> = [
  { value: 'seoul', label: '서울' },
  { value: 'gyeonggi_incheon', label: '경기·인천' },
  { value: 'other_metro', label: '광역시' },
  { value: 'rural', label: '지방·농촌' },
  { value: 'unknown', label: '모름' },
];

const AWARENESS_OPTIONS: Array<{ value: AwarenessAnswer; label: string }> = [
  { value: 'yes', label: '들어봤다' },
  { value: 'no', label: '못 들어봤다' },
  { value: 'unsure', label: '잘 모름' },
];

const WILLINGNESS_OPTIONS: Array<{ value: WillingnessAnswer; label: string }> = [
  { value: 'very', label: '매우 의향 있음' },
  { value: 'somewhat', label: '보통' },
  { value: 'low', label: '별로' },
  { value: 'no', label: '의향 없음' },
];

// ── Blank initial state — used on mount and after every save reset ─────────

interface FormState {
  location: StreetInterviewLocation | '';
  ageBand: StreetInterviewAgeBand | '';
  gender: StreetInterviewGender | '';
  region: StreetInterviewRegion | '';
  knowsHobbyApps: AwarenessAnswer | '';
  appsKnown: string[];
  nonUseReasons: string[];
  willingnessToUse: WillingnessAnswer | '';
  desiredFeatures: string[];
  freeText: string;
}

const BLANK: FormState = {
  location: '',
  ageBand: '',
  gender: '',
  region: '',
  knowsHobbyApps: '',
  appsKnown: [],
  nonUseReasons: [],
  willingnessToUse: '',
  desiredFeatures: [],
  freeText: '',
};

// ── Page ────────────────────────────────────────────────────────────────────

export default function InterviewsPage() {
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(BLANK);
  // Remember last-picked location so consecutive interviews at the same
  // place don't re-ask — the field interviewer is at one spot for hours.
  const [stickyLocation, setStickyLocation] = useState<StreetInterviewLocation | ''>('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [stats, setStats] = useState<{ total: number; today: number; thisWeek: number } | null>(
    null,
  );
  const [recent, setRecent] = useState<StreetInterview[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load stats + recent on mount and after every save
  const refresh = async () => {
    try {
      const [s, r] = await Promise.all([
        getStreetInterviewStats(),
        getRecentStreetInterviews(10),
      ]);
      setStats(s);
      setRecent(r);
    } catch (e) {
      console.warn('[interviews] refresh failed:', e);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Helpers
  const toggleArray = (field: 'appsKnown' | 'nonUseReasons' | 'desiredFeatures', value: string) => {
    setForm((f) => {
      const has = f[field].includes(value);
      return {
        ...f,
        [field]: has ? f[field].filter((v) => v !== value) : [...f[field], value],
      };
    });
  };

  const canSubmit =
    form.location !== '' &&
    form.ageBand !== '' &&
    form.gender !== '' &&
    form.region !== '' &&
    form.knowsHobbyApps !== '' &&
    form.willingnessToUse !== '';

  const handleSave = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveStreetInterview({
        location: form.location as StreetInterviewLocation,
        interviewer: user?.email ?? user?.uid ?? 'unknown',
        ageBand: form.ageBand as StreetInterviewAgeBand,
        gender: form.gender as StreetInterviewGender,
        region: form.region as StreetInterviewRegion,
        knowsHobbyApps: form.knowsHobbyApps as AwarenessAnswer,
        appsKnown: form.appsKnown,
        nonUseReasons: form.nonUseReasons,
        willingnessToUse: form.willingnessToUse as WillingnessAnswer,
        desiredFeatures: form.desiredFeatures,
        freeText: form.freeText.trim() || undefined,
        createdBy: user?.uid ?? 'unknown',
      });

      // Save the location for the next interview, reset everything else.
      const lastLoc = form.location as StreetInterviewLocation;
      setStickyLocation(lastLoc);
      setForm({ ...BLANK, location: lastLoc });

      // Visual confirmation — green flash for 1.2s
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);

      // Refresh stats + recent in background
      refresh();

      // Scroll to top so the interviewer is ready for the next person
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      const msg = (e as Error).message ?? '저장 실패';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Apply sticky location if form is blank
  useEffect(() => {
    if (!form.location && stickyLocation) {
      setForm((f) => ({ ...f, location: stickyLocation }));
    }
  }, [stickyLocation, form.location]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (!user) return <LoadingSpinner message="인증 확인 중..." />;

  return (
    <div className="pb-24">
      {/* Header w/ stats */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">길거리 인터뷰</h1>
        <p className="text-sm text-gray-500 mt-1">
          빠르게 입력 → 저장 → 다음 사람. 라디오·체크박스 위주, 텍스트는 선택.
        </p>
        {stats && (
          <div className="flex gap-3 mt-4">
            <Pill label="오늘" value={stats.today} accent="bg-emerald-100 text-emerald-700" />
            <Pill label="7일" value={stats.thisWeek} accent="bg-blue-100 text-blue-700" />
            <Pill label="누적" value={stats.total} accent="bg-slate-100 text-slate-700" />
          </div>
        )}
      </div>

      {/* Save flash */}
      {savedFlash && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 text-sm font-medium animate-pulse">
          ✅ 저장됨. 다음 인터뷰 준비됐어요.
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
          ❌ {error}
        </div>
      )}

      {/* ── Q0. 인터뷰 장소 ── */}
      <FormSection num="📍" title="인터뷰 장소" required>
        <RadioGrid
          options={INTERVIEW_LOCATION_OPTIONS}
          selected={form.location}
          onChange={(v) => setForm((f) => ({ ...f, location: v as StreetInterviewLocation }))}
        />
      </FormSection>

      {/* ── Q1. 응답자 인구통계 ── */}
      <FormSection num="👤" title="응답자" required>
        <Label>연령대</Label>
        <RadioGrid
          options={AGE_BAND_OPTIONS}
          selected={form.ageBand}
          onChange={(v) => setForm((f) => ({ ...f, ageBand: v as StreetInterviewAgeBand }))}
        />
        <Label className="mt-4">성별</Label>
        <RadioGrid
          options={GENDER_OPTIONS}
          selected={form.gender}
          onChange={(v) => setForm((f) => ({ ...f, gender: v as StreetInterviewGender }))}
        />
        <Label className="mt-4">거주 지역</Label>
        <RadioGrid
          options={REGION_OPTIONS}
          selected={form.region}
          onChange={(v) => setForm((f) => ({ ...f, region: v as StreetInterviewRegion }))}
        />
      </FormSection>

      {/* ── Q2. 인지도 ── */}
      <FormSection num="1️⃣" title="취미·모임 앱 들어보셨어요?" required>
        <RadioGrid
          options={AWARENESS_OPTIONS}
          selected={form.knowsHobbyApps}
          onChange={(v) => setForm((f) => ({ ...f, knowsHobbyApps: v as AwarenessAnswer }))}
        />

        {form.knowsHobbyApps === 'yes' && (
          <>
            <Label className="mt-4">어떤 앱? (여러 개 가능)</Label>
            <CheckboxGrid
              options={APPS_KNOWN_OPTIONS}
              selected={form.appsKnown}
              onToggle={(v) => toggleArray('appsKnown', v)}
            />
          </>
        )}
      </FormSection>

      {/* ── Q3. 미사용 이유 ── */}
      <FormSection num="2️⃣" title="사용 안 하는 이유 (여러 개 가능)">
        <CheckboxGrid
          options={NON_USE_REASON_OPTIONS}
          selected={form.nonUseReasons}
          onToggle={(v) => toggleArray('nonUseReasons', v)}
        />
      </FormSection>

      {/* ── Q4. 다시봄 설명 후 의향 ── */}
      <FormSection num="3️⃣" title='"다시봄 같은 앱이 있다면" 사용 의향' required>
        <p className="text-xs text-gray-500 mb-3 -mt-1">
          💡 설명 예시: &ldquo;50대 이상만, 본인인증 받고, AI가 사기 차단, 동네 친구·모임
          추천하는 앱이에요.&rdquo;
        </p>
        <RadioGrid
          options={WILLINGNESS_OPTIONS}
          selected={form.willingnessToUse}
          onChange={(v) =>
            setForm((f) => ({ ...f, willingnessToUse: v as WillingnessAnswer }))
          }
        />
      </FormSection>

      {/* ── Q5. 어떤 기능이 있으면 ── */}
      <FormSection num="4️⃣" title="어떤 기능이 있으면 쓰실 것 같으세요? (여러 개)">
        <CheckboxGrid
          options={DESIRED_FEATURE_OPTIONS}
          selected={form.desiredFeatures}
          onToggle={(v) => toggleArray('desiredFeatures', v)}
        />
      </FormSection>

      {/* ── Q6. 자유 코멘트 ── */}
      <FormSection num="💬" title="기타 코멘트 (선택)">
        <textarea
          value={form.freeText}
          onChange={(e) => setForm((f) => ({ ...f, freeText: e.target.value }))}
          rows={3}
          placeholder='기억나는 한 마디 — "비싸지 않으면 써볼게요" 같이'
          className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
        />
      </FormSection>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-white border-t border-gray-200 p-4 shadow-lg">
        <button
          onClick={handleSave}
          disabled={!canSubmit || saving}
          className={`w-full py-4 rounded-xl font-bold text-base transition-all ${
            canSubmit && !saving
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.99]'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {saving ? '저장 중...' : canSubmit ? '저장 + 다음 인터뷰' : '필수 항목을 모두 골라주세요'}
        </button>
      </div>

      {/* ── Recent entries (collapsible feel) ── */}
      {recent.length > 0 && (
        <div className="mt-10 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900 text-sm">최근 10건</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              본인 저장이 정상 반영되는지 확인용. 익명 집계.
            </p>
          </div>
          <ul className="divide-y divide-gray-50">
            {recent.map((iv) => (
              <li key={iv.id} className="px-5 py-3 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-gray-700">
                    {locationLabel(iv.location)} · {ageBandShort(iv.ageBand)} ·{' '}
                    {iv.gender === 'female' ? '여' : iv.gender === 'male' ? '남' : '-'}
                  </span>
                  <span className="text-gray-400 whitespace-nowrap">
                    {iv.conductedAt
                      ? iv.conductedAt.toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </span>
                </div>
                <div className="text-gray-500 mt-1">
                  의향: <span className="font-medium">{willingnessLabel(iv.willingnessToUse)}</span>
                  {iv.freeText && ` · &ldquo;${iv.freeText.slice(0, 30)}${iv.freeText.length > 30 ? '...' : ''}&rdquo;`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Helpers (formatting) ────────────────────────────────────────────────

function locationLabel(loc: StreetInterviewLocation): string {
  return INTERVIEW_LOCATION_OPTIONS.find((o) => o.value === loc)?.label ?? loc;
}

function ageBandShort(band: StreetInterviewAgeBand): string {
  return AGE_BAND_OPTIONS.find((o) => o.value === band)?.label.split(' ')[0] ?? '?';
}

function willingnessLabel(w: WillingnessAnswer): string {
  return WILLINGNESS_OPTIONS.find((o) => o.value === w)?.label ?? '?';
}

// ─── Reusable UI bits ────────────────────────────────────────────────────

function FormSection({
  num,
  title,
  required,
  children,
}: {
  num: string;
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      <h3 className="font-semibold text-gray-900 text-base flex items-center gap-2 mb-3">
        <span className="text-xl">{num}</span>
        <span>{title}</span>
        {required && <span className="text-red-500 text-xs">*</span>}
      </h3>
      {children}
    </section>
  );
}

function Label({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 ${className}`}>
      {children}
    </div>
  );
}

function RadioGrid<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  selected: T | '';
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {options.map((opt) => {
        const isOn = selected === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${
              isOn
                ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-semibold'
                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckboxGrid({
  options,
  selected,
  onToggle,
}: {
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {options.map((opt) => {
        const isOn = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-colors flex items-center gap-2 ${
              isOn
                ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-semibold'
                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
            }`}
          >
            <span
              className={`inline-flex w-4 h-4 items-center justify-center rounded border-2 flex-shrink-0 ${
                isOn
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-gray-300'
              }`}
            >
              {isOn && (
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                  <path
                    fillRule="evenodd"
                    d="M16.704 5.296a1 1 0 010 1.408l-7 7a1 1 0 01-1.408 0l-3-3a1 1 0 011.408-1.408L9 11.59l6.296-6.294a1 1 0 011.408 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </span>
            <span className="flex-1">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Pill({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${accent}`}>
      <span className="font-semibold">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}
