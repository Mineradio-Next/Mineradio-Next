# Mineradio Next Shell Design

## Status

Approved direction: Album Focus. This document defines the first independent Mineradio Next UI shell. It does not import LX feature code or copy LX page styling.

## Product position

Mineradio Next starts from the original project's working playback behavior. The new shell keeps the original product quiet when the user only wants to listen, while reserving clear locations for the stronger library, source, import, and queue capabilities that will later arrive from the LX upstream.

The resulting product is not a visual blend of two applications. It is one interface with a stable listening surface and deliberate task-specific views.

## View model

### A. Album Focus (default desktop view)

This is the application's default page and the first implementation target.

- A narrow persistent rail provides Home, Library, Playlists, Queue, and Settings. It may show an icon plus tooltip at compact widths; it does not become a large card column.
- The top bar contains global search and source selection. Source selection remains compact and expands only when the user needs a specific provider.
- The center is the primary listening surface: album art, track title, artist, album metadata, and the album track list.
- The next-up queue is a right-side drawer. It is collapsed by default but retains a visible handle and track count. It must not cover transport controls when opened.
- A stable bottom player contains current-track metadata, transport controls, progress, elapsed/total time, lyrics, quality, and volume entry points.

The layout must keep the currently playing album visually dominant. Generic action cards and repeated container borders are not allowed in the main listening surface.

### B. Lyric Stage (immersive/fullscreen)

The existing immersive/lyrics route becomes a dedicated presentation mode rather than an enlarged home screen.

- The active lyric line has the highest contrast and type scale.
- Adjacent lyric lines establish reading continuity at reduced contrast.
- Album art, track identity, and queue remain available but subordinate.
- The queue is a light right-hand drawer; it can be dismissed to leave only lyrics, track identity, and transport.
- The bottom transport remains reachable at all times and uses the same playback state as Album Focus.

### C. Collection Desk (library and management)

This view is the destination for library, playlist, local music, imports, history, and source-health work. It is not part of the default listening screen.

- Left: the user's collections and library navigation.
- Center: an asymmetric album ribbon, recent tracks, and the original daily time/note motif.
- Right: next-up details and source state.
- Bottom: the shared compact player.

LX features will later be placed here based on their job: local library and imports, source settings and status, playlist import/export, radio, and other collection-facing tools.

## Visual system

- Base: graphite/near-black surfaces, low-gloss layers, and thin low-contrast dividers.
- Accent: cold mist purple/indigo for the active listening state, with a restrained warm peach accent for focus and playback progress. Mint is reserved for successful source or device state.
- Corners: 3-6 px for controls and drawers. Do not use oversized rounded glass capsules.
- Surfaces: one primary stage per page. Secondary panels should read as structural zones, not floating cards.
- Typography: compact sans-serif UI text; album/track titles use stronger scale and normal letter spacing. No display-scale typography outside Lyric Stage.
- Motion: small opacity/transform transitions for opening the queue, changing tracks, and entering immersive mode. No permanent RGB, refractive-glass, or animated decorative background noise.

## Shared component boundaries

The shell must be built as reusable units over existing state and playback logic:

| Unit | Responsibility | Used by |
| --- | --- | --- |
| `next-shell` | desktop navigation, top bar, page body, responsive mode | A, B, C |
| `next-player-bar` | shared now-playing identity, transport, progress, quick controls | A, B, C |
| `next-queue-drawer` | queue count, open/close state, reorder/remove interactions | A, B |
| `next-source-picker` | provider selection and health/status display | A, C |
| `next-album-stage` | album art, metadata, current album track list | A |
| `next-lyric-stage` | active and surrounding lyric lines, immersive controls | B |
| `next-collection-desk` | library navigation, album ribbon, recents, source health | C |

These are visual and interaction ownership boundaries. Existing player, lyric, account, FX, and queue state remain the source of truth; the first shell phase must not duplicate playback state.

## Responsive and behavior requirements

- Desktop first: 1024 px and above shows the rail and the available drawer affordances.
- At narrow desktop/tablet widths, the rail contracts to icons, album art reduces before text is clipped, and the queue remains a drawer.
- At mobile width, the rail becomes a bottom navigation or sheet trigger; the active listening surface remains a single-column stage. The shared player never becomes inaccessible.
- Keyboard/focus behavior: navigation, search, queue drawer, player buttons, and view changes are keyboard reachable with visible focus states.
- Empty states use the original product's real concepts (no selected track, empty queue, no local library) and point to the relevant entry point without inventing fake recommendations.

## Delivery phases

1. Establish the shared shell, navigation, top bar, player bar, and tokens on the original baseline.
2. Implement Album Focus using existing playback, queue, lyric, and music-library state.
3. Implement Lyric Stage and Collection Desk using the same shared player and navigation surface.
4. Run the original static checks and Electron QA; repair baseline assertion failures before changing LX-facing features.
5. Hand the completed new shell to the owner for visual and behavior acceptance.
6. Only after acceptance, import LX features one capability at a time and integrate each into the designated A/B/C location.

## First-shell acceptance criteria

- Album Focus is visibly different from both upstream home pages: no repeated home-card grid, a dominant album stage, a drawer-based queue, and a compact structural player bar.
- Existing playback controls, queue actions, lyrics entry, search entry, and music-library entry continue to work.
- Lyric Stage can be entered and exited without losing playback or queue state.
- Collection Desk exposes real original data/empty states rather than mock data.
- Desktop and narrow-window layouts have no clipped controls or overlapping text.
- `node scripts/quick-check.js` passes, and Electron QA is rerun with any failures documented and fixed where caused by the new shell.
- No LX source code, package dependency, copied LX style sheet, or LX page has entered this phase.

## Non-goals

- No dependency vulnerability upgrade in the UI-shell change set.
- No LX capability migration before shell acceptance.
- No replacement of the playback engine, state model, or Electron process architecture.
- No project-wide rewrite of every visual screen in the first shell phase.
