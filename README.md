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

- `docs.json`: Mintlify configuration, navigation, branding, and API settings
- `index.mdx`: Documentation landing page
- `getting-started/`: Authentication, sandbox, and webhook setup
- `guides/`: Step-by-step integration guides for payins and payouts
- `openapi.yaml`: OpenAPI spec used for the API reference

## Publishing

Changes are deployed through Mintlify after they are merged into the default branch connected to the HelloPay docs project.

## Useful commands

```bash
mint dev
mint update
```

Use `mint update` if the local preview is outdated or fails to load correctly.
