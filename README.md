# Story Video Studio

Turns a written story script into a narrated video (16:9 for YouTube, 9:16 for Shorts/Reels/TikTok, plus vertical teaser snippets). You write and approve the script; the app handles voices, images, captions, music and rendering. Uploading stays manual.

See [docs/ui-brief.md](docs/ui-brief.md) for the UI direction.

## Requirements

- Node.js 22.18 or newer (the worker runs TypeScript directly with Node's built-in type stripping; no build step).
- Nothing else. FFmpeg comes from the `ffmpeg-static` npm package (about 80 MB, downloaded once by `npm install`).

## Setup

```bash
npm install
npm run dev        # app at http://localhost:3000
```

Without any settings the app runs in **local mode**: stories, style and uploads are saved as files in `.local/storage` on your computer. That is enough to write and organise stories. To use the deployed app (and later the cloud renderer) you need Cloudflare R2, below.

## Environment variables

Real values go only in `.env.local` on your computer, and later in Vercel and GitHub settings. Git ignores every `.env*` file, and a secret scanner blocks commits that contain keys (see [Security](#security)).

| Name | Needed for | Where it is set |
|---|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Storage (all four, or none for local mode) | `.env.local`, Vercel, GitHub secrets |
| `CLOUDFLARE_API_TOKEN` | Image generation and usage meters (Workers AI Edit/Read, Account Analytics Read) | `.env.local`, Vercel, GitHub secrets |
| `APP_PASSWORD` | The login. Required once deployed | `.env.local`, Vercel |
| `GITHUB_TOKEN`, `GITHUB_REPO` | Starting cloud renders (Actions: Read and write on this repo only) | `.env.local`, Vercel |
| `AI_HORDE_API_KEY` | Optional slow image fallback | GitHub secrets |
| `CLOUDFLARE_ACCOUNT_ID`, `LOCAL_STORAGE_DIR`, `FFMPEG_PATH`, `PIPER_PYTHON`, `PIPER_DATA_DIR` | Optional overrides | `.env.local` |

## Security

This repository is public. Nothing secret is in it:
- Keys live in `.env.local` (ignored by git), Vercel settings and GitHub Actions secrets.
- `npm run check:secrets` scans files for things that look like keys (GitHub, Cloudflare, AWS-style, private keys), and for any value from your `.env.local`. It runs automatically before every commit (a git hook, enabled with `npm run setup:hooks` after cloning) and on GitHub for every push.
- On GitHub, keep **Settings → Advanced Security → Secret Protection** and **Push protection** turned on (free for public repos). GitHub then also blocks pushes containing known key formats.
- If a key ever leaks: create a new one, delete the old one in Cloudflare/GitHub, and update `.env.local` and the secrets. Removing a leaked key from git history is not enough.

## Cloudflare R2 setup (one time, about 10 minutes)

Free tier (checked October 2026): 10 GB storage, 1 million write and 10 million read operations per month, no download fees. **Cloudflare may ask you to add a payment method (card or PayPal) before the first bucket can be created**, even though you stay inside the free tier. If you would rather not add a card, keep using local mode for now and tell the planning assistant; we will choose another option.

1. Sign in at <https://dash.cloudflare.com>. In the left menu choose **R2 Object Storage**. Accept the R2 terms if asked.
2. **Create bucket** → name it `story-studio` → Location: Automatic → Default storage class: **Standard** (the free tier only covers Standard) → Create.
3. Copy your **Account ID**. It is shown on the R2 overview page, on the right.
4. On the R2 overview page choose **Manage API tokens** → **Create API token**:
   - Permissions: **Object Read & Write**
   - Specify bucket: **Apply to specific buckets only** → `story-studio`
   - TTL: Forever
   - Create, then copy the **Access Key ID** and **Secret Access Key**. The secret is shown only once.
5. Open the bucket → **Settings** → **CORS Policy** → **Add CORS policy** and paste the policy below. Replace the Vercel address once you know it. This lets the browser upload music and images straight to R2.

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://YOUR-APP.vercel.app"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

6. Create `.env.local` (see [Environment variables](#environment-variables)) and fill in `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET=story-studio` (the bucket's name).
7. Run `npm run check:storage`. It writes, reads, lists and deletes a test file, and tests a browser-style upload (CORS). It prints pass/fail only, never your keys. Then restart `npm run dev`; the blue "Local mode" banner on the dashboard disappears when R2 is in use.

Stories created in local mode are not copied to R2 automatically.

### Storage layout

```
jobs/{jobId}/job.json      script, voices, title, style snapshot at generate time
jobs/{jobId}/status.json   written by the worker (state, stage, progress, outputs, errors)
jobs/{jobId}/audio/ images/ output/
settings/style.json        channel style
settings/music/*.mp3       uploaded background music
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm test` | Parser, timing, caption, motion and storage tests (Node's built-in test runner) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run sample-job` | Create a test job in `.local/jobs/sample` with placeholder images, tone "voices" and music |
| `npm run voices -- <jobDir> [--provider edge\|piper] [--force]` | Voice every line with text-to-speech (only changed lines are re-voiced) |
| `npm run render -- <jobDir> [options]` | Render a job folder to MP4 |
| `npm run voice-samples` | Record the play-button samples in `public/voices/` (only missing ones; `--force` to redo) |

### Voices

- **Primary: Microsoft Edge neural voices** via [`node-edge-tts`](https://github.com/SchneeHertz/node-edge-tts) (MIT). Free and natural-sounding, but unofficial: Microsoft can throttle or change it. Requests are spaced out and retried with backoff.
- **Fallback: [Piper](https://github.com/OHF-Voice/piper1-gpl)** (offline, `pip install piper-tts`, needs Python 3.9+). Used automatically for the whole story if Edge fails, so voices never mix. It runs as a separate program, so its GPL licence does not apply to this code. Voice models (~60 MB each) download on first use to `~/.cache/piper-voices` (or `PIPER_DATA_DIR`). It is not needed on your laptop; the cloud worker installs it.
- Each clip is trimmed of the engine's leading/trailing silence. `audio/manifest.json` records what each clip was made from, so editing one line re-voices only that line.
- The final mix is normalised to -14 LUFS, the level YouTube and the short-video apps play at.

Try it: `npm run sample-job`, then `npm run voices -- .local/jobs/sample`, then `npm run render -- .local/jobs/sample`.

### Images

Each scene needs one image. In the story editor every scene has **Generate / New image**, **Upload / Replace** and **Remove**, plus a "Generate N images" button for all missing ones. You can also drag an image onto a scene.

- **Primary: Cloudflare Workers AI, FLUX.2 [klein] 4B**, at 1024×768 (4:3), about 12–15 s per image. If it fails, **FLUX.1 [schnell]** (1024×1024, about 2 s) is tried next. Both have Apache-2.0 weights, so commercial use is fine. Free plan: 10,000 "neurons" per day, reset at 00:00 UTC. 4:3 keeps about two-thirds of the picture's height in 16:9 and still leaves room for the 9:16 centre crop. Check your usage under **AI → Workers AI** in the Cloudflare dashboard.
- **Optional slow fallback: AI Horde.** Free and volunteer-run, with no watermark. Anonymous requests waited about 30 minutes per image in testing, so it is only used by the cloud worker and only when `AI_HORDE_API_KEY` is set.
- **Always available: your own images.** Uploads are never replaced automatically. If you later change that scene's description, the image is marked "Outdated" so you can decide.
- Rejected (Oct 2026): Pollinations' free endpoint adds a watermark and returns low-resolution images, and its new API needs a key.

Every prompt is the channel art style from Style settings (first, because FLUX weighs early words most, which keeps all scenes in one look), then the scene's `[scene: ...]` description and a fixed "centred composition" hint. A scene without a description uses its first lines instead. Generated images are redone only when that prompt changes. "New image" picks a new seed for the same prompt.

Command line: `npm run images -- <jobDir> [--scene N] [--force]`.

#### Cloudflare Workers AI token (one time, about 3 minutes)

1. In the Cloudflare dashboard open **AI → Workers AI** in the left menu. Choose **Use REST API**, then **Create a Workers AI API Token**. If you don't see that button, use **My Profile → API Tokens → Create Token** and the **Workers AI** template instead.
2. Keep the suggested permissions (Workers AI: Read and Edit) and your account. Click **Continue to summary**, then **Create Token**.
3. Copy the token (shown once) into `.env.local`:
   ```
   CLOUDFLARE_API_TOKEN=your-token
   ```
   The account ID is taken from `R2_ACCOUNT_ID`.
4. Restart `npm run dev`. The **Generate** buttons appear on each scene.

### Renderer CLI

```bash
npm run sample-job
npm run render -- .local/jobs/sample                          # output/full-16x9.mp4
npm run render -- .local/jobs/sample --format 9x16            # output/full-9x16.mp4
npm run render -- .local/jobs/sample --format 9x16 --scenes 2-3   # output/snippets/scenes-02-03-9x16.mp4
```

Options: `--format 16x9|9x16`, `--scenes a-b`, `--out <path>`, `--crf <18-28>` (quality vs size, default 23), `--preset <x264 preset>` (default `veryfast`), `--no-status`.

A job folder looks like this (the same layout is used in R2 later):

```
job.json            script, voices, style snapshot
status.json         written by the renderer: state, progress, output, errors
audio/s01-l01.mp3   one file per spoken line (scene 01, line 01)
images/scene-01.png one image per scene (png/jpg/webp)
music/bed.mp3       optional, referenced from job.json
output/             rendered videos
```

## Password

The whole app sits behind one password, `APP_PASSWORD`. It is a single-owner lock, not a user system.

- Put `APP_PASSWORD=your-long-password` in `.env.local` (and later in Vercel → Project → Settings → Environment Variables).
- Every page, upload and action asks for it. After signing in, the browser stays signed in for 30 days (an HttpOnly, signed cookie). **Log out** is in the header.
- Five wrong attempts from one address lock it for 15 minutes. Each wrong attempt also waits 1 second.
- Changing `APP_PASSWORD` signs out every browser.
- Locally the password is optional. **A deployment without `APP_PASSWORD` refuses to work** rather than run open.
- The voice samples in `/voices/` stay public: they are just demo clips.

## Usage (free-tier meters)

The **Usage** page (and the "Free tier N%" chip in the header) shows how much of each free allowance is used: green under 70%, amber from 70%, red from 90%. It refreshes every minute while open. Each bar says where its number comes from:

- **Measured**: from Cloudflare (or from listing the bucket; that count is cached for 10 minutes, because listing is itself a Class A operation).
- **Estimate**: from the app's own tally in `usage/YYYY-MM.json`, e.g. images generated today × estimated neurons per image.
- **Not connected**: the source isn't set up yet.

What can cost money: only Cloudflare R2, which has your card on file. Workers AI on the free plan stops at its daily limit, and GitHub (private repo, no card) pauses at its monthly limit; neither charges. Keep an R2 Budget Alert as a backup.

### Connect Cloudflare's own numbers (one time, about 2 minutes)

1. Cloudflare dashboard: profile icon → **My Profile → API Tokens**, or **Manage Account → Account API Tokens**. Find the **Workers AI** token, then **⋯ → Edit**.
2. **+ Add more** under Permissions: **Account → Account Analytics → Read**. Keep the Workers AI rows.
3. **Continue to summary → Update token.** The token text doesn't change, so `.env.local` stays the same.

## Script format

```
# The Letter from Room 9
[scene: dim hotel corridor at night, one door slightly open]
NARRATOR: The letter arrived three days late.
CLERK: Nobody has stayed in that room in years.
```

- `# Title` on the first line.
- `[scene: description]` starts a scene; the description becomes the image prompt.
- `NAME: text` is a spoken line. Text without a name continues the previous speaker.
