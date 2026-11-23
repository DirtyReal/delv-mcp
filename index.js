#!/usr/bin/env node
// ============================================
// @delv-tools/mcp: MCP server for delv.tools
//
// Exposes the delv.tools directory to any MCP-compatible host so agents can
// answer "what's a good MCP for databases?" with real editorial picks.
//
// Usage (typical):
//   Add to your Claude Desktop config:
//   {
//     "mcpServers": {
//       "delv": { "command": "npx", "args": ["-y", "@delv-tools/mcp"] }
//     }
//   }
//
// Env (optional):
//   DELV_API_URL  - override the API base (default: https://delv.tools)
// ============================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const API = process.env.DELV_API_URL || 'https://delv.tools';
const UA = '@delv-tools/mcp/0.1.0';

async function fetchJson(path, params = {}) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Delv API ${path} returned ${res.status}`);
  }
  return res.json();
}

// ---------- Tool definitions ----------

const TOOLS = [
  {
    name: 'search_tools',
    description:
      'Search the delv.tools AI tools directory (2,000+ tools) for apps, platforms, and services. Use when the user asks about AI apps, SaaS tools, or products. Returns matching listings with short descriptions and links.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms (name, description, or tag). Optional if category is provided.' },
        category: {
          type: 'string',
          description: 'Restrict to a category slug.',
          enum: ['ai-writing', 'ai-image-design', 'ai-video-audio', 'ai-code-dev', 'ai-marketing', 'ai-productivity', 'ai-business', 'ai-research'],
        },
        limit: { type: 'number', description: 'Max results (default 10, max 50).', default: 10 },
      },
      required: [],
    },
  },
  {
    name: 'search_mcps',
    description:
      'Search delv.tools MCP server directory. Use when the user asks about MCP servers, Model Context Protocol, or agent tooling. Returns editorial reviews with install commands and host compatibility.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms (optional if category/host filter given).' },
        category: {
          type: 'string',
          description: 'MCP category filter.',
          enum: ['FILESYSTEM', 'DATABASE', 'SEARCH', 'DEV_TOOLS', 'PRODUCTIVITY', 'BROWSER', 'COMMUNICATIONS', 'CLOUD_INFRA', 'DATA_FETCH', 'MEMORY', 'INTEGRATION', 'UTILITY'],
        },
        host: {
          type: 'string',
          description: 'Only return MCPs compatible with this host.',
          enum: ['CLAUDE_DESKTOP', 'CLAUDE_CODE', 'CURSOR', 'WINDSURF', 'VSCODE', 'CLINE', 'ZED', 'CODEX'],
        },
        official_only: { type: 'boolean', description: 'Only show official (Anthropic or vendor) MCPs.', default: false },
        limit: { type: 'number', description: 'Max results (default 10, max 50).', default: 10 },
      },
      required: [],
    },
  },
  {
    name: 'get_mcp',
    description: 'Get full details for a single MCP server by slug, including editorial review, install command, config snippet, pros, cons, and compatibility.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The MCP slug (e.g. "filesystem", "github", "postgres").' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'search_skills',
    description:
      'Search delv.tools Agent Skills directory (Anthropic Skills and community bundles). Use when the user asks about Skills, document generation, or extending agent capabilities.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms.' },
        category: {
          type: 'string',
          enum: ['CODING', 'WRITING', 'RESEARCH', 'DATA', 'DOCUMENTS', 'CREATIVE', 'WORKFLOW', 'INTEGRATION', 'SPECIALIZED'],
        },
        limit: { type: 'number', default: 10 },
      },
      required: [],
    },
  },
  {
    name: 'search_agents',
    description:
      'Search delv.tools autonomous AI agents directory (Devin, Manus, Claude Code, v0, Bolt, Lovable, ChatGPT Agent, etc). Use when the user asks about autonomous coding agents, no-code app builders, research agents, or "what should I use to build X automatically".',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        kind: {
          type: 'string',
          enum: ['CODING', 'GENERAL_ASSISTANT', 'RESEARCH', 'BROWSER', 'NO_CODE_BUILDER', 'DATA_ANALYST', 'TASK_AUTOMATION', 'CREATIVE'],
        },
        limit: { type: 'number', default: 10 },
      },
      required: [],
    },
  },
  {
    name: 'search_mcp_clients',
    description:
      'Search delv.tools MCP clients directory - the AI hosts that support MCP (Claude Desktop, Cursor, Windsurf, Cline, Zed, Continue, Codex). Use when the user asks which AI host to use, or about MCP host compatibility.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        kind: { type: 'string', enum: ['IDE', 'CHAT_APP', 'CLI', 'FRAMEWORK', 'LIBRARY', 'PLATFORM'] },
        limit: { type: 'number', default: 10 },
      },
      required: [],
    },
  },
  {
    name: 'get_pulse',
    description:
      "Fetch stories from Delv Pulse, Delv's archive of AI news (model releases, MCP servers, Skills, developer tools). Pulse is paused, so it holds no new stories at present. Use when the user asks for Delv Pulse or for what it covered in a past period.",
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Narrow to a specific topic.',
          enum: ['MODELS', 'MCP', 'SKILLS', 'TOOLS', 'RESEARCH', 'AGENTS', 'INFRA', 'NEWS'],
        },
        since_hours: { type: 'number', description: 'How far back to look, in hours (default 168 = 1 week, max 720).', default: 168 },
        limit: { type: 'number', default: 10 },
      },
      required: [],
    },
  },
  {
    name: 'get_tool',
    description: 'Get full details for a single AI tool by slug, including full description, pros/cons, pricing, and editorial review.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The tool slug (e.g. "chatgpt", "midjourney", "cursor").' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'get_safety',
    description:
      "Fetch Delv's safety grade (A+ through F) for an MCP server, Agent Skill, autonomous Agent, or MCP Client. Grade reflects maintainer legitimacy, permission scope, supply chain, transparency, and incident history. Use when the user asks how safe a listing is.",
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['MCP', 'SKILL', 'AGENT', 'CLIENT'], description: 'Which catalogue the slug belongs to.' },
        slug: { type: 'string', description: 'The item slug (e.g. "filesystem", "devin").' },
      },
      required: ['type', 'slug'],
    },
  },
  {
    name: 'get_compatibility',
    description:
      'Check whether a given MCP server is known to work with a given MCP client (Claude Desktop, Cursor, Cline, Windsurf, Zed, Continue, etc). Returns status (WORKS / PARTIAL / BROKEN / UNTESTED), notes, tested date, and source.',
    inputSchema: {
      type: 'object',
      properties: {
        server: { type: 'string', description: 'MCP server slug (e.g. "filesystem").' },
        client: { type: 'string', description: 'MCP client slug (e.g. "claude-desktop", "cursor").' },
      },
      required: ['server', 'client'],
    },
  },
  {
    name: 'get_health',
    description:
      "Fetch the maintenance health score for an MCP server or autonomous Agent: last commit date, open issues, activity status (ACTIVE / SLOW / STALE / ABANDONED). Use when advising a user whether a listing is actively maintained before recommending it.",
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['MCP', 'AGENT', 'SKILL', 'CLIENT'] },
        slug: { type: 'string' },
      },
      required: ['type', 'slug'],
    },
  },
];

// A name to show a person, and what kind of tool each one is. Every tool here only reads
// Delv's own catalogue: nothing is written and nothing outside Delv is reached.
const TITLES = {
  search_tools: 'Search AI tools',
  get_tool: 'Get an AI tool listing',
  search_mcps: 'Search MCP servers',
  get_mcp: 'Get an MCP server listing',
  search_skills: 'Search Agent Skills',
  search_agents: 'Search AI agents',
  search_mcp_clients: 'Search MCP clients',
  get_safety: 'Get a safety grade',
  get_compatibility: 'Check server and client compatibility',
  get_health: 'Get repository health',
  get_pulse: 'Get Delv Pulse stories',
};
for (const tool of TOOLS) {
  tool.title = TITLES[tool.name];
  tool.annotations = { title: tool.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
}

// ---------- Response formatting ----------

function formatTool(t) {
  return {
    name: t.title,
    slug: t.slug,
    description: t.shortDesc,
    category: t.category?.name,
    subcategory: t.subcategory?.name,
    pricing: t.pricingType,
    rating: t.averageRating,
    featured: t.isFeatured,
    url: `https://delv.tools/tool/${t.slug}`,
    externalUrl: t.externalUrl,
  };
}

