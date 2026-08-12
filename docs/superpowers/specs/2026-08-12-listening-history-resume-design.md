# Mineradio Listening History and Resume Design

## Goal

Turn the existing local listening statistics into a complete, durable recent-play workflow. Users can find what they actually listened to, resume an unfinished track, queue it next, remove individual records, or clear history without changing playlists, offline copies, or platform accounts.

## Product Placement

- Add **Recent Plays** as a first-class tab in Music Library, beside Local Music, Playlists, and Offline Music.
- Keep the existing home Recent card. It continues to use the newest valid history record and now resumes unfinished listening.
- Do not add another global navigation button, settings section, Visual Console section, or account page.
- Use the existing Music Library typography, row density, controls, motion, and two-click destructive confirmation.

## Data Ownership

Extend the existing `mineradio-listen-stats-v1` payload instead of creating another history store. This keeps the home dashboard, listening statistics, and Music Library on one source of truth.

Each deduplicated recent record keeps the existing playback identity plus:

- `durationSec`: last known playable duration;
- `resumeAt`: last effective playback position, or zero when completed/near the end;
- `progress`: bounded zero-to-one progress for display;
- `album` and all non-secret provider identity needed to play again;
- `playedAt`, `listenMs`, and `completed` from the existing session model.

The store remains local-only and bounded. It never stores cookies, tokens, signed audio URLs, or account credentials. Corrupt or legacy records are normalized on read; old history remains usable.

## Recording Semantics

Only effective listening sessions enter history, preserving the existing threshold: completed, at least 45 seconds, at least half the track, or at least 30 seconds when duration is unknown. Replaying a song moves its latest record to the front rather than adding duplicates.

For an unfinished session, save a resume position only when it is meaningful. Positions near the beginning or within the final 15 seconds reset to zero. Completed sessions always restart from the beginning.

## Playback Semantics

Convert a history record back to a normal Mineradio song with the original provider identity. Playback uses the existing queue, offline-first resolution, provider fallback, quality rules, listening effects, and system-media path.

- **Continue** starts at `resumeAt` when valid.
- **Play again** starts at zero for completed/near-end records.
- **Play next** uses the existing queue-next command and does not interrupt current playback.
- Missing local files use the existing local-file missing state; network records use normal source fallback.

## Music Library Workspace

The Recent Plays tab contains:

- a restrained summary band with record count, total effective listening time, and unfinished count;
- search by title, artist, album, or source;
- filters for time range (all, today, seven days, thirty days) and provider;
- dense rows showing cover, title/artist, source/album, last played time, and a progress line;
- row actions for play/continue, play next, and two-click remove;
- a two-click clear-history action that does not touch aggregate listening statistics, playlists, local files, or offline copies.

Switching Music Library tabs clears the active text query and resets history pagination so a hidden filter cannot make another tab appear empty.

## Backup and Compatibility

Add the listening statistics key to Mineradio's full-backup library allowlist. Restore remains merge-based and bounded by the existing backup validator. Search history, credentials, and source scripts remain excluded.

## Failure Handling

- Invalid fields are clamped or discarded during load.
- A malformed store falls back to empty history without breaking playback.
- A failed playback attempt leaves the record intact so source recovery can be tried later.
- Removing or clearing history is local and immediately persisted; UI refreshes from the same in-memory state.

## Verification

- Unit tests cover legacy migration, progress bounds, resume thresholds, deduplication, removal, and clear behavior.
- Integration guards cover Music Library ownership, no derivative naming, existing queue actions, offline-first playback reuse, and full-backup allowlisting.
- Full `npm test`, `npm run check`, dependency audit, and Windows unpacked packaging must pass.
