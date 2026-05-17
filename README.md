# @flakiness/junit-xml

Convert JUnit XML test reports into a Flakiness report and upload it to [flakiness.io](https://flakiness.io). Parses Surefire and TestNG output, nested `<testsuites>`, retries, `<system-out>` / `<system-err>`, and file attachments.

Run it with `npx`:

```bash
npx @flakiness/junit-xml ./build/reports/junit --flakiness-project myorg/myproject
```

This combines every XML file under the given path into a single Flakiness report and uploads it to flakiness.io.

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

## Bun

`bun test` emits JUnit XML with `--reporter=junit`:

```bash
bun test --reporter=junit --reporter-outfile=./junit.xml
npx @flakiness/junit-xml ./junit.xml --category bun --flakiness-project myorg/myproject
```

## Rust

`cargo test` doesn't emit JUnit XML; [`cargo-nextest`](https://nexte.st/) does. Add a CI profile in `.config/nextest.toml`:

```toml
[profile.ci.junit]
path = "junit.xml"
```

Run the tests, then point at the XML nextest writes under `target/nextest/`:

```bash
cargo nextest run --profile ci
npx @flakiness/junit-xml ./target/nextest/ci/junit.xml --category rust --flakiness-project myorg/myproject
```

## Uploading

The report is uploaded to flakiness.io automatically. Authentication, in priority order:

1. **Access token** — `--token` or `FLAKINESS_ACCESS_TOKEN`.
2. **GitHub Actions OIDC** — no token needed when `--flakiness-project` (or `FLAKINESS_PROJECT`) is set, the project is bound to the repository, and the workflow grants `id-token: write`.

To convert without uploading, pass `--disable-upload` or set `FLAKINESS_DISABLE_UPLOAD=1`. The report is still written to `--output-dir`.

## License

MIT
