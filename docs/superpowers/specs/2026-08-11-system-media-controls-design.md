# Windows System Media Controls Design

## Goal

Expose Mineradio's existing playback state to the Windows media surface so media keys, Bluetooth headset controls, the volume flyout, and compatible lock-screen surfaces can control the active queue and display truthful now-playing information.

The feature must remain a shell adapter. It must not create another player, queue, timer, or renderer-owned playback state.

## Options Considered

1. **Chromium Media Session API (selected).** Uses the renderer's existing audio element and playback functions. It provides metadata, artwork, playback state, seek position, and standard media actions without a new dependency.
2. **Electron global shortcuts only.** Easy to register but provides no Windows now-playing metadata or seek position and may conflict with user hotkeys.
3. **Native Windows SMTC bridge.** Offers the deepest Windows integration but adds a native helper, packaging surface, and lifecycle complexity that is not justified for the current feature.

## Architecture

Add one classic renderer module after the desktop shell metadata helpers and before startup bindings. The module owns only Media Session publication and action registration.

- Read the current queue item and the existing desktop-song metadata helper.
- Publish title, artist, album, and a sniffable absolute artwork URL through `MediaMetadata`.
- Publish `playing`, `paused`, or `none` from the current audio element.
- Publish duration, position, and playback rate only when all values are finite and valid.
- Route system actions back to `togglePlay`, `prevTrack`, `nextTrack`, and the current audio element.
- Reuse the normal seek synchronization and snapshot path after system seeks.

Unsupported Media Session actions are registered independently so one browser limitation cannot disable the remaining controls.

## Windows Shell Batch

The same delivery batch also completes the surrounding Windows shell experience without moving playback ownership out of the renderer.

- The main process keeps only a sanitized snapshot for the native tray menu: current title, artist, play state, and volume.
- Tray commands are sent through a narrow IPC channel and routed back to the existing player functions.
- The tray menu includes the current song, play/pause, previous/next, volume changes, mute, window restore, full-desktop recovery, and exit.
- The renderer reads and writes startup state through `app.getLoginItemSettings()` and `app.setLoginItemSettings()`. The UI always re-reads the OS result, so an unsupported or failed operation is never shown as successful.
- Tray state and Windows Media Session state continue updating while the main window is hidden, because both subscribe to the existing audio lifecycle rather than window visibility.

## Synchronization

- Audio `play`, `playing`, `pause`, `ended`, `emptied`, `abort`, and `error` events refresh playback state and metadata through the existing playback-event path.
- Track setup refreshes metadata as soon as the queue item becomes current.
- `loadedmetadata`, `durationchange`, `seeked`, and throttled `timeupdate` events refresh the Windows position state.
- Empty queues and cleared playback remove metadata and publish the `none` state.
- Artwork failures degrade to no artwork. They never block playback or metadata publication.

## System Actions

- `play` and `pause` use the existing guarded play toggle.
- `previoustrack` and `nexttrack` use the existing queue functions as user-initiated actions.
- `seekbackward` and `seekforward` use the system-provided offset or 10 seconds.
- `seekto` clamps the requested time to the known duration.
- `stop` pauses without clearing the queue so the user can resume the same track.

Every seek updates the existing beat/lyric cursor, progress UI, and playback snapshot.

## Error Handling

The adapter is inert when `navigator.mediaSession` or `MediaMetadata` is unavailable. Every metadata, position, and handler operation is isolated with guarded calls because action support varies by Electron and Windows version.

## Tests

- Unit-test metadata normalization, artwork URL handling, position validation, seek clamping, and action routing with a VM Media Session mock.
- Add static integration guards for loader order and playback/progress synchronization hooks.
- Run the complete Node suite, `quick-check.bat full`, and the Windows NSIS build.

## Acceptance

While a song is playing, Windows shows its title, artist, cover, playback state, and progress. Media keys and headset controls can play, pause, seek, and change tracks without opening a second playback path. Normal Mineradio playback remains unchanged when the Windows integration is unsupported.
