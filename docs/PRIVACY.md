# Privacy & Data Sovereignty

Suri is a local-first system where privacy is enforced at the architectural level. It follows the [Data Privacy Act of 2012](https://privacy.gov.ph/data-privacy-act/), [GDPR](https://gdpr.eu/what-is-gdpr/), and [CCPA](https://oag.ca.gov/privacy/ccpa).

## 1. Zero-Image Storage
**Face images are never stored.**

When a face is detected, the AI converts it into a "vector" (a string of numbers) and discards the original image immediately. The database only ever sees those numbers.

Even if someone stole the hardware, they couldn't reconstruct a face from those numbers.


## 2. Secure Encrypted Backups (.suri Vaults)
Suri allows users to export their entire system state, including biometric data, into a portable archive. To ensure compliance and security:

* **End-to-End Encryption (E2EE)**: Backups are saved as `.suri` files. These are not plain text or standard JSON. The entire payload is encrypted client-side using **AES-256-GCM**.
* **Encryption Algorithm**: Backups are encrypted using **AES-256-GCM**.
* **Key Derivation**: The encryption key is derived locally from a user-provided password using PBKDF2-HMAC-SHA256 with 480,000 iterations.
* **Local Processing**: The encryption happens entirely on the local device. The application does not and cannot read the `.suri` file without the user's password.
* **Security Responsibility**: Because the backup is encrypted locally, the security of the biometric data relies entirely on the strength of the user's chosen password.


## 3. Data Sovereignty & Offline-First
*   **Offline First**: Suri works 100% offline using a local [SQLite](https://www.sqlite.org/index.html) database.
*   **Data Transparency**: In development, persistent data is stored in the project's root `/data` folder. In production, it follows OS standards (e.g., `%APPDATA%` on Windows).
*   **No Telemetry**: App usage metrics and button interactions are not tracked or transmitted.
*   **No Password Recovery**: Encryption keys are derived entirely from the vault password. If a user loses their `.suri` vault password, the biometric backup is permanently unrecoverable by design.

## 4. Compliance & Open Source
*   **GDPR / CCPA**: The user is the data controller. The service acts as the processor (only if Sync is on). Data deletion is available via a single click.
*   **Open Source**: Suri is licensed under [AGPL-3.0](../LICENSE.txt). The code is available for audit to verify transmitted data. There are no hidden "phone home" signals.

## Recommended Security
For maximum safety, encrypting the physical disk is recommended:
1.  **Windows**: Enable [BitLocker](https://learn.microsoft.com/en-us/windows/security/operating-system-security/data-protection/bitlocker/bitlocker-overview).
2.  **macOS**: Enable [FileVault](https://support.apple.com/en-us/HT204837).
