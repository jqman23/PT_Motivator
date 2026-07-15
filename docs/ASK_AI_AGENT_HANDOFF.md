# Ask AI and Agent Handoff

Last updated: 2026-07-15

Agent implementation baseline: `7c730f6` (`Add undoable AI agent actions`)

Implementation state: the original transaction protocol was introduced in `7c730f6`; the current repository HEAD includes the July 15 Ask AI reliability, fallback-key, whole-history, UI, and liberal-planning hardening described below.

This document is the source of truth for continuing work on Ask AI, `/ai` note guidance, history retrieval, chat persistence, and authorized AI agent actions. It records the product intent, implementation, database behavior, verification, important decisions, and known continuation points.

## Product Intent

Ask AI is intended to be more than a generic chat box. It should:

- Answer questions about saved PT history without inventing facts or dates.
- Find plausible historical days efficiently before spending AI tokens.
- Use optional user-authored `/ai` guidance to focus retrieval and answering.
- Preserve conversational context and let the user recall prior chats.
- Present dates in a human format and make relevant dates useful navigation targets.
- Propose app changes when explicitly requested.
- Never silently mutate data. Every AI-proposed write must be reviewable and explicitly authorized.
- Make an authorized group of changes behave like one app action that the existing Undo button can reverse.
- Scale to additional slash commands and additional agent actions without replacing the editor or execution architecture.

The interaction model is deliberately split into four stages:

1. Deterministic retrieval and validation.
2. AI reasoning and structured planning.
3. Human review and authorization.
4. Deterministic transactional execution and Undo.

The AI is not trusted as an executor. It can only propose data that passes the server-owned protocol.

Direct command detection includes ordinary app verbs such as add, change, log, record, save, attach, move, turn on/off, and navigation wording, plus completion statements, direct health values, PT/training dates, doctor questions, sets/reps statements, and short follow-ups such as “yes, do that.” Advice, hypothetical, and capability questions are excluded. When a command is recognized, the model must return a non-empty plan or ask one clarification. A liberal model-output adapter accepts common camelCase/snake_case action names, nested parameter objects, names in place of IDs, relative dates, and supported action aliases before the strict protocol validator runs. If the first response still has no plan, a dedicated zero-temperature planner gets one bounded retry. Explicit navigation, numeric health commands, health notes, PT sessions, doctor questions/follow-ups, exercise metrics, and exact-name exercise completion/note commands also have deterministic server fallbacks. Agent answers are rewritten to server-owned review language so the assistant never claims a proposed change already happened. A missing or invalid plan is surfaced explicitly in the answer UI and is never silently downgraded to ordinary chat.

## Work Leading to the Current State

The current feature was built incrementally across these commits, newest first:

| Commit | Purpose |
| --- | --- |
| `7c730f6` | Added versioned agent actions, review UI, transactional execution, durable Undo, navigation, and live verification. |
| `3b5b021` | Refined Ask AI history surfaces and visual treatment. |
| `bbcff11` | Polished Ask AI controls and action-bar placement. |
| `eeea657` | Added durable database-backed Ask AI chat history. |
| `ff542f4` | Fixed navigation from Ask AI to a suggested day. |
| `ab1925b` | Preserved the active Ask AI conversation and improved date presentation. |
| `5c4497f` | Prevented assistant questions from being emitted as tap-to-send user replies. |
| `9c6abb1` | Hardened mobile `/ai` command editing. |
| `9af85a5` | Restored first-Enter command exit and normal multiline behavior in the AI composer. |
| `1afdd53` | Added mobile composer resize/expand behavior matching health metric text boxes. |
| `2865d70` | Added `/ai` note guidance and the Scout reranking stage. |
| `ac4faa7` | Replaced basic history selection with advanced deterministic ranking. |
| `39f410a` through `f0b975b` | Fixed saved-secret deletion boundaries, caret positioning, and mobile typing stability. |
| `28c1598` through `659d0a9` | Rebuilt and refined the inline secret/command editor used as the foundation for `/ai`. |

