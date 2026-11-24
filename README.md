# @delv-tools/mcp

Search [delv.tools](https://delv.tools) from any MCP client: Claude Desktop, Claude Code, Cursor, Cline, Zed and others.

Delv is a directory of AI tools, MCP servers, Agent Skills and agents. This server lets your agent look things up there without opening the site. It runs on your machine, reads Delv's public API, and needs no account or API key.

## Use it without installing anything

Delv also runs this server for you. Add this address as a remote MCP server (streamable HTTP, no sign-in):

```
https://mcp.delv.tools/mcp
```

In Claude Code:

```
claude mcp add --transport http delv https://mcp.delv.tools/mcp
```

It has the same tools as the package below, is read-only, and allows 60 requests a minute.

## Install

Add this to your client's MCP config (for Claude Desktop, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "delv": {
      "command": "npx",
      "args": ["-y", "@delv-tools/mcp"]
    }
  }
}
```

In Claude Code:

```
claude mcp add delv -- npx -y @delv-tools/mcp
```

## Tools

| Tool                 | What it does                                                                        |
| -------------------- | ----------------------------------------------------------------------------------- |
| `search_tools`       | Search AI tools (2,000+ listings) by keyword, category or pricing, best match first  |
| `get_tool`           | Full listing for one AI tool: what it does, pricing details, strengths, alternatives |
| `search_mcps`        | Search MCP servers by keyword, category or supported client                          |
| `get_mcp`            | Full listing for one MCP server: install command, config, strengths, things to check |
| `search_skills`      | Search Agent Skills                                                                  |
| `search_agents`      | Search autonomous agents                                                             |
| `search_mcp_clients` | Search the clients that support MCP                                                  |
| `get_safety`         | Delv's safety notes and grade for a listing                                          |
| `get_compatibility`  | Delv's record for a server and client pair, or what the server's listing claims      |
| `get_health`         | Repository activity for a listing: last commit, status, whether it is archived       |
| `get_pulse`          | Delv Pulse, an archive of AI news summaries (it stopped publishing in May 2026)      |

All eleven are read-only.

## Good to know

- It only returns what is listed on Delv.
- Listings are drafted with AI from each maker's own published material and approved before they go live. They are not hands-on tests, and each full listing says how it was made and when it was last checked.
- Safety notes and grades are drafted with AI from public information. They are not a security audit.
- Repository activity is read from GitHub and dated. A server whose maintainers have archived it is returned last in a search, with a notice.
- A compatibility answer says whether it is Delv's record or only what the server's own listing claims.
- Something wrong in a listing? Email hello@delv.tools.

## Example prompts

> Find an MCP server for querying Postgres.
>
> Show me AI tools for video editing with a free plan.
>
> Does the Supabase MCP server work with Cursor?

## Config

One optional environment variable:

- `DELV_API_URL`: use a different API base (default `https://delv.tools`).

## Licence

MIT.
