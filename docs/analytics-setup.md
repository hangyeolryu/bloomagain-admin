# Analytics Setup for the Admin Dashboard

This guide covers the one-time setup to make GA4 funnel data queryable from
the admin dashboard. It also documents the existing Firestore-native
dashboards (sync failures, district density, backend health) that already
work out of the box.

---

## Already wired (no setup needed)

| Dashboard route | Data source | Purpose |
|---|---|---|
| `/dashboard/health` | Cloud Run `/api/v1/health` + `/api/v1/metrics` | Live backend status + request rate/latency |
| `/dashboard/sync-failures` | Firestore `sync_failures` collection | DLQ for failed backend→Firestore syncs |
| `/dashboard/district-density` | Firestore `district_density` collection | Cold-start geographic analysis |
| `/dashboard/alerts` | Firestore `admin_alerts` | App errors + security alerts from `AppErrorReporter` |

These three rely only on data that the backend already writes. **If they
appear empty**, confirm:

- Cloud Scheduler jobs `event-reminders-24h` and `district-density-aggregate`
  are running (see `bloomagain-backend/docs/ops-runbook.md` §4).
- The Cloud Run service account has
  `roles/firestore.user` on the `bloomagain-korea` project.
- `.env.local` or runtime env has `BLOOMAGAIN_BACKEND_URL`, `BACKEND_APP_ID`,
  `BACKEND_API_KEY` set (for `/dashboard/health` to proxy).

---

## Funnel dashboard (BigQuery — requires one-time setup)

The Flutter client fires a full set of milestone + funnel events to GA4 (see
`bloomagain-korea/docs/analytics-funnels.md` for the complete list). To
surface these inside the admin dashboard without leaving for ga.google.com,
we need BigQuery export enabled and one small additional page.

### One-time setup (~10 min)

1. **Enable BigQuery Linking** (Firebase Admin)
   - Go to Firebase Console → Project Settings → Integrations → BigQuery → Link
   - Select dataset location: **asia-northeast3** (same region as Cloud Run)
   - Export frequency: **Daily** is sufficient for beta; streaming costs more
   - Note the dataset name: it will be `analytics_<GA4_PROPERTY_ID>` (e.g.
     `analytics_123456789`). You'll need this for env vars.

2. **Grant BigQuery access** to the admin's Next.js runtime
   ```bash
   # Cloud Run / Firebase Hosting Cloud Function service account
   SA_EMAIL=$(gcloud iam service-accounts list \
     --project=bloomagain-korea \
     --filter='displayName:Firebase Admin SDK' \
     --format='value(email)')

   gcloud projects add-iam-policy-binding bloomagain-korea \
     --member="serviceAccount:$SA_EMAIL" \
     --role="roles/bigquery.dataViewer"
   gcloud projects add-iam-policy-binding bloomagain-korea \
     --member="serviceAccount:$SA_EMAIL" \
     --role="roles/bigquery.jobUser"
   ```

3. **Add env var** to the admin runtime
   ```
   GA4_BIGQUERY_DATASET=analytics_<GA4_PROPERTY_ID>
   ```

4. **Install the BigQuery client**
   ```bash
   cd bloomagain-admin
   npm install @google-cloud/bigquery
   ```

### Proposed implementation (future work)

When the team is ready, add:

- `lib/bigquery.ts` — thin wrapper around `@google-cloud/bigquery` with one
  prewritten query per dashboard tile
- `app/api/admin/funnel/route.ts` — server route that runs the funnel query
- `app/dashboard/analytics/funnel/page.tsx` — stacked bar visualization

**Prewritten query — onboarding conversion funnel:**

```sql
-- Count unique users who reached each stage, last 14 days
SELECT
  stage,
  COUNT(DISTINCT user_pseudo_id) AS users
FROM (
  SELECT
    user_pseudo_id,
    CASE
      WHEN event_name = 'splash_complete'        THEN '1_splash'
      WHEN event_name = 'age_gate_pass'          THEN '2_age_gate'
      WHEN event_name = 'profile_setup_complete' THEN '3_profile'
      WHEN event_name = 'first_circle_joined'    THEN '4_first_circle'
      WHEN event_name = 'first_event_attended'   THEN '5_first_event'
    END AS stage
  FROM `bloomagain-korea.${GA4_BIGQUERY_DATASET}.events_*`
  WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY))
            AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name IN (
      'splash_complete', 'age_gate_pass', 'profile_setup_complete',
      'first_circle_joined', 'first_event_attended'
    )
)
WHERE stage IS NOT NULL
GROUP BY stage
ORDER BY stage;
```

**Prewritten query — retention by wave-back cohort:**

```sql
-- D7 retention rate for users who received a wave-back within 48h vs those who didn't
WITH cohort AS (
  SELECT
    user_pseudo_id,
    MAX(IF(prop.key = 'wave_back_48h' AND prop.value.string_value = 'yes', 1, 0)) AS wave_back
  FROM `bloomagain-korea.${GA4_BIGQUERY_DATASET}.events_*`,
       UNNEST(user_properties) AS prop
  WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
            AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
  GROUP BY user_pseudo_id
),
returns AS (
  SELECT DISTINCT user_pseudo_id
  FROM `bloomagain-korea.${GA4_BIGQUERY_DATASET}.events_*`
  WHERE _TABLE_SUFFIX
        BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY))
            AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'session_start'
)
SELECT
  c.wave_back,
  COUNT(DISTINCT c.user_pseudo_id) AS cohort_size,
  COUNT(DISTINCT r.user_pseudo_id) AS retained_d7,
  SAFE_DIVIDE(COUNT(DISTINCT r.user_pseudo_id),
              COUNT(DISTINCT c.user_pseudo_id)) AS d7_rate
FROM cohort c
LEFT JOIN returns r USING (user_pseudo_id)
GROUP BY c.wave_back;
```

Both queries cost roughly $0.00 at beta scale (a few thousand events); keep
an eye on BigQuery billing once you cross 100k MAU.

---

## Fallback — GA4 Console is always available

The admin dashboard funnel page is an *optimization*, not a requirement. The
team can always check funnels + cohort analysis directly in
[GA4 Explore](https://analytics.google.com) — free, live, and authoritative.
Use the admin dashboard for things GA4 can't show (sync failures, district
density, backend health).
