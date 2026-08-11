# Platform Rankings Design

## Goal

Add a Mineradio-native ranking view to the existing home discovery surface. The view exposes current public charts from multiple music platforms without requiring an account, copying the LX interface, adding LX naming, or creating a second playback model.

## Product Boundary

- Upgrade the existing home `DISCOVER` modal instead of adding another page or home card.
- Keep the current platform recommendation view intact and add a top-level `推荐 / 榜单` segmented switch.
- Support `综合`, `网易云`, `QQ`, `酷狗`, `酷我`, and `咪咕` under the public provider keys `all`, `netease`, `qq`, `kugou`, `kuwo`, and `migu`.
- Expose the data through `GET /api/platform-rankings`; do not add `/api/lx-*`, LX provider aliases, LX labels, or LX visual components.
- Treat the results as public platform charts, not personalized recommendations. Login state must not hide or unlock the ranking view.
- Reuse the existing song model, queue, provider fallback, likes, collections, lyrics, shelf, and playback reporting.

## Data Contract

`GET /api/platform-rankings?provider=<key>&limit=<n>&refresh=1` returns:

- `ok`, `provider`, `providerLabel`, `chartTitle`, `updatedAt`, and `cached`.
- `songs`, where each item keeps the playback metadata expected by its existing provider adapter and adds only `rank`, `rankChange`, and `rankingProvider`.
- `providers`, an availability summary used by the combined view to show partial failures honestly.
- `partial`, set when a combined request succeeds with one or more unavailable platforms.

The service clamps the requested limit to 1-50 and caches each provider for six hours. `refresh=1` bypasses only the requested cache entry. Concurrent identical refreshes share one in-flight request.

## Provider Acquisition

- 网易云: public hot-song chart playlist.
- QQ: public popularity chart endpoint.
- 酷狗: public TOP chart page data.
- 酷我: public ranking page data.
- 咪咕: public chart/search catalogue data normalized through the existing backup-source song shape.

Each provider adapter owns fetching, parsing, and song normalization. An adapter may return an empty result with a concise error code, but it may not manufacture fixed fallback songs or replace a failed chart with arbitrary keyword search while claiming it is the native chart.

The combined chart requests all five providers independently, then mixes them round-robin while deduplicating normalized title and artist across platforms. A failed provider does not fail the entire combined chart when at least one provider succeeds.

## User Interface

- Keep the current modal proportions, typography, dark glass treatment, compact header, and rounded control language.
- Add a restrained segmented control directly below the header for `推荐` and `榜单`.
- In ranking mode, replace recommendation-source tabs with the six ranking provider tabs.
- Render a dense ranked list rather than recommendation cards. Each row contains a stable rank column, square cover, title, artist and album, provider badge, and compact icon actions.
- Row click plays that song from the complete visible ranking queue.
- Actions support `下一首播放` and `收藏到歌单`. Header actions support `播放全部` and `刷新当前榜单`.
- Use existing icon vocabulary and tooltips; do not use text-filled action pills inside every row.
- Use a short staggered row entrance, hover lift/highlight, pressed feedback, loading skeletons, and a subtle active-view transition. Motion respects reduced-motion preferences.
- The list becomes denser on desktop and remains one stable row per song at `390x844`; action buttons may collapse to icons but must remain visible and tappable.

## Playback And Collection

- Playing one row clones all visible ranking songs into `playQueue`, sets the selected index, and starts through `playQueueAt(index)` with a `platform-ranking` context.
- `播放全部` starts the same queue at index 0.
- `下一首播放` calls the existing `queueSongNext()` helper and preserves the current queue position.
- `收藏到歌单` calls the existing `openCollectModal()` flow. Backup-source tracks retain `additionalSourceCode` so their current local collection behavior remains available.
- Every action keeps provider metadata intact so source fallback and playback entitlement handling remain authoritative.

## State And Error Handling

- Recommendation and ranking state remain independent when switching views.
- A request sequence token prevents a slower prior provider request from replacing a newer selection.
- Closing the modal invalidates active ranking renders but does not cancel or alter playback.
- Refresh keeps the current list visible until replacement data arrives; initial load uses skeleton rows.
- An unavailable single provider shows its error state and leaves the other provider tabs usable.
- A partial combined result lists available songs and identifies unavailable providers in the status line.
- Empty or failed requests never replace the current play queue.

## Code Boundaries

- `platform-rankings.js`: provider adapters, normalization, cache, combined mixing, and exported pure helpers.
- `server.js`: dependency wiring and the `/api/platform-rankings` route only.
- `public/js/modules/05-playback/07c-platform-rankings.js`: ranking state, rendering, events, and playback actions.
- `public/index.html`: modal mode switch and ranking controls/containers.
- `public/css/index.css`: styles scoped to the existing discovery modal and ranking classes.

## Testing

- Backend unit tests cover provider normalization, rank metadata, combined round-robin mixing, cross-platform deduplication, partial failure behavior, six-hour caching, refresh bypass, and in-flight request sharing.
- Frontend VM tests cover view switching, stale-request suppression, full-queue playback, next-song insertion, collection handoff, empty-result queue preservation, and project wiring.
- Integration guards verify the new route and module, public provider keys, recommendation regression safety, responsive markup, and absence of LX naming/routes.
- Run every Node test, JavaScript syntax checks, `node scripts/quick-check.js --electron`, desktop interaction checks, `390x844` interaction checks, and console error inspection.

## Non-Goals

- Account-only personalized charts, historical chart archives, chart search, chart downloads, provider protocol emulation, or background polling.
- A standalone ranking page, copied LX layout, fixed fallback song lists, or a second queue/collection implementation.