Adjacent mobile work also stabilized the action bar, scroll-to-health/top controls, and the quick exercise metric popup. Those changes are not part of the agent protocol, but they matter when testing navigation and mobile overlays.

## Current User Experience

### Ask AI Entry Points

Ask AI can be opened from:

- The Ask AI setting/tile.
- The AI icon in the action bar.

The action-bar AI icon is conditional on the `aiCoach` widget preference. Disabling Ask AI removes the icon. The icon is positioned to the right of the theme/sun control and uses its highlighted AI color while other settings remain restrained.

### Composer Behavior

The Ask AI composer uses `SecretTextarea`, so `/ai` instructions have the same inline outlined visual language as commands in notes.

Current behavior:

- `/ai` works at valid command boundaries, including in the middle of a sentence.
- It does not require the user to type slowly.
- The first Enter while editing an `/ai` block exits the command block without inserting an unwanted blank line.
- Subsequent Enter presses create normal newlines.
- Enter in the Ask AI composer does not submit the question.
- Submission is an explicit button action.
- The mobile composer can be vertically resized/expanded.
- The default mobile answer/composer area is larger than the original version.
- The four initial prompt ideas and their surrounding separators were removed to save vertical space.

The related editor implementation is in `components/SecretTextarea.tsx`, `lib/noteCommands.ts`, and `lib/secretNotes.ts`.

### `/ai` Guidance Semantics

`/ai` content is user-authored focus guidance, not factual evidence. Example:

```text
Describe my pain over the past seven days /ai focus on pain and general notes
```

The serialized form is an internal `ai` block. Visible note text excludes this payload. `extractAiInstructions()` returns normalized guidance separately.

Guidance can come from:

- The current Ask AI question.
- Recent conversation messages.
- Exercise notes on candidate days.
- Health note fields on candidate days.
- PT/training session notes.

System prompts explicitly state that guidance cannot override factual records, medical safety, privacy, or system rules.

Secret blocks are never exposed as ordinary AI context. `stripSecretNotes()` removes both secret and command payloads from visible text, while only `/ai` payloads are extracted through the dedicated function.

## History Retrieval Pipeline

History retrieval is intentionally staged to control tokens and improve accuracy.

### When History Loads

The route loads personal day history only when the request indicates:

- A historical/date lookup.
- A pattern or trend question.
- An explicit date.
- A deterministic bulk action based on note text.
- `/ai` guidance that requires looking through saved records.

General public questions do not automatically load personal history.

The default history window is 365 days. `AI_HISTORY_DAYS_PTMOTIVATOR` may configure it, bounded between 90 and 730 days. An explicitly referenced older date can extend the lower bound to that date.

### Deterministic Ranking

`lib/historyRanking.ts` performs the first ranking without AI.

It indexes each day into weighted fields:

- Exercise notes: weight `3.5`.
- PT/training session notes: weight `3.2`.
- Pain/general health notes: weight `3.0`.
- Treatment notes: weight `2.9`.
- Sleep/energy/mood notes: weight `2.1`.
- Completed exercises: weight `1.5`.
- Date/weekday metadata: weight `0.8`.

The query planner adds:

- Normalized and stemmed terms.
- Exact quoted and multiword phrases.
- Deterministic synonym groups for symptoms, anatomy, PT, medication, sleep, and exercise concepts.
- Context terms from recent conversation at a lower weight.
- Typo-tolerant matching.
- Exact phrase bonuses.
- Field-aware evidence.
- Explicit-date priority.
- Selected-day priority when the wording refers to this/that day.
- Earliest/latest ordering.
- Highest/lowest metric ordering.
- Correct best/worst interpretation based on whether higher values are good or bad.
- Day-before/day-after temporal relationships around PT, training, or treatment anchors.
- Recency as a small tie-breaker rather than the primary signal.
- Reciprocal-rank-style fusion (`RRF_K = 24`) across retrieval evidence.

The deterministic stage returns at most 24 plausible candidates and does not pad the result with unrelated days.

