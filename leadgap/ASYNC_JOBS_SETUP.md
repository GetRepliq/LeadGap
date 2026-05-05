# Async Jobs Setup (Render + Supabase)

## 1) Create queue table in Supabase

Run this SQL in Supabase SQL editor:

```sql
create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',
  payload jsonb not null,
  result jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_jobs_status_created
  on public.agent_jobs(status, created_at);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_agent_jobs_updated_at on public.agent_jobs;
create trigger trg_agent_jobs_updated_at
before update on public.agent_jobs
for each row execute function public.set_updated_at();
```

## 2) Add environment variable

Set `WORKER_TOKEN` in your Next.js Render service.

## 3) Start worker loop on Render Background Worker

Use this command in a Render Background Worker service:

```bash
while true; do
  curl -sS -X POST "https://<your-web-service>/api/worker/agent" -H "x-worker-token: $WORKER_TOKEN" >/dev/null
  sleep 2
done
```

## 4) Behavior

- `POST /api/agent` now returns `202` + `{ jobId, status: "pending" }` for scrape intents.
- Frontend polls `GET /api/job/:jobId` every 3s.
- Worker endpoint processes one pending job per call.
