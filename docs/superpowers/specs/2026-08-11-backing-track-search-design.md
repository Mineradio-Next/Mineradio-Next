# Backing Track Discovery Design

## Goal

Add a small, original-style action that finds a backing track for the current song without interrupting playback. The feature reuses Mineradio's existing multi-provider search, result list, queue, toast, and modal behavior. It does not import the derivative project's page structure, API names, or branding.

## User Experience

- Add a `查找伴奏` action chip to the existing song-detail chip row.
- Keep the main playback bar unchanged.
- While searching, the chip shows `查找中...` and ignores duplicate clicks.
- Search with the normalized current title, artist, and `伴奏`.
- Show all returned candidates in the existing search result panel.
- Highlight the highest-scoring candidate when it meets the confidence threshold.
- Put that candidate immediately after the current queue item, but do not start it.
- If no candidate reaches the threshold, leave the queue unchanged and let the user choose from the results.

## Architecture

Create a focused `backing-track-discovery.js` playback module loaded after the normal search module and before queue actions. It owns:

- current-title query normalization;
- deterministic candidate scoring and ranking;
- stale-request and duplicate-request protection;
- rendering through the existing search state and result renderer;
- optional handoff to the existing `queueSongNext()` function.

The song-detail module only renders the action chip. Search provider selection remains controlled by `fetchMusicSearchResults(query, 'song')`, so enabled built-in providers and optional backup catalog providers continue to follow the application's existing rules.

## Matching Rules

- Backing markers (`伴奏`, `instrumental`, `karaoke`, `off vocal`, `纯音乐`, `无人声`, `music only`) add strong confidence.
- An exact normalized title after removing backing markers receives the strongest title score.
- Prefix and partial title matches receive smaller scores.
- Matching artist text adds a small bonus.
- Medleys, live recordings, DJ/remix versions, and covers are penalized.
- A score of 60 or more is considered safe to queue as next.

## State And Errors

- Missing current song: show `请先播放一首歌`.
- Missing usable title: show `当前歌曲缺少可搜索的信息`.
- Empty results: render the existing empty-result surface and leave the queue unchanged.
- Search failure: render an error in the existing result surface and leave the queue unchanged.
- A newer backing search invalidates older responses.
- Closing the song-detail modal does not cancel the search; the search panel remains the result destination.

## Motion And Visual Fit

The action uses the existing `detail-chip` visual language with a dedicated action state. Its hover lift, pressed state, focus ring, and busy opacity follow existing chip/button motion values. The highlighted result uses a restrained accent edge and short entrance emphasis without changing row dimensions.

## Verification

- Unit-test title cleanup, query construction, marker scoring, penalties, and ranking.
- Integration-test the original search and queue APIs are reused and no `/api/lx-*` route appears.
- Test high-confidence queue insertion and low-confidence no-op behavior.
- Run JavaScript syntax checks, the full Node test suite, `git diff --check`, and the Electron quick check.
