[![Tests](https://img.shields.io/endpoint?url=https%3A%2F%2Fflakiness.io%2Fapi%2Fbadge%3Finput%3D%257B%2522badgeToken%2522%253A%2522badge-5GdyOe2e6TECpfSm9KgGAj%2522%257D)](https://flakiness.io/flakiness/junit-xml)

# @flakiness/junit-xml

Convert JUnit XML test reports into a Flakiness report and upload it to [flakiness.io](https://flakiness.io).

The recommended way to run it is with `npx` (no install step):

```bash
npx @flakiness/junit-xml --flakiness-project myorg/myproject ./build/reports/junit 
```

This combines every XML file under the given path into a single Flakiness report and auto-uploads it to flakiness.io. See [authentication](#authentication) on how to configure auto-upload.

If your environment has no Node.js, a [standalone binary](#standalone-binary-no-nodejs) is also available.

## Contents

- [Usage](#usage)
- [Example: ingesting `bun test` results](#example-ingesting-bun-test-results)
- [Example: ingesting Rust `cargo-nextest` results](#example-ingesting-rust-cargo-nextest-results)
- [Standalone binary (no Node.js)](#standalone-binary-no-nodejs)
- [Authentication](#authentication)
- [License](#license)

## Usage

```
flakiness-junit-xml [options] <junit-path>

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
npx @flakiness/junit-xml --category bun --flakiness-project myorg/myproject ./junit.xml
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
npx @flakiness/junit-xml --category rust --flakiness-project myorg/myproject ./target/nextest/ci/junit.xml
```

## Standalone binary (no Node.js)

This tool is also shipped as a single self-contained executable that bundles
its own runtime, so it works on machines without Node.js.

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
flakiness-junit-xml --flakiness-project myorg/myproject ./build/reports/junit 
```

> [!NOTE]
> You can set `INSTALL_DIR` to configure custom location for installation.
> ```bash
> curl -fsSL https://github.com/flakiness/junit-xml/releases/latest/download/install.sh | INSTALL_DIR="$HOME/.local/bin" sh
> ```

## Authentication

The report is uploaded to flakiness.io automatically. Authentication, in priority order:

1. **Access token** — `--token` or `FLAKINESS_ACCESS_TOKEN`.
2. **GitHub Actions OIDC** — no token needed when `--flakiness-project` (or `FLAKINESS_PROJECT`) is set, the project is bound to the repository, and the workflow grants `id-token: write`.

To convert without uploading, pass `--disable-upload` or set `FLAKINESS_DISABLE_UPLOAD=1`. The report is still written to `--output-dir`.

## License

MIT
