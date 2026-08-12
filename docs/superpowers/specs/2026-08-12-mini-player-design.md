# Mineradio Mini Player Design

## Goal

Add a focused Windows mini-player mode to the existing Mineradio main window. It must keep the current audio, queue, provider fallback, offline playback, effects, lyrics, and media-session state alive while reducing the visible surface to everyday playback controls.

## Product Boundary

- The feature is named `迷你播放器`; no LX naming or route is exposed.
- It is a main-window presentation mode, not a second BrowserWindow and not a second player.
- The normal window remains the owner of playback, queue, search, library, settings, visual rendering, and account state.
- Mini mode is unavailable while native fullscreen or full desktop mode is active. Entering mini mode first returns to an ordinary window.
- Mini state is not restored automatically after an abnormal exit. The next launch uses the normal window so the user cannot become trapped in a compact layout.

## Window Contract

The trusted preload bridge exposes bounded mini-mode operations: enter, exit, toggle always-on-top, and read state. The main process accepts these calls only from the main document.

On entry, the main process stores the current normal bounds and maximized state, leaves fullscreen, sets a compact minimum size, and animates the window to a display-clamped `440 x 180` target near its current screen position. On exit, it restores the previous minimum size and normal bounds, then restores maximized state when applicable. Moving the mini window does not overwrite the normal restore bounds.

Always-on-top is an explicit mini-only preference. It defaults to off, is visible in the mini controls, and is cleared when mini mode ends or the app exits.

## Renderer Surface

Mini mode applies one body class and exposes a dedicated semantic surface inside the existing document. The full homepage, visual stage, panels, modal triggers, and normal player chrome are hidden without being destroyed.

The compact surface contains:

- draggable title area and album cover;
- song title, artist, public source label, and current lyric line;
- clickable progress track with elapsed and total time;
- previous, play/pause, and next controls using the existing player functions;
- volume control using the existing volume state;
- always-on-top, return-to-full-player, minimize, and close controls.

Icons use the existing thin-stroke visual language. Motion is limited to a short mode transition, cover state, progress movement, and control feedback. Reduced-motion users receive no entrance animation.

## State Synchronization

The mini renderer reads the current queue item and the existing audio element. It updates from the same playback, time, volume, queue, and lyric state already used by the normal player. It never resolves its own source or writes a second playback snapshot.

Window state events include `isMiniPlayer` and `isAlwaysOnTop`. Renderer controls are updated from those authoritative values so failed or rejected transitions do not leave a false UI state.

## Failure Handling

- Missing or destroyed main window returns a bounded error result.
- Full desktop mode is disabled before compact resizing; a failure leaves the normal window unchanged.
- A display change clamps both compact and restored bounds into an available work area.
- Leaving mini mode always clears always-on-top, even if restoring the old bounds fails.
- Closing from mini mode follows the user's existing close-to-tray or exit behavior.

## Verification

- Unit tests cover bounded IPC, transition and restoration semantics, topmost cleanup, and project wiring.
- Static integration tests verify one playback owner, existing transport/seek/volume calls, original visual language, responsive compact dimensions, and no derivative naming.
- Full test, quick-check, dependency audit, Electron runtime smoke check, and Windows unpacked build must pass.

## Out Of Scope

- A second player window or duplicate audio element.
- Queue editing, search, library management, effects settings, or account controls inside mini mode.
- Automatic mini-mode startup, taskbar thumbnail replacement, global mini hotkeys, or per-monitor saved mini positions.
