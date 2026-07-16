<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Vercel and Neon cost safeguards

Neon transfer/egress and Vercel observability are budget-sensitive. Preserve application behavior, but follow these backend rules for every change:

- Never run `CREATE TABLE`, `ALTER TABLE`, or other schema checks inside normal request handlers. Put schema setup and migrations in `initDb` or an explicit one-time migration path.
- Keep ordinary reads and writes to the fewest reasonable database round trips. Prefer one bounded query, an atomic upsert, a CTE, or `RETURNING` over read-before-write sequences when correctness is equivalent.
- Select only the columns the caller uses. Avoid `SELECT *`, unbounded history, and broad table reads. Use sensible date bounds and `LIMIT` values.
- Do not return large photo/base64/blob fields unless the open screen explicitly needs them. List, dashboard, report, and background requests should default to lightweight metadata/text; use flags such as `includePhotos=false` or a dedicated detail/media request.
- Batch related configuration reads instead of making one request per key. Reuse data already loaded by the page rather than refetching it from enhancer components.
- Do not poll Neon-backed API routes. Refresh on explicit user actions, relevant events, or actual date/state changes; deduplicate in-flight requests. High-frequency timers may inspect local state only.
- Avoid high-frequency Vercel crons, request fan-out, and background refresh loops. Any new scheduled or repeated server work must have a clear need and a bounded cadence.
- Keep production logs sparse. Log actionable errors, not successful requests or routine state. Never log full database rows, notes, images, request bodies, secrets, or other large/personal payloads.
- Production verification should use status-only or narrowly scoped requests where possible; do not download private or large response bodies just to check health.
- Do not weaken user-visible functionality or data correctness merely to save queries. If an operation genuinely needs more data or an additional round trip, keep it bounded and document the reason in the code or handoff.

When changing a Neon-backed path, compare it with commit `fba31f2` (`Reduce Neon database egress`) and explicitly check for runtime DDL, redundant queries, polling, unbounded reads, and oversized payloads before committing.

# Workflow rules

- When the user reports a broken AI behavior using a specific chat, phrase, model response, body part, exercise, date, or visual, treat that example as evidence of a broader failure mode. Fix the underlying intent detection, prompt contract, validation, fallback, data-shaping, UI affordance, or test coverage so adjacent phrasings and future cases improve too. Do not hardcode the user's specific example unless the app already has a real domain entity by that name and the requested change is explicitly about that entity.
- Preserve AI date navigation as a permanent response invariant. If an AI answer mentions a real saved calendar date, the reply must include the matching `dateLinks` entry through normal responses, validation/repair, deterministic answers, and degraded fallbacks. Never return a date-bearing answer with an empty `dateLinks` array, and keep regression coverage for this behavior.
- Do not create pull requests unless explicitly asked for a PR.
- Do not run `gh pr create`.
- Prefer committing and pushing directly to `main`.
- After completing changes, run:
  - `git status`
  - `git add .`
  - `git commit -m "Clear short message"`
  - `git pull --rebase origin main`
  - `git push origin main`
- If direct push to `main` is unavailable in Codex cloud, stop and explain the limitation instead of creating a PR.
