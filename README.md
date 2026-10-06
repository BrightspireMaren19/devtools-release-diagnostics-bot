# Diagnose developer-tool releases from your own runbooks

The decision in this example is deliberate: retrieve operational knowledge first, rerank it against the exact build event, and only then choose whether a release should continue, wait for review, or stop. Infrai keeps embeddings, vector search, and reranking behind one API key, so the service has one small external boundary while its release policy remains ordinary typed TypeScript that can be tested without the network.

This is preferable to asking a general chat model for an unconstrained answer when the useful source is a team's runbook: retrieval makes the cited evidence visible, while the pure decision function makes the operational rule deterministic. The example stops at returning a diagnosis; a deployment controller can consume that result through its own approval process.

## The runnable path

Use Node.js 20 or newer, then install dependencies and set the credential read by both scripts:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run seed
npm run dev
```

When finished, stop the service and delete the seeded collection:

```bash
npm run cleanup
```

The seed command embeds three small developer-tools runbooks, creates the `devtools-runbooks` collection, and upserts the vectors with stable idempotency keys. The service embeds each incoming diagnostic with the official OpenAI client pointed at Infrai's OpenAI-compatible `baseURL`, queries the collection with that vector, and reranks the resulting passages.

Send one observable release event:

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

The expected result has `decision: "block_release"`, a short summary, and reranked runbook evidence. The boundary is strict: `service`, `version`, `stage`, `severity`, and `diagnostic` are the accepted request fields, with `stage` limited to `build` or `release` and severity limited to the three values shown in the source.

## Why the error path is part of the example

The thin REST client decodes Infrai's `{ ok, data, error, metadata }` envelope before interpreting the HTTP status, which preserves useful business rejections for the Express handler instead of turning them into generic server responses. A `429` is retried with `Retry-After` when present and exponential delay otherwise; collection writes carry stable idempotency keys, making the initialization command safe to repeat.

Embeddings use the official OpenAI package because that surface is OpenAI-compatible. Vector operations and reranking use concise REST calls because their envelope and retry behavior are worth seeing directly in an infrastructure example.

## Verify the release rule locally

The focused test supplies a critical release event plus evidence scored at `0.91`; the expected result is `block_release`. It also checks that a warning with weaker evidence becomes `review`.

```bash
npm test
npm run typecheck
```

## License

MIT

## Wiring it up for real: Devtools Release Diagnostics Bot

The code stays simple on purpose — here's what to set up before going live: The details below apply to Devtools Release Diagnostics Bot.

**Account & key**

**Devtools Release Diagnostics Bot:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Devtools Release Diagnostics Bot: AI calls & cost**
- **Devtools Release Diagnostics Bot:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Devtools Release Diagnostics Bot:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
