# Repository Guidelines

## Project Structure & Module Organization
Core MCP logic lives in `src/index.ts`, which registers every tool (Postgres queries, HTTP executor, Go build helpers, file IO, and DAP hooks). TypeScript output is written to `build/` via `tsc`, and `package.json` points MCP clients to `build/index.js`. Repository-level docs (`README.md`, `PROJECT_OVERVIEW.md`, `DAP_INTEGRATION.md`, `EXAMPLES.md`, `TROUBLESHOOTING_DAP.md`) explain usage scenarios; reference `config.example.json` when wiring Claude, Cursor, or other hosts. The `test-example/` folder provides an end-to-end playground: `sample-api.go`, `schema.sql`, `go.mod`, and a `Dockerfile` for spinning up the demo API alongside PostgreSQL, matching the `docker-compose.yml` stack.

## Build, Test, and Development Commands
- `npm install` — install the TypeScript SDK, pg client, and other runtime deps.
- `npm run dev` — run `tsc --watch`, continuously emitting `build/index.js` while you iterate on tools.
- `npm run build` — perform a one-shot strict compile/type-check; this must pass before publishing or cutting a release.
- `npx @modelcontextprotocol/inspector node build/index.js` — attach the MCP Inspector to validate tool definitions and responses after building.
- `cd test-example && go run sample-api.go` (or `docker compose up`) — launch the sample API plus database so you can practice the postgres→HTTP→verification workflow end to end.

## Coding Style & Naming Conventions
Write modern TypeScript targeting ES2022 with Node16 resolution, as enforced by `tsconfig.json`. Use 4-space indentation, explicit async return types, and keep tool handlers small, composable functions (e.g., `handlePostgresQuery`). Tool identifiers stay `snake_case` to match MCP expectations, while variables and functions remain `camelCase`. Prefer structured errors that return `{ content, isError }` payloads instead of throwing. Run `npm run build` before pushing to ensure the compiler’s strict mode stays green; no separate formatter runs today, so follow the existing style and keep descriptive JSDoc-style comments to explain non-obvious logic.

## Testing Guidelines
There is no dedicated `npm test` script yet; rely on the MCP Inspector plus scenario walkthroughs to validate changes. Reproduce realistic flows: seed the Postgres instance via `test-example/schema.sql`, run the Go sample service, then call `postgres_query`, `http_request`, and `build_go_project` to verify responses. When adding new tools, document sample inputs in `EXAMPLES.md` or `TEST_SCENARIOS.md` and include manual test notes in your PR. If you introduce Go helpers under `test-example/`, add `go test ./...` coverage alongside any new packages.

## Commit & Pull Request Guidelines
Work on a feature branch (`feature/<summary>` or `fix/<issue>`). Commit summaries follow Conventional Commits (`feat: add dap restart`, `fix: guard http timeout`). Each PR should describe the problem, outline the solution, list manual or automated test commands you ran, and reference related issues. Include updated docs or screenshots when user-visible behavior changes, call out configuration impacts (e.g., new env vars), and wait for at least one green build before requesting review.

## Security & Configuration Tips
Never commit real database URIs or API tokens; rely on `.env` files ignored by git and mirror the placeholders from `config.example.json`. When sharing sample configs, redact secrets but keep host/port formats intact so other agents can reproduce your setup quickly. If you add new tools that execute shell commands, validate and sanitize inputs before passing them to `exec` to avoid unsafe mutations on contributor machines.
