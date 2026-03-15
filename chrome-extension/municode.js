// CivicWork WebMCP — Municode Tools
// Registers WebMCP tools on library.municode.com via the imperative API.
// Tools use the Municode REST API (api.municode.com) which powers the SPA.
// CORS allows requests from library.municode.com to api.municode.com.
//
// Verified API paths and field names (Mar 2026):
//   /Clients/stateAbbr?stateAbbr=IL        → [{ ClientID, ClientName, ... }]
//   /ClientContent/{clientId}               → { codes: [{ productId, productName }], features, munidocs }
//   /Jobs/latest/{productId}                → { Id, ProductId, ... }
//   /codesToc/children?jobId&productId&nodeId → [{ Id, Heading, HasChildren, ... }]
//   /CodesContent?jobId&productId&nodeId    → { Docs: [{ Id, Title, Content (HTML), ... }], ... }
//   Search requires auth (401) — not available via public API.

(function () {
  "use strict";

  if (!navigator.modelContext) {
    console.warn(
      "[CivicWork WebMCP] navigator.modelContext not available. " +
        "Enable the WebMCP flag at chrome://flags/#enable-webmcp-testing"
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const API = "https://api.municode.com";

  async function apiGet(path) {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText} — ${path}`);
    return res.json();
  }

  function ok(data) {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  function err(message) {
    return { content: [{ type: "text", text: JSON.stringify({ error: message }) }] };
  }

  // Cache client lookups to avoid repeated API calls within a session
  const clientCache = new Map();

  async function resolveClient(state_abbr, municipality_slug) {
    const key = `${state_abbr}/${municipality_slug}`;
    if (clientCache.has(key)) return clientCache.get(key);

    // Step 1: Get client list for state (API wants uppercase state abbr)
    const stateParam = state_abbr.toUpperCase();
    const clients = await apiGet(`/Clients/stateAbbr?stateAbbr=${encodeURIComponent(stateParam)}`);

    // Match by ClientName (case-insensitive, partial match on slug-like name)
    const slugLower = municipality_slug.toLowerCase();
    const client = clients.find(
      (c) => (c.ClientName || "").toLowerCase() === slugLower
    ) || clients.find(
      (c) => (c.ClientName || "").toLowerCase().replace(/\s+/g, "-") === slugLower
    );
    if (!client) {
      throw new Error(
        `Municipality '${municipality_slug}' not found in ${state_abbr}. ` +
        `Use municode_list_municipalities to find the correct name.`
      );
    }

    const clientId = client.ClientID;
    const clientName = client.ClientName;

    // Step 2: Get products (publications)
    const content = await apiGet(`/ClientContent/${clientId}`);
    const codes = content.codes || [];
    const product = codes.find(
      (p) => (p.productName || "").toLowerCase().includes("code of ordinances")
    ) || codes[0];

    if (!product) throw new Error(`No publications found for ${clientName}`);

    const productId = product.productId;
    const productName = product.productName;

    // Step 3: Get latest job ID
    const jobInfo = await apiGet(`/Jobs/latest/${productId}`);
    const jobId = jobInfo.Id;

    const result = { clientId, clientName, productId, productName, jobId };
    clientCache.set(key, result);
    return result;
  }

  // Strip HTML tags from content for cleaner output
  function stripHtml(html) {
    if (!html) return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent.trim();
  }

  // ---------------------------------------------------------------------------
  // Tool 1: List Municipalities in a State
  // ---------------------------------------------------------------------------

  navigator.modelContext.registerTool({
    name: "municode_list_municipalities",
    description:
      "List all municipalities in a US state that have their code of ordinances " +
      "on the Municode library. Returns municipality names and client IDs. " +
      "Useful for discovering if a municipality is on Municode and finding " +
      "the correct name to use with other tools.",
    inputSchema: {
      type: "object",
      properties: {
        state_abbr: {
          type: "string",
          description: "Two-letter US state abbreviation (e.g., 'IL', 'CA', 'TX')",
        },
      },
      required: ["state_abbr"],
    },
    annotations: { readOnlyHint: true },
    execute: async ({ state_abbr }) => {
      try {
        const stateParam = state_abbr.toUpperCase();
        const clients = await apiGet(`/Clients/stateAbbr?stateAbbr=${encodeURIComponent(stateParam)}`);
        const municipalities = clients.map((c) => ({
          name: c.ClientName,
          client_id: c.ClientID,
          city: c.City,
          website: c.Website,
        }));
        return ok({
          state: stateParam,
          municipality_count: municipalities.length,
          municipalities,
        });
      } catch (e) {
        return err(`Failed to list municipalities: ${e.message}`);
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Tool 2: Browse Table of Contents
  // ---------------------------------------------------------------------------

  navigator.modelContext.registerTool({
    name: "municode_browse_table_of_contents",
    description:
      "Browse the table of contents (document tree) of a municipality's code of " +
      "ordinances. Returns section headings and IDs for navigating deeper or " +
      "retrieving full text. Omit node_id to get top-level titles/chapters.",
    inputSchema: {
      type: "object",
      properties: {
        state_abbr: {
          type: "string",
          description: "Two-letter US state abbreviation",
        },
        municipality_name: {
          type: "string",
          description: "Municipality name as it appears in Municode (e.g., 'Elgin', 'Aurora')",
        },
        node_id: {
          type: "string",
          description:
            "Optional: ID of a section to browse its children. " +
            "Omit to get the top-level table of contents. " +
            "Example: 'MUCO_TIT19ZO' for Title 19 Zoning.",
        },
      },
      required: ["state_abbr", "municipality_name"],
    },
    annotations: { readOnlyHint: true },
    execute: async ({ state_abbr, municipality_name, node_id }) => {
      try {
        const { jobId, productId, productName, clientName } = await resolveClient(
          state_abbr,
          municipality_name
        );

        const nodeParam = node_id || String(productId);
        const tree = await apiGet(
          `/codesToc/children?jobId=${jobId}&productId=${productId}&nodeId=${encodeURIComponent(nodeParam)}`
        );

        const sections = (Array.isArray(tree) ? tree : []).map((n) => ({
          id: n.Id,
          heading: n.Heading,
          has_children: n.HasChildren,
        }));

        return ok({
          municipality: clientName,
          publication: productName,
          parent_node: node_id || "(root)",
          section_count: sections.length,
          sections,
        });
      } catch (e) {
        return err(`Failed to browse TOC: ${e.message}`);
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Tool 3: Get Section Content
  // ---------------------------------------------------------------------------

  navigator.modelContext.registerTool({
    name: "municode_get_section_content",
    description:
      "Retrieve the full text of a specific code section by its ID. " +
      "Returns the ordinance text including section numbers, headings, and body. " +
      "Use municode_browse_table_of_contents to find section IDs. " +
      "For chapters or titles, returns all subsections within.",
    inputSchema: {
      type: "object",
      properties: {
        state_abbr: {
          type: "string",
          description: "Two-letter US state abbreviation",
        },
        municipality_name: {
          type: "string",
          description: "Municipality name as it appears in Municode",
        },
        node_id: {
          type: "string",
          description:
            "The ID of the section to retrieve " +
            "(e.g., 'MUCO_TIT1GEPR_CH1.01COAD' for Chapter 1.01 Code Adoption)",
        },
      },
      required: ["state_abbr", "municipality_name", "node_id"],
    },
    annotations: { readOnlyHint: true },
    execute: async ({ state_abbr, municipality_name, node_id }) => {
      try {
        const { jobId, productId, productName, clientName } = await resolveClient(
          state_abbr,
          municipality_name
        );

        const data = await apiGet(
          `/CodesContent?jobId=${jobId}&productId=${productId}&nodeId=${encodeURIComponent(node_id)}`
        );

        // API returns { Docs: [{ Id, Title, Content (HTML), ... }], ... }
        const docs = data.Docs || [];
        const parts = [];
        for (const doc of docs) {
          const content = doc.Content;
          if (!content) continue;
          const title = doc.Title || "";
          const text = stripHtml(content);
          if (text) {
            parts.push(title ? `## ${title}\n${text}` : text);
          }
        }

        const fullText = parts.join("\n\n");
        const truncated = fullText.length > 10000;
        const content = truncated
          ? fullText.substring(0, 10000) + "\n\n[... truncated — request a more specific node_id for full text]"
          : fullText;

        // Also extract recent ordinances if present
        const newOrds = (data.NewOrds || []).slice(0, 5).map((o) => ({
          title: o.Title,
          description: (o.Description || "").trim(),
          adoption_date: o.AdoptionDate,
        }));

        const result = {
          municipality: clientName,
          publication: productName,
          node_id,
          url: `https://library.municode.com/${state_abbr.toLowerCase()}/${municipality_name.toLowerCase()}/codes/code_of_ordinances?nodeId=${node_id}`,
          section_count: docs.filter((d) => d.Content).length,
          content,
          truncated,
        };
        if (newOrds.length > 0) {
          result.pending_ordinances = newOrds;
        }
        return ok(result);
      } catch (e) {
        return err(`Failed to get section content: ${e.message}`);
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Tool 4: Search Code (via browser SPA)
  // ---------------------------------------------------------------------------

  navigator.modelContext.registerTool({
    name: "municode_search_code",
    description:
      "Search within a municipality's code of ordinances. " +
      "NOTE: The Municode search API now requires authentication. This tool " +
      "triggers the search via the SPA's search bar on the current page. " +
      "You must be on a Municode code page for the municipality you want to search. " +
      "As an alternative, use municode_browse_table_of_contents to navigate " +
      "the code structure and municode_get_section_content to read sections.",
    inputSchema: {
      type: "object",
      properties: {
        search_text: {
          type: "string",
          description: "Search query — keywords or phrases",
        },
      },
      required: ["search_text"],
    },
    annotations: { readOnlyHint: true },
    execute: async ({ search_text }) => {
      try {
        // Try to use the SPA's search input if we're on a code page
        const searchInput = document.querySelector(
          'input[type="search"], input.search-input, #searchInput, input[placeholder*="Search"]'
        );
        if (searchInput) {
          // Set value and trigger change/submit
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
          ).set;
          nativeInputValueSetter.call(searchInput, search_text);
          searchInput.dispatchEvent(new Event("input", { bubbles: true }));
          searchInput.dispatchEvent(new Event("change", { bubbles: true }));

          // Try to find and click the search button
          const searchBtn = document.querySelector(
            'button.search-btn, button[type="submit"], .fa-search'
          );
          if (searchBtn) searchBtn.click();

          return ok({
            action: "search_triggered",
            query: search_text,
            note: "Search has been triggered in the SPA. Results will appear on the page. " +
                  "Read the page content to see results.",
          });
        }

        return err(
          "Search input not found on this page. Navigate to a municipality's code page first, " +
          "or use municode_browse_table_of_contents + municode_get_section_content to find content."
        );
      } catch (e) {
        return err(`Search failed: ${e.message}`);
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Tool 5: Get Client Info (Internal IDs)
  // ---------------------------------------------------------------------------

  navigator.modelContext.registerTool({
    name: "municode_get_client_info",
    description:
      "Retrieve internal Municode identifiers (clientId, productId, jobId) for a " +
      "municipality. Also shows what features are available (CodeBank, OrdBank, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        state_abbr: {
          type: "string",
          description: "Two-letter US state abbreviation",
        },
        municipality_name: {
          type: "string",
          description: "Municipality name as it appears in Municode",
        },
      },
      required: ["state_abbr", "municipality_name"],
    },
    annotations: { readOnlyHint: true },
    execute: async ({ state_abbr, municipality_name }) => {
      try {
        const info = await resolveClient(state_abbr, municipality_name);

        // Fetch features from the full job info
        const jobInfo = await apiGet(`/Jobs/latest/${info.productId}`);
        const features = jobInfo.Product?.Features || {};

        return ok({
          ...info,
          features,
          municode_url: `https://library.municode.com/${state_abbr.toLowerCase()}/${municipality_name.toLowerCase()}/codes/code_of_ordinances`,
        });
      } catch (e) {
        return err(`Failed to get client info: ${e.message}`);
      }
    },
  });

  // ---------------------------------------------------------------------------

  console.log(
    "[CivicWork WebMCP] Registered 5 Municode tools on library.municode.com"
  );
})();
