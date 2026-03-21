# Security Policy

## Supported Versions

Facenox handles biometric and attendance data. Only the latest released version is considered supported for security fixes.

| Version | Supported |
| --- | --- |
| latest release | yes |
| older releases | no |

## Reporting a Vulnerability

Do not open a public GitHub issue for a security vulnerability.

Preferred path:

1. Open a GitHub draft security advisory for this repository.

Fallback path:

1. Contact the maintainer privately through [LinkedIn](https://www.linkedin.com/in/johnraivenolazo/) if GitHub advisories are not available to you.

Include:

- the affected version or commit
- a clear description of the issue
- reproduction steps or proof of concept
- impact, especially if biometric or attendance data can be exposed or altered

## Response Target

Reports are normally acknowledged within 48 to 72 hours. The exact fix timeline depends on severity and reproducibility.

## What Counts as High Severity

Examples of high-severity issues include:

- extracting raw face images or biometric templates unexpectedly
- bypassing consent checks for enrollment or recognition
- reading another organization's cloud data through a tenant-isolation bug
- modifying attendance or audit data without authorization

## Scope Reminder

This repository covers the open source desktop application and its desktop-side cloud integration points. A deployed Facenox Cloud environment has its own operational and infrastructure risk surface and should be reviewed separately.
