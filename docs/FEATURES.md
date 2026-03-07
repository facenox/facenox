# Features

## Current Capabilities

### Face Recognition

- **Local recognition pipeline**: face detection and recognition run on the local machine.
- **Liveness checks**: the recognition flow includes anti-spoofing checks.
- **Identity tracking**: tracked detections are stabilized across frames during live use.

### Attendance Management

- **Group-based organization**: members are assigned to groups.
- **Attendance logging**: recognized members can be recorded as attendance events and sessions.
- **Configurable attendance settings**: thresholds and timing behavior can be adjusted in settings.
- **Historical records**: attendance history can be reviewed and exported.

### Member and Consent Handling

- **Member management**: create, update, and remove member records.
- **Biometric consent tracking**: member consent is stored with audit-related metadata.
- **Consent-aware registration**: biometric registration is blocked until consent exists.
- **Consent-aware recognition scope**: non-consenting members are excluded from biometric matching.
- **Privacy Shield in registration**: the registration workflow can show a shield overlay for members without consent.

### Data Storage and Portability

- **Local storage**: attendance data, settings, and biometric templates are stored locally.
- **Encrypted biometric templates**: stored templates are encrypted at rest.
- **Vault export and import**: password-protected `.suri` vaults can be used for backup and restore.
- **CSV export**: attendance data can be exported for external reporting.

### Administrative Support

- **Audit logging**: sensitive actions such as consent changes and vault operations are logged.
- **Cleanup support**: retention-related cleanup endpoints exist for attendance data.
- **Settings UI**: application behavior can be adjusted through the desktop interface.

## Not Part of the Current Feature Set

- **Hosted web dashboard**: not implemented in the current repository.
- **Cloud biometric sync**: not implemented in the current repository.
- **Cloud reporting platform**: not implemented in the current repository.