Whole-history comparisons are handled separately from targeted retrieval. Requests using all/every/each/entire/full/complete/whole/overall/all-time/lifetime language, “look through everything,” “since I started tracking,” “leave nothing out,” “compare them all,” or a global best/worst superlative all select this path. The main model receives one compact structured row for every loaded saved day, including the core health metrics, session kind, activity/note counts, and a bounded notable-context excerpt. Scout may still choose detailed candidate records, but those candidates no longer define the comparison scope. The UI reports `Compared all N saved days` for this path and hides the Scout-candidate label so it cannot imply that a 24-candidate shortlist was the full comparison.

### Scout Reranking

If deterministic ranking returns more than eight candidates, a compact Scout-style reranking request selects up to eight date IDs.

The reranker receives only bounded candidate summaries, not the full history. It can use:

- Retrieval evidence.
- Compact exercise notes.
- Compact health values and notes.
- Session context.
- Saved `/ai` guidance.
- The current question and the last four conversation messages.

The reranker must return only candidate date IDs. It cannot invent dates. Its output budget is currently 220 completion tokens. If reranking fails or returns nothing valid, the app falls back to the top eight deterministic candidates.

The default reranker chain is:

1. `meta-llama/llama-4-scout-17b-16e-instruct`
2. `openai/gpt-oss-20b`
3. `qwen/qwen3-32b`
4. `llama-3.3-70b-versatile`

### Main Answer Model

Personal history and symptom questions use the personal model chain:

1. `openai/gpt-oss-120b`
2. `llama-3.3-70b-versatile`
3. `qwen/qwen3-32b`
4. `meta-llama/llama-4-scout-17b-16e-instruct`
5. `openai/gpt-oss-20b`
6. `qwen/qwen3.6-27b`
7. `llama-3.1-8b-instant`

Clearly public/non-personal questions may try `groq/compound-mini` and `groq/compound` before that chain. Compound models are intentionally excluded from personal-history requests because they may invoke external tools.

The main Ask AI answer budget is currently 950 completion tokens. Model chains can be overridden with the bounded `GROQ_MODELS_PTMOTIVATOR_*` environment variables defined in `lib/groq.ts`. Each model is tried with `GROQ_KEY_PTMOTIVATOR`, then `GROQ_KEY2_PTMOTIVATOR`, `GROQ_KEY3_PTMOTIVATOR`, and `GROQ_KEY4_PTMOTIVATOR` before the cascade advances to the next model. Missing and duplicate keys are skipped.

Operational context discussed during development: the available `gpt-oss-120b` limit was 8K TPM and 200K TPD. The retrieval architecture was designed so deterministic ranking and compact reranking reduce the amount of history sent to the main model.

## Answer Presentation

### Dates

The model is instructed to write exact dates as ISO `YYYY-MM-DD` so the response remains machine-readable.

The UI renders:

- Current-year dates as `M/D`.
- Other-year dates as `M/D/YY`.

Dates mentioned inline are parsed by `lib/aiDatePresentation.ts`. When a deterministic one-sentence summary is available for that date, the date is clickable and opens a small day-at-a-glance popup. This summary is built from already loaded records and does not require another AI call.

Suggested-day tiles open the selected day normally and close the overlay instead of leaving Ask AI floating above the destination. The active conversation is kept in browser session storage so reopening Ask AI resumes where the user left off.

Suggested-day tiles are server-gated. A model-supplied tile survives only when its exact date is materially cited in the answer or was explicitly requested by the user. The route does not auto-fill tiles from the top retrieval candidates. If the AI request fails, only explicit dates or dates backed by high-confidence deterministic evidence may be shown; merely related-looking days are omitted.

Inline date links use normal line-height and inline flow. They must not introduce vertical margins or extra line spacing.

### Suggested Replies

Tap-to-send reply options must be answers written from the user's perspective. Assistant questions, generic prompts, and instructional text are removed by `normalizeAiReplyOptions()`.

The assistant may ask at most one clarifying question, and that question belongs in the answer text rather than in the tap-to-send options.

