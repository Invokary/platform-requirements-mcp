# Platform Requirements MCP server

A read-only MCP server for what Claude, ChatGPT, Cursor and the Official MCP Registry require before they list an MCP connector or plugin. Every answer carries the requirement's sources, an evidence label and the date it was last checked.

**Endpoint:** `https://mcp.invokary.com/mcp` (Streamable HTTP, no sign-in)

Maintained by [Invokary](https://invokary.com/open-source). The data is the [Platform Requirements dataset](https://invokary.com/platforms), published under CC BY 4.0.

## Connect

The server needs no account, key or sign-in. Add it by URL:

- **Claude:** add a custom connector with the URL `https://mcp.invokary.com/mcp`.
- **Claude Code:** `claude mcp add --transport http platform-requirements https://mcp.invokary.com/mcp`
- **ChatGPT:** in developer mode, add an MCP server with the URL `https://mcp.invokary.com/mcp`.
- **Cursor:** add this to `.cursor/mcp.json` (or install the plugin in `.cursor-plugin/`):

  ```json
  { "mcpServers": { "platform-requirements": { "url": "https://mcp.invokary.com/mcp" } } }
  ```

- **VS Code:** add this to `.vscode/mcp.json`:

  ```json
  { "servers": { "platform-requirements": { "type": "http", "url": "https://mcp.invokary.com/mcp" } } }
  ```

- **Any client:** try it with the MCP Inspector: `npx @modelcontextprotocol/inspector --cli https://mcp.invokary.com/mcp --method tools/list`

It speaks the 2026-07-28 protocol (`server/discover`, no sessions) and still serves clients that open with the 2025 `initialize` handshake.

## Tools

| Tool | What it does |
|---|---|
| `list_platforms` | Lists the platforms covered, with each one's directory, vendor, number of requirements, topics and latest check date. |
| `get_platform_requirements` | Returns one platform's requirements, optionally narrowed to a topic or a product surface. |
| `get_requirement` | Returns one requirement by id, such as `claude.rule-annotations`, or what replaced it if it was retired. |
| `compare_platforms` | Sets two or more platforms' requirements side by side, grouped by topic. |
| `search_requirements` | Finds requirements matching keywords or a question, such as "privacy policy" or "test cases". |
| `list_platform_changes` | Lists dated notes on changes to the platforms' submission rules. |

Every result has a text form and a structured form (each tool declares an output schema), and both end with the citation: the dataset's name, version, date, license and attribution. [`tools.json`](tools.json) holds the full tool definitions.

All six tools set the same hints, for the same reason: they only read a dataset bundled with the server.

| Hint | Value | Why |
|---|---|---|
| `readOnlyHint` | `true` | The tools read the bundled dataset and change nothing. |
| `destructiveHint` | `false` | Nothing is written or deleted, anywhere. |
| `openWorldHint` | `false` | The tools call no outside system; every answer comes from the bundled data. |
| `idempotentHint` | `true` | The same call returns the same answer until the data is next updated. |

## Data

`data/platform-requirements.json` is a copy of [invokary.com/data/platform-requirements.json](https://invokary.com/data/platform-requirements.json), the dataset's source of truth. A daily workflow ([`sync-data.yml`](.github/workflows/sync-data.yml)) copies a new version when there is one, after it passes validation and the tests, and the server redeploys from the commit.

- Each requirement has a stable `id`. An id is never reused; a removed requirement is listed as retired, with its replacement if there is one.
- `evidence` is `V` (verified against the platform's documentation), `3P` (third-party), `CC` (company claim) or `INF` (inference).
- `verifiedAt` is the date the requirement was last checked against its sources.

Spotted a requirement that is out of date? Open an issue with the platform page that says otherwise, or write to hello@invokary.com.

## Privacy

The server has no accounts and sets no cookies. For each request it records the method, the tool name, the client name and version the client declares, the protocol version, the outcome and the response time. It never records IP addresses, user agents or tool arguments. Cloudflare processes your IP address to deliver the response and to apply a rate limit, and the server does not store it. Invokary's privacy notice is at [invokary.com/legal/privacy](https://invokary.com/legal/privacy#mcp-server).

## Development

```sh
npm ci
npm test            # unit, protocol and HTTP tests, the submission test cases (evals/) and the tools.json check
npm run typecheck
npm run dev         # wrangler dev on http://127.0.0.1:8787/mcp
npm run tools:json  # regenerate tools.json after changing a tool
npm run data:sync   # refresh the dataset snapshot from invokary.com
```

The Worker deploys to `mcp.invokary.com` through Cloudflare Workers Builds on every push to `main`, so no Cloudflare credentials live in this repository.

## License

The code is under the [MIT License](LICENSE). The data in `data/` is under [CC BY 4.0](data/README.md): credit Invokary and link to https://invokary.com/platforms.

Invokary is an independent studio and is not affiliated with Anthropic, OpenAI or Anysphere. Claude, ChatGPT and Cursor are trademarks of their respective owners.
