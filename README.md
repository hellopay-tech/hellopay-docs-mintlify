# HelloPay API Docs

Mintlify documentation for the HelloPay API, including getting started guides, payment rail walkthroughs, and the API reference used by the docs site.

## Requirements

- Node.js 18+
- Mintlify CLI

Install the CLI globally, or run it on demand with `npx` if you prefer not to install it:

```bash
npm i -g mint
```

```bash
npx mint dev
```

## Run locally

From this directory, start the local docs preview:

```bash
mint dev
```

The site will be available at `http://localhost:3000`.

## Main files

- `docs.json`: Mintlify configuration, navigation, branding, API settings, and the agent instructions added to every Markdown export
- `index.mdx`: Documentation landing page
- `getting-started/`: Core concepts, authentication, sandbox, webhooks, errors, and AI agent setup
- `guides/`: Step-by-step guides for payins (PSE, Bre-B, Nequi), payment links, and payouts. The go-live checklist is a section of `index.mdx`
- `snippets/`: Reusable content and the animated flow components (`flows.jsx`)
- `style.css`: Styles for the animated flows (respects `prefers-reduced-motion`)
- `openapi.yaml`: OpenAPI spec used for the API reference. Endpoints marked `x-excluded` are internal and not published
- `skills/hellopay-payments/`: The HelloPay Agent Skill. `.mintlify/skills` links to it so the docs site serves it at `/skill.md`; `.mintignore` keeps it out of the page build

When you change API behavior, update the guide, `openapi.yaml`, and the matching file in `skills/hellopay-payments/` together.

## Publishing

Changes are deployed through Mintlify after they are merged into the default branch connected to the HelloPay docs project.

## Useful commands

```bash
mint dev
mint validate
mint broken-links
mint update
```

Use `mint update` if the local preview is outdated or fails to load correctly.
