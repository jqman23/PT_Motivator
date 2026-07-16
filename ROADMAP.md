# Feature Roadmap

A short, living list of ideas planned for PT Motivator. Update this file as features are refined, started, or completed.

## AI execution platform

### Phase 1 implemented and hardening: general planning without a UX rewrite

- Keep the existing Ask AI composer, clickable dates, evidence drilldowns, visual cards, and Review / Apply / Undo workflow.
- Represent each request as a typed, dependency-aware plan so one message can request retrieval, analysis, a chart, an explanation, navigation, and proposed changes together.
- Register AI capabilities and their read/write, permission, preview, Apply, and Undo boundaries explicitly.
- Calculate supported structured analytics on the server. The model may choose the calculation and presentation, but it may not invent personal chart values.
- Attach a compact execution and evidence ledger describing resolved scope, coverage, calculations, assumptions, completed outputs, and missing outputs.
- Use one request-wide deadline below the browser timeout, propagate cancellation through retrieval checkpoints, reranking, model calls, repair calls, and analytics assembly, and preserve cross-provider diversity before retrying alternate credentials or models.
- Maintain golden-request tests for real conversational failures: short follow-ups, past-week scope, semantic counts, compound chart-plus-action requests, advice versus writes, missing values, and provider failure.
- Begin converging ordinary UI writes and AI actions on stable domain-command contracts without changing the current database schema or safety workflow.
- Bind all named comparison scopes and measures into executable analytics steps; supported arithmetic now returns directly from the server without a reranker or answer-model dependency.
- Support multiple analytical subgoals in one execution, including independent per-field operations plus observed and missing counts, with bounded month and comparison scopes.
- Project prompts by capability so read, analytics, exercise, and action tasks carry only the contracts and records they need.
- Decompose independent app commands outside quoted values and merge every validated sub-action into one existing Review / Apply / Undo card.
- Bind explicit commands to required action slots and reject both incomplete plans and unrelated targets before Review.
- Keep focal dates separate from evidence windows, preserve compact prior visual/execution/action artifacts for follow-ups, and isolate quoted payloads from command interpretation.
- Return explicit unsupported-capability results and derive execution completion statuses only from artifacts actually produced.
- Preserve an exact-wording, source-inspectable fallback when the user explicitly lists semantic count categories and terminology-expansion providers fail.

### Next: complete the shared intelligence and command layers

- Move normal UI and AI mutations behind the same domain command handlers so validation, side effects, audit records, and undo semantics cannot drift.
- Persist typed conversation state for the active goal, date range, body region, laterality, metric, grouping, last visual, accepted assumptions, and pending action plan.
- Add derived health events for symptom, region, laterality, negation, status, severity, duration, trigger, relief, source text, and extraction confidence.
- Add a canonical bounded AI facts surface spanning health, workouts, exercise notes and metrics, PT sessions, doctor notes, treatments, and media metadata.
- Add immutable plan hashes, entity versions, stale-preview checks, a unified user/AI audit log, and a transactional outbox for reliable UI/chat synchronization.
- Expand the deterministic analytics vocabulary with treatment overlays, event timelines, before/after comparisons, correlations, streaks, adherence, and laterality comparisons.
- Grow the response protocol with timelines, heatmaps, matrices, report cards, photo comparisons, and other ordered blocks when they materially help the request.

### Later: durable and multimodal workflows

- Run unusually long compound analyses as resumable jobs with visible progress rather than extending a frozen browser request.
- Add permissioned image inspection and comparison, preserving source date and media identity and separating visual observations from medical conclusions.
- Add saved reports, recurring plans, reminders, timers, proactive trends, and treatment-response analysis through the same capability and command registries.

## Image annotation and AI vision

### Planned: draw on enlarged images

- On mobile and desktop, open any uploaded image in the larger image viewer and enter a simple **Edit / Mark up** mode.
- Draw freehand, circle an area, add an arrow, or undo/clear a mark.
- Save the annotated version without losing the original image.
- Keep touch controls comfortable on mobile and mouse/pointer controls precise on desktop.

### Later: ask AI about annotated images

- Let the user point AI to a specific saved image from a note, exercise, or other image-supported area.
- Allow AI to inspect the image together with its saved caption and drawn annotations.
- Treat circles, arrows, and other markings as visual context so questions such as “look at the area I circled” work naturally.
- Clearly show which image and annotation the AI is analyzing.

## AI recommendations

### Now: surface recommendations in roadmap and UI copy

- Keep recommendation language available as a first-class roadmap item so the app can reference it without pretending the full workflow is finished.
- Let AI return a short recommendation block when it has enough evidence, but keep it clearly labeled as a suggestion rather than a committed action.
- Make recommendations easy to review, copy, and turn into a follow-up action later.
- Keep the behavior broad enough to support exercise ideas, recovery guidance, next-step prompts, and other adjacent suggestion types without hardcoding one case.

### Later: turn recommendations into richer guided actions

- Expand recommendation blocks into selectable action templates when the user wants to apply them.
- Support recommendations across exercises, notes, photos, and health patterns with the same UI pattern.
