---
title: Licensing
description: How Relab licenses its software, its API specification, and its dataset releases, and the two limits no licence changes.
---

Relab licenses three layers separately, on purpose. Which one applies depends on what you are
reusing, not on which repository you found it in.

| Layer                                                                                    | Licence                                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Platform software: backend, app, www, and this docs site                                 | [AGPL-3.0-or-later](https://github.com/CMLPlatform/relab/blob/main/LICENSE)     |
| API specification: the OpenAPI schemas this repository generates, and their client types | [Apache-2.0](https://github.com/CMLPlatform/relab/blob/main/LICENSE-APACHE-2.0) |
| Curated dataset releases                                                                 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), planned              |

## Why the API specification is carved out

The platform is copyleft, including over a network, so a hosted fork stays open. Applying that to
the integration surface would work against the point of publishing one: anyone writing a client, an
importer, or a pipeline against the API would inherit obligations from a file that only describes an
interface. An interface description is thin copyright in any case, since
[Directive 2009/24/EC art. 1(2)](https://eur-lex.europa.eu/eli/dir/2009/24/oj) excludes the ideas
and principles underlying a program's interfaces from protection.

Apache-2.0 rather than a public-domain dedication, because the carve-out covers generated TypeScript
client types as well as the schemas. Those are software, which Creative Commons advises against
covering with a CC licence, and Apache-2.0 carries an explicit patent grant.

In practice: **generate a client from the public or device schema and you inherit no copyleft.**

The carve-out covers the two schemas this repository generates, `openapi.public.json` and
`openapi.device.json`. The [RPi camera API](/api/rpi-cam/) is not one of them: `openapi.rpi-cam.json`
is fetched verbatim from the separate
[relab-rpi-cam-plugin](https://github.com/CMLPlatform/relab-rpi-cam-plugin) repository and carries
whatever licence that project sets. Check there before reusing it.

## Dataset releases

Curated releases are planned under CC BY 4.0. No release has been published yet, so nothing is
distributed under those terms today; see [Dataset](/project/dataset/) for what a release will
contain and how it differs from the live records in the app.

CC 4.0 licenses the EU *sui generis* database right alongside copyright, so one instrument covers
both the structure of the database and its contents, and no second licence is needed for the records
themselves. Attribution is the whole obligation, which is what keeps a release usable for
machine-learning work.

## Two limits no licence changes

**Personal data is governed by the GDPR regardless of the licence.** A licence grants permissions
over material the licensor may lawfully distribute; it cannot make publication of personal data
lawful. What makes a release publishable is the sanitisation applied when building it, described in
[Security and hardening](/operations/security/), not the CC BY grant on top.

**CC BY grants no trademark rights**
([CC BY 4.0 §2(b)(2)](https://creativecommons.org/licenses/by/4.0/legalcode#s2b)). Teardown
photographs necessarily show brand marks and model numbers. The licence covers those images as
images; it licenses nothing about the marks in them.
