# Architecture

## 1. Layering (Clean Architecture)

Dependencies point **inward**. Outer layers know about inner layers; inner layers never
import from outer layers.

```
┌─────────────────────────────────────────────────────────────┐
│ api/ , scheduler/                         (interface layer) │  ← entry points (HTTP, cron)
│   ↓ calls                                                    │
│ pipeline/                                 (application layer)│  ← use-case orchestration
│   ↓ calls                                                    │
│ planner/ , ai/ , video/ , instagram/ , storage/  (domain     │  ← business logic,
│   services, each behind an interface)      services layer)   │    one concern each
│   ↓ implements                                                │
│ services/interfaces, repositories/interfaces, entities/        │  ← ports (interfaces)
│   ↑ implemented by                                            │
│ services/{llm,voice,media}, instagram/*Publisher,              │  ← adapters (concrete
│ storage/*StorageProvider, repositories/prisma/*                │    3rd-party integrations)
│   ↓ uses                                                       │
│ db/ (Prisma client), config/, utils/                            │  ← infrastructure
└─────────────────────────────────────────────────────────────┘
```

`entities/` holds plain domain objects (`Topic`, `Script`, `ResearchResult`, `VoiceOverResult`,
`SubtitleTrack`, `MediaAsset`, `RenderedVideo`, `CaptionPackage`, `ExecutionContext`, …). They
have **no dependency on Prisma** — Prisma's generated types are mapped to/from entities inside
the repository implementations. This means swapping Postgres/Prisma for another persistence
technology later only touches `repositories/prisma/*`, nothing else.

## 2. Ports & Adapters (why every provider is an interface)

The spec requires LLM, Voice, Media, Publisher and Storage providers to be swappable. Each one
gets:

- an **interface** ("port") in `services/interfaces/*` (or `instagram/IPublisher.ts`,
  `storage/IStorageProvider.ts` for the two that have dedicated top-level folders)
- one or more **adapters** implementing it (`GeminiLlmProvider`, `GeminiVoiceProvider`,
  `EspeakVoiceProvider`, `PexelsMediaProvider`, `PixabayMediaProvider`,
  `InstagramGraphPublisher`, `LocalStorageProvider`)

Nothing above the port ever imports a concrete adapter directly — the composition root
(`src/container.ts`) is the only file that wires interface → implementation. To add, e.g., an
ElevenLabs voice provider later: implement `IVoiceProvider`, change one line in
`container.ts`. No other file changes.

## 3. Dependency Injection

This project deliberately avoids a DI framework (not in the approved stack) and uses **manual
constructor injection** with a single composition root: `src/container.ts`. It:

1. Loads and validates `.env` (`config/env.ts`, Zod).
2. Constructs infrastructure (Prisma client, logger).
3. Constructs repositories (Prisma-backed) behind their interfaces.
4. Constructs adapters (Gemini, Pexels, Pixabay, Instagram, Storage) behind their interfaces.
5. Constructs domain services (`TopicPlanner`, `ResearchService`, …) injecting the interfaces
   from steps 3–4.
6. Constructs `PipelineOrchestrator` injecting all domain services.
7. Returns one `AppContainer` object consumed by `api/app.ts`, `scheduler/*` and
   `scripts/run-pipeline.ts`.

This keeps every class unit-testable: pass a fake/mock implementing the interface instead of
the real adapter.

## 4. Repository Pattern

Every table has an interface (`repositories/interfaces/ITopicRepository.ts`, etc.) and a Prisma
implementation (`repositories/prisma/PrismaTopicRepository.ts`). Domain/application code depends
only on the interface. This is what makes "never repeat a topic" and "resume interrupted
executions" testable without a real database.

## 5. Pipeline orchestration & resumability

`pipeline/PipelineOrchestrator.ts` is the application-layer use case that runs the pipeline steps,
in order:

`plan topic → research → script (+ quality-score/regenerate loop) → voice → visual plan → media →
subtitles → compose video → caption → hashtags → publish → persist metadata`

Every step is wrapped by `runStep()`, which:

- writes a row to `execution_history` (`status: RUNNING`) before the step,
- runs it through the shared `withRetry()` utility (3 attempts, exponential backoff) if it's an
  external call,
- updates the row to `SUCCEEDED`/`FAILED` with duration + error, and
- **persists the step's output** on the `Execution` (as JSON) so a re-run can skip completed
  steps.

