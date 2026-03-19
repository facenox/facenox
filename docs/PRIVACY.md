# Privacy and Data Handling

This document covers the open source desktop application in this repository and the current Cloud Beta data boundary.

## Scope

This document applies to:

- the Electron desktop app in `app/`
- the local FastAPI backend in `server/`
- the current desktop-side Cloud Beta integration

It does not replace the privacy and operational documentation required for a hosted Suri Cloud deployment.

## What Suri Stores Locally

By default, the desktop app stores the following data on the local machine:

- groups and members
- attendance records and attendance sessions
- consent status and related metadata
- application settings
- audit entries
- encrypted biometric templates

The desktop app is the primary environment for biometric processing in this repository.

## Biometric Data

### What Suri keeps

Suri keeps biometric templates used for recognition. These templates are mathematical representations used by the local recognition pipeline.

### How biometric data is handled

Suri is not designed as a raw face-image archive. Registration and recognition images are processed for enrollment and matching, while the long-term working record is the encrypted biometric template.

## Consent Rules

- Biometric enrollment requires consent.
- Members without active consent are excluded from biometric matching.
- Revoking consent removes the member's biometric template.
- Deleting a member removes the associated biometric template.

These controls help enforce a narrow recognition scope inside the application. They do not replace your own notices, legal basis, or retention policy.

## Backups and Restore

- Vault exports are password-protected `.suri` files.
- Vault exports can include biometric templates so a restore does not require full re-enrollment.
- Restores still depend on the consent information present in the imported data.

If you export a vault, treat the backup file as sensitive data.

## Telemetry

The open source desktop app does not include analytics, ads, or hidden background telemetry by default.

That does not automatically make every surrounding deployment private. If you add hosting, external logs, monitoring, or third-party infrastructure, those systems need their own review.

## Cloud Beta Boundary

The desktop app can optionally pair with a separate Suri Cloud deployment.

### Data not sent to Suri Cloud

- raw face images
- biometric templates
- embeddings
- face matching and recognition decisions

### Data that may be sent to Suri Cloud

- organization, site, and device identifiers
- groups and member directory data needed for reports
- attendance records and sessions
- sync status and device health metadata

The desktop app currently uses one-way snapshot sync. The cloud side is not the source of truth for biometrics.

## Offline Operation

The core desktop workflow remains offline-capable:

- enrollment works locally
- recognition works locally
- attendance capture works locally
- local settings and vault operations work locally

If the internet is unavailable, Cloud Beta stops updating until connectivity returns, but local attendance continues.

## Security Notes

- Biometric templates are encrypted in local storage.
- Vault backups are password-protected before they are written to disk.
- Physical device security still matters. If the machine is compromised, software controls alone are not enough.
- Full-disk encryption at the OS level is strongly recommended for real deployments.

## Compliance Position

Suri includes controls that can support privacy-conscious deployments, but the software alone does not make a deployment compliant with GDPR, the Philippine Data Privacy Act, or any other privacy law.

Operators are still responsible for:

- notices and consent flows
- lawful basis and documentation
- retention and deletion policy
- access control
- vendor and processor management
- incident response and breach handling

If you deploy Suri Cloud, document that environment separately. This file should not be treated as the complete privacy position for a hosted service.
