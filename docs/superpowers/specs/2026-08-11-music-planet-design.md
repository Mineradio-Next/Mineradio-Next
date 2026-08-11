# Music Planet Design

## Goal

Add a Mineradio-native spatial library view that groups the user's currently available songs by artist. The view turns existing playback and library state into an explorable Three.js scene without adding another catalogue, playback model, LX route, or LX-branded surface.

## Product Boundary

- Add a `音乐星图` command beside the close action in the existing `音乐发现` dialog. Do not add another home card or push current first-viewport content downward.
- Open a dedicated full-viewport dialog so the 3D scene is the primary surface rather than a preview inside a decorative card.
- Build only from songs already present in Mineradio: current queue, current search/list results, persistent local library, daily discovery data, and loaded user or local playlists.
- Do not fetch a new remote catalogue, require login, copy the LX page, add an LX label, or fabricate fallback songs.

## Data Model

1. Collect bounded candidates from existing stores and deduplicate by `queueItemKey`, then normalized title and artist.
2. Resolve one primary artist per song through the existing artist fields and normalization rules.
3. Rank artists by available track count, preserving the current track's artist when present.
4. Render at most 12 artist nodes and 48 song satellites on desktop. Narrow or low-power layouts use at most 8 artists and 24 satellites.
5. Keep the original song objects and source metadata. The planet state owns only derived node positions, selection state, camera state, and disposable Three.js resources.

## Scene And Interaction

- Use a separate transparent Three.js renderer, scene, perspective camera, raycaster, and root group.
- The current track is the central node. Artist planets orbit the center; their song satellites use smaller nearby orbits and faint connector lines.
- Use actual cover images on song nodes when they can be loaded. Failed or missing covers fall back to deterministic artist colors and initials.
- Drag rotates the root, wheel or trackpad zooms within a fixed range, and pointer hover highlights a node without changing layout.
- Clicking an artist opens its song drawer. Clicking a song node or drawer row starts that song through the existing queue and playback path.
- Drawer actions support direct play, next-song insertion, and collection through existing Mineradio functions.
- Escape closes the drawer first and then the dialog. Backdrop click and the close button follow the existing modal contract.

## Visual System

- Keep the original dark glass, restrained borders, compact type, and current accent color.
- The scene uses a quiet star field, thin orbital paths, album-cover nodes, and one selected-node halo. It does not use gradient orbs, decorative bokeh, copied LX artwork, or a second brand palette.
- A compact header shows `MUSIC MAP / 音乐星图`, available artist and track counts, a reset-view icon, and close.
- The lower hint names only the direct gestures. The side drawer uses the existing dense song-row language and never nests cards.
- At `390 x 844`, the scene remains full viewport, controls stay inside safe bounds, and the drawer becomes a bottom sheet with a bounded track list.

## Lifecycle And Performance

- Create renderer resources on first open and rebuild only derived nodes on later opens.
- Cap pixel ratio at `1.5`, use bounded geometry counts, reuse shared sphere and plane geometries, and avoid per-frame DOM layout reads.
- Pause requestAnimationFrame when closed or when the document is hidden. Resume only while visible.
- Dispose textures, materials, geometries, event bindings, and the renderer when the runtime is torn down.
- Honor reduced motion by disabling automatic rotation while preserving drag, zoom, and selection.
- If WebGL initialization fails, show the same artist and song data as an accessible list rather than a blank canvas.

## Playback And Errors

- Selecting a song finds its existing queue identity. If absent, clone and append it through the existing queue helper before playback.
- Direct play uses `playQueueAt` with a `music-planet` context. Next-song and collection actions reuse `queueSongNext` and `openCollectModal`.
- Empty data leaves current playback untouched and explains that the user should first play, import, or load songs.
- A failed cover or one malformed record cannot prevent the remaining scene from rendering.

## Testing

- Pure tests cover candidate collection, cross-provider deduplication, artist grouping, current-artist preservation, desktop/mobile caps, and deterministic fallback colors.
- Integration guards verify the discovery command, dialog markup, loader wiring, existing queue/collection calls, no LX naming/routes, and packaging through `public/**/*`.
- Browser verification covers desktop and `390 x 844`: nonblank canvas pixels, stable framing, drag/zoom state changes, artist drawer, song actions, text containment, and no console errors.
- Run the full Node suite, JavaScript syntax checks, Electron quick check, and runtime smoke test.

## Non-Goals

- A recommendation engine, streaming service, social graph, online artist database, or listening-history server.
- A copy of the LX music-planet layout, background asset, inline script, or remote-control feature.
- Replacing the existing 3D playlist shelf, home dashboard, music discovery recommendations, or platform rankings.
