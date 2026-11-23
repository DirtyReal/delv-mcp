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

| Tool                 | What it does                                                        |
| -------------------- | ------------------------------------------------------------------- |
| `search_tools`       | Search AI tools (2,000+ listings across 8 categories)               |
| `get_tool`           | Full listing for one AI tool                                        |
| `search_mcps`        | Search MCP servers by category, host or who maintains them          |
| `get_mcp`            | Full listing for one MCP server: install command, config, pros, cons |
| `search_skills`      | Search Agent Skills                                                 |
| `search_agents`      | Search autonomous agents                                            |
| `search_mcp_clients` | Search the clients that support MCP                                 |
| `get_safety`         | Delv's safety grade for a listing                                   |
| `get_compatibility`  | Whether an MCP server is known to work with a given client          |
| `get_health`         | Repository activity for a listing (last commit, open issues)        |
| `get_pulse`          | Delv's AI news feed (paused, so it returns nothing new for now)     |

## Good to know

- It only returns what is listed on Delv.
- Listings are drafted with AI from each maker's own published material and approved before they go live. They are not hands-on tests.
- Something wrong in a listing? Email hello@delv.tools.

## Example prompts

> Find an MCP server for querying Postgres.
>
> Show me AI tools for video editing with a free plan.
>
> Does the GitHub MCP server work with Cursor?

## Config

One optional environment variable:

- `DELV_API_URL`: use a different API base (default `https://delv.tools`).

## Licence

MIT.
