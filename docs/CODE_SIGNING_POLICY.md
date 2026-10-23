# Code Signing Policy

This page explains how to tell whether a Facenox desktop build is official, and how we plan to handle code signing as the project matures.

## Current Status

The checked-in desktop build configuration does not configure code signing. Check each release's notes and installer signature for its signing status.

- **Automated Builds:** All official binaries are compiled and packaged using GitHub Actions in this repository.
- **Source scanning:** The CodeQL workflow is configured for pushes and pull requests to `main`, plus a weekly scan.
- **Provenance:** Treat a build as official only if it is attached to an official GitHub release in this repository.

### Windows 11 Smart App Control & SmartScreen Notice

If Windows blocks a downloaded build, verify that it came from the official release page and check the release's signing notes.

On managed computers, ask the administrator to review the installer and installation policy. Do not treat a security warning as proof that the file is an official or safe release.

Once code signing is live, we will update this page with:

- The signing provider or certificate details
- Which release artifacts are signed
- How users can verify signatures

## Official Repository

The official open source repository for Facenox is:

- `https://github.com/facenox/facenox`

This repository covers the open source desktop app and local backend.

Facenox Cloud is a separate hosted companion service. It is not part of the open source desktop codebase covered by this page.

## Release Ownership

Official desktop releases should come from the same team responsible for the source code and build setup.

Current release ownership:

- **Maintainer:** The Facenox project owner and repository maintainer
- **Release approver:** The Facenox project owner and repository maintainer
- **Contribution path:** External changes should go through pull request review before they are included in a release

As the project grows, this section can be replaced with explicit team or maintainer links.

## What Counts as Official

An official Facenox release should:

- Be built from this repository
- Be published through the official Facenox GitHub repository
- Map to a tagged version or otherwise traceable source revision
- Include release notes describing what changed

If a build comes from a mirror, a fork, a re-packaged installer, or any other unofficial channel, do not treat it as an official Facenox release unless we explicitly point to it ourselves.

## Privacy and Network Behavior

Privacy and data handling are documented here:

- [Privacy and Data Handling](./PRIVACY.md)

In short:

- Facenox desktop does not send raw face images to other networked systems.
- Paired computers can sync attendance records and, on supported plans, encrypted face templates to Facenox Cloud. Cloud manages keys for synced templates.
- Local recognition and attendance workflows continue to work without Facenox Cloud connectivity.

## Release Artifacts

Official release artifacts should:

- Use the Facenox product name consistently
- Be traceable to the tagged source tree and release notes
- Be built from the repository's source code and release configuration

When code signing is enabled, this page will also document:

- Which artifacts are signed
- Any exceptions
- How signature verification works

## Going Forward

This page will evolve as release automation, build provenance, and code-signing infrastructure mature.

If we later adopt SignPath or another signing provider, we will update this page with the provider-specific wording and verification details that apply at that time.
