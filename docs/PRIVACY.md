# Privacy and Data Handling

This document covers the open source desktop application in this repository and the data boundary for the **official Facenox Cloud**.

## Scope

This document applies to:

- the Electron desktop app in `app/`
- the local FastAPI backend in `server/`
- the current desktop-side Facenox Cloud integration

It does not replace the privacy and operational documentation required for a hosted Facenox Cloud deployment.

## What Facenox Stores Locally

By default, the desktop app stores the following data on the local machine:

- groups and members
- attendance records and attendance sessions
- application settings
- audit entries
- encrypted biometric templates

The desktop app is the primary environment for biometric processing in this repository.

## Biometric Data

### What Facenox keeps

Facenox extracts 512-dimension float32 vectors from face scans. The local database stores only these encrypted vectors.

### How biometric data is handled

Facenox is not designed as a raw face-image archive. 
- **Enrollment & Matching:** Raw camera frames are processed locally and are never persisted to disk or uploaded to the cloud. The pipeline extracts mathematical embeddings directly from camera frames.
- **Liveness Detection:** Anti-spoofing analysis executes locally on-device. No photos or video frames used for liveness checks are ever written to disk.
- **Storage:** Templates are encrypted at rest locally using **AES-256**.

## Legal Responsibility and Compliance

- **Deployment responsibilities:** Legal roles depend on who determines the purposes and means of processing. Organizations should establish appropriate processing grounds, notices, access controls, and retention practices. Confirm responsibilities for the actual deployment with qualified advisers; software alone does not establish compliance.
- **Biometric Template Lifecycle:** Enrolling a member stores their encrypted mathematical vector. Member removal clears the template in the system processing the removal. When Cloud is connected, removals propagate through sync; disconnected computers must reconnect to receive them. Cloud preserves attendance history separately from the removed template. Previously exported backup files are independent copies and must be handled separately.
- **Data-handling information:** **Settings ➔ About ➔ Privacy & Data Handling** explains the local and Cloud data boundaries. These explanations do not replace deployment-specific policies or establish compliance.

## Backups and Restore

- Backup exports are password-protected `.facenox` files.
- Backup exports can include biometric templates so a restore does not require full re-enrollment.
- Restores re-import the member metadata and biometric templates preserved in the backup package.

If you export a backup, treat the backup file as sensitive data.

## Telemetry

The open source desktop app does not include analytics, ads, or hidden background telemetry by default.

That does not automatically make every surrounding deployment private. If you add hosting, external logs, monitoring, or third-party infrastructure, those systems need their own review.

## Facenox Cloud data boundary

The desktop app can optionally pair with **Facenox Cloud** for browser access to synced records and reports. Essentials includes CSV export for one connected device. Paid plans add PDF and Excel DTR exports, additional devices, and encrypted face-template sync.

Synchronization is not an independent recovery backup: updates and removals can propagate between connected systems. Keep password-protected `.facenox` archives separately when you need a recoverable copy.

### Data NOT sent to Facenox Cloud

- raw face images (never leave the device)
- video or camera recordings
- face matching and recognition decisions

### Data that MAY be sent (encrypted) to Facenox Cloud

- **encrypted biometric templates**: AES-256-GCM encrypted before transmission and stored in encrypted form in the database for multi-device sync.

### Data that MAY be sent to Facenox Cloud

- organization, site, and device identifiers
- groups and member directory data needed for reports
- attendance records and sessions
- sync status and device health metadata

The desktop app uses event-driven and snapshot sync. On plans with face-template sync, encrypted templates can sync between paired computers at the same location.

Cloud manages the location encryption keys. During a transfer between locations, the server decrypts templates in memory and re-encrypts them with the destination key. Encrypted storage does not mean the Cloud service is technically unable to decrypt templates. Face recognition itself runs on the paired computers.

## Offline Operation

The core desktop workflow remains offline-capable:

- enrollment works locally
- recognition works locally
- attendance capture works locally
- local settings and backup operations work locally

If the internet is unavailable, Facenox Cloud synchronization stops updating until connectivity returns, but local attendance continues uninterrupted.

## Security Notes

- Biometric templates are encrypted in local storage using **AES-256**.
- Backups are password-protected before they are written to disk.
- Physical device security still matters. If the machine is compromised, software controls alone are not enough.
- Full-disk encryption at the OS level is strongly recommended for real deployments.

## Compliance Position

Facenox includes controls that can support privacy-conscious deployments, but the software alone does not make a deployment compliant with GDPR, the Philippine Data Privacy Act, or any other privacy law.

Operators are still responsible for:

- institutional privacy notices and policies
- lawful basis and documentation
- retention and deletion policy
- access control
- vendor and processor management
- incident response and breach handling

## Website Analytics

The website includes Vercel Analytics and Speed Insights. When configured, PostHog captures page views and page departures. These hosted services are separate from the desktop app's local processing. Actual production event fields, provider configuration, and retention require confirmation by the service operator.

## Google API Services Disclosure

Facenox uses Google API Services to handle user authentication and account setup for Facenox Cloud.

### Data Accessed
When you authenticate via Google, we access your:
- Primary email address
- Full name
- Profile picture URL

We use the standard `openid`, `email`, and `profile` scopes.

### Data Usage
The account workflow uses this data to:
- Create and identify your Facenox Cloud account.
- Personalize your profile.
- Send transactional emails (e.g., password resets, organization invitations).

This account-data description is separate from the website's analytics configuration.

### Data Sharing
Facenox Cloud uses external services for hosting, authentication, billing, and transactional email. Do not treat local desktop processing as a promise that hosted account data never reaches service providers. Contact privacy@facenox.com for questions about hosted data handling.

### Data Storage & Protection
Cloud access uses HTTPS. Face-template encryption is separate from account-data storage; the template encryption implementation does not establish the encryption configuration of every hosted database.

### Data Retention & Deletion
Request account deletion by emailing privacy@facenox.com. The dashboard links to this request route; it does not perform immediate self-service deletion. Account data, organization records, paired computers, and independently exported backups have different deletion scopes.

---

Facenox's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.
