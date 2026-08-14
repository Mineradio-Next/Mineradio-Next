# Third-party ports

## Mineradio-LX-Music desktop/home reference

- Upstream: `ww085213/Mineradio-LX-Music`
- Initial reference revision: `82826df814c32853d99697c0ee60f749a2fcad79`
- Homepage refresh revision: `812e2dc2e18bbc263e61dbd0206cb765e003d6e9`
- Artist album reference revision: `82751d5907fb580bc31da42afde5a4e806636400`
- License: GNU GPL v3 (`GPL-3.0-only`)
- Port dates: 2026-07-18 (initial), 2026-07-19 (homepage refresh), 2026-08-11 (artist albums)

Mineradio's full desktop mode adapts the upstream idea of moving the existing
Electron main-window HWND between the Windows WorkerW desktop layer and an
interactive top-level window. The native attach/detach code in this project was
rewritten around the optimized edition's fail-closed WorkerW discovery, DPI
conversion, structured acknowledgements, serialized lifecycle, and cleanup
requirements.

The home dashboard adapts the upstream information hierarchy (continue,
library, daily recommendations, recent playback, today's listening, next up,
discovery, and radio entry points). Its data adapters use this project's current
multi-provider discovery, playlist, search, playback queue, and listen-history
state. Upstream LX-only server routes and the legacy standalone wallpaper
overlay were not copied.

The 2026-07-19 refresh additionally adapts the three-song "For You" strip,
stable cover-image swaps, in-place quick-card updates, daily-review hover
feedback, and compact-height scrolling/settings behavior. These features remain
implemented against Mineradio's existing provider, weather-radio, local-library,
queue, and playback modules rather than the upstream LX/local-only data model.

The 2026-08-11 artist-album work adapts only the upstream idea of continuing
from an artist page into album works. Mineradio uses real Netease and QQ artist
album APIs, a new shared response contract, an original compact horizontal
layout, and the existing Mineradio album-detail/gapless/collection paths. The
upstream grouping implementation and its immersive album interface were not
copied.

The combined application remains distributed under the repository's GNU GPL v3
license. Preserve this notice and the corresponding source when redistributing
modified builds.

## Qishui Passport Web QR authentication

- Upstream: `Wx2yZx/Mineradio-Qishui-QR-Login`
- Reference revision: `aaadaab7d011714f94fbe45b382ba8dcc7cf17b9`
- Declared license: `GPL-3.0-only`
- Port date: 2026-07-30

Mineradio ports only the official Passport Web QR authentication boundary:
an isolated hidden Electron security host, the Qishui web signing bootstrap,
QR creation and polling, account-session cookie persistence, and the official
second-verification UI when the service requests it. The upstream whole-project
installer was not run, and no application files were wholesale replaced.

The QR bridge feeds the authenticated cookie into Mineradio's existing
`qishui-api.js` provider. Search, playlists, likes, comments, entitlement checks,
and audio playback remain Mineradio implementations. Legacy token/manual-cookie
login controls and local SodaMusic cookie discovery are not exposed by the
current login UI.

The web security runtime resources under `qishui-auth-v6/` are retained
byte-for-byte for protocol compatibility and remain the property of their
respective rights holders. They are loaded only inside the isolated authentication
partition for the user's own official login session.

## KuGou concept-edition protocol adapters

- Upstream: `MakcRe/KuGouMusicApi`
- Reference revision: `7a60b70`
- License: MIT
- Port date: 2026-08-13

Mineradio references the upstream request shapes for concept-edition daily
recommendations, user songs, cloud playlists, playlist tracks, playlist writes,
and membership lookup. The implementation is integrated into Mineradio's existing
KuGou module with separate `kugou` and `kugouConcept` account scopes, Cookie stores,
cache keys, error states, and UI adapters.

Concept-edition playback remains represented as `provider: kugou` with
`kugouVariant: concept`, while account mutations use the independent
`kugouConcept` key. This prevents standard and concept-edition logins, likes, and
playlists from sharing session state. Basic concept sessions can read the official
user-song endpoint as a read-only "我喜欢" fallback when the cloud-list service
requires a stronger device authorization. Daily VIP claim endpoints are not ported.

Playback URL requests use the concept-edition application identity and tracker
route, retry lower quality levels when the requested stream is unavailable, and
classify login, membership, copyright, and temporary URL failures separately.
Playlist writes normalize KuGou global collection IDs to the numeric list IDs
required by the cloud-list service. Renderer account evidence and lyric-cache keys
remain isolated from the standard KuGou account even when both editions expose the
same song hash.
