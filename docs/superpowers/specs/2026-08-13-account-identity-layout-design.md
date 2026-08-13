# Account identity layout

## Goal

Prevent signed-in provider identities from colliding with membership, external-display, and workflow controls while preserving the existing Mineradio Next visual language.

## Approved hierarchy

- The top-right account pill contains the avatar, a single-line account name, and an optional VIP or SVIP badge.
- Ordinary membership is implicit and has no badge.
- Each login-provider row keeps the platform name as its primary label.
- A real account nickname appears as a smaller secondary line and truncates inside a fixed text track.
- An ordinary signed-in account uses a compact green status dot instead of an `已登录` label.
- VIP, SVIP, and exceptional pending states use one compact badge in the same status slot.
- Hover titles expose the full account identity when visible text is truncated.

## Interaction constraints

Provider sorting, account-pill sorting, external-display switches, workflow ports, login selection, and logged-out presentation remain unchanged. Dynamic content must never resize the provider controls or expand the fixed account pill width.

## Verification

Regression checks cover ordinary, VIP, long-name, and logged-out markup. The existing test and CI check suites must pass.
