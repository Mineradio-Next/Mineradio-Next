# Music Radio Design

## Goal

Add a Mineradio-native music radio surface that turns an explicit listening theme into a continuous queue. The feature fills the gap between platform-owned recommendation feeds and ordinary keyword search without using LX naming, LX routes, or a second playback model.

## Product Boundary

- Keep the existing `DISCOVER` entry as the home for verifiable platform recommendations.
- Replace the duplicate `PLATFORM PICKS` home entry with `MUSIC RADIO` / `音乐电台`.
- Describe radio truthfully as a themed queue generated from currently available public catalogues and the user's own music pool. It is not presented as an official provider recommendation.
- Do not add `/api/lx-*`, a new backend search route, account requirements, downloads, podcasts, or spoken programs.
- Reuse the existing song model, source readiness checks, provider search URLs, queue renderer, playback fallback, lyrics, likes, collections, and Cuefield behavior.

## Modes

The first complete release contains 21 data-driven modes in four categories:

- Personal: 私人漫游、心动模式、今日漫游.
- Scene: 通勤节拍、深夜氛围、专注电台、清晨唤醒、雨天咖啡馆、公路旅行、睡前轻音乐.
- Style: 华语流行、粤语金曲、摇滚现场、独立民谣、二次元、R&B 夜色、BGM 背景音乐.
- Energy: 热门 DJ、高燃模式、游戏战歌、城市夜跑.

Each mode owns an id, category, short label, description, search queries, matching terms, and a restrained accent color. Mode definitions are configuration, not conditional UI branches.

## User Interface

- Open an original-style modal from the lower home discovery rail.
- Use a compact header, category tabs, refresh-order icon, and a responsive mode grid.
- Each repeated mode item shows its label, title, one-line description, play state, and a star control for local favorites.
- Favorites persist locally and sort before non-favorites without changing category membership.
- Loading is scoped to the selected mode. The modal remains stable while the queue is assembled.
- Escape, backdrop click, close button, keyboard focus, `aria-selected`, `aria-pressed`, and live status text follow the existing modal interaction contract.
- Narrow layouts collapse to one column and keep all text and actions inside the viewport.

## Queue Construction

1. Read local candidates from the current queue, current search/list state, local file playlists, current daily songs, and locally available user playlist tracks.
2. For personal modes, prefer liked/local candidates and the top artist from listening statistics when available.
3. Run at most two bounded theme queries through the existing public catalogue search providers. Providers already unavailable in the current source status are skipped.
4. Reject podcasts, spoken programs, numbered episodes, overlong spoken titles, and records without a stable song identity.
5. For the DJ mode, require an explicit DJ/remix/mix marker in the title or album. A producer name alone is insufficient.
6. Deduplicate by provider identity and then by normalized title/artist/version.
7. Deterministically shuffle the pool per mode and refresh nonce, then cap the queue at 48 songs.
8. Preserve every song's original provider metadata and add only `radioModeId` and `radioModeName` context fields.

Selecting a mode replaces the current queue only after a non-empty candidate set has been built. A failed build leaves the old queue and current playback untouched.

## Playback And Errors

- Start through `playQueueAt(0)` with a `music-radio` playback context.
- Refresh the queue panel and 3D shelf through their existing safe wrappers.
- Close the modal only after the queue commits successfully.
- If no catalogue is ready, say that no searchable music source is available.
- If requests partially fail, use successful providers and local candidates.
- If the final pool is empty, keep the existing queue and show a concise retry message.
- Use a request token so stale mode builds cannot overwrite a newer selection.

## Persistence

- Store only favorite mode ids under `mineradio-music-radio-favorites-v1`.
- Add that preference to full backup and restore.
- Do not persist generated queues as a second library; the existing last-playback snapshot remains authoritative.

## Testing

- Pure tests cover mode count/category validity, spoken-content filtering, DJ filtering, deduplication, stable shuffle, queue cap, and favorite normalization.
- Integration guards verify the home entry, modal, loader order, no LX naming/routes, existing search dependency, queue commit boundary, and backup allowlist.
- Run all Node tests, JavaScript syntax checks, the Electron quick check, desktop and 390 px browser interaction checks, and console error inspection.

## Non-Goals

- Provider radio protocol emulation or account-only personalized FM.
- Audio downloads, cached radio stations, podcast radio, live broadcast streams, or continuous server-side recommendation learning.
- A standalone page, LX visual shell, or copied LX implementation.
