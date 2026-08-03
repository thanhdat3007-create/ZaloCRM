---
name: ak:ai-multimodal
description: Analyze images/audio/video with Gemini API (better vision than Claude). Generate images (Imagen 4, Nano Banana 2, MiniMax), videos (Veo 3, Hailuo), speech (MiniMax TTS), music (MiniMax). Use for vision analysis, transcription, OCR, design extraction, multimodal AI.
user-invocable: true
when_to_use: "Invoke for Gemini vision, OCR, media generation, or transcription."
category: ai-ml
keywords: [vision, image, video, audio, Gemini]
license: MIT
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
argument-hint: "[file-path] [prompt]"
---

# AI Multimodal

Process audio, images, videos, and documents with the exact-pinned
`@mrgoonie/multix@0.2.0` CLI. Use the `npx` invocation shown here; do not
install or call a floating global `multix`.

```bash
npx -y -p @mrgoonie/multix@0.2.0 multix --version
```

## Setup

Requires Node.js 20+ and provider keys in process env, project `.env`, or
`~/.multix/.env`.

```bash
export GEMINI_API_KEY="your-key"          # https://aistudio.google.com/apikey
export OPENROUTER_API_KEY="your-key"      # optional image/video routing
export MINIMAX_API_KEY="your-key"         # optional MiniMax generation
```

Verify setup:

```bash
npx -y -p @mrgoonie/multix@0.2.0 multix check --verbose
```

The backend pin travels with the skill. Users update it by refreshing the
AgentKit kit; there is no auto-update path inside the skill.

### Backend ownership

- Treat the exact-pinned Multix CLI as the runtime contract for covered media
  operations; keep this skill focused on orchestration, provider setup, and
  examples.
- Report missing keys, FFmpeg, provider access, or `multix check` failures as
  environment blockers, not kit-loader failures.
- Track missing capability upstream, validate a new exact pin, then refresh the
  kit. Do not recreate a parallel AgentKit Python backend unless an accepted ADR
  or explicit maintainer decision changes backend ownership.
- When changing the pin, verify stale local-script references, skill metadata,
  adapter golden output, and provider setup guidance together.

## Quick Start

Analyze media:

```bash
npx -y -p @mrgoonie/multix@0.2.0 multix gemini analyze \
  --files input.png \
  --prompt "Analyze this content" \
  --format markdown \
  --output analysis.md
```

Transcribe audio or video:

```bash
npx -y -p @mrgoonie/multix@0.2.0 multix gemini transcribe \
  --files interview.mp4 \
  --prompt "Generate a transcript with timestamps" \
  --format markdown \
  --output transcript.md
```

Extract structured data:

```bash
npx -y -p @mrgoonie/multix@0.2.0 multix gemini extract \
  --files receipt.png \
  --prompt "Extract merchant, date, total, and line items as JSON" \
  --format json \
  --output receipt.json
```

Convert documents to Markdown:

```bash
npx -y -p @mrgoonie/multix@0.2.0 multix doc convert \
  --input report.pdf \
  --output report.md
```

Generate images with Gemini / Imagen:

```bash
npx -y -p @mrgoonie/multix@0.2.0 multix gemini generate \
  --prompt "Studio product photo on white background" \
  --model gemini-3.1-flash-image-preview \
  --aspect-ratio 1:1 \
  --size 2K \
  --output product.png
```

Generate images through OpenRouter:

```bash
npx -y -p @mrgoonie/multix@0.2.0 multix openrouter generate \
  --prompt "Editorial campaign key visual" \
  --model google/gemini-3.1-flash-image-preview \
  --aspect-ratio 4:5 \
  --image-size 2K \
  --output campaign.png
```

Configure OpenRouter fallback models with:

```bash
export OPENROUTER_FALLBACK_MODELS="black-forest-labs/flux.2-flex,recraft-ai/recraft-v3"
```

Generate videos with Veo:

```bash
npx -y -p @mrgoonie/multix@0.2.0 multix gemini generate-video \
  --prompt "15-second product demo video" \
  --model veo-3.1-generate-preview \
  --resolution 1080p \
  --aspect-ratio 16:9 \
  --output demo.mp4
```

Generate with MiniMax:

```bash
# Image
npx -y -p @mrgoonie/multix@0.2.0 multix minimax generate \
  --prompt "A cyberpunk city" --model image-01 --aspect-ratio 16:9 --output city.png

# Video
npx -y -p @mrgoonie/multix@0.2.0 multix minimax generate-video \
  --prompt "A dancer" --model MiniMax-Hailuo-2.3 --duration 6 --resolution 1080P --output dancer.mp4

# Speech
npx -y -p @mrgoonie/multix@0.2.0 multix minimax generate-speech \
  --text "Hello world" --model speech-2.8-hd --voice English_Warm_Bestie --emotion happy --output hello.mp3

# Music
npx -y -p @mrgoonie/multix@0.2.0 multix minimax generate-music \
  --lyrics "La la la\nOh yeah" --prompt "upbeat pop" --model music-2.5 --output song.mp3
```

Optimize media before provider uploads:

