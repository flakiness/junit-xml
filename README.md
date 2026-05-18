# @flakiness/junit-xml

Convert JUnit XML test reports into a Flakiness report and upload it to [flakiness.io](https://flakiness.io). Parses Surefire and TestNG output, nested `<testsuites>`, retries, `<system-out>` / `<system-err>`, and file attachments.

The recommended way to run it is with `npx` (no install step):

```bash
npx @flakiness/junit-xml ./build/reports/junit --flakiness-project myorg/myproject
```

This combines every XML file under the given path into a single Flakiness report and uploads it to flakiness.io.

If your environment has no Node.js, a [standalone binary](#standalone-binary-no-nodejs) is also available.

## Contents

- [Usage](#usage)
- [Example: ingesting `bun test` results](#example-ingesting-bun-test-results)
- [Example: ingesting Rust `cargo-nextest` results](#example-ingesting-rust-cargo-nextest-results)
- [Standalone binary (no Node.js)](#standalone-binary-no-nodejs)
- [Uploading](#uploading)
- [License](#license)

## Usage

```
flakiness-junit-xml <junit-path> [options]

  <junit-path>                   JUnit XML file, or a directory of XML files (scanned recursively)
  --env-name <name>              Environment name (defaults to --category, or `junit`)
  --commit-id <id>               Git commit ID (auto-detected from cwd if omitted)
  --title <title>                Report title (env: FLAKINESS_TITLE)
  --output-dir <dir>             Output directory (default: flakiness-report)
  -c, --category <category>      Category, e.g. `bun`, `rust` (default: `junit`)
  --flakiness-project <project>  Flakiness project, `org/project` (env: FLAKINESS_PROJECT)
  --token <token>                Flakiness.io access token (env: FLAKINESS_ACCESS_TOKEN)
  --endpoint <url>               Flakiness.io API endpoint override
  --disable-upload               Convert only; don't upload (env: FLAKINESS_DISABLE_UPLOAD)
```

Requires Node.js `^20.17.0 || >=22.9.0`.

`flakiness-junit-xml` ingests JUnit XML from **any** test runner. Some runners don't emit it by default — the examples below show how to get XML out of the common ones.

## Example: ingesting `bun test` results

`bun test` emits JUnit XML with `--reporter=junit`:

```bash
bun test --reporter=junit --reporter-outfile=./junit.xml
npx @flakiness/junit-xml ./junit.xml --category bun --flakiness-project myorg/myproject
```

## Example: ingesting Rust `cargo-nextest` results

`cargo test` doesn't emit JUnit XML; [`cargo-nextest`](https://nexte.st/) does. Add a CI profile in `.config/nextest.toml`:

```toml
[profile.ci.junit]
path = "junit.xml"
```

Then run the tests and point at the XML nextest writes under `target/nextest/`:

```bash
cargo nextest run --profile ci
npx @flakiness/junit-xml ./target/nextest/ci/junit.xml --category rust --flakiness-project myorg/myproject
```

## Standalone binary (no Node.js)

A secondary distribution: a single self-contained executable that bundles its own runtime, so it works on machines without Node.js. The CLI, flags, and behavior are identical to the `npx` version — only the way you launch it differs.

**macOS / Linux:**

```bash
curl -fsSL https://github.com/flakiness/junit-xml/releases/latest/download/install.sh | sh
```

**Windows (PowerShell):**

```powershell
irm https://github.com/flakiness/junit-xml/releases/latest/download/install.ps1 | iex
```

This installs a `flakiness-junit-xml` command on your `PATH`. Then use it exactly as above:

```bash
flakiness-junit-xml ./build/reports/junit --flakiness-project myorg/myproject
```

The installer detects your OS/architecture (x64 and arm64; Linux glibc and Alpine/musl) and always pulls the latest release. To pin a directory, set `INSTALL_DIR` (default `/usr/local/bin`):

```bash
curl -fsSL https://github.com/flakiness/junit-xml/releases/latest/download/install.sh | INSTALL_DIR="$HOME/.local/bin" sh
```

Prefer `npx` when Node.js is available — it's the primary, always-current path. Reach for the standalone binary only when Node.js isn't an option.

## Uploading

The report is uploaded to flakiness.io automatically. Authentication, in priority order:

1. **Access token** — `--token` or `FLAKINESS_ACCESS_TOKEN`.
2. **GitHub Actions OIDC** — no token needed when `--flakiness-project` (or `FLAKINESS_PROJECT`) is set, the project is bound to the repository, and the workflow grants `id-token: write`.

To convert without uploading, pass `--disable-upload` or set `FLAKINESS_DISABLE_UPLOAD=1`. The report is still written to `--output-dir`.

## License

MIT