function formatMcp(m) {
  return {
    name: m.name,
    slug: m.slug,
    description: m.shortDesc,
    officialness: m.officialness,
    category: m.category,
    author: m.author,
    supportedHosts: m.supportedHosts,
    installCommand: m.installCommand,
    rating: m.rating,
    featured: m.isFeatured,
    url: `https://delv.tools/mcp/${m.slug}`,
    repoUrl: m.repoUrl,
  };
}

function formatSkill(s) {
  return {
    name: s.name,
    slug: s.slug,
    description: s.shortDesc,
    category: s.category,
    author: s.author,
    rating: s.rating,
    url: `https://delv.tools/skills/${s.slug}`,
    homepageUrl: s.homepageUrl,
  };
}

function formatAgent(a) {
  return {
    name: a.name,
    slug: a.slug,
    description: a.shortDesc,
    kind: a.kind,
    author: a.author,
    platforms: a.platforms,
    pricingType: a.pricingType,
    pricingNote: a.pricingNote,
    rating: a.rating,
    featured: a.isFeatured,
    url: `https://delv.tools/agents/${a.slug}`,
    homepageUrl: a.homepageUrl,
  };
}

function formatClient(c) {
  return {
    name: c.name,
    slug: c.slug,
    description: c.shortDesc,
    kind: c.kind,
    author: c.author,
    platforms: c.platforms,
    supportsTools: c.supportsTools,
    supportsResources: c.supportsResources,
    supportsPrompts: c.supportsPrompts,
    rating: c.rating,
    featured: c.isFeatured,
    url: `https://delv.tools/mcp/clients/${c.slug}`,
    homepageUrl: c.homepageUrl,
    docsUrl: c.docsUrl,
  };
}

