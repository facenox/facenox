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
 
- Instant, frictionless biometric enrollment via live camera capture or batch photo import.
- Raw camera frames are processed in-memory and never written to disk or transmitted to external servers.
- Embeddings are encrypted at rest locally and purged when a member is deleted.
- Integrated privacy notices and terms in Settings support Data Controller compliance requirements.
 
### Local storage and portability
 
- The local database stores groups, members, attendance, settings, and audit data.
- Biometric templates are encrypted at rest in the local store using AES-256.
- Backup exports create password-protected `.facenox` files for full portability.

### Operational features

- Audit logging for sensitive local actions
- Desktop settings for camera, attendance, updater, and sync behavior
- Offline-first operation for the core attendance workflow

## Facenox Cloud Integration

Facenox Cloud connects offline Facenox desktop kiosks to a unified cloud control plane for backup, automated DTR reporting, and multi-location management.

### What the desktop app supports

- store a custom cloud URL
- redeem a short-lived pairing code
- connect a desktop instance to an organization and branch/site
- show pairing state, last sync state, and sync messages
- run background auto-sync
- run manual sync on demand

### What gets synced

- group metadata
- member directory data needed for reports
- attendance records
- attendance sessions
- device and sync metadata

### What does not get synced

- raw face photos
- face matching decisions
- remote-side recognition state

### What gets synced (encrypted)

- **biometric templates**: AES-256-GCM encrypted before transmission and stored in encrypted form in the database for sync. Decryption happens on your paired devices.

## Not in Scope

These items are outside the current desktop repository scope:

- remote-side face matching
- two-way sync for members and attendance edits
- payroll or HRIS integrations
- self-serve billing
- SSO or SCIM
- public developer API
- mobile app

If any of these ship later, they should be documented as separate capabilities instead of being implied here.
