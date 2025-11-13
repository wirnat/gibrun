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

## Feature Development Guidelines

See `doc/feat_project_analyzer.md`, `doc/file_handler.md`, and `doc/project_analyzer_advanced_features.md` for detailed feature development guidelines.

## Documentation References

### Core Documentation
- **`doc/dap_implementation.md`**: DAP protocol implementation and debugging tools
- **`doc/mcp_implementation.md`**: MCP server integration across platforms
- **`doc/project-structure.md`**: Current modular architecture
- **`doc/testing.md`**: Comprehensive testing guide with Vitest and Docker

### Feature Documentation
- **`doc/feat_project_analyzer.md`**: Project analyzer capabilities
- **`doc/file_handler.md`**: File handling enhancements
- **`doc/project_analyzer_advanced_features.md`**: Advanced features roadmap
- **`doc/project_analyzer_implementation_roadmap.md`**: Implementation timeline
- **`doc/project_analyzer_integration_plan.md`**: MCP integration details
- **`doc/project_analyzer_testing_strategy.md`**: Testing methodology

### Operational Documentation
- **`README.md`**: Project overview and quick start
- **`PROJECT_OVERVIEW.md`**: Architecture overview
- **`DAP_INTEGRATION.md`**: DAP debugging setup
- **`EXAMPLES.md`**: Usage examples
- **`TROUBLESHOOTING_DAP.md`**: DAP troubleshooting

### Documentation Management
- **`doc/documentation-changelog.md`**: History of documentation updates and changes

## Testing Guidelines

See `doc/testing.md` for comprehensive testing guide using Vitest framework (167+ test cases, 85%+ coverage) and Docker Compose for local testing environment.

## Documentation Update Guidelines

### When to Update Documentation
Update relevant documentation **immediately after** completing implementation or fixes:

1. **New Features**: Update `doc/feat_*.md` and `doc/*_implementation.md`
2. **Bug Fixes**: Update `doc/*_troubleshooting.md` if applicable
3. **API Changes**: Update `doc/mcp_implementation.md` and relevant feature docs
4. **Configuration Changes**: Update `README.md`, `PROJECT_OVERVIEW.md`, and config examples
5. **Testing Changes**: Update `doc/testing.md` and `doc/*_testing_strategy.md`

### Documentation Update Process
1. **Identify affected docs**: Check which `doc/*.md` files need updates
2. **Update content**: Modify documentation with accurate, current information
3. **Test examples**: Verify code examples and commands work
4. **Commit separately**: Use commit message `docs: update <feature> documentation`
5. **Reference in PR**: Include documentation updates in feature/fix PRs

### Documentation Standards
- Keep examples current and tested
- Update version numbers and compatibility info
- Maintain consistent formatting across all docs
- Include troubleshooting sections for common issues
- Reference related documentation sections

## Commit & Pull Request Guidelines
Work on a feature branch (`feature/<summary>` or `fix/<issue>`). Commit summaries follow Conventional Commits (`feat: add dap restart`, `fix: guard http timeout`). Each PR should describe the problem, outline the solution, list manual or automated test commands you ran, and reference related issues. Include updated docs or screenshots when user-visible behavior changes, call out configuration impacts (e.g., new env vars), and wait for at least one green build before requesting review.

## Security & Configuration Tips
Never commit real database URIs or API tokens; rely on `.env` files ignored by git and mirror the placeholders from `config.example.json`. When sharing sample configs, redact secrets but keep host/port formats intact so other agents can reproduce your setup quickly. If you add new tools that execute shell commands, validate and sanitize inputs before passing them to `exec` to avoid unsafe mutations on contributor machines.