If any step throws after retries: the orchestrator catches it, logs via `scheduler_logs` +
`execution_history`, and returns without crashing the process (spec §15 "resume next day, do not
crash"). On the next scheduled run, `PipelineOrchestrator.resumeOrStart()` looks for the most
recent `IN_PROGRESS`/`FAILED` execution for *today's* run; if found it resumes from the first
incomplete step instead of starting over (spec bonus: "resume interrupted executions").

## 6. Why topics never repeat

`TopicPlanner` queries `ITopicRepository.findAllTitlesAndHooks()` (cached in memory per run) and
passes that history into the Gemini prompt as an explicit exclusion list, while also doing a
local normalized string-similarity check as a hard backstop in code — so uniqueness does not
depend solely on the LLM honoring the instruction.

## 7. Retry & error isolation

`utils/retry.ts` exports `withRetry(fn, { attempts, baseDelayMs })`, used by every outbound HTTP
call (Gemini, Pexels, Pixabay, Instagram Graph API). It performs exponential backoff with jitter
and logs each attempt via `pino`. Every adapter also writes an `api_logs` row per call (endpoint,
status, latency, attempt number) for observability — this is what the future "performance
dashboard" bonus feature reads from.

## 8. Voice generation strategy

Gemini's TTS-capable models are not guaranteed to be available on every Google account/region on
the free tier, so `IVoiceProvider` has two implementations:

- `GeminiVoiceProvider` — calls Gemini's `generateContent` with audio response modality.
- `EspeakVoiceProvider` — **fully free, offline, no API key**, using the `espeak-ng` binary via
  `child_process`. This is the default in `.env.example` because it always works, including in
  CI/Docker with no external credentials.

Swapping which one is active is a one-line change in `container.ts` (`VOICE_PROVIDER` could also
be exposed as an env flag — see `config/env.ts`).

## 9. Word-level timestamps without paid forced alignment

True forced alignment (e.g., Whisper) is a heavy dependency outside the approved stack. Instead,
`SubtitleGenerator` derives word timings by distributing the known total audio duration
(measured via `ffprobe`) across words, weighted by character count and punctuation-pause
heuristics. This is documented as a deliberate, swappable approximation —
`ISubtitleTimingStrategy` is its own interface so a real ASR-based aligner can be dropped in
later without touching the SRT-writing code.

## 10. Content-quality gate (ContentEvaluator regenerate loop)

`ContentEvaluator` scores a generated `Script` 0-10 on hook strength, clarity, beginner
friendliness, originality, visual feasibility, and value, plus an overall score and a one-sentence
critique. This lives *inside* the `SCRIPT` `runStep()` call (not as its own pipeline step): the
loop is "generate → evaluate → if below `qualityThreshold`, regenerate with the critique appended
to the prompt, up to `qualityMaxRetries` times, then ship the best-scoring attempt" — all of that
has to happen within one step invocation so `runStep`'s cache-on-success semantics stay simple
(the cached SCRIPT output is always just a final `Script`, never a half-finished loop state). A
new topic is deliberately *not* generated mid-loop even if scores stay low: `TopicPlanner.
planForToday` is idempotent per (settingId, day), and cheaply discarding a planned Topic
mid-execution would fight that contract for a case (systematically bad topic selection) that's
better fixed by adjusting `TopicPlanner`'s own prompt/category logic.

The evaluator fails **open**, not closed: if its own LLM call throws or its JSON response fails
Zod validation, `evaluate()` returns a neutral passing score rather than propagating the error —
a broken quality gate must never be able to break the entire daily posting pipeline.

## 11. Visual planning: stock footage vs. diagram cards

`VisualPlanner` runs as its own pipeline step (`VISUAL_PLAN`, between `VOICE` and `MEDIA`) and
assigns each script line a visual treatment: `"stock"` (searched via the existing
`MediaSourcingService`) or `"diagram"` (rendered by `VideoComposer.renderDiagramCard` — a short
animated text/box card built entirely from FFmpeg's `drawtext`/`drawbox` source filters, chosen
deliberately over pulling in a graphics/canvas library so the Docker image doesn't need a native
rendering dependency). `segmentTiming.ts`'s `AlignedMediaSegment` is a discriminated union
(`{kind: 'stock', asset, ...} | {kind: 'diagram', diagramSpec, ...}`) so `VideoComposer` can branch
per segment without `MediaSourcingService` ever needing to know diagram cards exist — it simply
skips sourcing footage for any line the plan marked `"diagram"`.

Two things worth knowing if you touch `renderDiagramCard`:

- **Connectors between boxes are drawn rectangles, not arrow glyphs.** A Unicode arrow character
  (e.g. "→") silently renders as a missing-glyph box on fonts that lack it — verified empirically
  — so a thin filled rectangle is used instead, since it can never fail to render regardless of
  font/platform.
- **Text values are written to temp files and passed via `textfile=`, never inlined as
  `text='...'`.** Diagram titles/labels come from LLM output and can contain apostrophes (e.g.
  "User's Cache"); inlining them requires escaping a literal `'` inside an ffmpeg single-quoted
  filter value, and *every* documented escaping scheme for that was verified empirically to
  silently render blank text rather than error — `textfile=` sidesteps the ambiguity entirely.
  `VideoComposer.writeLabelFile` + `utils/text.ts`'s `sanitizeDrawtextLabel` (strips to a safe
  character set server-side, since these are LLM-generated strings) are the two halves of this.