## Chat Persistence

Database-backed chat history is implemented by `app/api/ai-chat-sessions/route.ts` and `lib/aiChatHistory.ts`.

The `ai_chat_sessions` table stores:

- Session ID.
- Generated title from the first user message.
- Compact preview.
- Normalized message JSON.
- Message count.
- Created and updated timestamps.

Behavior and limits:

- Chat lists are keyset-paginated, 30 by default and at most 50 per page.
- Full messages load only when a conversation is opened.
- A conversation keeps at most the latest 100 normalized messages.
- Stored answer text, options, date links, date summaries, exercise drafts, model metadata, and agent-plan state are bounded.
- Saves are serialized through a client-side promise queue so a slower prior save cannot overwrite a newer conversation state.
- The currently active conversation is also mirrored in `sessionStorage` under `pt-ai-coach-session-v1`.
- Closing Ask AI intentionally clears the active browser session, but the database chat remains available in history.
- Navigating from Ask AI preserves the active browser session so returning to Ask AI resumes the same conversation.

The history UI uses inset, rounded conversation cards inside a clipped modal shell. Keep bottom spacing beneath the final card, and do not let exercise/date surfaces visually bleed beyond the popup background.

## AI Agent Protocol

The versioned protocol is in `lib/aiAgent.ts`.

Current protocol version: `1`.

Maximum normalized/expanded action count: `100`.

### Supported Write Actions

| Type | Purpose |
| --- | --- |
| `completion_set` | Check or uncheck one exercise on one date. |
| `exercise_note_change` | Append to or replace an exercise note. |
| `health_change` | Append/replace a health note or set/clear a numeric health field. |
| `metrics_set` | Set sets, reps or duration, weight, unit, and `x1/x2/x4` scope. |
| `metrics_clear` | Remove an exercise metric row for a date. |
| `exercise_add` | Add an app-ready exercise and place it in a category. |
| `exercise_update` | Update supported exercise fields. |
| `exercise_move` | Move an exercise into a named category. |
| `exercise_remove` | Remove an exercise from the library and all categories. |
| `category_upsert` | Add or rename/recolor a category. |
| `category_remove` | Remove an existing empty category. |
| `doctor_note_upsert` | Create, update, or append to a doctor note. |
| `doctor_note_remove` | Delete a doctor note when safe to reverse. |
| `pt_session_upsert` | Add/update a PT or training session. |
| `pt_session_remove` | Remove a PT or training session. |
| `widget_set` | Enable or disable a supported app widget. |
| `app_title_set` | Change the app title. |
| `photo_attach` | Attach one user-selected photo to a supported destination. |
| `bulk_completion_from_note` | Deterministically set completion on matching note dates. |

### Navigation Actions

`navigate` can open:

- A date.
- A specific exercise note.
- Health.
- Doctor notes or one exact doctor note.
- Widget settings.
- Exercise type settings.
- Library.
- Calendar.
- PT/training sessions.
- Treatments.
- Progress report.
- Data export/PT report.
- Exercise guide.
- Exercise management.
- Master exercise database.
- Timer.
- App top.

Navigation actions are directly available from the review card and do not require a write transaction.

### Normalization and Safety Rules

The protocol normalizer:

- Rejects malformed dates, including impossible calendar dates.
- Requires exact IDs for exercise and doctor-note destinations.
- Requires an exact date for date navigation.
- Deduplicates action IDs.
- Truncates all strings and arrays to explicit limits.
- Clamps health and metric numbers to app-supported ranges.
- Requires exactly one of reps or duration for metrics.
- Restricts metric scope to `1`, `2`, or `4`.
- Defaults note edits to append. Replace must be explicit.
- Restricts category colors to the app palette.
- Restricts doctor-note kinds and colors to supported values.
- Accepts exercise media URLs only over HTTP or HTTPS.
- Removes any image/blob payload attempted by the model.
- Requires explicit structured targets for photos.
- Allows only one photo destination per plan.
- Rejects a plan that attaches a photo to a doctor note it also deletes.
- Coalesces compatible edits to the same target instead of silently dropping an earlier patch or producing a duplicate-row SQL conflict.
- Lets an explicit exercise removal override incompatible edit/move actions for the same exercise.

