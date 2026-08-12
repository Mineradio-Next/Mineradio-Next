# Mineradio Unified Favorites Design

## Goal

Add one dependable song-favorites workspace without replacing provider playlists or turning the Music Library into another settings panel. The visible feature is named `我的收藏` and follows Mineradio's existing music-library layout, typography, motion, and playback controls.

## Ownership And Scope

- `音乐库 -> 我的收藏` owns saved songs only.
- Saved playlists remain under `我的歌单`; favorite albums remain in album details; favorite radio modes remain in `音乐电台`.
- No LX name, route, file format, or provider-private label appears in the feature.
- The workspace reuses the existing queue, next-track, detail, like, source-fallback, and local-playlist paths.

## Data Model

- Keep a bounded local catalog of favorite song snapshots keyed by the existing provider-aware song identity.
- A successful or optimistic heart action updates the catalog; failed provider writes roll it back with the existing heart state.
- Songs loaded from a provider's special `我喜欢` playlist are imported into the catalog as provider-synced favorites.
- Backup catalogue hearts are explicitly marked `本机收藏`; platform hearts are marked with their public source name.
- Persist only playback-safe metadata. Never persist audio URLs, cookies, tokens, request headers, or account credentials.
- De-duplicate by provider identity first and normalized title/artist only when merging display rows from multiple evidence sources.

## Workspace

- Add `我的收藏` beside `我的歌单` in the existing Music Library tabs.
- Summary shows total songs, represented sources, and locally held favorites.
- Search title, artist, album, and source.
- Filter by source and by `全部 / 平台同步 / 本机收藏`.
- Row actions: play, play next, open detail, and toggle heart.
- Bulk actions: play visible results and queue visible results.
- Empty states distinguish no favorites, no matching filter, and provider refresh in progress.
- Opening or explicitly refreshing the page refreshes account playlist catalogues and imports any loaded `我喜欢` tracks without blocking local favorites.

## Failure And Consistency Rules

- A provider refresh failure keeps existing local catalog rows and shows a restrained partial-state message.
- Unliking removes the catalog row only after the provider action reaches its final state; a failed write restores it.
- Read-only providers never pretend to accept a write.
- Missing local files use the existing local-file error behavior and are never silently replaced by an online search.
- The catalog is bounded and normalized on every read so corrupt browser data cannot grow the UI or inject unsafe fields.

## Verification

- Unit tests cover normalization, secret-field exclusion, de-duplication, bounded persistence, and provider/local classification.
- Integration guards cover the Music Library tab, existing playback paths, and the absence of derivative branding.
- Full project tests, quick checks, dependency audit, and a Windows unpacked build must pass before acceptance.
