# Mineradio Offline Music Cache Design

Date: 2026-08-12
Status: Approved by standing product direction

## Goal

Add a native Windows offline-music workflow without changing Mineradio's playback identity or turning Chromium's temporary media cache into a user promise. A user can explicitly save a playable network track, see download state and disk use in Music Library, play the saved copy without a network connection, and remove it without touching playlists or local music files.

## Product Placement

- Add **Offline Music** as a first-class Music Library tab beside Local Music, Playlists, Library Health, and Import.
- Add a compact **Save Offline** action to track detail. Do not add another global navigation entry or put this workflow in Visual Console.
- Keep original provider names where they describe a public source. Do not expose LX naming.
- Use the existing Music Library typography, spacing, row density, buttons, and transitions.

## Scope

The first release supports an explicit one-track-at-a-time action for ordinary playable network songs. It does not silently cache listening sessions, download entire playlists, copy local-library files, export unrestricted standalone music files, or persist provider credentials and temporary signed URLs.

## Architecture

### OfflineMusicLibrary

Create `desktop/offline-music-library.js` as the sole owner of disk state. It stores:

- `offline-music.json`: versioned, atomically replaced metadata index under stable `userData`;
- audio payloads under the selected managed cache root in `offline-music/`;
- temporary `.part` files that are renamed only after a complete response and size checks.

Each committed entry contains a stable track key, sanitized playback metadata, relative payload filename, content type, byte size, timestamps, and original provider identity. It never contains cookies, authorization headers, signed source URLs, or account tokens.

The library serializes mutations, rejects unsafe keys and paths, limits metadata and response size, accepts only HTTP(S) audio responses, follows a bounded number of redirects, supports cancellation, and cleans stale partial files at startup.

### Read-only protocol

Register `mineradio-offline://track/<key>` before app readiness. The handler resolves only committed index entries and serves the file with byte-range support. Renderer code never receives a raw Windows path.

### IPC bridge

Expose trusted-main-window handlers through preload:

- list/status;
- start download with sanitized song metadata and the already resolved current playback URL;
- remove one committed entry;
- cancel one in-progress job;
- resolve whether a song has a committed offline copy.

Progress events carry key, received bytes, optional total bytes, and terminal state. The main process validates the sender and does all file I/O.

## Playback Data Flow

1. Before requesting a provider URL, playback asks the offline bridge for the current song key.
2. A committed copy returns `mineradio-offline://track/<key>` and becomes the playback source.
3. Lyrics, cover, queue identity, listening effects, media keys, resume state, and play history continue to use the original song object.
4. If the copy is missing or corrupt, playback removes/ignores the bad index entry and follows the existing online provider and fallback transaction.
5. Local-library tracks keep their current `mineradio-local://` path and are never duplicated.

The offline action in track detail first uses the current resolved provider URL when it belongs to the same song. Otherwise it resolves the source through the existing provider API, then asks the main process to download. Trial-only and unplayable responses are rejected rather than presented as complete songs.

## Music Library UI

The Offline Music tab has:

- a restrained summary band with saved count, disk usage, and active jobs;
- search by title, artist, album, or provider;
- dense rows with cover, track identity, source/quality, size/date, play, cancel/retry, and remove actions;
- truthful empty, loading, progress, failed, and unavailable desktop states;
- a two-step removal confirmation consistent with Library Health.

Downloads update rows through IPC progress events without rebuilding unrelated Music Library tabs. Removing an item deletes only Mineradio's managed payload and index entry; the song remains in playlists and can stream online later.

## Cache Settings Integration

Add `offlineMusicPath` and `offlineMusicBytes` to the existing managed cache snapshot. Moving the cache root applies to new downloads after restart; existing committed entries stay readable from their recorded managed root until an explicit future migration feature is designed. The UI must not count the same payload in both Chromium and offline totals.

## Error Handling

- Network, redirect, HTTP, stream, disk, size, and cancellation failures leave no committed entry.
- Existing committed copies remain available when a refresh attempt fails.
- Duplicate requests for one key share or reject against the active job instead of writing concurrently.
- App shutdown aborts active jobs and removes partial files.
- Missing payloads are reported as broken entries and may be removed safely.

## Tests

- Unit tests cover key normalization, metadata sanitization, atomic index persistence, redirect/size/content validation, cancellation, partial cleanup, removal, and byte-range reads.
- Integration guards cover trusted IPC, preload exposure, protocol registration, Music Library ownership, no LX naming, and offline-first playback fallback.
- Existing Node suite, full quick check, security audit, and Windows unpacked build remain required gates.

## Deferred

Playlist batch download, download scheduling, bandwidth limits, automatic LRU eviction, cross-device sync, format conversion, metadata rewriting, and cache-root migration are intentionally deferred until the single-track transaction proves stable.
