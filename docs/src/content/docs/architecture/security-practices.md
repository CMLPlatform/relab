---
title: Security Practices
description: Advisory security review practices for RELab development.
owner: docs
status: reviewed
lastReviewed: '2026-04-30'
---

Security review in RELab is meant to be a normal part of development, not a separate compliance step. This page is for contributors writing security-sensitive code and for reviewers checking it.

## Standards

[OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS) is the application security baseline. Level 1 applies broadly; Level 2 applies to authentication, authorization, uploads, device and WebSocket flows, secrets, admin APIs, and deployment.

[OpenSSF Scorecard](https://scorecard.dev/) is used as an advisory signal for supply-chain hygiene: dependency updates, pinned Actions, branch protection, and security tooling. Treat findings as inputs to judgment, not a checklist to clear.

## OWASP cheat sheets by area

Quick reference for reviewers. Find the area that matches the change and skim the relevant sheets.

- **API design:** [REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html), [REST Assessment](https://cheatsheetseries.owasp.org/cheatsheets/REST_Assessment_Cheat_Sheet.html), [Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- **Authentication and tokens:** [Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [JSON Web Token](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html), [OAuth2](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)
- **Authorization and object access:** [Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [Access Control](https://cheatsheetseries.owasp.org/cheatsheets/Access_Control_Cheat_Sheet.html), [IDOR Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)
- **Data and business logic:** [Mass Assignment](https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html), [Business Logic Security](https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html), [SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html), [Query Parameterization](https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html), [Database Security](https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html)
- **Files, media, and device flows:** [File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html), [SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [Denial of Service](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
- **Frontend and browser:** [XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html), [DOM XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html), [Content Security Policy](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html), [HTTP Headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html), [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- **Mobile app:** [Mobile Application Security](https://cheatsheetseries.owasp.org/cheatsheets/Mobile_Application_Security_Cheat_Sheet.html), [Pinning](https://cheatsheetseries.owasp.org/cheatsheets/Pinning_Cheat_Sheet.html), [OWASP MASVS](https://mas.owasp.org/MASVS/)
- **Secrets, CI/CD, and supply chain:** [Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html), [Docker Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html), [CI/CD Security](https://cheatsheetseries.owasp.org/cheatsheets/CI_CD_Security_Cheat_Sheet.html), [GitHub Actions Security](https://cheatsheetseries.owasp.org/cheatsheets/GitHub_Actions_Security_Cheat_Sheet.html), [NPM Security](https://cheatsheetseries.owasp.org/cheatsheets/NPM_Security_Cheat_Sheet.html), [Vulnerable Dependency Management](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_Dependency_Management_Cheat_Sheet.html), [Software Supply Chain Security](https://cheatsheetseries.owasp.org/cheatsheets/Software_Supply_Chain_Security_Cheat_Sheet.html)
- **Logging, errors, and privacy:** [Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), [Error Handling](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html), [User Privacy Protection](https://cheatsheetseries.owasp.org/cheatsheets/User_Privacy_Protection_Cheat_Sheet.html)

## What reviewers should check

For security-sensitive PRs, the main things to verify:

- authorization is enforced server-side, not just hidden on the client
- input is validated at API, upload, form, and device boundaries
- nothing sensitive ends up in logs — no tokens, passwords, private URLs, or OAuth material
- auth, permission, and upload behavior has test coverage
- new runtime dependencies and GitHub Actions have a clear reason to exist
- docs are updated when a security-sensitive flow changes

## Threat model notes

For changes in any of these areas, add a short security note to the PR description or a relevant architecture page:

- authentication, sessions, password reset, email verification, OAuth, token refresh
- roles, permissions, organizations, ownership, object access
- file, image, media, or backup handling
- RPi camera pairing, device assertions, direct uploads, WebSocket relay flows
- admin APIs, operational scripts, deployment, secrets, production configuration
- personal data, public data publication, privacy behavior

The note doesn't need to be long. The goal is to give reviewers and future maintainers enough context to understand what was considered:

```md
## Security considerations

- Assets affected:
- Trust boundaries crossed:
- What could go wrong:
- Controls and tests:
- Follow-up items:
```
