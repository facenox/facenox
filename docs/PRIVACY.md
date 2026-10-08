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

- **Data Processor vs Data Controller:** Facenox (the desktop application and cloud sync pipeline) operates strictly as a **Data Processor**. Deploying organizations (schools, enterprises, institutions) act as the **Data Controller** responsible for securing appropriate organizational waivers prior to biometric enrollment.
- **Biometric Template Lifecycle:** Enrolling a member stores their encrypted mathematical vector. Deleting a member permanently purges their biometric template from both local storage and cloud sync.
- **Compliance Disclosures:** Institutional compliance is supported via the integrated disclosures in **Settings ➔ About ➔ Privacy & Data Handling** and the organization's EULA/Terms of Service.

## Backups and Restore

- Backup exports are password-protected `.facenox` files.
- Backup exports can include biometric templates so a restore does not require full re-enrollment.
- Restores re-import the member metadata and biometric templates preserved in the backup package.

If you export a backup, treat the backup file as sensitive data.

## Telemetry

The open source desktop app does not include analytics, ads, or hidden background telemetry by default.

That does not automatically make every surrounding deployment private. If you add hosting, external logs, monitoring, or third-party infrastructure, those systems need their own review.

## Facenox Cloud data boundary

The desktop app can optionally pair with **Facenox Cloud** for automatic backup, DTR generation, and multi-device synchronization.

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

The desktop app uses event-driven and snapshot sync. Encrypted biometric templates can sync between paired devices in the same organization so that enrolling on one device is sufficient for all devices across that site.

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

## Google API Services Disclosure

Facenox uses Google API Services to handle user authentication and account setup for Facenox Cloud.

### Data Accessed
When you authenticate via Google, we access your:
- Primary email address
- Full name
- Profile picture URL

We use the standard `openid`, `email`, and `profile` scopes.

### Data Usage
This data is used exclusively to:
- Create and identify your Facenox Cloud account.
- Personalize your profile.
- Send transactional emails (e.g., password resets, organization invitations).

We do not use this data for marketing, advertising, or any other purposes.

### Data Sharing
We do not share Google user data with any third-party applications, advertisers, or other services. Your data is kept strictly within the Facenox Cloud environment.

### Data Storage & Protection
Your Google account information is stored in our secure, encrypted database (AES-256) and transmitted via secure protocols (TLS/SSL).

### Data Retention & Deletion
We retain your Google user data for as long as your account remains active. You can request the deletion of your account and all associated Google user data at any time via your dashboard or by emailing privacy@facenox.com.

---

Facenox's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.