`VisualPlanner` fails safe like `ContentEvaluator`: any LLM/validation failure defaults every line
to `"stock"` using the script line's own `visualKeyword` — a broken visual plan degrades the
video, it never blocks the Reel.

## 12. Caption styling: ASS + karaoke highlight

`SubtitleGenerator` writes `.ass` (Advanced SubStation Alpha) instead of plain `.srt`. This is a
drop-in swap at the FFmpeg layer — the `subtitles=` filter renders both formats via the same
libass backend, so `VideoComposer` doesn't change beyond pointing at the new extension. The
payoff is styling libass supports but plain SRT doesn't: `src/ai/captionStyles.ts` defines
`[V4+ Styles]` presets (`bold-highlight`, `clean-white`) selected by `CAPTION_STYLE_PRESET`, and
`SubtitleGenerator` emits one ASS `{\k<centiseconds>}` tag per word (reusing the existing
`HeuristicSubtitleTimingStrategy` word timings unchanged) so captions progressively highlight
left-to-right as they're spoken — verified empirically via rendered frame extraction, since ASS's
`PrimaryColour`/`SecondaryColour` karaoke-swap direction isn't obvious from the spec alone.

Font handling follows the same "verify, don't assume" approach: the Docker image installs
`fonts-dejavu-core` so `VIDEO_FONT_FAMILY=DejaVu Sans` resolves exactly in production, but on a
dev machine without that exact font installed, fontconfig gracefully substitutes an available
font rather than failing (verified on macOS) — so there's no hard dependency on any specific font
being present, only a documented default that's guaranteed correct in the shipped Docker image.

## 13. Content taxonomy: formats & hook categories

Beyond the existing `TopicCategory` rotation (`topicCategories.ts`), `Topic` now also carries a
`ContentFormat` (`contentFormats.ts` — quick-tip, mistake, beginner-explanation, did-you-know,
before-after, myth-reality, challenge, mini-story) and a `HookCategory`
(`hookCategories.ts` — curiosity, problem, mistake, challenge, surprise, story, question), each
rotated deterministically the same way category is (read the most recent `Topic`'s value, advance
to the next one in a fixed array) rather than randomly, for the same reason category rotation is
deterministic: it guarantees every value appears before any repeats. Both are plain string
columns on `Setting`/`Topic` (not Postgres enums) — a deliberate choice, since this is editorial
taxonomy expected to evolve, and adding a new format/hook category should be a one-line array
edit, not a migration. `ScriptGenerator`'s prompt receives both as explicit structure/style
instructions rather than leaving tone/shape entirely up to the model.

## 14. Testing strategy

Every adapter (Gemini, Pexels, Pixabay, Instagram Graph, ffmpeg invocation) is called through an
interface, so unit tests inject hand-written fakes from `tests/mocks/*` — no network calls, no
real ffmpeg binary required for logic tests. `tests/integration/*` contains a small number of
tests that do shell out to a real (test-only) SQLite-less Postgres/ffmpeg when explicitly run
with `RUN_INTEGRATION=true`, kept separate from the default `npm test` run.

## 15. Deliberate additions beyond the literal folder list

The brief's example tree is illustrative. Two folders were added because Clean Architecture
requires them and the brief's own module list depends on them:

- `pipeline/` — the application-layer orchestrator (step 17 in this doc's flow). Without it, the
  scheduler would have to know about every domain service directly, which breaks the dependency
  direction described above.
- `scripts/` — small operational entry points (`run-pipeline.ts` for manual/CI-triggered runs,
  used by `npm run run:pipeline`).
