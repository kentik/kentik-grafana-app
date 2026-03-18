# Changelog

## 2.0.0 (2026-03-15)

**Features:**

- Batch topXdata queries to reduce API calls and improve dashboard load time
- New OSI Health dashboard with per-layer network panels and alias patterns
- "Open in Kentik" panel links for direct portal navigation
- Support for custom/on-prem portal URL derivation from region config

**Improvements:**

- Client-side Kentik portal URL eliminates separate /query/url API calls
- Dynamic query depth scales with topx setting for faster server processing
- Null safety in batch response handling

**Breaking changes:**

- Minimum Grafana version: 10.4.0

## 1.7.0

Previous release.
