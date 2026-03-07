# Privacy & Security

Suri is a local-first desktop attendance system. The current app processes face recognition on the local machine and stores its working data locally by default.

## 1. What Suri Stores

- **Local data by default**: Member records, attendance history, settings, audit entries, and biometric templates are stored on the local device.
- **No raw photos saved as records**: Registration and recognition images are processed in memory. Suri stores an encrypted biometric template, not a photo library.
- **No telemetry in the current desktop app**: The current codebase does not include analytics, ads, or background usage tracking.

## 2. Consent and Biometric Use

- **Consent is required before registration**: A member must have biometric consent on record before face registration is accepted by the backend.
- **Non-consenting members are blocked from biometric enrollment**: The UI blocks capture for members without consent, and the backend rejects direct registration attempts without consent.
- **Privacy Shield overlay**: During registration, Suri can cover the live camera view for a selected member who does not yet have consent. The current implementation uses a shield-style overlay, not a blur effect.
- **Consent is recorded**: Consent status, consent timestamp, and consent metadata are stored with the member record.

## 3. Storage and Deletion

- **Encrypted biometric templates**: Stored face templates are encrypted at rest using a machine-bound local encryption key.
- **Delete means delete**: Removing a member deletes the stored biometric template. Revoking biometric consent also removes the member's stored biometric template.
- **Recognition scope respects consent**: Only consented members are eligible for biometric recognition.

## 4. Backups and Transfers

- **Password-protected vault exports**: Vault exports are encrypted with a password before being written to a `.suri` backup file.
- **Backups can include biometric templates**: Vault exports may include biometric templates so a restore can avoid re-registration.
- **Consent still applies on restore**: Vault import restores biometric templates only for members whose consent is present in the imported data.

## 5. Compliance Position

Suri is designed to support privacy-conscious deployments, including requirements commonly associated with the **Philippine Data Privacy Act of 2012** and **GDPR**, but compliance still depends on how the software is operated.

Suri helps support:

- **Transparency**: The app makes biometric processing visible in the UI and records consent state.
- **Choice**: People can be kept out of biometric enrollment until consent is granted.
- **Erasure**: Biometric templates can be removed by deleting a member or revoking consent.
- **Security**: Biometric templates are encrypted at rest on the local device.

Suri does **not** by itself guarantee full legal compliance for every deployment. Operators are still responsible for notices, lawful basis, retention policies, access control, and organizational procedures.

## 6. Cloud Features

The current desktop codebase does **not** implement a production cloud biometric sync service. Any future hosted sync, dashboard, or SaaS features would need separate documentation, privacy terms, and security review.

---

**Need more info?** Suri is open source. The implementation can be reviewed directly in the repository.
