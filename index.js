#!/usr/bin/env node
// ============================================
// @delv-tools/mcp: MCP server for delv.tools
//
// Lets any MCP client search Delv's directory of AI tools, MCP servers, Agent Skills,
// agents and MCP clients, and read its safety notes, compatibility records and repository
// activity. Read-only: it only reads Delv's public API.
//
// Usage (typical): add to your MCP client's config
//   {
//     "mcpServers": {
//       "delv": { "command": "npx", "args": ["-y", "@delv-tools/mcp"] }
//     }
//   }
// Or skip the install and add the hosted server by address: https://mcp.delv.tools/mcp
//
// Env (optional):
//   DELV_API_URL  - override the API base (default: https://delv.tools)
//
// This file is written by a script from the hosted server's source, so the two offer the
// same tools word for word. Change the tools there, not here.
// ============================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const API = process.env.DELV_API_URL || 'https://delv.tools'
const UA = '@delv-tools/mcp/0.4.1'
const TIMEOUT_MS = 15000

// The API answered, but not with 200. The status travels with the error so a tool can tell
// "there is no such listing" (404) from a fault, and say something useful about it.
class ApiStatusError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function fetchJson(path, params = {}) {
  const url = new URL(`${API}${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    url.searchParams.set(k, String(v))
  }
  let res
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new Error(`Delv API ${path} could not be reached`)
  }
  if (!res.ok) throw new ApiStatusError(`Delv API ${path} returned ${res.status}`, res.status)
  return res.json()
}

// How a write-up on Delv was made, said next to the write-up itself.
//
// A listing that was checked against its maker's own site, documentation or README in the
// last four months says so. One that was not (the site would not load, or the check is old)
// only says what is certainly true of every listing: nobody here tried the product.
// Change these lines only if the method changes.
const CHECK_SHOWN_FOR_DAYS = 120;
function reviewBasis(lastVerified) {
    if (lastVerified) {
        const age = Date.now() - new Date(lastVerified).getTime();
        if (age >= 0 && age <= CHECK_SHOWN_FOR_DAYS * 24 * 60 * 60 * 1000) {
            return "Written from the maker's own published material. Not a hands-on test.";
        }
    }
    return 'Not a hands-on test.';
}

// ---------- Allowed values (also the enums in the schemas) ----------
const TOOL_CATEGORIES = ['ai-writing', 'ai-image-design', 'ai-video-audio', 'ai-code-dev', 'ai-marketing', 'ai-productivity', 'ai-business', 'ai-research'];
const PRICING_TYPES = ['FREE', 'FREEMIUM', 'PAID', 'ENTERPRISE'];
const MCP_CATEGORIES = ['FILESYSTEM', 'DATABASE', 'SEARCH', 'DEV_TOOLS', 'PRODUCTIVITY', 'BROWSER', 'COMMUNICATIONS', 'CLOUD_INFRA', 'DATA_FETCH', 'MEMORY', 'INTEGRATION', 'UTILITY'];
const MCP_HOSTS = ['CLAUDE_DESKTOP', 'CLAUDE_CODE', 'CURSOR', 'WINDSURF', 'VSCODE', 'CLINE', 'ZED', 'CODEX'];
const SKILL_CATEGORIES = ['CODING', 'WRITING', 'RESEARCH', 'DATA', 'DOCUMENTS', 'CREATIVE', 'WORKFLOW', 'INTEGRATION', 'SPECIALIZED'];
const AGENT_KINDS = ['CODING', 'GENERAL_ASSISTANT', 'RESEARCH', 'BROWSER', 'NO_CODE_BUILDER', 'DATA_ANALYST', 'TASK_AUTOMATION', 'CREATIVE'];
const CLIENT_KINDS = ['IDE', 'CHAT_APP', 'CLI', 'FRAMEWORK', 'LIBRARY', 'PLATFORM'];
const PULSE_TOPICS = ['MODELS', 'MCP', 'SKILLS', 'TOOLS', 'RESEARCH', 'AGENTS', 'INFRA', 'NEWS'];
const SAFETY_TYPES = ['MCP', 'SKILL', 'AGENT', 'CLIENT'];
const HEALTH_TYPES = ['MCP', 'AGENT', 'SKILL', 'CLIENT'];
const LIMIT = { type: 'integer', description: 'How many results to return (default 10, at most 50).', default: 10, minimum: 1, maximum: 50 };
// ---------- Tool definitions (as in the npm package, version 0.4.0) ----------
//
// A description says what the tool reads and what comes back, in plain words. It carries no
// instruction to the assistant beyond when the tool applies, and makes no claim the answer
// does not keep (the directories check both).
const TOOLS = [
    {
        name: 'search_tools',
        description: "Search Delv's directory of AI tools (apps, platforms and services, more than 2,000 listed) by keyword, category or pricing. Returns the matching listings, best match first, each with a one-line description, its category, its pricing type and a link to the full listing. For questions about AI apps and products.",
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What to look for: a name, a job or a few keywords, such as "video editing" or "transcription". Optional when a category is given.' },
                category: { type: 'string', description: 'Only tools filed under this category.', enum: TOOL_CATEGORIES },
                pricing: { type: 'string', description: 'Only tools with this pricing type. FREEMIUM means a free plan or a free allowance that renews.', enum: PRICING_TYPES },
                has_free_plan: { type: 'boolean', description: 'Only tools that can be used without paying (pricing type FREE or FREEMIUM).', default: false },
                limit: LIMIT,
            },
            required: [],
        },
    },
    {
        name: 'search_mcps',
        description: "Search Delv's directory of MCP servers by keyword, category or supported client. Returns the matching listings, best match first, each with a one-line description, who maintains it, its install command, the clients it lists as supported and how recently its repository changed. Servers archived by their maintainers come last and say so. For questions about MCP servers and connecting assistants to other software.",
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What to look for: a product or a job, such as "postgres" or "browser automation". Optional when a category or host is given.' },
                category: { type: 'string', description: 'Only servers in this category.', enum: MCP_CATEGORIES },
                host: { type: 'string', description: 'Only servers whose listing names this client as supported.', enum: MCP_HOSTS },
                official_only: { type: 'boolean', description: "Only servers maintained by the product's own maker or by Anthropic.", default: false },
                limit: LIMIT,
            },
            required: [],
        },
    },
    {
        name: 'get_mcp',
        description: "Get one MCP server's full listing from Delv by its slug: the write-up, getting-started steps, install command, config snippet, environment variables, strengths, things to check, and how recently its repository changed. Says how the write-up was made and whether the server has been archived.",
        inputSchema: {
            type: 'object',
            properties: {
                slug: { type: 'string', description: 'The server\'s slug as returned by search_mcps, such as "filesystem" or "supabase".' },
            },
            required: ['slug'],
        },
    },
    {
        name: 'search_skills',
        description: "Search Delv's directory of Agent Skills (Anthropic's own and community collections) by keyword or category. Returns the matching listings, best match first, each with a one-line description, its author and links. For questions about Skills and extending what an agent can do.",
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What to look for, such as "pdf" or "spreadsheets". Optional when a category is given.' },
                category: { type: 'string', description: 'Only skills in this category.', enum: SKILL_CATEGORIES },
                limit: LIMIT,
            },
            required: [],
        },
    },
    {
        name: 'search_agents',
        description: "Search Delv's directory of autonomous AI agents (coding agents, app builders, research and browser agents) by keyword or kind. Returns the matching listings, best match first, each with a one-line description, its maker, the platforms it runs on and its pricing type. For questions about agents that carry out a task by themselves.",
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What to look for: a name or a job, such as "app builder". Optional when a kind is given.' },
                kind: { type: 'string', description: 'Only agents of this kind.', enum: AGENT_KINDS },
                limit: LIMIT,
            },
            required: [],
        },
    },
    {
        name: 'search_mcp_clients',
        description: "Search Delv's directory of MCP clients: the editors, chat apps, command-line tools and frameworks that can connect to MCP servers. Returns the matching listings, best match first, each with a one-line description and which parts of MCP it supports (tools, resources, prompts). For questions about which app to use MCP servers from.",
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What to look for, such as "cursor" or "claude". Optional when a kind is given.' },
                kind: { type: 'string', description: 'Only clients of this kind.', enum: CLIENT_KINDS },
                limit: LIMIT,
            },
            required: [],
        },
    },
    {
        name: 'get_pulse',
        description: "Read Delv Pulse, Delv's archive of short AI news summaries (model releases, MCP servers, Skills, developer tools). Pulse stopped publishing in May 2026, so this returns the most recent stories on file, newest first, each with its date and a link to the source. It is an archive, not current news.",
        inputSchema: {
            type: 'object',
            properties: {
                topic: { type: 'string', description: 'Only stories on this topic.', enum: PULSE_TOPICS },
                limit: LIMIT,
            },
            required: [],
        },
    },
    {
        name: 'get_tool',
        description: "Get one AI tool's full listing from Delv by its slug: what it does, its pricing type and pricing details, strengths, things to check, use cases, alternatives and the write-up. Says how the write-up was made and whether the tool has been discontinued.",
        inputSchema: {
            type: 'object',
            properties: {
                slug: { type: 'string', description: 'The tool\'s slug as returned by search_tools, such as "cursor" or "midjourney".' },
            },
            required: ['slug'],
        },
    },
    {
        name: 'get_safety',
        description: "Get Delv's safety notes for an MCP server, Agent Skill, agent or MCP client: an overall grade (A+ to F), scores for maintainer, permissions, supply chain, transparency and incident history, the red and green flags behind the grade, the permissions it needs and the date the notes were written. The notes were drafted with AI from public information. They are not a security audit.",
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string', enum: SAFETY_TYPES, description: 'Which directory the slug belongs to.' },
                slug: { type: 'string', description: 'The listing\'s slug as returned by a search, such as "filesystem".' },
            },
            required: ['type', 'slug'],
        },
    },
    {
        name: 'get_compatibility',
        description: "Check an MCP server against an MCP client. Returns Delv's record for the pair when there is one (WORKS, PARTIAL or BROKEN, where the record comes from, and notes and a test date when known). When there is no record, says whether the server's own listing names that client as supported, which is a claim and not a test.",
        inputSchema: {
            type: 'object',
            properties: {
                server: { type: 'string', description: 'The MCP server\'s slug as returned by search_mcps, such as "filesystem".' },
                client: { type: 'string', description: 'The MCP client\'s slug as returned by search_mcp_clients, such as "claude-desktop" or "cursor".' },
            },
            required: ['server', 'client'],
        },
    },
    {
        name: 'get_health',
        description: "Get how actively an MCP server, Agent Skill, agent or MCP client is maintained, read from its public repository: the date of the last commit, an activity status by that date (ACTIVE under 30 days, SLOW under 90, STALE under 180, ABANDONED beyond), open issues, whether its maintainers have archived it, and the date Delv last looked. A listing with no public repository has no figures.",
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string', enum: HEALTH_TYPES, description: 'Which directory the slug belongs to.' },
                slug: { type: 'string', description: 'The listing\'s slug as returned by a search, such as "github-official".' },
            },
            required: ['type', 'slug'],
        },
    },
];
// A name to show a person, and what kind of tool each one is. Every tool here only reads
// Delv's own catalogue: nothing is written and nothing outside Delv is reached. The
// directories that list MCP servers for AI assistants require both on every tool.
const TITLES = {
    search_tools: 'Search AI tools',
    get_tool: 'Get an AI tool listing',
    search_mcps: 'Search MCP servers',
    get_mcp: 'Get an MCP server listing',
    search_skills: 'Search Agent Skills',
    search_agents: 'Search AI agents',
    search_mcp_clients: 'Search MCP clients',
    get_safety: 'Get safety notes',
    get_compatibility: 'Check server and client compatibility',
    get_health: 'Get repository activity',
    get_pulse: 'Read the Delv Pulse archive',
};
for (const tool of TOOLS) {
    const title = TITLES[tool.name];
    if (!title)
        throw new Error(`the tool ${tool.name} has no title`);
    tool.title = title;
    tool.annotations = { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
}
// The same rule as [[tool:slug]] links: nothing that could reshape an address.
const SLUG = /^[a-z0-9-]{1,120}$/;
const MAX_TEXT = 200;
const isBlank = (v) => v === undefined || v === null || v === '';
// A slug, trimmed and lower-cased first because models often send "Cursor".
function slugArg(args, key) {
    const v = args[key];
    const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
    if (!SLUG.test(s)) {
        throw new Error(`${key} must be a slug: lowercase letters, digits and hyphens (1 to 120 characters). A search returns the slug of each listing.`);
    }
    return s;
}
// Free text for a search. Never echoed back in an error.
function textArg(args, key) {
    const v = args[key];
    if (isBlank(v))
        return undefined;
    if (typeof v !== 'string')
        throw new Error(`${key} must be text`);
    const s = v.trim();
    if (s.length > MAX_TEXT)
        throw new Error(`${key} must be ${MAX_TEXT} characters or fewer`);
    return s || undefined;
}
// One of the listed values, matched without regard to case. The API would answer 500 to
// anything else, because it hands the value straight to the database as an enum.
function choiceArg(args, key, allowed, required = false) {
    const v = args[key];
    if (isBlank(v)) {
        if (required)
            throw new Error(`${key} is required: one of ${allowed.join(', ')}`);
        return undefined;
    }
    const match = typeof v === 'string' ? allowed.find((a) => a.toLowerCase() === v.trim().toLowerCase()) : undefined;
    if (!match)
        throw new Error(`${key} must be one of ${allowed.join(', ')}`);
    return match;
}
// A whole number between 1 and max; anything unreadable falls back to the default.
function countArg(args, key, fallback, max) {
    const v = args[key];
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(Math.max(Math.floor(n), 1), max);
}
const flagArg = (args, key) => args[key] === true || args[key] === 'true';
// ---------- Answers that are sentences ----------
// A search that matched nothing, or a listing that does not exist. Both are ordinary
// outcomes, so they come back as a sentence the assistant can act on.
class Plain extends Error {
}
function noMatches(what, example) {
    throw new Plain(`Nothing in Delv's directory of ${what} matched that search. Try one or two plain keywords (${example}), or leave the query out and use a filter.`);
}
function noSuchListing(what, slug, searchTool) {
    throw new Plain(`Delv has no ${what} listed under the slug "${slug}". Call ${searchTool} to find the right slug.`);
}
// The API's answer, or null when it says there is no such thing (404).
async function fetchOrNull(path, params = {}) {
    try {
        return await fetchJson(path, params);
    }
    catch (e) {
        if (e instanceof ApiStatusError && e.status === 404)
            return null;
        throw e;
    }
}
const asRow = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const asList = (v) => (Array.isArray(v) ? v.map(asRow) : []);
const nameOf = (v) => asRow(v).name;
const day = (v) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);
// The same day as people write it ("18 April 2026"), for wording an assistant will repeat.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDay = (v) => {
    const [year, month, date] = (day(v) ?? '').split('-').map(Number);
    return year && MONTHS[month - 1] && date ? `${date} ${MONTHS[month - 1]} ${year}` : null;
};
const listOf = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
// The tag that marks a listing whose maintainers archived it (src/lib/mcp-search.ts).
const isArchived = (row) => listOf(row.tags).includes('archived');
const ARCHIVED_NOTICE = 'Archived by its maintainers and no longer maintained.';
// How recently the repository changed, in the words the site uses, with the dates.
function repositoryOf(row) {
    if (!row.repoUrl)
        return { status: 'NO_PUBLIC_REPOSITORY' };
    return {
        status: isArchived(row) ? 'ARCHIVED' : row.activityStatus,
        lastCommit: day(row.lastCommitAt),
        checked: day(row.healthCheckedAt),
    };
}
function formatTool(t) {
    const discontinued = t.status === 'DISCONTINUED';
    return {
        name: t.title,
        slug: t.slug,
        description: t.shortDesc,
        ...(discontinued ? { notice: 'Discontinued: this tool has closed or is no longer on sale.' } : {}),
        category: nameOf(t.category),
        subcategory: nameOf(t.subcategory),
        pricing: t.pricingType,
        ...(typeof t.averageRating === 'number' ? { visitorRating: t.averageRating } : {}),
        url: `https://delv.tools/tool/${t.slug}`,
        externalUrl: t.externalUrl,
    };
}
function formatMcp(m) {
    return {
        name: m.name,
        slug: m.slug,
        description: m.shortDesc,
        ...(isArchived(m) ? { notice: ARCHIVED_NOTICE } : {}),
        officialness: m.officialness,
        category: m.category,
        author: m.author,
        supportedHosts: m.supportedHosts,
        installCommand: m.installCommand,
        repository: repositoryOf(m),
        url: `https://delv.tools/mcp/${m.slug}`,
        repoUrl: m.repoUrl,
    };
}
function formatSkill(s) {
    return {
        name: s.name,
        slug: s.slug,
        description: s.shortDesc,
        ...(isArchived(s) ? { notice: ARCHIVED_NOTICE } : {}),
        category: s.category,
        author: s.author,
        url: `https://delv.tools/skills/${s.slug}`,
        homepageUrl: s.homepageUrl,
    };
}
function formatAgent(a) {
    return {
        name: a.name,
        slug: a.slug,
        description: a.shortDesc,
        ...(isArchived(a) ? { notice: ARCHIVED_NOTICE } : {}),
        kind: a.kind,
        author: a.author,
        platforms: a.platforms,
        pricingType: a.pricingType,
        pricingNote: a.pricingNote,
        url: `https://delv.tools/agents/${a.slug}`,
        homepageUrl: a.homepageUrl,
    };
}
function formatClient(c) {
    return {
        name: c.name,
        slug: c.slug,
        description: c.shortDesc,
        ...(isArchived(c) ? { notice: ARCHIVED_NOTICE } : {}),
        kind: c.kind,
        author: c.author,
        platforms: c.platforms,
        supportsTools: c.supportsTools,
        supportsResources: c.supportsResources,
        supportsPrompts: c.supportsPrompts,
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
// How a write-up was made and when it was last checked against the maker's own material:
// the same line the listing's page shows under its heading.
function basisOf(row) {
    const checked = typeof row.lastVerified === 'string' ? row.lastVerified : null;
    return { basis: reviewBasis(checked), lastChecked: day(checked) };
}
const GRADES = { A_PLUS: 'A+', A: 'A', B: 'B', C: 'C', D: 'D', F: 'F', UNRATED: 'No grade' };
// The client an MCP host value stands for ("CLAUDE_DESKTOP" is the client "claude-desktop").
const hostOfClient = (slug) => MCP_HOSTS.find((h) => h.toLowerCase().replace(/_/g, '-') === slug);
const RECORD_SOURCES = {
    EDITORIAL: "Delv's own check",
    VENDOR: "the maker's documentation",
    COMMUNITY: 'reports from people using it',
    SELF_REPORTED: "the server author's own report",
};
// Every published story is older than any window worth asking for, so the archive is read
// whole: a window of twenty years, in hours.
const PULSE_ARCHIVE_HOURS = 20 * 365 * 24;
// A Map, so a tool name such as "constructor" can never reach an inherited property.
const HANDLERS = new Map([
    ['search_tools', async (args) => {
            const pricing = choiceArg(args, 'pricing', PRICING_TYPES);
            const query = textArg(args, 'query');
            const params = {
                search: query,
                // With nothing to match on, the list comes in a plain order: full write-ups first,
                // most recently checked first. The site's own "featured first" is not passed on.
                order: query ? undefined : 'established',
                // The list API reads a category slug as `categorySlug`; its `category` wants a database id.
                categorySlug: choiceArg(args, 'category', TOOL_CATEGORIES),
                pricing: pricing ?? (flagArg(args, 'has_free_plan') ? 'FREE,FREEMIUM' : undefined),
                limit: countArg(args, 'limit', 10, 50),
                // The slim rows: every field formatTool uses, without the long editorial text.
                view: 'card',
            };
            const tools = asList(await fetchJson('/api/tools', params));
            if (tools.length === 0)
                noMatches('AI tools', 'such as "video editing" or "transcription"');
            return tools.map(formatTool);
        }],
    ['search_mcps', async (args) => {
            const query = textArg(args, 'query');
            const params = {
                q: query,
                // With nothing to match on: the maker's own servers first, most recently active first.
                order: query ? undefined : 'maintained',
                category: choiceArg(args, 'category', MCP_CATEGORIES),
                host: choiceArg(args, 'host', MCP_HOSTS),
                limit: countArg(args, 'limit', 10, 50),
            };
            if (flagArg(args, 'official_only'))
                params.official = 'true';
            const mcps = asList(await fetchJson('/api/mcp', params));
            if (mcps.length === 0)
                noMatches('MCP servers', 'a product or a job, such as "postgres" or "browser"');
            return mcps.map(formatMcp);
        }],
    ['get_mcp', async (args) => {
            const slug = slugArg(args, 'slug');
            const found = await fetchOrNull('/api/mcp', { slug });
            if (!found)
                noSuchListing('MCP server', slug, 'search_mcps');
            const mcp = asRow(found);
            return {
                ...formatMcp(mcp),
                ...basisOf(mcp),
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
        }],
    ['search_skills', async (args) => {
            const params = { q: textArg(args, 'query'), category: choiceArg(args, 'category', SKILL_CATEGORIES), limit: countArg(args, 'limit', 10, 50) };
            const skills = asList(await fetchJson('/api/skills', params));
            if (skills.length === 0)
                noMatches('Agent Skills', 'such as "pdf" or "spreadsheets"');
            return skills.map(formatSkill);
        }],
    ['search_agents', async (args) => {
            const params = { q: textArg(args, 'query'), kind: choiceArg(args, 'kind', AGENT_KINDS), limit: countArg(args, 'limit', 10, 50) };
            const agents = asList(await fetchJson('/api/agents', params));
            if (agents.length === 0)
                noMatches('AI agents', 'a name or a job, such as "coding" or "app builder"');
            return agents.map(formatAgent);
        }],
    ['search_mcp_clients', async (args) => {
            const params = { q: textArg(args, 'query'), kind: choiceArg(args, 'kind', CLIENT_KINDS), limit: countArg(args, 'limit', 10, 50) };
            const clients = asList(await fetchJson('/api/mcp-clients', params));
            if (clients.length === 0)
                noMatches('MCP clients', 'such as "cursor" or "claude"');
            return clients.map(formatClient);
        }],
    ['get_pulse', async (args) => {
            const params = {
                topic: choiceArg(args, 'topic', PULSE_TOPICS),
                since_hours: PULSE_ARCHIVE_HOURS,
                limit: countArg(args, 'limit', 10, 50),
            };
            const stories = asList(await fetchJson('/api/pulse', params));
            if (stories.length === 0)
                throw new Plain('The Delv Pulse archive has no stories on that topic. Leave the topic out to read the most recent ones.');
            return {
                note: 'Delv Pulse stopped publishing in May 2026. These are the most recent stories in its archive, not current news.',
                stories: stories.map(formatPulse),
            };
        }],
    ['get_tool', async (args) => {
            const slug = slugArg(args, 'slug');
            // The list API by slug, not /api/tools/<slug>: that one also adds to the view count.
            // A tool that has closed is asked for too, so the answer can say so.
            const tools = await fetchJson('/api/tools', { slug, discontinued: 1 });
            const tool = Array.isArray(tools) ? tools[0] : tools;
            if (!tool)
                noSuchListing('AI tool', slug, 'search_tools');
            const t = asRow(tool);
            return {
                ...formatTool(t),
                pricingDetails: t.pricingDetails,
                ...basisOf(t),
                fullDesc: t.fullDesc,
                aiSummary: t.aiSummary,
                editorReview: t.editorReview,
                verdict: t.verdict,
                pros: t.aiPros,
                cons: t.aiCons,
                useCases: t.aiUseCases,
                alternatives: t.aiAlternatives,
                bestFor: t.bestFor,
            };
        }],
    ['get_safety', async (args) => {
            const type = choiceArg(args, 'type', SAFETY_TYPES, true);
            const slug = slugArg(args, 'slug');
            const raw = await fetchOrNull(`/api/safety/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`);
            if (!raw)
                throw new Plain(`Delv has no safety notes for the ${type} listing "${slug}". Check the slug with a search; not every listing has notes.`);
            const data = asRow(raw);
            const withdrawn = data.overallGrade === 'UNRATED';
            const written = data.assessedAt ?? data.updatedAt;
            const grade = GRADES[String(data.overallGrade)] ?? String(data.overallGrade);
            return {
                itemType: data.itemType,
                itemSlug: data.itemSlug,
                basis: 'Drafted with AI from public information about the project. Not a security audit, and not a test of the software.',
                writtenOn: day(written),
                // The grade never travels alone. An assistant repeats this field as it stands, and one
                // was seen giving "Delv gives it a C safety grade" with the basis line left behind
                // (24 Nov 2026), so the grade says what it is in the same phrase.
                overallGrade: withdrawn ? grade : `${grade} (from AI-drafted notes${longDay(written) ? ` of ${longDay(written)}` : ''}, not a security audit)`,
                ...(withdrawn ? {} : { overallScore: data.overallScore }),
                scores: withdrawn
                    ? undefined
                    : {
                        maintainer: data.maintainerScore,
                        permissions: data.permissionsScore,
                        supplyChain: data.supplyChainScore,
                        transparency: data.transparencyScore,
                        incidentHistory: data.incidentScore,
                    },
                summary: data.summary,
                redFlags: data.redFlags,
                greenFlags: data.greenFlags,
                permissions: data.permissions,
            };
        }],
    ['get_compatibility', async (args) => {
            const server = slugArg(args, 'server');
            const client = slugArg(args, 'client');
            const [mcpFound, clientFound] = await Promise.all([fetchOrNull('/api/mcp', { slug: server }), fetchOrNull('/api/mcp-clients', { slug: client })]);
            if (!mcpFound)
                noSuchListing('MCP server', server, 'search_mcps');
            if (!clientFound)
                noSuchListing('MCP client', client, 'search_mcp_clients');
            const mcp = asRow(mcpFound);
            const clientName = String(asRow(clientFound).name ?? client);
            const archived = isArchived(mcp) ? { notice: ARCHIVED_NOTICE } : {};
            const record = asRow(await fetchJson('/api/compatibility', { server, client }));
            if (record.status && record.status !== 'UNTESTED') {
                const source = RECORD_SOURCES[String(record.source)] ?? 'not recorded';
                return {
                    server,
                    client,
                    ...archived,
                    status: record.status,
                    basis: `Delv's record for this pair, taken from ${source}.${record.testedAt ? '' : ' No test date is recorded.'}`,
                    notes: record.notes,
                    testedServerVersion: record.testedVersion,
                    testedClientVersion: record.testedClientVer,
                    testedOn: day(record.testedAt),
                };
            }
            // No record: all Delv can say is what the server's own listing claims.
            const host = hostOfClient(client);
            const listed = Boolean(host) && listOf(mcp.supportedHosts).includes(host);
            return {
                server,
                client,
                ...archived,
                status: listed ? 'LISTED_AS_SUPPORTED' : 'NO_RECORD',
                basis: listed
                    ? `Delv has no record of this pair being tested. The server's listing names ${clientName} among the clients it supports, which is a claim and not a test.`
                    : `Delv has no record of this pair, and the server's listing does not name ${clientName} among the clients it supports. That is not evidence that it fails: any client that speaks MCP may work.`,
                supportedHosts: mcp.supportedHosts,
            };
        }],
    ['get_health', async (args) => {
            const type = choiceArg(args, 'type', HEALTH_TYPES, true);
            const slug = slugArg(args, 'slug');
            const raw = await fetchOrNull(`/api/health/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`);
            if (!raw)
                throw new Plain(`Delv has no ${type} listing under the slug "${slug}". Check the slug with a search.`);
            const data = asRow(raw);
            if (!data.repoUrl) {
                return { slug: data.slug, name: data.name, activityStatus: 'NO_PUBLIC_REPOSITORY', note: 'This listing has no public repository, so there are no activity figures for it.' };
            }
            return {
                slug: data.slug,
                name: data.name,
                ...(data.archived ? { notice: ARCHIVED_NOTICE } : {}),
                activityStatus: data.archived ? 'ARCHIVED' : data.activityStatus,
                lastCommitAt: data.lastCommitAt,
                openIssuesCount: data.openIssuesCount,
                checkedOn: day(data.healthCheckedAt),
                repoUrl: data.repoUrl,
            };
        }],
]);
/**
 * Runs one tool call and shapes the MCP result: the answer as pretty-printed JSON text, a
 * plain sentence when there is nothing to list, or `isError` with a one-line reason when
 * the call itself was wrong or something failed.
 */
async function callTool(name, args) {
    const handler = HANDLERS.get(name);
    if (!handler) {
        return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name.slice(0, 100)}` }] };
    }
    try {
        const result = await handler(args && typeof args === 'object' ? args : {});
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    catch (e) {
        if (e instanceof Plain)
            return { content: [{ type: 'text', text: e.message }] };
        const message = e instanceof Error ? e.message : 'unexpected error';
        return { isError: true, content: [{ type: 'text', text: `Error calling ${name}: ${message}` }] };
    }
}

// ---------- Server ----------

// The same version as the npm package @delv-tools/mcp, which offers the same tools.
const SERVER_INFO = {
    name: 'delv',
    title: 'Delv',
    version: '0.4.1',
    websiteUrl: 'https://delv.tools',
    // Served from the MCP server's own name, which is not behind Cloudflare: directories and
    // assistants fetch icons from data centres, which the main site's bot check turns away.
    // nginx serves the file (a copy of public/images/hotlink-ok/delv-icon-512.png).
    icons: [{ src: 'https://mcp.delv.tools/icon.png', mimeType: 'image/png', sizes: ['512x512'] }],
};
// What an assistant is told about the server as a whole when it connects. It describes the
// data and how the tools fit together. It asks for nothing and steers nothing.
const INSTRUCTIONS = [
    'Delv (delv.tools) is a directory of AI tools, MCP servers, Agent Skills, autonomous agents and MCP clients. These tools read its public listings. Nothing is written and nothing outside Delv is reached.',
    'A search returns short listings, best match first, each with a slug. Pass a slug to get_tool or get_mcp for the full listing, or to get_safety, get_health and get_compatibility for that listing.',
    'Listings are drafted with AI from each maker\'s own published material and approved before they go live. They are not hands-on tests, and each full listing says how it was made and when it was last checked. Safety notes are drafted with AI and are not an audit. Repository activity is read from GitHub and dated.',
    'A server that its maintainers have archived, or a tool that has been discontinued, is returned with a notice saying so.',
].join(' ');

const server = new Server(SERVER_INFO, { capabilities: { tools: {} }, instructions: INSTRUCTIONS })
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))
server.setRequestHandler(CallToolRequestSchema, async (request) => callTool(request.params.name, request.params.arguments))

async function main() {
  await server.connect(new StdioServerTransport())
  console.error(`@delv-tools/mcp ${SERVER_INFO.version} running on stdio (API: ${API})`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
