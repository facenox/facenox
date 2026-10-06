# Code Signing Policy

This page explains how to tell whether a Facenox desktop build is official, and how we plan to handle code signing as the project matures.

## Current Status

Facenox desktop releases are currently **unsigned** while we finish our code-signing setup. However, we ensure build integrity through the following:

- **Automated Builds:** All official binaries are compiled and packaged using GitHub Actions in this repository.
- **Security Auditing:** Every commit is automatically scanned by **GitHub CodeQL** for potential vulnerabilities.
- **Provenance:** Treat a build as official only if it is attached to an official GitHub release in this repository.

### Windows 11 Smart App Control & SmartScreen Notice

Because preview/beta builds are unsigned and newly released binaries have not yet accumulated cloud reputation:

- **Windows SmartScreen:** May display *"Windows protected your PC"*. You can proceed by clicking **More info** → **Run anyway**.
- **Windows 11 Smart App Control (SAC):** If Smart App Control is enabled in **Enforce mode**, Windows may block unsigned executables from the internet without displaying the *"Run anyway"* bypass button.
  - To unblock a downloaded binary: Right-click the `.exe` installer → select **Properties** → check the **Unblock** box at the bottom under Security → click **Apply**.
  - For developers and test workstations: You can run Facenox from source in **Developer Mode** or adjust SAC settings in *Windows Security > App & browser control > Smart App Control*.

Once code signing is live, we will update this page with:

- the signing provider or certificate details
- which release artifacts are signed
- how users can verify signatures

## Official Repository

The official open source repository for Facenox is:

- `https://github.com/facenox/facenox`

This repository covers the open source desktop app and local backend.

Facenox Cloud is a separate hosted companion service. It is not part of the open source desktop codebase covered by this page.

## Release Ownership

Official desktop releases should come from the same team responsible for the source code and build setup.

Current release ownership:

- **Maintainer:** the Facenox project owner and repository maintainer
- **Release approver:** the Facenox project owner and repository maintainer
- **Contribution path:** external changes should go through pull request review before they are included in a release

As the project grows, this section can be replaced with explicit team or maintainer links.

## What Counts as Official

An official Facenox release should:

- be built from this repository
- be published through the official Facenox GitHub repository
- map to a tagged version or otherwise traceable source revision
- include release notes describing what changed

If a build comes from a mirror, a fork, a re-packaged installer, or any other unofficial channel, do not treat it as an official Facenox release unless we explicitly point to it ourselves.

## Privacy and Network Behavior

Privacy and data handling are documented here:

- [Privacy and Data Handling](./PRIVACY.md)

In short:

- Facenox desktop does not send raw face images to other networked systems.
- Facenox desktop may, if enabled by the operator, send attendance snapshots and encrypted biometric templates to Facenox Cloud.
- Local recognition and attendance workflows continue to work without Facenox Cloud connectivity.

## Release Artifacts

Official release artifacts should:

- use the Facenox product name consistently
- be traceable to the tagged source tree and release notes
- be built from the repository's source code and release configuration

When code signing is enabled, this page will also document:

- which artifacts are signed
- any exceptions
- how signature verification works

## Going Forward

This page will evolve as release automation, build provenance, and code-signing infrastructure mature.

If we later adopt SignPath or another signing provider, we will update this page with the provider-specific wording and verification details that apply at that time.