```bash
npx -y -p @mrgoonie/multix@0.2.0 multix media optimize \
  --input raw-video.mp4 \
  --output optimized-video.mp4 \
  --target-size 20
```

## Models

### Google Gemini / Imagen
- **Image gen**: `gemini-3.1-flash-image-preview` (Nano Banana 2 default), `gemini-2.5-flash-image`, `gemini-3-pro-image-preview`, `imagen-4.0-generate-001`, `imagen-4.0-ultra-generate-001`, `imagen-4.0-fast-generate-001`
- **Video gen**: `veo-3.1-generate-preview`
- **Analysis**: `gemini-2.5-flash`, `gemini-2.5-pro`

### OpenRouter
- **Image gen routing**: provider-qualified model ids such as `google/gemini-3.1-flash-image-preview`
- **Fallbacks**: set `OPENROUTER_FALLBACK_MODELS=model-a,model-b`

### MiniMax
- **Image gen**: `image-01`, `image-01-live`
- **Video gen**: `MiniMax-Hailuo-2.3`, `MiniMax-Hailuo-2.3-Fast`, `MiniMax-Hailuo-02`, `S2V-01`
- **Speech/TTS**: `speech-2.8-hd`, `speech-2.8-turbo`, `speech-2.6-hd`, `speech-2.6-turbo`
- **Music**: `music-2.5`, `music-2.0`

## Failure UX

- **First run / offline**: `npx` fetches `@mrgoonie/multix@0.2.0` on first use, then reuses the npm cache. For sandboxed or offline sessions, pre-warm with `npx -y -p @mrgoonie/multix@0.2.0 multix --version`.
- **Node <20**: install Node.js 20+ and rerun the command.
- **Provider key missing**: `multix` reports the missing env var. Export keys in the shell, project `.env`, or `~/.multix/.env`.
- **Old `.claude` env hierarchy**: the previous Python scripts searched `.claude` env layers. `multix` v0.2.0 does not; migrate provider keys to shell env, project `.env`, or `~/.multix/.env`.
- **Provider API error**: keep the full provider error, redact keys, and retry only after fixing auth, billing, quota, model access, or request parameters.
- **Codex installs**: `skill.yaml` is AgentKit runtime metadata only. Codex uses the pinned `npx` commands in this file, so pre-warm the npm cache before network-restricted runs.

## Not Yet In multix v0.2.0

These are verified gaps from the issue #683 mapping. Do not revive the deleted
Python backend for covered operations.

| Gap | Upstream | Workaround |
| --- | --- | --- |
| `GEMINI_API_KEY_2` key rotation | https://github.com/mrgoonie/multix-cli/issues/23 | Rotate keys outside the skill or switch `GEMINI_API_KEY` before invocation. |
| Stdin media piping | https://github.com/mrgoonie/multix-cli/issues/24 | Write piped content to a temp file, then pass it with `--files`. |
| `.claude` layered env resolver | https://github.com/mrgoonie/multix-cli/issues/22 | Use shell env, project `.env`, or `~/.multix/.env`. |

## References

Load for detailed guidance:

| Topic | File | Description |
|-------|------|-------------|
| Music | `references/music-generation.md` | Lyria Realtime API for background music generation, style prompts, real-time control, integration with video production. |
| Audio | `references/audio-processing.md` | Audio formats and limits, transcription, TTS models, best practices, cost and token math. |
| Images | `references/vision-understanding.md` | Vision capabilities, supported formats and models, OCR/document reading, multi-image workflows. |
| Image Gen | `references/image-generation.md` | Imagen and Gemini image model overview, aspect ratios and costs, editing and composition. |
| Video | `references/video-analysis.md` | Video analysis capabilities, local/inline/YouTube inputs, transcription with visual context. |
| Video Gen | `references/video-generation.md` | Veo model matrix, text-to-video and image-to-video workflows, prompt design patterns. |
| MiniMax | `references/minimax-generation.md` | MiniMax image, video, speech, and music APIs with CLI examples. |

## Limits

Provider limits still apply: Gemini inline media is best under 20 MB, File API
handles larger media, and long audio/video transcripts may need chunking to
avoid output truncation. For transcripts longer than 15 minutes, split media
with `ffmpeg` or `multix media split`, transcribe each segment, then combine the
results.

Transcript output should be Markdown with metadata, chunk status, and timestamped
lines:

```text
[HH:MM:SS -> HH:MM:SS] transcript content
```

## Outputs

Invoke `ak:project-organization` when generated assets need to be grouped into a
project, campaign, report, or deliverable folder.

## Resources

- [multix CLI](https://github.com/mrgoonie/multix-cli)
- [Gemini API Docs](https://ai.google.dev/gemini-api/docs/)
- [Gemini Pricing](https://ai.google.dev/pricing)
- [OpenRouter Image Generation Docs](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [OpenRouter Provider Routing](https://openrouter.ai/docs/features/provider-routing)
- [MiniMax API Docs](https://platform.minimax.io/docs/api-reference/api-overview)
- [MiniMax Pricing](https://platform.minimax.io/pricing)
