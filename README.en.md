# ScamCheck

[繁體中文](./README.md) · **English**

ScamCheck helps teenagers in Taiwan assess suspicious messages, screenshots and short videos. It uses rules that explain which warning signs they found, compares messages with public fact-checks from Cofacts, and can use Google Gemini to help interpret the results. An anonymous study explores which warning signs teenagers tend to overlook.

Students in the Department of Data Processing at Sanchong Commercial and Industrial Vocational High School built ScamCheck for their business and management project.

> The risk index is a weighted score based on the warning signs found. It does not estimate the probability of fraud. Results are for reference only and carry no legal authority.

- **Use the website** on a phone, tablet or computer. [Main site](https://scamcheck.slimebvs.net) · [Backup site](https://scamcheck.slimebvs-scamcheck.workers.dev)
- **Hosting** uses Cloudflare Workers and D1 on the free plan, so the site runs independently of the team's computers.
- **Maintenance and handover notes** are shared separately with administrators and incoming student maintainers.

## Features

| Feature | What it does |
|---|---|
| Message checks | Looks for ten categories of warning signs, finds related fact-checks through the public Cofacts API, and offers Gemini explanations when a key is configured. Administrators can turn off Cofacts. |
| URL checks | Checks domains against Taiwan's National Police Agency 165 anti-fraud lists, covering roughly 110,000 domains. Administrators can update the lists. Google Safe Browsing and VirusTotal checks are optional. |
| Gemini analysis | Users can choose a model or let the site switch to the next available free model when a quota runs out. If Gemini is unavailable, backup models on Cloudflare Workers AI or Groq analyze the text. Images and videos are not sent to them. Administrators choose the backup models and their order. |
| Screenshots and short videos | Gemini can analyze images and videos, including audio. Users can also enter text manually when Gemini is unavailable. |
| Research quiz | Participants give consent and receive an anonymous study ID. Between a pre-test and a post-test, one group receives general information and the other sees explanations from ScamCheck. |
| Privacy | Without research consent, the service keeps only the analysis result and deletes it after 30 days by default. With consent, it can retain redacted text and URLs until the retention deadline. Participants can withdraw consent and delete their research data. Personal check history stays in the user's browser. |
| Administration | Administrators can view statistics and business metrics, review cases and risk patterns, classify research records, export Excel files, download a full backup, manage settings and work with demo data. |

## Project layout

```text
web/                 Website (React frontend and Cloudflare Worker backend)
  src/               Frontend pages
  worker/            Backend API and tests
  migrations/        D1 database migrations
  e2e/               Cross-device browser tests
legacy/              Archived v0.1 portable Python application for Windows
```

## Local development

Use Node.js 20 or later.

```bash
cd web
npm install
npm run dev        # Start the local site at http://localhost:5173
npm test           # Run frontend and Worker unit tests
npm run test:e2e   # Run browser tests for iPhone, Pixel, iPad and desktop
```

To test the admin page locally, copy `web/.dev.vars.example` to `web/.dev.vars` and set `ADMIN_PASSWORD` in your local copy.

Pushing to the GitHub `main` branch starts the Cloudflare deployment. The changes go live after the tests and build pass.

## Data sources

| Source | Use | License or terms |
|---|---|---|
| [Cofacts 真的假的](https://cofacts.tw) | Looks up existing fact-checks when a user submits a message. The project does not host a copy of the Cofacts database. | CC BY-SA 4.0 |
| [National Police Agency 165 list of suspected scam sites with suspended DNS resolution](https://data.gov.tw/dataset/176455) | Checks submitted URLs. A processed snapshot is included at `web/snapshot/tw165.json.gz`. | Open Government Data License, version 1.0 |
| [National Police Agency 165 list of fraudulent investment and gambling sites](https://data.gov.tw/dataset/160055) | Checks submitted URLs. | Open Government Data License, version 1.0 |
| Google Gemini, Google Safe Browsing, Google Fact Check Tools and VirusTotal | Optional external services. Site operators supply their own API keys. | Each provider's terms apply. |
| Cloudflare Workers AI and Groq | Backup AI when Gemini fails. Workers AI uses a Cloudflare binding and needs no key. Groq is optional and needs the operator's own `GROQ_API_KEY`. | Each provider's terms apply. |

## Acknowledgments

The playful button on the check page was inspired by Codfish's [ChillComponent](https://chillcomponent.codlin.me/components/btn-naughty/) (MIT license). The team wrote its own React implementation.

## License

Copyright (C) 2026 kiroto-slime

You may use, modify and redistribute this project under the GNU Affero General Public License v3.0 (AGPL-3.0). Keep the copyright notice. If you run a modified version as a website, you must offer its corresponding source code to the people using it. The datasets listed above retain their own licenses. [Full license](./LICENSE)
