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

Requires Chrome with WebMCP support (see [Setup](#setup) below).

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

## What It Does

Instead of manually clicking through a government website to find meeting dates, agenda items, and legislation, you ask a question in plain English. The AI reads the page through structured tools, chains multiple lookups together, and returns a complete answer in seconds — with real data from the live site, not a hallucinated guess.

| Without WebMCP | With WebMCP |
|---|---|
| Click calendar → click meeting → scroll → find PDF | "What's on the agenda for Tuesday?" |
| One lookup at a time, across multiple pages | AI chains 3+ tools in a single pass |
| You need to know where things are on the site | Describe what you want in plain language |
| Data stays trapped in the webpage | Data comes back structured and linked |

The extension doesn't replace the website — it works **on** the website. It doesn't store or cache data. It doesn't require the government to change anything. It reads what's already public.

## Setup

### Prerequisites

- **Chrome** (version 133+) with WebMCP support. If your Chrome version doesn't have native WebMCP support yet, enable the flag at `chrome://flags/#enable-webmcp-testing` and relaunch.
- **A Gemini API key** — get one free at [aistudio.google.com](https://aistudio.google.com/apikey). The testing interface uses Gemini as the AI model.

### Install the extension

1. Clone or download this repo
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked** and select the `chrome-extension/` directory
5. You should see "CivicWork WebMCP" appear in your extensions list

### Install the testing tool

6. Install **[WebMCP - Model Context Tool Inspector](https://chromewebstore.google.com/detail/webmcp-model-context-tool/gbpdfapgefenggkahomfgkhfehlcenpd)** from the Chrome Web Store — this is Google's tool for interacting with WebMCP tools
7. Open the inspector (click its icon in the toolbar) and click **Set Gemini API Key** to enter your key

### Try it

8. Navigate to any Legistar site (e.g., `countyofkane.legistar.com/Calendar.aspx`)
9. Open the WebMCP Inspector — you should see 7 tools listed under "WebMCP Tools"
10. Type a question in the **User Prompt** box and click **Send**

Try: *"What meetings are coming up this week? Get the agenda for the earliest one."*

The AI will call your tools, fetch live data from the page, and return a structured answer.

### Notes

- The CivicWork WebMCP extension appears **greyed out** in Chrome's extension menu — this is normal. It's a content-script-only extension with no popup UI. It works silently in the background.
- If you see "No tools registered" in the inspector, **refresh the Legistar/Municode page**. The tools re-register on each page load.
- Between test runs, refresh the page to re-establish the tool connection.

## Usage with a WebMCP-compatible agent

The Chrome extension is one way to use these tools. You can also point any WebMCP-compatible agent at the config files in `configs/`. The `_navigation` blocks in each tool definition contain the URLs, selectors, and API endpoints the agent needs.

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
