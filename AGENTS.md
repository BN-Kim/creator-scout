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
- Check history before recommendation and same-run duplicates before visible results.
- Manual corrections override system decisions.
- Keep business rules outside React components.
- User-facing UI text must be Korean.
- Work on one phase from [`docs/development-plan.md`](docs/development-plan.md) at a time.
- Do not add an external integration unless the active phase explicitly requires it.
- Update [`docs/current-status.md`](docs/current-status.md) after meaningful implementation changes.
- Preserve the three-field history export contract: `channel_name`, `url`, `status`.

Canonical business rules live in [`docs/product-rules.md`](docs/product-rules.md). Architectural ownership lives in [`docs/architecture.md`](docs/architecture.md). Do not duplicate those specifications elsewhere.

## Completion

Run `npm run verify`. It executes lint, tests, type checking, and the production build. Fix implementation-related failures before handing off.
