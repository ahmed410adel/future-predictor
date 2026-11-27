# Security policy

## Reporting a vulnerability

Do not open a public issue. Use GitHub private vulnerability reporting
(enable it under the repository's security settings).

## Areas to review carefully

- File upload: size and type limits, server-generated object keys
- Access control: every result must be checked against its owner
- Untrusted CV content: malicious files and prompt injection
- IAM roles and security groups: least privilege