The server revalidates every plan during preview and again immediately before apply. Client-side state and model output are not trusted.

## Preview and Authorization

`POST /api/ai-agent/preview` is read-only.

It:

- Normalizes the action list.
- Loads only configuration keys needed by those action types.
- Confirms exercise and category targets still exist.
- Confirms doctor-note targets still exist and rejects agent deletion of a note with photos before the Apply stage.
- Requires a category to be empty before removal.
- Expands bulk rules into concrete actions.
- Resolves single-value conflicts while merging compatible note, category, and exercise patches.
- Produces human-readable preview rows.
- Labels actions as navigation, change, destructive, or bulk.

Bulk matching is a bounded SQL query over a specified date range and one allow-listed note field. It uses case-insensitive literal substring matching through `STRPOS(LOWER(...), LOWER(phrase))`; `%` and `_` are not treated as wildcards. More than 100 matches fails with a request to narrow the range.

The review interface in `components/ExerciseAiCoachModal.tsx` provides:

- One checkbox per write action.
- Separate open controls for navigation actions.
- Destructive and bulk labels.
- A six-row collapsed view with Show more/Show fewer.
- A photo chooser only when a selected action requires one.
- Local image resizing to a maximum dimension of 1100 pixels and JPEG quality `0.76` where the browser can decode it.
- A two-million-character server limit for the final data URL.
- One Apply selected button.
- Applied and Undone states.
- JSON plan copy with visible confirmation.
- A contained, high-contrast review surface with an action-count badge, explicit “nothing changed yet” language, selected-count status, larger checkboxes, and full Open buttons for navigation.
- Modal layers above the desktop action bar and floating widget controls. The PT Sessions dialog uses the same protected overlay layer and supports Escape-to-close.

Agent commands do not load ordinary saved-day history merely because they mention today or another explicit date. They also suppress unrelated date tiles, Scout labels, external exercise search, and exercise-draft cards. This keeps a direct command focused on the review card and avoids unnecessary Neon/API work.

Applied plans cannot be applied a second time from the same chat card. Selected/applied action IDs persist in chat history.

## Transactional Execution

`POST /api/ai-agent` is implemented in `app/api/ai-agent/route.ts`.

### Request Identity

The client creates a stable request ID from the chat session and assistant message IDs. The server derives the run ID as `agent-${requestId}`.

`request_id` is unique in the database. Retrying a request after a lost response cannot apply the mutations twice.

### Conditional Pre-Reads

Before mutation, the executor reads only touched entities:

- Completion rows for completion targets.
- Exercise notes for note/photo targets.
- Health rows for health/photo targets.
- Metric rows for metric targets.
- Doctor-note metadata for doctor-note targets.

Empty entity groups do not issue empty SQL reads. Photo/blob columns are selected only when an explicit photo operation requires them.

### Inverse Payload

Before applying, the route constructs a minimal inverse payload containing:

- Previous completion values and whether the row existed.
- Previous exercise-note text and photo IDs introduced by the run.
- Previous values for only the touched health fields and photo IDs introduced by the run.
- Previous complete metric rows and row existence.
- Previous touched doctor-note fields, whether a deleted note must be recreated, and introduced photo IDs.
- Previous configuration values for changed keys.
- The chat session/message identity associated with the plan.

Photo data is not copied into the run record. Only IDs for newly attached photos are stored for removal during Undo.

Doctor notes with existing photos cannot be agent-deleted. Reversible deletion would otherwise require duplicating potentially large private photo blobs in the inverse payload.

### SQL Transaction

Writes are batched with `jsonb_to_recordset` rather than one SQL request per action.

The serializable transaction:

