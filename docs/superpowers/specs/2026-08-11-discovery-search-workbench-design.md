# Discovery and Search Workbench Design

## Goal

Upgrade the existing Mineradio music discovery dialog and top search surface without creating a second discovery route or changing the provider/playback contracts.

## Direction

Use a compact "source pulse" visual language: the existing dark glass shell stays intact, while each surface gains a small amount of context before the content. Discovery shows which view and provider are active, then separates loading, login-required, empty, and failed states. Search shows the active query, result count, and provider coverage, then offers local content filters for all results, original/studio-first results, and accompaniment/version results.

## Boundaries

- Reuse `/api/search`, provider search endpoints, recommendation feeds, ranking feeds, and existing queue/playback handlers.
- Do not add a duplicate discovery or search entry.
- Do not move unrelated controls into the visual workstation.
- Keep all labels branded as Mineradio concepts; no derivative project naming.

## Data Flow

1. Existing discovery loaders keep owning remote state.
2. New discovery context rendering reads that state and updates status chips/context text.
3. Existing search fetch and merge pipeline remains unchanged.
4. Search results are filtered client-side after merge; the filtered list becomes the current playback playlist so result actions remain index-safe.

## Interaction

- Switching discovery view/source updates context immediately and preserves the current loader.
- Refresh uses the current view's existing refresh handler.
- Search content filters appear only for music results and reset when a new query or mode starts.
- Empty/error states retain their existing login and retry actions.

## Verification

- Existing unit tests remain green.
- Add source-level assertions for discovery context/state rendering and search filter behavior.
- Run full `node --test`, quick-check, and packaged Windows smoke.
