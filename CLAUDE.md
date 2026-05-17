# fk-junit-xml

JUnit XML → Flakiness Report converter, shipped both as a library and a CLI.
Thin transformer — schema lives in `@flakiness/flakiness-report` (`FK.*` types),
report normalization + attachment helpers in `@flakiness/sdk` (`ReportUtils`).

## Source layout

- `src/parser.ts` — the converter. `parseJUnit(xmls, options)`. All conversion logic stays here.
- `src/cli.ts` — `createCommand()`: builds a commander `Command`.
- `src/index.ts` — the single public entry. Re-exports **both** `parseJUnit` and `createCommand` (`@flakiness/junit-xml`). There is no `./cli` subpath — consumers import everything from the package root.
- `src/bin.ts` — `#!/usr/bin/env node` entrypoint. Renames the command to `flakiness-junit-xml` and parses argv. (`bin` field)

The single command is authored once in `src/cli.ts`. `createCommand(name)` takes the
command name as a required argument — the bin passes `'flakiness-junit-xml'`, a host
CLI passes `'convert-junit'` and `addCommand`s the result. Never fork the command definition.

## Toolchain

- **pnpm** (not npm/yarn). Use `pnpm install`, `pnpm build`, `pnpm test`.
- Node 20.17+ / 22.9+. Targets `node22` ESM.
- Build: Kubik + esbuild (`build.mts`) → ESM, `bundle: false`, then `tsc` for `.d.ts`.

## Invariants — do not break

1. **Conversion logic lives only in `src/parser.ts`.** `cli.ts`/`bin.ts`/`index.ts` are thin wiring. Push schema/normalization changes upstream to `@flakiness/flakiness-report` and `@flakiness/sdk` instead of growing the parser.
2. **One command definition.** The CLI is authored once in `src/cli.ts` via `createCommand()`. The Flakiness monorepo CLI imports the same factory and `addCommand`s it — do not duplicate the option/argument spec there.

## Tests

`tests/basic.spec.ts` loads XML fixtures from `tests/assets/` and calls `parseJUnit`
directly. `tests/cli.spec.ts` spawns the built `lib/bin.js` to cover the CLI path
end-to-end. Tests run under `@playwright/test` for parity with the rest of the
reporter family. The CLI test requires `pnpm build` first (it runs the compiled bin).

## Releasing

Tag-driven: `pnpm version <bump>` → `git push --follow-tags` → create GitHub Release → CI publishes to npm. Prereleases (`-alpha` etc.) auto-publish to `@next`. Don't `npm publish` manually.
