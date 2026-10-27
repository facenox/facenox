# Set up Facenox Desktop

This guide is for the person setting up attendance on a computer. Packaged releases do not require the development setup in [Installation from source](INSTALLATION.md).

## 1. Download and install

Use the [Facenox download page](https://facenox.com/download) to check system requirements and select a release for your operating system. Use the official release assets, not the source-code archives.

- **Windows:** Run the Windows installer and follow its prompts.
- **macOS:** Open the disk image and copy Facenox to Applications.
- **Linux:** Use the package for your distribution, or make the AppImage executable before opening it.

If your operating system blocks the app or installation fails, verify the download source and consult the release notes and [troubleshooting guide](TROUBLESHOOTING.md). On managed computers, ask the administrator about installation restrictions.

## 2. Select a camera

Connect a compatible webcam or use the computer's built-in camera. Open Facenox, allow camera access when prompted, and select the camera. Check that the preview shows a clear face in consistent lighting.

## 3. Enroll members

Create a group and add the people who will use the attendance computer. Enroll their faces using the app's enrollment flow. Before collecting biometric data, establish your organization's privacy notices, access rules, and retention practices. See [Privacy and Data Handling](PRIVACY.md).

## 4. Check the attendance workflow

Review the entry/exit and attendance settings for your workflow. Scan an enrolled member and confirm that the expected record appears. Local enrollment, recognition, and attendance recording work without internet after installation. Keep the computer powered on and the app running when it needs to record attendance.

## 5. Optionally connect Facenox Cloud

You do not need an account for local use. To review synced records from a browser, create a Facenox Cloud account and set up an organization and location. Generate an 8-character pairing code in Facenox Cloud and enter it in **Settings → Cloud sync** in the desktop app. The settings also support a device-initiated approval flow that uses a 6-character device code. Pairing authorizes organization administrators to apply attendance policies and supported device commands, including local data wipe and admin-PIN reset; review **Cloud sync & privacy** before connecting.

Cloud requires internet for pairing, syncing, and browser access. If the connection drops, the desktop continues recording locally and pending records sync when it reconnects.

Essentials provides free Cloud access with member, device, and history limits, including CSV export. Paid plans add capabilities such as PDF and Excel reports, additional devices, and encrypted face-template sync. Check [current plans](https://facenox.com/pricing) before choosing a setup.

## Keep a recovery copy

Use the desktop backup export to create a password-protected `.facenox` archive and keep it in a separate, protected location. Backup files can contain biometric templates. Cloud sync propagates changes and removals and does not replace an independent backup.
