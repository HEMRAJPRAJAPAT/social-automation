# Reel Automation

A production-quality Node.js/TypeScript service that automatically plans, researches, scripts,
narrates, renders, captions, and publishes one Instagram Reel per day — built almost entirely on
free-tier technology. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design rationale (Clean
Architecture layering, ports & adapters, DI, resumability, retry strategy).

## What it does, end to end

Every scheduled run executes this pipeline (`src/pipeline/PipelineOrchestrator.ts`):

```
plan topic → research → write script (+ quality-score/regenerate loop) → synthesize voice →
plan visuals (stock vs. diagram) → source stock media → generate captions →
compose video (FFmpeg) → write caption → generate hashtags →
publish to Instagram → persist metadata
```

Each step is checkpointed to the database, so a crash mid-run resumes from the first incomplete
step on the next trigger instead of starting over or double-publishing. See
[Content Generation](#content-generation) below for how the content itself — not just the
pipeline plumbing — is designed to be beginner-friendly, varied, and visually engaging.

## Tech stack

Node.js 22+, TypeScript (strict), Express, PostgreSQL + Prisma, node-cron, FFmpeg, Gemini API
(free tier), Pexels API, Pixabay API, espeak-ng (free offline TTS), Docker, pino, zod, vitest,
eslint, prettier. No paid services required.

## Prerequisites

- Node.js 22+
- PostgreSQL 14+ (or use `docker compose up`, which provisions one)
- **FFmpeg** (built with `libass`) and **espeak-ng** binaries on `PATH` (only needed if running
  outside Docker — the Docker image installs both, and Debian's `apt` package already includes
  `libass`):
  - macOS: **`brew install ffmpeg` alone is not enough.** Homebrew's default `ffmpeg` formula
    (as of late 2026) ships without `libass`/`freetype`/`fontconfig`, so ffmpeg's `subtitles`
    filter — what `VideoComposer` uses to burn in captions — doesn't exist and fails with a
    confusing `No option name near '<path>'` filtergraph error. Install the full-featured build
    from the community tap instead:
    ```bash
    brew install espeak-ng
    brew uninstall ffmpeg          # if you already have the slim core formula
    brew tap homebrew-ffmpeg/ffmpeg
    brew install homebrew-ffmpeg/ffmpeg/ffmpeg
    ffmpeg -filters | grep subtitles   # sanity check: should print a line, not nothing
    ```
  - Debian/Ubuntu: `sudo apt-get install ffmpeg espeak-ng`
- Free API keys (all have generous free tiers):
  - **Gemini** — https://aistudio.google.com/app/apikey
  - **Pexels** — https://www.pexels.com/api/
  - **Pixabay** — https://pixabay.com/api/docs/
  - **Instagram Graph API** — a Meta developer app + Instagram Business/Creator account linked
    to a Facebook Page. See https://developers.facebook.com/docs/instagram-platform/content-publishing

> A `.env` file may already exist in this project from prior local testing — **do not commit
> it**. `.gitignore` already excludes `.env`; only `.env.example` (no real secrets) is tracked.

## Setup

```bash
npm install
cp .env.example .env      # then fill in your keys — skip if .env already exists
npx prisma migrate deploy # applies the committed migration in prisma/migrations/
npm run dev                # starts the API + scheduler with hot reload
```

`container.bootstrap()` runs automatically on every startup and upserts a `settings` row from
your `.env` content configuration (niche/language/frequency/duration/style/cron/timezone), so
there's no separate seeding step required for a single-niche setup. `npm run prisma:seed` does
the same thing standalone, without booting the server.

### Environment variables

See [.env.example](./.env.example) for the full list with comments. The only two that are
*required* to boot are `DATABASE_URL` and `GEMINI_API_KEY` (`CONTENT_NICHE` also has no default
and must be set). Everything else has a sensible default or is optional:

- `PEXELS_API_KEY` / `PIXABAY_API_KEY` — leave blank and that provider is simply never queried
  (the other one is tried instead); leave both blank and stock media sourcing will fail loudly.
- `INSTAGRAM_ACCESS_TOKEN` / `PAGE_ID` / `BUSINESS_ACCOUNT_ID` — required only for the PUBLISH
  step; you can develop/test the rest of the pipeline without them and let that step fail (it
  won't crash the process — see `ARCHITECTURE.md` §5/§7).
- `VOICE_PROVIDER` — `espeak` (default, free, offline) or `gemini` (requires `GEMINI_TTS_MODEL`
  and confirmed TTS access on your Gemini account).
- `CONTENT_AUDIENCE_LEVEL`, `CONTENT_QUALITY_THRESHOLD`, `CONTENT_QUALITY_MAX_RETRIES`,
  `CAPTION_STYLE_PRESET`, `VOICE_SPEED`, `VOICE_STYLE`, `VIDEO_FONT_FAMILY` — content-quality and
  presentation knobs; see [Content Generation](#content-generation) for what each one controls.

## Running

```bash
npm run dev              # local dev server (scheduler + API), hot reload
npm run build && npm start   # production build + run
npm run run:pipeline     # manually run the pipeline once for every active setting, then exit
```

By default the scheduler runs once a day per active `settings` row, per that row's own
`cronExpression`/`timezone` (`.env`'s `CRON`/`TIMEZONE` seed the default row). Set
`RUN_ON_STARTUP=true` to also fire an immediate run when the process boots — handy for local
testing.

### API

| Method | Path                  | Purpose                                                              |
| ------ | --------------------- | --------------------------------------------------------------------- |
| GET    | `/health`             | Liveness + DB connectivity check                                      |
| POST   | `/trigger`             | Manually run the pipeline now (`{ "settingKey": "default" }` optional) |
| GET    | `/executions`          | Recent pipeline runs with per-step status (pagination via `?limit=`)  |
| GET    | `/executions/:id`      | One execution's full step-by-step detail                              |
| GET    | `/analytics/summary`   | 30-day rollup: posts published/failed, topic mix, API call success rate |
| GET    | `/media/*`             | Static hosting for rendered MP4s (what gets sent to Instagram's Graph API) |

## Docker

```bash
docker compose up --build
```

This builds the app image (Node 22 + ffmpeg + espeak-ng baked in), starts Postgres, waits for its
healthcheck, applies migrations automatically via `docker-entrypoint.sh`, and starts the server on
`:3000`. Rendered videos and Postgres data persist in named volumes across restarts.

## Deploying to Render (free tier)

Render can build and run this directly from `Dockerfile` (which already has ffmpeg + espeak-ng
installed), and gives you a real public HTTPS URL — solving the problem that Instagram's Graph
API can't fetch a video from `http://localhost:...`, which it needs to do for the PUBLISH step.

1. Push this repo to GitHub (`.env` is already gitignored — only `.env.example` gets committed).
2. In Render: **New → Blueprint**, point it at the repo. It reads [render.yaml](./render.yaml)
   and provisions a free web service (Docker runtime) + a free Postgres database, wired together.
3. Fill in the secrets Render prompts for (they're deliberately left blank in `render.yaml`):
   `GEMINI_API_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`, `PAGE_ID`,
   `BUSINESS_ACCOUNT_ID`.
4. After the first deploy, check the actual assigned URL in the Render dashboard. If it doesn't
   match `https://reel-automation.onrender.com` (e.g., that subdomain was taken), update the
   `PUBLIC_BASE_URL` env var to match and redeploy.

Two free-tier caveats worth planning around:

- **Free web services sleep after ~15 minutes idle** and only wake on an incoming HTTP request —
  so `node-cron` firing on schedule isn't reliable if the service happens to be asleep at that
  moment. The common workaround is an external free scheduler (e.g., cron-job.org) hitting your
  `/trigger` endpoint on the schedule you actually want; that single request both wakes the
  service and runs the pipeline.
- **Free Postgres on Render expires after 90 days.** Fine for evaluating this project; for
  anything longer-lived, upgrade the database plan or point `DATABASE_URL` at a longer-lived free
  Postgres elsewhere (Neon, Supabase) instead.
- Free web services also don't get a persistent disk, so `storage/output` is ephemeral — rendered
  videos disappear on redeploy/restart. That's fine functionally (Instagram only needs to fetch
  the file once, during that same run's PUBLISH step), but don't expect old Reels to still be
  downloadable from `/media/...` after a restart.

## Testing

```bash
npm run test            # run once
npm run test:watch      # watch mode
npm run test:coverage   # with coverage report + enforced thresholds
```

Every external dependency (Gemini, Pexels, Pixabay, Instagram Graph API, ffmpeg/child_process,
Prisma) sits behind an interface (`services/interfaces/*`, `instagram/IPublisher.ts`,
`storage/IStorageProvider.ts`, `repositories/interfaces/*`), so unit tests inject hand-written
fakes from `tests/mocks/fakes.ts` — no real network calls, no ffmpeg binary required, no live
database. `PipelineOrchestrator.test.ts` exercises the full pipeline end to end against fakes,
including a crash-and-resume scenario and a "never throws" failure-isolation scenario.

Current coverage is 90%+ statements/lines across everything with meaningful logic to test.
Coverage intentionally **excludes** (see `vitest.config.ts` for the full list, each with a
comment explaining why):

- Pure interface/type-contract files (erased at compile time — nothing to execute)
- Thin adapters that are one HTTP/child_process call wrapped in retry+logging (Gemini, Pexels,
  Pixabay, Instagram, espeak-ng, local storage, ffmpeg invocation, Prisma repositories) — these
  are exercised *indirectly* through the service-layer tests that mock their interfaces; asserting
  on the raw axios/child_process call shape itself adds little
- Express route handlers that are thin Prisma pass-throughs (`api/**`) — best validated with a
  real Postgres via manual/integration smoke testing rather than mocked unit tests

## Code quality

```bash
npm run lint          # eslint (strict, no `any`, consistent type-only imports)
npm run format:check  # prettier
npm run typecheck      # tsc --noEmit across src/ + tests/
```

CI (`.github/workflows/ci.yml`) runs all of the above plus the full build and a Docker image
build on every push/PR.

## Extending with new providers

Every external capability is a port defined as a TypeScript interface, with the composition root
(`src/container.ts`) as the *only* file that wires an interface to a concrete implementation:

| Capability | Interface | Current adapter(s) |
| --- | --- | --- |
| LLM | `services/interfaces/ILlmProvider.ts` | `GeminiLlmProvider` |
| Voice | `services/interfaces/IVoiceProvider.ts` | `EspeakVoiceProvider` (default), `GeminiVoiceProvider` |
| Stock media | `services/interfaces/IMediaProvider.ts` | `PexelsMediaProvider`, `PixabayMediaProvider` |
| Publishing | `instagram/IPublisher.ts` | `InstagramGraphPublisher` |
| Storage | `storage/IStorageProvider.ts` | `LocalStorageProvider` |

To add e.g. an ElevenLabs voice provider: implement `IVoiceProvider`, then change one
constructor call in `container.ts`. Nothing else in the codebase needs to know.

## Content Generation

This section explains how a Reel actually gets *written* — the goal is that every Reel feels like
a smart human creator explaining one clear idea to a beginner, not generic AI-generated filler.

### How a Reel is created

```
Idea (TopicPlanner)
  → Research (ResearchService)
  → Script (ScriptGenerator, scored by ContentEvaluator, regenerated if weak)
  → Voice (EspeakVoiceProvider / GeminiVoiceProvider)
  → Visual Plan (VisualPlanner: which lines get stock footage vs. a diagram card)
  → Media (MediaSourcingService sources stock clips for "stock" lines only)
  → Captions (SubtitleGenerator: styled, karaoke-highlighted .ass)
  → Video (VideoComposer: stock clips + diagram cards + captions + voice, via FFmpeg)
  → Instagram (InstagramGraphPublisher)
```

Every LLM call in this chain is a separate, single-responsibility prompt (`TopicPlanner`,
`ResearchService`, `ScriptGenerator`, `ContentEvaluator`, `VisualPlanner`, `CaptionGenerator`,
`HashtagGenerator`) rather than one giant prompt — each receives only the structured context it
needs (niche, audience level, format, hook category, research, recent hooks/topics to avoid) and
its output is Zod-validated before anything downstream trusts it.

### Content formats

`TopicPlanner` rotates deterministically through 8 reusable Reel structures
(`src/planner/contentFormats.ts`) so consecutive Reels don't all follow the same shape:
`quick-tip`, `mistake`, `beginner-explanation`, `did-you-know`, `before-after`, `myth-reality`,
`challenge`, `mini-story`. Each format comes with its own prompt hint describing the beats
`ScriptGenerator` should hit (e.g. *Before vs After*: bad approach → why it's bad → better
approach → result).

### Beginner-friendly content

Every `Topic` carries a `coreLesson` (the one specific thing a viewer should walk away knowing)
and a `visualIdea` (a concrete real-world analogy). `ScriptGenerator`'s prompt requires:

- One core lesson per Reel — never three things crammed into one video
- Plain-language explanations the moment a technical term or acronym is first used
- No documentation-speak: a banned-phrase list rejects "in this video", "let's dive in", "first of
  all", "in conclusion", etc., in favor of natural transitions like "here's the interesting part"
  or "think about it like this" (used sparingly, not as a crutch)
- TTS-aware phrasing — acronyms are spelled the way they're actually spoken (e.g. "A P I") since
  the script is read aloud, not displayed as text

### Hook strategy

`TopicPlanner` also rotates through 7 hook categories (`src/planner/hookCategories.ts`):
curiosity, problem, mistake, challenge, surprise, story, question — each with example phrasing
matching the category. This rotation is independent of (and layered on top of) the pre-existing
hook-repetition guard: `ScriptGenerator` still checks every generated hook against recent posts'
hooks via Jaccard similarity and regenerates on a near-duplicate, exactly as before.

### Visual strategy

`VisualPlanner` (LLM-based, `src/ai/VisualPlanner.ts`) decides per script line whether it should
be illustrated with **stock footage** or a **diagram card** — a short animated text/box graphic
rendered entirely with FFmpeg's `drawtext`/`drawbox` filters (no images, no new dependencies),
used only for lines that explain a concept, comparison, or process more clearly as 2-3 labeled
boxes than as generic b-roll. `MediaSourcingService` only searches stock footage for lines the
plan marks `"stock"`; `VideoComposer.renderDiagramCard` renders the rest. If the planner's LLM
call or its output fails validation, it fails open to an all-stock plan — a broken visual plan
degrades the video, it never blocks the Reel.

### Voice strategy

`VOICE_SPEED` (`slow`/`normal`/`fast`) and `VOICE_STYLE` (free-text delivery hint) are threaded
into both voice providers through the shared `IVoiceProvider` interface — `EspeakVoiceProvider`
maps speed to its `-s` words-per-minute flag; `GeminiVoiceProvider` folds speed and style into its
natural-language delivery instruction (Gemini's TTS performs an instruction like "say this warmly
and at an upbeat pace" rather than reading it aloud — verified by comparing output duration against
narration-only duration). Adding a new provider with different capabilities (e.g. real prosody
control) only means implementing `IVoiceProvider`; providers that can't honor a hint simply ignore
it rather than faking support.

### Caption styles

`SubtitleGenerator` burns in `.ass` (Advanced SubStation Alpha) subtitles instead of plain `.srt`,
using the same word-level timing heuristic as before (`HeuristicSubtitleTimingStrategy`) but adding
per-word `{\k}` karaoke tags so each word progressively highlights as it's spoken — a native ASS
feature rendered by the same `subtitles=` FFmpeg filter, no new dependency. `CAPTION_STYLE_PRESET`
selects between `bold-highlight` (large text, gold highlight as each word is spoken — the
TikTok/Reels-native look) and `clean-white` (smaller, static, no karaoke pop); see
`src/ai/captionStyles.ts` to add more presets — the karaoke/cue-building logic is fully decoupled
from the style definition.

### Content quality scoring

`ContentEvaluator` (`src/ai/ContentEvaluator.ts`) scores every generated script 0-10 on
`hookStrength`, `clarity`, `beginnerFriendliness`, `originality`, `visualFeasibility`, and `value`,
plus an `overall` score and one sentence of improvement feedback. Inside the `SCRIPT` pipeline
step, `PipelineOrchestrator` loops: generate → evaluate → if `overall` is below
`CONTENT_QUALITY_THRESHOLD`, regenerate with the evaluator's feedback appended to the prompt, up to
`CONTENT_QUALITY_MAX_RETRIES` times. It always ships the best-scoring attempt seen — a daily-posting
bot silently skipping its slot over a quality gate would be worse than a mediocre Reel, so this is
a quality *nudge*, not a hard block. If the evaluator's own LLM call or output ever fails, it fails
open with a neutral passing score rather than blocking the pipeline.

### Configuration

All of the above is tunable via `.env` (see [.env.example](./.env.example) for defaults):
`CONTENT_AUDIENCE_LEVEL`, `CONTENT_QUALITY_THRESHOLD`, `CONTENT_QUALITY_MAX_RETRIES`,
`CAPTION_STYLE_PRESET`, `VOICE_SPEED`, `VOICE_STYLE`, `VIDEO_FONT_FAMILY`. These currently apply
globally (read once at `container.bootstrap()` into the default `settings` row); per-niche
overrides would mean setting them directly on that niche's `Setting` row instead — the columns
already exist for that.

## Bonus features implemented

- **Multiple niches/accounts**: the `settings` table supports multiple active rows, each with its
  own niche/language/cron/timezone; the scheduler schedules one job per row.
- **Avoid repeated hooks**: `ScriptGenerator` checks new hooks against recent post hooks and
  retries with the LLM if too similar.
- **Never-repeat topics**: `TopicPlanner` combines an LLM exclusion-list prompt with a local
  Jaccard-similarity backstop so uniqueness doesn't depend solely on the model following
  instructions.
- **Resume interrupted executions**: see `PipelineOrchestrator.runStep` + `execution_steps` table.
- **Automatic temp file cleanup**: `cleanupOldFiles()` runs after every successful pipeline run.
- **Health check endpoint**, **Docker Compose**, **GitHub Actions CI**: all above.
- **Analytics collection / performance dashboard data**: `/analytics/summary` and
  `/executions` return the underlying data; `api_logs` captures per-call latency/success for every
  external provider.

Not yet implemented (documented rather than faked): weekly/monthly content *planning* beyond the
daily topic rotation, true multi-variant Reel generation (the `videos` table already supports
multiple rows per post via `variantLabel`/`isSelected`, but only one variant is currently
rendered per run), and genuine trend detection (the research step is LLM-knowledge-based, not
live-trend-sourced).
