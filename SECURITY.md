# Security

## Report a problem privately

If you find a security problem, report it privately through GitHub: open
this repository's **Security** tab and choose **Report a vulnerability**.
Don't open a public issue, pull request or discussion about it.

This matters most for the code that runs on a server:

- the Live relay in [`live/`](live/), a Cloudflare Durable Object that polls
  RTD's realtime feeds and pushes changes to every open page
- the Pages Functions in [`functions/`](functions/), which connect the site
  to the relay

Say what you found, how to reproduce it, and what it lets someone do. You'll
get a reply on the report.

## What's in scope

The code in this repository and the site it publishes. RTD's own data, feeds
and systems are RTD's. Report problems with them to RTD, not here.

## Supported versions

Only the live site and the `main` branch get fixes.
