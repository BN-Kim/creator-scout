# Agent Guide

## Required reading order

1. Read this file.
2. Read [`docs/index.md`](docs/index.md).
3. Read [`docs/current-status.md`](docs/current-status.md).
4. Read the relevant sections of [`docs/architecture.md`](docs/architecture.md) and [`docs/product-rules.md`](docs/product-rules.md).
5. Read tests related to the requested change.

## Permanent rules

- TypeScript only; do not use Python.
- Creator decisions are only `recommended`, `hold`, and `excluded`.
- Organization-owned email always means excluded.
- Hard gates override positive signals.
- Never invent creator identity, URLs, emails, metrics, or evidence. Fictional fixtures must be clearly marked as mock data.
- Normalize identity and check history before expensive evidence collection; silently skip prior-history matches from new results.
- Keep the same-run identity blocklist and treat duplicate skipping as a pipeline action, never a creator decision.
- Treat the automatic-run target as the number of newly recommended creators; duplicates, holds, exclusions, and failures never satisfy it.
- Persist every finalized creator decision automatically; users do not maintain or import history files.
- Manual corrections override system decisions.
- Keep business rules outside React components.
- User-facing UI text must be Korean.
- Work on one phase from [`docs/development-plan.md`](docs/development-plan.md) at a time.
- Do not add an external integration unless the active phase explicitly requires it.
- Use only the official YouTube Data API v3 behind the existing H3 provider contracts.
- Never normalize unavailable, unsupported, or malformed provider evidence to a confirmed numeric zero.
- Exact stable YouTube channel-ID resolution satisfies identity verification; channel-name matching is not a second gate.
- Live recruitment collection is limited to the exact public sources and methods adopted in decision 008; do not broaden the source set, guess URLs, or bypass access controls.
- `YOUTUBE_API_KEY` is required for live YouTube collection and must never be committed or logged.
- Update [`docs/current-status.md`](docs/current-status.md) after meaningful implementation changes.
- Preserve the three-field history export contract: `channel_name`, `url`, `status`.

Canonical business rules live in [`docs/product-rules.md`](docs/product-rules.md). Architectural ownership lives in [`docs/architecture.md`](docs/architecture.md). Do not duplicate those specifications elsewhere.

## Completion

Run `npm run verify`. It executes lint, tests, type checking, and the production build. Fix implementation-related failures before handing off.
