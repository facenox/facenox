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

- **Enrollment & Matching:** Raw camera frames are processed locally and are never persisted to disk or uploaded to Facenox Cloud. The pipeline extracts mathematical embeddings directly from camera frames.
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

## Analytics, Diagnostics, and Network Connections

The open source desktop app does not include ads, behavioral analytics, session recording, or automatic diagnostic uploads.

The following desktop features can make outbound connections:

| Connection | When it occurs | Destination | Data and purpose |
| --- | --- | --- | --- |
| Update check | In packaged builds, first after a short startup delay and then at most once every 24 hours | GitHub Releases API | Current app version in the user agent; retrieves the latest release metadata |
| Online clock check | Only when a user selects **Check now** in system-time settings | Google, Cloudflare, or Microsoft public web endpoint | Reads the HTTP `Date` header; no attendance record, member data, or biometric template is included |
| Facenox Cloud | Only after a computer is explicitly paired | The configured Cloud service and its Ably realtime connection | Pairing, synchronization, operational status, policies, and supported remote administration |
| External links | Only when a user opens one | The selected website | Normal browser request |

Normal HTTPS connections expose network metadata such as the public IP address and request time to the destination. The application does not treat update checks or a user-requested clock comparison as product analytics.

Health reports are generated only when a user selects **Export health data**. They are written to the Downloads folder and are not uploaded automatically. A report contains app and operating-system details, CPU and memory information, local backend status, and recent local log lines. Review it before sharing it with another party.

That does not automatically make every surrounding deployment private. Hosted logs, monitoring, analytics, and third-party infrastructure need their own documented review.

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
- device name and app version
- groups and member directory data needed for reports
- attendance records and sessions
- sync timestamps, outcomes, and operational activity

The desktop app uses event-driven and snapshot sync. On plans with face-template sync, encrypted templates can sync between paired computers at the same location.

Cloud manages the location encryption keys. During a transfer between locations, the server decrypts templates in memory and re-encrypts them with the destination key. Encrypted storage does not mean the Cloud service is technically unable to decrypt templates. Face recognition itself runs on the paired computers.

### Remote administration

Pairing also authorizes the organization to apply attendance policies and send supported commands to the computer. The current desktop client supports commands that:

- remove local Facenox attendance records and enrolled templates
- reset and disable the local admin PIN
- request an application update check

The computer returns the command outcome to Cloud. Organizations should restrict these controls to authorized administrators and protect destructive commands with appropriate authentication and audit controls in the hosted service.

### Hosted-service documentation

This repository defines the desktop-side data boundary. The operator of an official or self-hosted Cloud deployment must separately publish and maintain:

- the exact operational and security log fields
- purposes and lawful bases for processing
- retention periods for attendance, audit, device, account, billing, and support data
- deletion procedures and completion timelines
- subprocessors, processing regions, and international transfers
- access controls, incident handling, and a privacy contact

Cloud synchronization, service logs, security audit logs, and optional product analytics are different data categories and should not be combined under a generic telemetry label.

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

The website code includes Vercel Analytics and Speed Insights. When configured, PostHog captures page views and page departures. These hosted services are separate from the desktop app's local processing. The public website privacy notice must identify the active providers, event fields, storage technologies, purposes, retention, processing region, and available consent or opt-out controls. Production behavior cannot be established from the desktop repository alone.

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

Facenox Cloud uses external services for hosting, authentication, billing, and transactional email. These providers process the account data needed to deliver those services.

### Data Storage & Protection

Cloud access uses HTTPS. Face-template encryption is separate from account-data storage; the template encryption implementation does not establish the encryption configuration of every hosted database.

### Data Retention & Deletion

Request account deletion by emailing privacy@facenox.com. Facenox Cloud links to this request route; it does not perform immediate self-service deletion. Include any organizations and paired computers whose records you also want removed. Exported backup files must be deleted separately.

---

Facenox's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.
