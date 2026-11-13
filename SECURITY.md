# Security Policy

## Overview
ForenSight is engineered for sensitive digital forensics investigations where cryptographic integrity, chain of custody, and access control are critical. We prioritize prompt identification and resolution of any security vulnerabilities.

## Supported Versions
| Version | Supported          |
| ------- | ------------------ |
| 4.x     | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability
If you discover a security vulnerability within ForenSight:

1. **Do NOT open a public GitHub issue.**
2. Report the vulnerability privately via **GitHub Security Advisories** (navigate to `Security` -> `Advisories` -> `Report a vulnerability`).
3. Alternatively, contact the maintainers directly via email at `kharbashpriyanshu@gmail.com` with the subject line `[SECURITY] ForenSight Vulnerability Report`.

Please include:
- A descriptive summary of the vulnerability
- Steps to reproduce or proof-of-concept payload
- Impact assessment on forensic evidence integrity or authentication
- Any recommended remediations

## Response SLA
- **Initial Acknowledgement:** Within 48 hours
- **Severity Assessment & Triage:** Within 5 business days
- **Patch Release & Advisory:** Within 14 business days (or coordinated disclosure timeline)

## Security Architecture Highlights
- **Cryptographic Evidence Sealing:** SHA-256 bitstream fingerprinting upon intake
- **Scientific Algorithm Freeze:** Cryptographic verification of all forensic algorithms prior to test and deployment
- **Append-Only Audit Ledger:** Tamper-evident chained audit records for every investigative action
- **Session Protection:** HttpOnly, SameSite=Lax cookies, rotating refresh tokens with replay detection, double-submit CSRF protection
- **MFA / TOTP:** RFC 6238-compliant TOTP multi-factor authentication with encrypted secret storage and single-use hashed recovery codes
