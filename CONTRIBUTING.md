# Contributing to Sidera

Thanks for helping! Sidera is a small, local-first macOS app — bug reports, ideas and pull requests are all welcome.

## Before you start

- **Bugs:** open an issue with the steps to reproduce, what you expected and your macOS / Sidera version
  (Settings → About).
- **Features:** open an issue first for anything bigger than a small fix, so we can agree on the approach.
- **Security issues:** please don't open a public issue — see [SECURITY.md](SECURITY.md).

## Development

Requirements: macOS, Node.js 24 and npm.

```bash
npm install
npm run dev        # app with hot reload
npm test           # vitest (runs inside Electron's Node because of better-sqlite3)
npm run typecheck  # TypeScript, main + renderer
```

Both `npm test` and `npm run typecheck` must pass before a pull request is merged (CI runs them).

[`CLAUDE.md`](CLAUDE.md) is the architecture guide (layout, conventions, the "adding a feature" checklist) — it's
written for AI coding agents but reads fine for humans too. In short:

- Business logic lives in `src/main/services/` and is shared by the UI (IPC) and the MCP server.
- Database changes are new entries in `src/main/db/migrations.ts` (never edit old ones) plus `schema.ts`.
- UI strings go through `t()` with keys in both `src/renderer/src/lib/i18n/en.ts` and `de.ts`.
- Add a test for new service logic in `tests/`.

## Pull requests

- Keep them focused — one change per PR.
- Describe what changed and how you tested it; add a screenshot for UI changes.
- Never commit API keys, `.env` files or personal data.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