1. Inserts `ai_agent_runs` with status `applying` and `ON CONFLICT (request_id) DO NOTHING`.
2. Applies each batch only while that exact run remains `applying`.
3. Writes configuration changes in one batch.
4. Marks the run `applied` only at the end.

If any statement fails, Neon rolls back the entire transaction, including the run insert.

The response returns only the run metadata, affected dates, and changed configuration values needed for targeted UI refresh.

## Undo Integration

`POST /api/ai-agent/undo` reverses one exact applied run.

It is integrated with the existing top app Undo button rather than adding an agent-specific Undo control.

Behavior:

- Applying an agent run replaces the current one-level Undo target.
- A subsequent ordinary app action replaces the agent Undo target, matching the existing one-level Undo model.
- The active agent Undo target is mirrored in local storage under `pt-agent-undo-run`.
- A refresh can therefore restore the Undo button for the most recent agent action.
- An already-undone run returns success idempotently.

Undo restores or deletes rows according to their prior existence. It removes only photo IDs added by the agent and preserves unrelated photos.

The Undo transaction also updates the associated `ai_chat_sessions.messages` JSON so the persisted action card reads `Undone`. `app/page.tsx` patches the active browser session too. This is important when Undo is pressed after Ask AI was closed or after AI navigation moved the user elsewhere.

The app then performs targeted refreshes for affected current-day logs/notes, health, exercise library, layout, PT sessions, widget preferences, and title. It does not reload the whole page.

## Database Schema

`lib/db.ts` defines the `ai_agent_runs` table only inside `initDb`:

```sql
ai_agent_runs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  undo_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'applied',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at TIMESTAMPTZ
)
```

Index: `ai_agent_runs_created_idx (created_at DESC)`.

The production Neon database was explicitly migrated and the table, index, defaults, and a live `undone` run were verified. Normal API handlers contain no DDL.

Never put a database URL or credential in this document. The URL used for verification was supplied through a no-echo terminal prompt. Because a credential was previously pasted into chat, rotate it when practical.

## Neon and Vercel Cost Safeguards

The new Neon paths were reviewed against commit `fba31f2` (`Reduce Neon database egress`).

Verified properties:

- No request-time `CREATE TABLE` or `ALTER TABLE`.
- No polling.
- No background refresh loops.
- No unbounded history reads.
- No `SELECT *` in agent routes.
- Configuration reads select only keys required by the current action types.
- Entity pre-reads are conditional and batched.
- Bulk history queries have date bounds and result limits.
- Doctor-note AI context is requested only for doctor-related questions, selects bounded text/metadata, excludes photos, and is capped at 50 notes.
- Chat history lists return metadata only; full messages load on explicit open.
- Photo fields are not loaded by ordinary agent operations.
- Action/run JSON never contains the selected photo blob.
- Production logging contains actionable errors, not successful requests, full notes, request bodies, database rows, or images.

## Verification Completed

### Automated Checks

The final handoff state passed:

```bash
node --test lib/aiAgent.test.ts lib/aiAgentFallback.test.ts lib/aiChatHistory.test.ts lib/aiDatePresentation.test.ts lib/aiHistoryScope.test.ts lib/aiRequestIntent.test.ts lib/historyRanking.test.ts lib/aiReplyOptions.test.ts lib/modalInteraction.test.ts lib/noteCommands.test.ts lib/secretNotes.test.ts
npx tsc --noEmit
npx eslint components/ExerciseAiCoachModal.tsx lib/aiAgent.ts lib/aiAgentServer.ts lib/aiChatHistory.ts app/api/ai-agent/route.ts app/api/ai-agent/preview/route.ts app/api/ai-agent/undo/route.ts app/api/ai-exercise-question/route.ts
npm run build
```

Results for the July 15 hardening pass:

- 61 focused tests passed.
- TypeScript passed.
- Targeted ESLint passed.
- The full Next.js production build passed when `DATABASE_URL` was supplied privately.

Broad lint still reports pre-existing React hook/static-component findings in `app/page.tsx` and `components/DoctorNotesWidget.js`. They were present outside the agent-specific changes and are not hidden by this handoff.

