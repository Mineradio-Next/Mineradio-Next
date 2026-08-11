# Desktop Lyrics Position Design

## Goal

Complete the existing Mineradio desktop-lyrics positioning workflow without adding a new page or copying the LX interface. Users can place desktop lyrics horizontally, use quick position presets, drag the unlocked lyric window, and keep that position after restart.

This batch extends the original desktop-lyrics controls. It does not add LX naming, a second lyric renderer, multi-line layout modes, alignment modes, window resizing, or a new visual style.

## Approaches Considered

1. Port the complete LX desktop-lyrics control set. This exposes more controls, but its multi-line and alignment helpers are not connected end to end in the referenced revision and would force a renderer rewrite.
2. Add only a horizontal slider. This is low risk, but dragging would still be temporary and the two positioning methods would disagree after restart.
3. Add a complete positioning loop. This is the selected approach: horizontal state, presets, drag persistence, multi-display clamping, schema migration, and focused tests.

## User Surface

The existing desktop-lyrics section gains:

- A `桌面歌词左右` slider from 2% to 98%.
- A compact segmented row with `左侧`, `居中`, `右侧`, and `复位`.
- Existing unlocked drag remains the direct-manipulation path.

No new sidebar item, modal, card, brand color, or menu name is introduced. The visual console indexes the horizontal slider under the existing desktop-lyrics group.

## State And Migration

Add `desktopLyricsX` with default `0.5` and clamp it to `0.02..0.98`.

Persist a compact display anchor alongside the ratios. It contains the Electron display id and its last known bounds, allowing a position on a secondary monitor to survive restart. If that display is no longer available, the stored bounds select the nearest available display and the window is constrained there.

The desktop-lyrics persisted schema advances to `desktop-lyrics-v4`. Version 3 remains readable and receives the centered default when `desktopLyricsX` is absent. Visual archives include the new field, so restoring an older archive remains centered and restoring a new archive restores both axes.

Position presets update state through one function, refresh the existing controls, push the existing desktop-lyrics payload, and save through the current lyric-layout persistence path.

## Window Geometry

Create a small pure geometry module for desktop-lyrics bounds. It owns:

- Default bounds from display bounds plus normalized X/Y ratios.
- Clamping a lyric window inside the selected display.
- Converting a dragged window back to normalized X/Y ratios.

Horizontal placement uses the available travel distance after subtracting window width. Vertical placement continues to use the window center against display height. Negative display coordinates and displays smaller than the preferred window are supported.

`desktop/main.js` selects the relevant Electron display and delegates the arithmetic to this pure module. This keeps multi-display behavior testable without launching a visible BrowserWindow.

## Drag Persistence Flow

1. The unlocked lyric overlay starts and ends a drag through the existing preload bridge.
2. The main process moves and constrains the BrowserWindow as it does today.
3. On drag end, the main process converts the final bounds to normalized X/Y values.
4. The main process sends one position-state event to the renderer.
5. The renderer updates `fx.desktopLyricsX/Y`, saves the lyric layout once, and refreshes controls without pushing a second move.

Every position message carries a monotonic runtime revision. A lyric/progress update that was queued before drag completion cannot overwrite the newer dragged position when it reaches the main process late.

Programmatic slider and preset moves do not enter this feedback path. Manual bounds are cleared when X or Y changes through settings, so the saved setting remains authoritative.

## Interaction Fix

When desktop lyrics are locked, any visible interaction hint is immediately hidden. A click-through window cannot reliably receive a pointer-leave event, so leaving the hint visible would otherwise strand it on screen.

## Error Handling

- Invalid ratios fall back to the centered/default position.
- Every computed window rectangle is constrained to the selected display.
- Missing or destroyed windows return a structured failure from IPC handlers.
- Missing renderer listeners do not affect desktop-lyrics playback or window cleanup.
- Position persistence occurs only after a completed drag, avoiding localStorage writes on every pointer move.

## Tests

- Unit-test default bounds, dragged ratio recovery, clamping, negative display coordinates, and small displays.
- Regression-test v3 state migration and v4 archive persistence for `desktopLyricsX`.
- Guard payload, preload event, main-process drag-end broadcast, slider, presets, and visual-console wiring.
- Run `node --test`, `quick-check.bat fast`, and hidden Electron `quick-check.bat full`.
- Hidden QA must not open a visible desktop-lyrics window.

## Acceptance

1. Enable desktop lyrics and move the horizontal slider; the window moves left/right without leaving the display.
2. Try left, center, right, and reset presets.
3. Unlock with the middle mouse button, drag the lyric window, and lock it again.
4. Restart Mineradio; the dragged position is retained.
5. Existing size, opacity, height, click-through, highlight, and desktop-lyrics animation behavior remain unchanged.