function formatPulse(p) {
  return {
    title: p.title,
    slug: p.slug,
    summary: p.summary,
    source: p.sourceName || p.sourceType,
    topic: p.primaryTopic,
    tags: p.tags,
    publishedAt: p.publishedAt,
    url: `https://delv.tools/pulse/${p.slug}`,
    sourceUrl: p.sourceUrl,
  };
}

// ---------- Tool handlers ----------

const handlers = {
  async search_tools({ query, category, limit = 10 }) {
    const params = {};
    if (query) params.search = query;
    // The API takes a category's slug as `categorySlug`; its `category` wants a database id,
    // which is why this filter returned nothing before 0.3.0.
    if (category) params.categorySlug = category;
    params.limit = Math.min(limit, 50);
    const tools = await fetchJson('/api/tools', params);
    return (tools || []).map(formatTool);
  },

  async search_mcps({ query, category, host, official_only, limit = 10 }) {
    const params = { q: query, category, host, limit: Math.min(limit, 50) };
    if (official_only) params.official = 'true';
    const mcps = await fetchJson('/api/mcp', params);
    return (mcps || []).map(formatMcp);
  },

  async get_mcp({ slug }) {
    const mcp = await fetchJson('/api/mcp', { slug });
    return {
      ...formatMcp(mcp),
      longDesc: mcp.longDesc,
      editorialReview: mcp.editorialReview,
      verdict: mcp.verdict,
      gettingStarted: mcp.gettingStarted,
      configSnippet: mcp.configSnippet,
      pros: mcp.pros,
      cons: mcp.cons,
      envVars: mcp.envVars,
      useCases: mcp.useCases,
    };
  },

  async search_skills({ query, category, limit = 10 }) {
    const params = { q: query, category, limit: Math.min(limit, 50) };
    const skills = await fetchJson('/api/skills', params);
    return (skills || []).map(formatSkill);
  },

  async search_agents({ query, kind, limit = 10 }) {
    const params = { q: query, kind, limit: Math.min(limit, 50) };
    const agents = await fetchJson('/api/agents', params);
    return (agents || []).map(formatAgent);
  },

  async search_mcp_clients({ query, kind, limit = 10 }) {
    const params = { q: query, kind, limit: Math.min(limit, 50) };
    const clients = await fetchJson('/api/mcp-clients', params);
    return (clients || []).map(formatClient);
  },

  async get_pulse({ topic, since_hours = 168, limit = 10 }) {
    const params = { topic, since_hours: Math.min(since_hours, 720), limit: Math.min(limit, 50) };
    const items = await fetchJson('/api/pulse', params);
    return (items || []).map(formatPulse);
  },

  async get_tool({ slug }) {
    const tools = await fetchJson('/api/tools', { slug });
    const tool = Array.isArray(tools) ? tools[0] : tools;
    if (!tool) return { error: 'Not found' };
    return {
      ...formatTool(tool),
      fullDesc: tool.fullDesc,
      aiSummary: tool.aiSummary,
      editorReview: tool.editorReview,
      verdict: tool.verdict,
      pros: tool.aiPros,
      cons: tool.aiCons,
      useCases: tool.aiUseCases,
      alternatives: tool.aiAlternatives,
      bestFor: tool.bestFor,
    };
  },

  async get_safety({ type, slug }) {
    const data = await fetchJson(`/api/safety/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`);
    if (!data || data.error) return { error: data?.error || 'Not found' };
    return {
      itemType: data.itemType,
      itemSlug: data.itemSlug,
      overallGrade: data.overallGrade,
      overallScore: data.overallScore,
      maintainerGrade: data.maintainerGrade,
      permissionsGrade: data.permissionsGrade,
      supplyChainGrade: data.supplyChainGrade,
      transparencyGrade: data.transparencyGrade,
      incidentGrade: data.incidentGrade,
      summary: data.summary,
      redFlags: data.redFlags,
      greenFlags: data.greenFlags,
      permissions: data.permissions,
      updatedAt: data.updatedAt,
    };
  },

  async get_compatibility({ server, client }) {
    const data = await fetchJson('/api/compatibility', { server, client });
    if (!data) return { error: 'Not found' };
    return {
      server,
      client,
      status: data.status,
      source: data.source,
      notes: data.notes,
      testedVersion: data.testedVersion,
      testedClientVer: data.testedClientVer,
      testedAt: data.testedAt,
      message: data.message,
    };
  },

  async get_health({ type, slug }) {
    const data = await fetchJson(`/api/health/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`);
    if (!data || data.error) return { error: data?.error || 'Not found' };
    return {
      slug: data.slug,
      name: data.name,
      activityStatus: data.activityStatus,
      healthScore: data.healthScore,
      lastCommitAt: data.lastCommitAt,
      openIssuesCount: data.openIssuesCount,
      healthCheckedAt: data.healthCheckedAt,
      repoUrl: data.repoUrl,
    };
  },
};

// ---------- MCP server boilerplate ----------

const server = new Server(
  { name: 'delv', version: '0.3.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = handlers[name];
  if (!handler) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    };
  }
  try {
    const result = await handler(args || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error calling ${name}: ${e.message}` }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Don't log to stdout - that's the MCP transport channel. stderr only.
  console.error('delv-mcp listening on stdio');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
