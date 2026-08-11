# Three-Track Lyric Editor Design

## Goal

Extend Mineradio's existing custom-lyric modal into a focused lyric workbench for original text, translation, and romanization. The workbench must support live line timing, whole-track offsets, local persistence, and LRC export without importing the derivative project's backup system, dynamic styles, page structure, API names, or branding.

## User Experience

- Keep the existing custom-lyric entry point and modal lifecycle.
- Show the current song and artist in the existing track header.
- Provide compact actions to load the currently resolved lyrics, add a row, and shift the entire timeline.
- Render one stable row per timestamp with a timing button, editable timestamp, original text, translation, romanization, and an icon-only delete action.
- Clicking a row's timing button captures the current playback position without pausing the song.
- A range control previews and applies small whole-track timing adjustments; a numeric control handles exact offsets.
- Save and apply the edited lyrics from the existing modal footer.
- Export standard `.lrc` from the original track or enhanced `.elrc` containing all three tracks.

## Architecture

Create a focused playback sidecar module loaded immediately after the existing song-detail and custom-lyric module. It owns:

- normalized three-track line data and schema migration;
- parsing current/custom lyric state into editor rows;
- sorting, timing, offset, serialization, and export helpers;
- editor rendering and modal interaction;
- applying saved original and translation tracks through Mineradio's existing lyric state pipeline.

The existing custom-lyric store key and preference key remain unchanged. Stored entries gain an optional versioned `editor` object, so older string and `{ text }` entries continue to load. The standard `text` field remains populated for compatibility with older Mineradio builds.

## Data Rules

Each editor line contains:

```json
{
  "t": 12.345,
  "original": "original lyric",
  "translation": "translated lyric",
  "romanization": "romanized lyric"
}
```

- Timestamps are finite, non-negative, rounded to milliseconds, and sorted when saved or exported.
- Empty rows are omitted on save.
- Existing custom LRC or plain text is converted into editor rows on open.
- Existing resolved translations are retained when loading current lyrics.
- The stage applies original and translation text immediately after save.
- Romanization remains part of the saved editor data and enhanced export; the original two-layer stage renderer is unchanged in this batch.

## Export

- Standard LRC contains metadata and one timestamped original line per row.
- Enhanced LRC uses the same timestamp for the original line plus `[tr]` and `[roma]` companion lines.
- Export uses a generic desktop text-file IPC bridge with a constrained extension and sanitized default filename.
- Canceling the save dialog is silent; write failures produce the existing toast feedback.

## Motion And Visual Fit

The modal retains the original dark glass surface, restrained gold focus color, compact type scale, and existing GSAP open/close behavior. Toolbar controls use the existing button language. Rows use subtle border and background transitions without resizing, while timing feedback briefly emphasizes the captured row. No nested cards, new navigation, large decorative headers, or separate visual system are introduced.

## Error Handling

- Missing current song: keep the modal closed and show the existing toast.
- No resolved lyrics to load: keep current edits and show a toast.
- Unsaved edits before reloading: use the existing confirmation pattern.
- Empty save or export: show inline status or toast without mutating stored lyrics.
- Local storage failure: apply the lyrics for the current session and report that persistence failed.
- Desktop export bridge unavailable: report that file export is unavailable.

## Verification

- Unit-test line normalization, migration, standard/enhanced serialization, offset clamping, and current-line conversion.
- Integration-test the sidecar load order, three-track storage schema, reuse of the existing modal and lyric pipeline, and absence of derivative API or branding names.
- Syntax-check changed JavaScript files.
- Run the full Node test suite, `git diff --check`, and the Electron quick check.

