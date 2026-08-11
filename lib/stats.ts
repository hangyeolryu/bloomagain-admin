import { getDocs, query, collection, where } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import { db } from './firebase';

function toDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  return undefined;
}

export interface TrendPoint {
  label: string;
  date: Date;
  count: number;
}

export interface RetentionStat {
  kept: number;
  eligible: number;
}

export interface CohortRow {
  cohortLabel: string;
  cohortStart: Date;
  total: number;
  months: Array<{ count: number; pct: number; isPartial: boolean } | null>;
}

export interface StatsPageData {
  total: number;
  today: number;
  d7: number;
  d7prev: number;
  d30: number;
  d30prev: number;
  dailyAvg30: number;
  dau: number;
  wau: number;
  mau: number;
  activeCount: number;
  notifEnabled: number;
  hasInterests: number;
  trend30d: TrendPoint[];
  trend12w: TrendPoint[];
  trend12m: TrendPoint[];
  usersWithoutCreatedAt: number;
  retention: { d1: RetentionStat; d7: RetentionStat; d30: RetentionStat; d90: RetentionStat };
  cohorts: CohortRow[];
}

export async function getStatsPageData(): Promise<StatsPageData> {
  const now = new Date();
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  const ms = (days: number) => days * 86_400_000;

  // Single fetch of all identity-verified users
  const snap = await getDocs(query(collection(db, 'users'), where('identityVerified', '==', true)));

  interface RawUser {
    createdAt: Date | null;
    lastActiveAt: Date | null;
    accountStatus: string | null;
    notificationEnabled: boolean;
    hasInterests: boolean;
  }

  const users: RawUser[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      createdAt: toDate(data.createdAt) ?? null,
      lastActiveAt: toDate(data.lastActiveAt) ?? null,
      accountStatus: data.accountStatus ?? null,
      notificationEnabled: data.notificationEnabled === true,
      hasInterests: Array.isArray(data.interests) && data.interests.length > 0,
    };
  });

  const total = users.length;
  const usersWithoutCreatedAt = users.filter((u) => !u.createdAt).length;

  const ago = (days: number) => new Date(now.getTime() - ms(days));
  const countCreated = (from: Date, to?: Date) =>
    users.filter((u) => u.createdAt && u.createdAt >= from && (!to || u.createdAt < to)).length;
  const countActive = (from: Date) =>
    users.filter((u) => u.lastActiveAt && u.lastActiveAt >= from).length;

  const today   = countCreated(todayMidnight);
  const d7      = countCreated(ago(7));
  const d7prev  = countCreated(ago(14), ago(7));
  const d30     = countCreated(ago(30));
  const d30prev = countCreated(ago(60), ago(30));
  const dailyAvg30 = Math.round((d30 / 30) * 10) / 10;

  const dau = countActive(todayMidnight);
  const wau = countActive(ago(7));
  const mau = countActive(ago(30));

  const activeCount   = users.filter((u) => !u.accountStatus || u.accountStatus === 'active').length;
  const notifEnabled  = users.filter((u) => u.notificationEnabled).length;
  const hasInterests  = users.filter((u) => u.hasInterests).length;

  // Daily 30d trend
  const trend30d: TrendPoint[] = Array.from({ length: 30 }, (_, i) => {
    const dayStart = new Date(todayMidnight.getTime() - (29 - i) * ms(1));
    const dayEnd   = new Date(dayStart.getTime() + ms(1));
    return {
      label: `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
      date:  dayStart,
      count: countCreated(dayStart, dayEnd),
    };
  });

  // Weekly 12w (Monday-start)
  const currentMonday = new Date(todayMidnight);
  const dow = currentMonday.getDay();
  currentMonday.setDate(currentMonday.getDate() - (dow === 0 ? 6 : dow - 1));

  const trend12w: TrendPoint[] = Array.from({ length: 12 }, (_, i) => {
    const wStart = new Date(currentMonday.getTime() - (11 - i) * 7 * ms(1));
    const wEnd   = new Date(wStart.getTime() + 7 * ms(1));
    return {
      label: `${wStart.getMonth() + 1}/${wStart.getDate()}~`,
      date:  wStart,
      count: countCreated(wStart, wEnd),
    };
  });

  // Monthly 12m
  const trend12m: TrendPoint[] = Array.from({ length: 12 }, (_, i) => {
    const mStart = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const mEnd   = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 1);
    return {
      label: `${mStart.getMonth() + 1}월`,
      date:  mStart,
      count: countCreated(mStart, mEnd),
    };
  });

  function retFor(days: number): RetentionStat {
    const cutoff = ago(days);
    const eligible = users.filter((u) => u.createdAt && u.createdAt <= cutoff);
    const kept = eligible.filter(
      (u) => u.lastActiveAt && u.createdAt &&
        u.lastActiveAt.getTime() >= u.createdAt.getTime() + ms(days)
    );
    return { kept: kept.length, eligible: eligible.length };
  }

  const retention = { d1: retFor(1), d7: retFor(7), d30: retFor(30), d90: retFor(90) };

  // Cohort retention (last 8 signup months × M0–M5)
  const cohorts: CohortRow[] = [];
  for (let i = 7; i >= 0; i--) {
    const cStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const cEnd   = new Date(cStart.getFullYear(), cStart.getMonth() + 1, 1);
    const cohortUsers = users.filter(
      (u) => u.createdAt && u.createdAt >= cStart && u.createdAt < cEnd
    );
    if (cohortUsers.length === 0) continue;

    const months = Array.from({ length: 6 }, (_, m) => {
      const windowEnd = new Date(cStart.getTime() + (m + 1) * 30 * ms(1));
      const isPartial = windowEnd > now;
      if (m === 0) {
        return { count: cohortUsers.length, pct: 100, isPartial: cEnd > now };
      }
      const eligible = cohortUsers.filter(
        (u) => u.createdAt && now.getTime() >= u.createdAt.getTime() + m * 30 * ms(1)
      );
      if (eligible.length === 0) return null;
      const kept = eligible.filter(
        (u) => u.lastActiveAt && u.createdAt &&
          u.lastActiveAt.getTime() >= u.createdAt.getTime() + m * 30 * ms(1)
      );
      return { count: kept.length, pct: Math.round((kept.length / eligible.length) * 100), isPartial };
    });

    cohorts.push({
      cohortLabel: cStart.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }),
      cohortStart: cStart,
      total: cohortUsers.length,
      months,
    });
  }

  return {
    total, today, d7, d7prev, d30, d30prev, dailyAvg30,
    dau, wau, mau, activeCount, notifEnabled, hasInterests,
    trend30d, trend12w, trend12m, usersWithoutCreatedAt,
    retention, cohorts,
  };
}