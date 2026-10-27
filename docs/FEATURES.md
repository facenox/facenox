# Features

This page covers the shipped desktop feature set and the scope of the current Facenox Cloud integration.

## Desktop Features

### Local recognition pipeline

- Face detection runs on the local machine.
- Face recognition runs on the local machine.
- Anti-spoofing checks run in the local pipeline.
- The renderer sends image data as binary payloads to avoid unnecessary encoding overhead.

### Attendance workflows

- Create and manage groups.
- Create, edit, and remove members.
- Record attendance events and attendance sessions.
- Configure attendance timing behavior in settings.
- Review historical attendance data and export reports.

### Privacy-first biometric architecture

- Biometric enrollment via live camera capture or batch photo import.
- Raw camera frames are processed in-memory and never written to disk or transmitted to external servers.
- Embeddings are encrypted at rest locally and purged when a member is deleted.
- Settings explain local processing, Cloud template access, and organizational data-handling responsibilities.

### Local storage and portability

- The local database stores groups, members, attendance, settings, and audit data.
- Enrolled face data is encrypted at rest in the local store using AES-256.
- Backup exports create password-protected `.facenox` files that you can move to another computer.

### Operational features

- Audit logging for sensitive local actions
- Desktop settings for camera, attendance, updater, and sync behavior
- Offline-first operation for the core attendance workflow

## Facenox Cloud Integration

Facenox Cloud connects offline Facenox desktop kiosks to a unified cloud control plane for browser-based review of synced records, automated DTR reporting, and multi-location management.

### What the desktop app supports

- Store a custom Facenox Cloud server address (advanced)
- Redeem a short-lived 8-character pairing code from Facenox Cloud
- Connect a desktop instance to an organization and location
- Show pairing state, last sync state, and sync messages
- Run background auto-sync
- Run manual sync on demand
- Receive organization attendance policies and supported remote administration commands

### What gets synced

- Group metadata
- Member directory data needed for reports
- Attendance records
- Attendance sessions
- Device name and ID, app version, and sync activity

Cloud directory changes, including group/member updates and removals, are applied on connected computers through sync. Disconnected computers receive updates when they reconnect.

### What does not get synced

- Raw face photos
- Face matching decisions
- Remote-side recognition state
- Camera video, CPU or memory diagnostics, and exported health reports

### What gets synced (encrypted)

- **Enrolled face data (paid Cloud plans)**: AES-256-GCM encrypted before upload and stored encrypted for sync between paired computers at a location. Computers decrypt templates for local recognition. Cloud manages location keys and also decrypts/re-encrypts templates during transfers between locations.

### Remote administration

After pairing, authorized Cloud commands can wipe local Facenox data, reset the local admin PIN, or request an update check. Command results are returned to Cloud. Hosted deployments are responsible for administrator authorization, step-up protection for destructive actions, auditability, and retention.

## Not in Scope

These items are outside the current desktop repository scope:

- Remote-side face matching
- Two-way sync for attendance edits
- Direct payroll or HRIS integrations (DTR exports can feed payroll processing)
- Self-serve billing
- SSO or SCIM
- Public developer API
- Mobile app

If any of these ship later, they should be documented as separate capabilities instead of being implied here.
