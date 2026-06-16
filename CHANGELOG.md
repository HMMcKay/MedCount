# Changelog

All notable changes to this project are documented here.

## [2.0.1] - 2026-06-16

### Security
- Fixed a stored XSS vulnerability in the dose-history print view — medication names and dose notes were written into the print window without escaping, exploitable via a crafted or imported data file.
- Escaped reminder time values in the reminder editor to close a secondary injection path reachable through the same import flow.
- Audited the full codebase and git history for hardcoded secrets, API keys, and credentials — none found.

## [2.0.0] - 2026-06-10

### Added
- Today view: a daily schedule grouping doses by time of day, with one-tap logging.
- Stats page: adherence ring chart, current streak tracking, 7-day dose history bar chart, per-medication adherence breakdown, and quantity-over-time chart with refill markers.
- Search, plus sorting by days-of-supply remaining.
- Refill dialog replacing the old prompt-based refill flow.
- Bottom navigation between Home, Today, and Stats.

### Changed
- Replaced the dose history dialog with a full-page, expandable history view (2026-06-01).

## [1.0.0] - 2026-05-27

### Added
- Initial release: local-first medication tracker PWA.
- Medication tracking with quantity, dosage, refill, and expiration fields.
- Dose history logging with JSON export and print support.
- Optional PIN-based AES-256-GCM encryption.
- Smart dose, refill, and "forgot to log" reminders via the Service Worker.
- Installable, offline-capable PWA with Material Design 3 styling.