### Live Neon Transaction Test

A reversible synthetic plan against a future date tested seven actions together:

- Completion creation.
- Exercise-note append.
- User-selected photo attachment.
- Health general-note append.
- Metric creation.
- Doctor-note creation.
- No-op app-title configuration write.

Preview returned seven actions, apply committed seven actions, and Undo removed/restored all synthetic state. Narrow verification confirmed no synthetic completion, note, health, metric, or doctor-note record remained and the app title was unchanged. The durable run remained as an `undone` audit record.

### Closed-Ask Chat Test

A second live test:

1. Created a temporary saved chat.
2. Applied a health action linked to its assistant message.
3. Saved the message with its applied run ID.
4. Called the app Undo route.
5. Reopened the chat from the database.
6. Confirmed the plan had `undoneAt`.
7. Confirmed the synthetic health row was gone.
8. Deleted the temporary chat.

This specifically verifies the final fix that keeps persisted chat status synchronized when Ask AI is not mounted.

### Deployment

The original agent transaction implementation (`7c730f6`) and subsequent hardening commits are pushed directly to `origin/main`; use `git log` and the Vercel deployment status for the exact current production commit.

The in-app browser/screenshot tool was unavailable in the implementation environment. Desktop/mobile visual behavior received responsive code review and production-build verification, but not an automated screenshot pass. A real desktop and iPhone/Safari interaction pass remains the highest-value manual follow-up.

## Important Current Constraints

- Undo is intentionally one-level at the app level. A newer ordinary or AI action replaces the prior Undo target.
- Agent Undo is durable, but it is not a general multi-level event-sourcing system.
- One plan may attach one selected photo to one destination. Multiple independent photos should be split into separate plans until the review UI supports one chooser per action.
- Doctor notes with existing photos cannot currently be agent-deleted.
- Direct plans are prompted to contain at most 12 actions, while server-expanded plans are hard-capped at 100.
- The protocol accepts valid calendar dates broadly. Product rules for disallowing future completion/health dates could be added separately if desired; PT/training sessions may legitimately be future-dated.
- Version 1 does not directly edit doctor response transcripts, exercise type-display metadata, exercise program-display metadata, local-only filters, or hidden-completed local state.
- Version 1 represents doctor follow-ups/responses as append operations on the exact doctor note body; it does not create a separate semantic `follow_up` database record or edit voice-transcript tiles.
- There is no agent-created arbitrary SQL or arbitrary JSON/config write action. This is deliberate; only allow-listed domain actions are executable.
- The app is currently a personal application and follows the authorization model of the existing API routes. If it becomes multi-user, every chat, run, and mutation query must be scoped to an authenticated owner before expanding the protocol.
- AI plans are validated twice, but the pre-read and final serverless transaction are separate phases. In this single-user app that is acceptable. A multi-user version should consider stronger compare-and-swap semantics for fields that can be edited concurrently.

## Specific Final Refinements in `7c730f6`

The last implementation/audit pass added several details that are easy to miss when resuming:

- Existing sparse metric rows are identified by database row ID, not by whether `sets_count` happens to be non-null.
- Duplicate doctor-note mutations are conflict-resolved before batched SQL to avoid PostgreSQL cardinality errors.
- Bulk note phrases are matched literally, not as `ILIKE` wildcard patterns.
- Invalid exercise/category targets fail visibly rather than being silently dropped.
- Unsupported category colors, doctor-note kinds, and unsafe exercise media URL schemes are normalized/rejected.
- Health note actions default to append for safety.
- Navigation to a date, exercise, or exact doctor note requires the corresponding target.
- Only one photo destination is allowed per plan.
- Empty Neon pre-read groups are omitted.
- Configuration reads are selected by action type instead of always loading every large config value.
- Raw SQL/database errors are no longer returned to the client; only allow-listed validation messages are exposed.
- The apply route waits for the applied chat state to save before enabling the top-level Undo target.
- Undo updates database chat JSON and active browser session JSON so `Applied` cannot remain stale after a closed-window Undo.
- The production schema defaults were explicitly verified after migration.

