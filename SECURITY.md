# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities in these SDKs privately to **security@responsedock.com**. Do not open a public issue. Include:

- the affected package and version
- reproduction steps or a proof of concept
- the impact you observed

Do not access other customers' data or degrade the service while you investigate.

We aim to acknowledge credible reports within two business days, send a triage update within five business days, and coordinate disclosure once a fix is released. These are goals, not a contractual SLA.

## Supported versions

Security fixes ship in the latest minor release of `@responsedock/sdk-browser` and `@responsedock/sdk-react`. The hosted script at `https://survey.responsedock.com/sdk/<major.minor>/` picks up patch releases automatically.

## Verifying packages

Every release is published from this repository's **Publish SDKs** workflow with npm provenance. To check the attestations of an installed package, run `npm audit signatures`.
