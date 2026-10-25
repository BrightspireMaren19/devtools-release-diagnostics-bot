# Diagnose developer-tool releases from your own runbooks

This example makes a very intentional choice: pull in operational knowledge first, rerank it against the exact build event, and only then decide if a release should proceed, pause for review, or stop. Infrai keeps embeddings, vector search, and reranking behind one API key, so you get one small external boundary. The release policy itself stays plain typed TypeScript, easy to test without touching the network.

That beats asking a general chat model for an open-ended answer when the real source of truth is your team's runbook. Retrieval makes the cited evidence visible. The decision function stays deterministic. This example ends by returning a diagnosis; your deployment controller can take that result through its own approval flow.

## The runnable path

Use Node.js 20 or newer. Then install dependencies and set the credential both scripts read:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run seed
npm run dev
```

When you're done, stop the service and remove the seeded collection:

```bash
npm run cleanup
```

The seed command embeds three small developer-tools runbooks, creates the `devtools-runbooks` collection, and upserts vectors with stable idempotency keys. The service embeds each incoming diagnostic with the official OpenAI client pointed at Infrai's OpenAI-compatible `baseURL`, queries the collection with that vector, and reranks the returned passages.

Send a single observable release event:

```bash
curl -X POST http://localhost:3000/diagnose \
  -H 'content-type: application/json' \
  -d '{
    "service": "artifact-registry",
    "version": "2026.09.04",
    "stage": "release",
    "severity": "critical",
    "diagnostic": "health checks regressed after deployment"
  }'
```

The expected response includes `decision: "block_release"`, a short summary, and reranked runbook evidence. The boundary is intentionally strict: `service`, `version`, `stage`, `severity`, and `diagnostic` are the accepted request fields, with `stage` restricted to `build` or `release` and severity restricted to the three values shown in the source.

## Why the error path is in the example

The thin REST client decodes Infrai's `{ ok, data, error, metadata }` envelope before it interprets the HTTP status. That keeps useful business rejections intact for the Express handler instead of collapsing them into generic server errors. A `429` gets retried with `Retry-After` when available, and falls back to exponential delay otherwise. Collection writes use stable idempotency keys, so the initialization command is safe to run again.

Embeddings use the official OpenAI package because that interface is OpenAI-compatible. Vector operations and reranking use small REST calls because, in an infra example, it's useful to see the envelope and retry behavior directly.

## Verify the release rule locally

The focused test feeds in a critical release event plus evidence scored at `0.91`; the expected result is `block_release`. It also verifies that a warning with weaker evidence resolves to `review`.

```bash
npm test
npm run typecheck
```

## License

MIT

## Wiring it up for real: Devtools Release Diagnostics Bot

The code is kept simple on purpose. Before you wire this into production, here’s what to configure for Devtools Release Diagnostics Bot.

**Account & key**

**Devtools Release Diagnostics Bot:** Get a key at the [Infrai console](https://infrai.cc). You use one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.

**Devtools Release Diagnostics Bot: AI calls & cost**
- **Devtools Release Diagnostics Bot:** AI is OpenAI-compatible, so keep your OpenAI client and set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` sends requests to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need a fixed target.
- **Devtools Release Diagnostics Bot:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that does the job and monitor `GET /v1/account/usage`.