# Features

This page covers the shipped desktop feature set and the scope of the current Cloud Beta integration.

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

### Consent-aware biometrics

- Biometric enrollment is blocked until consent exists for the member.
- Members without active consent are excluded from matching.
- Revoking consent removes the member's biometric template.
- The registration flow can visually shield members who do not yet have consent.

### Local storage and portability

- The local database stores groups, members, attendance, settings, and audit data.
- Biometric templates are encrypted at rest in the local store.
- Backup exports create password-protected `.facenox` files.
- Backup imports can restore attendance data and biometric templates when consent is present in the imported data.

### Operational features

- Audit logging for sensitive local actions
- Desktop settings for camera, attendance, updater, and sync behavior
- Offline-first operation for the core attendance workflow

## Cloud Beta Integration

Cloud Beta connects a Facenox desktop instance to a separate Facenox Cloud deployment for reporting and device visibility.

### What the desktop app supports

- store a cloud base URL
- redeem a short-lived pairing code
- connect a desktop instance to an organization and site
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
- biometric templates
- embeddings
- cloud-side recognition state

## Not in Scope

These items are outside the current desktop repository scope:

- cloud-side biometric storage
- cloud-side face matching
- two-way sync for members and attendance edits
- payroll or HRIS integrations
- self-serve billing
- SSO or SCIM
- public developer API
- mobile app

If any of these ship later, they should be documented as separate capabilities instead of being implied here.
