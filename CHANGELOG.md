# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-04-17

### Changed (BREAKING)
- Renamed package from `html-report-server` to `@knorq/html-report-server`. Update your `.mcp.json` / install commands to the scoped name.
- Pinned `engines.node` to `>=18.0.0`.

### Added
- GitHub Actions workflow that publishes to npm with `--provenance --access public` on tag push, signed via OIDC.

## [1.4.0] and earlier

See git history.
