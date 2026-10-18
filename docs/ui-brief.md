# UI brief

Research summary (October 2026) of script-to-video tools (ElevenLabs Studio, Synthesia, Pictory, Descript, Fliki, Opus Clip, InVideo, HeyGen, Revid) and what Story Video Studio takes from them. [V] = verified in vendor docs, [A] = from reviews/marketing or judgement.

## Patterns we copy

| Pattern | Seen in | Our screen |
|---|---|---|
| Colour marker per speaker; that speaker's lines tinted the same colour | ElevenLabs Studio [V] | Story editor preview, character cards |
| "Change voice" says how many lines it affects and re-voices only those | ElevenLabs [V] | Editor, after first generate |
| Per-line/per-scene status bar plus a lock on good takes | ElevenLabs [V] | Generate progress, Review |
| Show the cost of a run on the button (what will be (re)generated) | ElevenLabs [V] | Generate / retry buttons |
| Whole-script storyboard view plus single-scene detail | Synthesia [V] | Editor preview, Review drawer |
| Scenes appear live as you type a scene marker | Descript `/` [V] | Editor (`[scene: ...]`) |
| Replace one scene's media without touching the rest | InVideo [A], Fliki [V] | Review: regenerate / upload per scene |
| Voice dropdown with play sample, "apply to all" | Fliki [V] | Character cards |
| Pick a clip by transcript or by timeline handles | Opus Clip [V] | Snippets |
| Multi-select scenes to adjust vertical crop together | Opus Clip [V] | Review in 9:16 mode |
| Approve the plan before anything renders | HeyGen [A] | Editor preview is the plan |

## Complaints we avoid

- Paying (in time or quota) to redo the whole video for one change: only stale parts regenerate.
- Failures without reasons: every failed scene shows the exact error and a retry.
- Opaque credit maths: show plain counts (N images, M seconds of audio).
- Generic look-alike output: one Style setting applied everywhere, easy image replacement.
- Crowded editors with many tabs: one level of controls per scene.
- Destructive actions without confirmation or undo.

## Visual direction: "archive desk at night"

Quiet charcoal surfaces, an aged-brass accent, document-flavoured mono type, used sparingly. A tool, not a horror skin.

- Dark (default): bg `#0E0F12`, surface `#16181D`, raised `#1E2128`, border `#2A2E37`, text `#E7E4DC`, muted `#9A9AA3`, accent `#C9A45C`, danger `#B4473F`, success `#6F9E7A`, info `#7C93B8`.
- Light ("paper"): bg `#F6F3EC`, surface `#FFFFFF`, border `#E2DDD1`, text `#1C1B19`, muted `#6B6760`, accent `#8C6A2A`, danger `#A23A33`, success `#3F7A52`, info `#3F5F8F`.
- Speaker colours: `#C9A45C #7C93B8 #9C7FB0 #6F9E7A #B07A5C #8AA3A0`.
- Type: Inter (UI), IBM Plex Mono (script, timecodes, labels), Source Serif 4 (story titles only).
- 4 px spacing grid; radius 6 (controls) / 10 (cards) / pill (chips); shadows only on overlays; 2 px accent focus ring.

## Screens

- **Dashboard:** story cards (serif title, date, length, status chip), status filter chips, one "New story" button, helpful empty state.
- **Story editor:** desktop two panes (mono script left, live preview right); mobile tabs. Preview = stats, issues (click to jump to line), characters (colour, voice, sample), scenes. Sticky bottom bar with estimate and Generate.
- **Progress:** Voices / Images / Render stages with x/y counts; per-scene rows with status, error text, retry. Safe to leave and return.
- **Review:** player with 16:9 / 9:16 toggle and scene strip; scene cards with regenerate, upload, lock, crop focus (9:16).
- **Snippets:** scene strip with range selection, live length meter (green at 60–90 s), 9:16 preview, saved snippet list.
- **Publish:** editable copy fields (title, description, tags) with copy buttons, downloads, checklist incl. YouTube "Altered content" label, "Mark as downloaded".
- **Style settings:** art style, narrator voice, captions, music; small previews; saved once.