## Primary Files

| File | Responsibility |
| --- | --- |
| `lib/aiAgent.ts` | Versioned action types, normalization, limits, and safe value parsing. |
| `lib/aiAgentServer.ts` | Server target validation, selective config loading, bulk expansion, conflict handling, preview labels, and config transforms. |
| `app/api/ai-agent/preview/route.ts` | Read-only plan preparation. |
| `app/api/ai-agent/route.ts` | Conditional pre-read, inverse construction, idempotent serializable apply. |
| `app/api/ai-agent/undo/route.ts` | Durable inverse execution and persisted chat status update. |
| `app/api/ai-exercise-question/route.ts` | Intent detection, history pipeline, Scout reranking, main answer prompt, and optional agent-plan output. |
| `components/ExerciseAiCoachModal.tsx` | Chat, history UI, plan review, selection, photo preparation, apply, and restored plan status. |
| `app/page.tsx` | Ask AI entry points, agent navigation, targeted refresh, and integration with the existing Undo button. |
| `components/DoctorNotesWidget.js` | Opening an exact doctor note from agent navigation. |
| `lib/historyRanking.ts` | Advanced deterministic day retrieval. |
| `lib/aiChatHistory.ts` | Bounded chat/message/plan persistence contracts. |
| `lib/aiDatePresentation.ts` | Browser session keys, date validation, display formatting, and inline date parsing. |
| `components/SecretTextarea.tsx` | Mobile-safe structured editor used by `/secret` and `/ai`. |
| `lib/noteCommands.ts` | Slash-command recognition and conversion. |
| `lib/secretNotes.ts` | Serialized block format, secret stripping, and AI-instruction extraction. |
| `lib/groq.ts` | Task-specific model chains, fallbacks, timeouts, and Groq error handling. |
| `lib/db.ts` | One-time schema initialization, including chat and agent-run tables. |

## Resume Checklist

When continuing this work:

1. Read this document and `AGENTS.md` before editing.
2. Start from commit `7c730f6` or later and inspect `git log --oneline` for subsequent fixes.
3. Reproduce the issue on a real iPhone/Safari viewport whenever the report involves caret movement, keyboard behavior, sticky action bars, or overlays.
4. Keep model output in the proposal layer. Add new capabilities as explicit protocol actions rather than parsing prose or executing arbitrary JSON.
5. Add normalization tests for every new action shape.
6. Add preview labels and risk classification for every new action.
7. Define a minimal inverse before adding the forward mutation.
8. Batch related SQL and keep photo/blob reads conditional.
9. Make the action idempotent through the existing run guard.
10. Update both active browser state and durable chat state when action status changes.
11. Run the focused tests, TypeScript, targeted ESLint, and a production build.
12. For a new mutation family, run a reversible live integration check using synthetic data and verify cleanup with narrowly scoped queries.
13. Update this document with the new action contract, migration, verification, and any new limitation.

## High-Value Next Tests and Extensions

The next engineering session should prioritize observation over adding more breadth:

- Real iPhone tests for long action plans, checkbox selection, photo picking, keyboard reopening, and Undo after navigation.
- Verify sticky action-bar rendering immediately after AI navigation to a day without requiring a scroll nudge.
- Test a real bulk completion request against several matching and non-matching note fields, then Undo it.
- Test partial authorization where only some proposed actions are selected.
- Test a failed or timed-out client response followed by retry with the same request ID.
- Test stale target behavior when an exercise/category/doctor note changes between preview and apply.
- Consider compare-and-swap checks if concurrent editing becomes realistic.
- Consider a dedicated doctor-note follow-up/transcript action with a bounded inverse.
- Consider type/program metadata actions only after defining strict allow-listed schemas.
- Consider an agent activity/history screen only if one-level Undo becomes insufficient; do not expose raw private inverse payloads.

Do not weaken explicit review, deterministic validation, idempotency, or Undo guarantees when expanding the agent.
