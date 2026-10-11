# Invokary Platform Requirements

Look up what Claude, ChatGPT, Cursor and the Official MCP Registry require before they list an MCP connector or plugin. Every answer gives the requirement's sources and the date it was last checked, so you can check your own server or plugin against the rules while you build it.

## What the plugin adds

One remote MCP server, `platform-requirements`, at `https://mcp.invokary.com/mcp` (Streamable HTTP). It needs no account, key or sign-in. The plugin has no skills, hooks, commands or local code.

The server's six tools are read-only:

- `list_platforms`: the platforms covered, with each one's directory and latest check date.
- `get_platform_requirements`: one platform's requirements, optionally by topic or product surface.
- `get_requirement`: one requirement by id.
- `compare_platforms`: two or more platforms side by side.
- `search_requirements`: requirements matching keywords or a question.
- `list_platform_changes`: dated notes on changes to submission rules.

Try: "What does Claude's Connectors Directory require before it lists a connector?"

## What it sends and records

When Claude calls a tool, the request goes to `mcp.invokary.com`, run by Invokary on Cloudflare. Nothing else is contacted.

For each request the server records the method, the tool name, the client name and version the client declares, the protocol version, the outcome and the response time. It never records IP addresses, user agents or tool arguments. Cloudflare processes your IP address to deliver the response and apply a rate limit; the server does not store it. Privacy notice: https://invokary.com/legal/privacy#mcp-server

## Source and license

The server's code is at https://github.com/Invokary/platform-requirements-mcp under the MIT License. The data is Invokary's Platform Requirements dataset (https://invokary.com/platforms), under CC BY 4.0. It is a third-party source: confirm each rule with the platform's own documentation.

Invokary is an independent studio and is not affiliated with Anthropic, OpenAI or Anysphere.
