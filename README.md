# Municipal WebMCP

WebMCP configurations and browser tools for municipal governance platforms. Gives AI agents structured access to public legislative data — meetings, legislation, codified law — across hundreds of municipalities.

Built by [CivicWork, Inc.](https://civicwork.ai) — open-source AI infrastructure for local government.

## What's Here

### WebMCP Configs (`configs/`)

Declarative tool definitions that describe how to navigate and extract data from municipal platforms. These configs are designed for any WebMCP-compatible agent — they document the URL patterns, DOM selectors, and API endpoints needed to interact with each platform.

**[Legistar](configs/legistar-webmcp-config.json)** — 7 tools for Granicus Legistar, used by hundreds of municipalities for legislative management:
- List upcoming meetings from the calendar
- Get meeting detail with full agenda items, votes, and document links
- Search legislation (ordinances, resolutions, motions)
- Get legislation detail with vote history, attachments, and full text
- List elected officials and office members
- List departments and committees
- Construct direct download URLs for agendas, minutes, and attachments

Parameterized by municipality subdomain — swap `{municipality}` to target any Legistar deployment (e.g., `chicago`, `countyofkane`, `kansascity`).

**[Municode](configs/municode-webmcp-config.json)** — 8 tools for MunicodeNEXT (CivicPlus), the largest collection of codified municipal law in the United States (3,300+ codes):
- List municipalities in a state
- Browse table of contents (document tree)
- Get full section content (ordinance text)
- Search within a municipality's code
- Cross-municipality search (find how other cities handle a topic)
- Get internal client/product/job identifiers
- Get ordinance history (OrdBank/OrdLink)
- Compare code versions across supplements (CodeBank)

Includes both browser-based SPA navigation and direct REST API endpoints.

### Chrome Extension (`chrome-extension/`)

A Manifest V3 Chrome extension that registers WebMCP tools directly in the browser using the `navigator.modelContext` imperative API. When you visit a Legistar or Municode page, the extension automatically makes structured tools available to browser AI agents.

- **legistar.js** — 7 tools, uses same-origin fetch to parse server-rendered ASP.NET pages
- **municode.js** — 5 tools, uses the public Municode REST API (`api.municode.com`)

Requires the WebMCP flag enabled at `chrome://flags/#enable-webmcp-testing`.

### Documentation (`docs/`)

**[Legistar Site Analysis](docs/legistar-site-analysis.md)** — Technical deep dive into the Legistar platform architecture: ASP.NET WebForms structure, Telerik RadGrid pagination, URL patterns, DOM selectors, and observations for agent design. Based on live inspection of `countyofkane.legistar.com`.

## How the Platforms Work Together

Legistar and Municode cover the full lifecycle of municipal law:

1. A proposed ordinance appears on a **Legistar** agenda
2. It moves through committees (tracked via Legistar vote history)
3. If adopted, the ordinance is codified into **Municode**
4. OrdLink in Municode links back to the original meeting
5. CodeBank preserves previous versions for comparison

An agent with both configs can follow an ordinance from introduction through adoption to codification — or start from codified law and trace back to the meeting where it was discussed.

## Usage

### With a WebMCP-compatible agent

Point your agent at the config files. The `_navigation` blocks in each tool definition contain the URLs, selectors, and API endpoints the agent needs.

### With the Chrome extension

1. Clone this repo
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `chrome-extension/` directory
5. Enable `chrome://flags/#enable-webmcp-testing`
6. Navigate to any `*.legistar.com` or `library.municode.com` page

### Known municipalities

**Legistar** — Hundreds of deployments. Common subdomains include: `chicago`, `countyofkane`, `kansascity`, `kingcounty`, `lakecounty`, `madison`, `oregon-city`.

**Municode** — 3,300+ codes. Browse by state at `library.municode.com/{state_abbr}` or use the `municode_list_municipalities` tool.

## Why This Exists

Municipal data is public, but it's locked behind platforms that weren't designed for programmatic access. Staff spend time manually looking things up across multiple systems. AI tools can't help if they can't reach the data.

These WebMCP configs make public legislative data accessible to AI agents using open standards — no custom APIs, no vendor agreements, no authentication required. Public data should be easy to access programmatically, not just through a web browser.

## Related

- [CivicWork](https://civicwork.ai) — open-source AI infrastructure for local government
- [CivicWork GitHub](https://github.com/civicwork) — Coda MCP Server, Municipal Plugin, and more

## License

Apache 2.0 — see [LICENSE](LICENSE).
