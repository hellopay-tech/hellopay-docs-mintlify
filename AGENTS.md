# AGENTS.md

The Mintlify site for docs.hellopay.com.co, deployed by Mintlify on merge to `main`. See `README.md` for the file map.

## Commands

- Preview: `npx mint dev` (http://localhost:3000). If it looks stale or fails to load, run `npx mint update`.
- Before a commit: `npx mint validate` and `npx mint broken-links`.
- `/skill.md`, `/llms.txt` and `/mcp` exist only on the deployed site, not in the local preview.

## Content rules

- When API behavior changes, update the guide, `openapi.yaml` and the matching file in `skills/hellopay-payments/` together.
- Verify claims against `hellopay-backend` on `origin/main` (fetch first) and, when the user provides a key, against the staging API (`https://api.stg.hellopay.com.co`). Never write that key to a file or commit.
- Never name HelloPay's payment providers or vendors. Error codes such as `VENDOR_REJECTED` are API values and stay as they are.
- Endpoints marked `x-excluded` in `openapi.yaml` are internal and not published.
- The go-live checklist is a section of `index.mdx`; `/guides/go-live` redirects to `/#go-live` in `docs.json`.
- The docs are written for AI agents as well as developers. `markdown.instructions` in `docs.json` is appended to every Markdown export; keep it in line with the guides.

## Structure

- `skills/` is the source of the Agent Skill. `.mintlify/skills` is a symlink to it, and `.mintignore` keeps it out of the page build. Edit `skills/`, not the symlink.
- `snippets/flows.jsx` and `style.css` hold the animated flows; keep `prefers-reduced-motion` working.

## Replacement site

`../hellopay-api-docs` (Astro, not on GitHub yet) is replacing this site. Its tests require its guides, `openapi.yaml` and `skills/` to match this repo byte for byte. Mirror every content change there, or tell the user it is needed.

## Secrets

`tmp-access.txt` is excluded through `.git/info/exclude`. Never read it, copy it or commit it.
