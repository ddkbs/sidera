# Security policy

## Reporting a vulnerability

Please **don't** open a public issue. Report it privately through GitHub:
[Security → Report a vulnerability](https://github.com/ddkbs/sidera/security/advisories/new).

Include the affected version, steps to reproduce and the impact you see. You'll get an answer as soon as possible;
fixes ship in a new release and are credited in the release notes unless you prefer otherwise.

## Supported versions

Only the latest release gets security fixes.

## Scope

Sidera is a local-first desktop app. Areas that matter most: the local MCP server (`127.0.0.1:3845`), the iPad sync
server on the local network, the `sidera-file://` protocol, fetching of link previews / clipped pages, and storage of
AI provider keys.
