# fk-junit-xml

`@flakiness/junit-xml` is a **CLI tool** that converts JUnit XML into a Flakiness
report and uploads it to flakiness.io. It is not a library — there are no public
exports. Thin transformer: schema lives in `@flakiness/flakiness-report` (`FK.*`
types), report normalization / attachment / upload helpers in `@flakiness/sdk`
(`ReportUtils`, `writeReport`, `uploadReport`).

## Source layout

Exactly two files:

- `src/parser.ts` — the converter. `parseJUnit(xmls, options)`. All conversion logic stays here. Imported by `cli.ts` via a relative path, never via the package name.
- `src/cli.ts` — the `bin`. Starts with `#!/usr/bin/env node`, builds the commander program inline at module scope (no factory function), and calls `program.parseAsync(process.argv)`. Runs convert → write → auto-upload.

There is no `exports` map, no `main`, no `index.ts`, no `bin.ts`, no command factory. `import '@flakiness/junit-xml'` is intentionally not resolvable — the package is something you *run*, not import. `package.json#bin` points at `./lib/cli.js`.

## Toolchain

- **pnpm** (not npm/yarn). Use `pnpm install`, `pnpm build`, `pnpm test`.
- Node 20.17+ / 22.9+. Targets `node22` ESM.
- Build: Kubik + esbuild (`build.mts`) → ESM, `bundle: false`, then `tsc` for `.d.ts`. Because `bundle: false`, every runtime module is its own esbuild entry point: `parser.ts`, `cli.ts`, `bin.ts`.

## Invariants — do not break

1. **Conversion logic lives only in `src/parser.ts`.** `cli.ts`/`bin.ts` are thin wiring. Push schema/normalization changes upstream to `@flakiness/flakiness-report` and `@flakiness/sdk` instead of growing the parser.
2. **No public API.** Don't add an `exports` map or otherwise re-export `parseJUnit`. If a programmatic consumer ever genuinely needs the parser, that's a deliberate decision to revisit — not a default.
3. **Auto-upload is the contract.** Like every reporter in the family, the CLI uploads after converting, gated by `--disable-upload` / `FLAKINESS_DISABLE_UPLOAD`, authed via `--token` / `FLAKINESS_ACCESS_TOKEN` or GitHub OIDC (when `flakinessProject` is set). Don't make convert-without-upload the default.
4. **Unknown `testRunner`.** XML doesn't reliably identify the runner that produced it. The converter does not populate `Report.testRunner`; callers disambiguate via `--category` (`bun`, `rust`, default `junit`).

## Tests

`tests/basic.spec.ts` imports `parseJUnit` from `../src/parser.js` (relative — there's no package export) and asserts on the returned report. `tests/cli.spec.ts` spawns the built `lib/cli.js` with `--disable-upload` (so the smoke test never hits the network) and reads the report back. Tests run under `@playwright/test` for parity with the rest of the reporter family; the CLI test requires `pnpm build` first.

## Releasing

Tag-driven: `pnpm version <bump>` → `git push --follow-tags` → create GitHub Release → CI publishes to npm. Prereleases (`-alpha` etc.) auto-publish to `@next`. Don't `npm publish` manually.
