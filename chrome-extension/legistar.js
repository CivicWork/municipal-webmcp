// CivicWork WebMCP — Legistar Tools
// Registers WebMCP tools on *.legistar.com pages via the imperative API.
// Tools use same-origin fetch to read server-rendered ASP.NET pages and
// return structured data for browser AI agents.

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

  const municipality = window.location.hostname.split(".")[0];
  const baseUrl = `https://${municipality}.legistar.com`;

  async function fetchDoc(path) {
    const res = await fetch(`${baseUrl}${path}`);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    const html = await res.text();
    return new DOMParser().parseFromString(html, "text/html");
  }

  function text(el) {
    return el?.textContent?.trim() ?? null;
  }

  function href(el) {
    if (!el) return null;
    const raw = el.getAttribute("href");
    if (!raw) return null;
    if (raw.startsWith("http")) return raw;
    return `${baseUrl}/${raw.replace(/^\//, "")}`;
  }

  function ok(data) {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  function err(message) {
    return { content: [{ type: "text", text: JSON.stringify({ error: message }) }] };
  }

  // Extract ID and GUID from a URL like MeetingDetail.aspx?ID=123&GUID=abc
  function extractParams(url) {
    if (!url) return {};
    try {
      const u = new URL(url, baseUrl);
      return {
        id: u.searchParams.get("ID"),
        guid: u.searchParams.get("GUID"),
      };
    } catch {
      return {};
    }
  }

  // ---------------------------------------------------------------------------
  // Tool 1: List Upcoming Meetings
  // ---------------------------------------------------------------------------

  navigator.modelContext.registerTool({
    name: "legistar_list_upcoming_meetings",
    description:
      `List upcoming meetings for ${municipality} from the Legistar calendar. ` +
      "Returns meeting name (committee/body), date, time, location, and links " +
      "to the meeting detail page, agenda, and minutes for each meeting.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: { readOnlyHint: true },
    execute: async () => {
      try {
        const doc = await fetchDoc("/Calendar.aspx");
        const rows = doc.querySelectorAll(
          "#ctl00_ContentPlaceHolder1_gridCalendar_ctl00 > tbody > tr"
        );

        const meetings = [];
        for (const row of rows) {
          if (row.classList.contains("rgPager")) continue;
          const cells = row.querySelectorAll("td");
          if (cells.length < 7) continue;

          const nameLink = cells[0]?.querySelector("a");
          const detailLink = cells[5]?.querySelector('a[href*="MeetingDetail.aspx"]');
          const agendaLink = cells[6]?.querySelector('a[href*="View.ashx"]');
          const minutesLink = cells[8]?.querySelector('a[href*="View.ashx"]');

          const location = text(cells[4]);
          const cancelled = location?.includes("CANCELLED") ?? false;

          meetings.push({
            name: text(nameLink) || text(cells[0]),
            date: text(cells[1]),
            time: text(cells[3]),
            location,
            cancelled,
            detail_url: href(detailLink),
            detail_params: extractParams(href(detailLink)),
            agenda_url: href(agendaLink),
            minutes_url: href(minutesLink),
          });
        }

        return ok({ municipality, meeting_count: meetings.length, meetings });
      } catch (e) {
        return err(`Failed to list meetings: ${e.message}`);
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Tool 2: Get Meeting Detail
  // ---------------------------------------------------------------------------

  navigator.modelContext.registerTool({
    name: "legistar_get_meeting_detail",
    description:
      "Get the full detail for a specific Legistar meeting: committee, date/time, " +
      "location, agenda status, minutes status, and the complete list of agenda items " +
      "with file numbers, types, titles, actions, and vote results.",
    inputSchema: {
      type: "object",
      properties: {
        meeting_id: {
          type: "string",
          description: "Numeric meeting ID (from detail_params.id in list results)",
        },
        meeting_guid: {
          type: "string",
          description: "Meeting GUID (from detail_params.guid in list results)",
        },
      },
      required: ["meeting_id", "meeting_guid"],
    },
    annotations: { readOnlyHint: true },
    execute: async ({ meeting_id, meeting_guid }) => {
      try {
        const path = `/MeetingDetail.aspx?ID=${encodeURIComponent(meeting_id)}&GUID=${encodeURIComponent(meeting_guid)}&Options=info|&Search=`;
        const doc = await fetchDoc(path);

        const meeting = {
          name: text(doc.querySelector("#ctl00_ContentPlaceHolder1_hypName")),
          date_time: text(doc.querySelector("#ctl00_ContentPlaceHolder1_lblDate")),
          location: text(doc.querySelector("#ctl00_ContentPlaceHolder1_lblLocation")),
          agenda_status: text(doc.querySelector("#ctl00_ContentPlaceHolder1_lblAgendaStatus")),
          minutes_status: text(doc.querySelector("#ctl00_ContentPlaceHolder1_lblMinutesStatus")),
        };

        // Agenda/minutes PDF links (use specific element IDs)
        meeting.agenda_pdf_url = href(doc.querySelector("#ctl00_ContentPlaceHolder1_hypAgenda"));
        meeting.accessible_agenda_url = href(doc.querySelector("#ctl00_ContentPlaceHolder1_hypAgendaHTML"));
        meeting.minutes_pdf_url = href(doc.querySelector("#ctl00_ContentPlaceHolder1_hypMinutes"));

        // Agenda items grid
        const itemRows = doc.querySelectorAll(
          "#ctl00_ContentPlaceHolder1_gridMain_ctl00 > tbody > tr"
        );
        const agenda_items = [];
        for (const row of itemRows) {
          if (row.classList.contains("rgPager")) continue;
          const cells = row.querySelectorAll("td");
          if (cells.length < 4) continue;

          const fileLink = cells[0]?.querySelector('a[href*="LegislationDetail.aspx"]');

          agenda_items.push({
            file_number: text(fileLink) || text(cells[0]),
            legislation_url: href(fileLink),
            legislation_params: extractParams(href(fileLink)),
            type: text(cells[1]),
            title: text(cells[2]),
            action: text(cells[3]),
            result: text(cells[4]),
          });
        }

        return ok({ municipality, meeting, agenda_item_count: agenda_items.length, agenda_items });
      } catch (e) {
        return err(`Failed to get meeting detail: ${e.message}`);
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Tool 3: Get Legislation Detail
  // ---------------------------------------------------------------------------

  navigator.modelContext.registerTool({
    name: "legistar_get_legislation_detail",
    description:
      "Get the full record for a specific piece of legislation: file number, type, " +
      "status, title, sponsors, controlling body, full text, vote history with dates " +
      "and results, and links to all attachments.",
    inputSchema: {
      type: "object",
      properties: {
        legislation_id: {
          type: "string",
          description: "Numeric legislation ID (from legislation_params.id)",
        },
        legislation_guid: {
          type: "string",
          description: "Legislation GUID (from legislation_params.guid)",
        },
      },
      required: ["legislation_id", "legislation_guid"],
    },
    annotations: { readOnlyHint: true },
    execute: async ({ legislation_id, legislation_guid }) => {
      try {
        const path = `/LegislationDetail.aspx?ID=${encodeURIComponent(legislation_id)}&GUID=${encodeURIComponent(legislation_guid)}&Options=&Search=`;
        const doc = await fetchDoc(path);

        const legislation = {
          file_number: text(doc.querySelector("#ctl00_ContentPlaceHolder1_lblFile2")),
          type: text(doc.querySelector("#ctl00_ContentPlaceHolder1_lblType2")),
          status: text(doc.querySelector("#ctl00_ContentPlaceHolder1_lblStatus2")),
          file_created: text(doc.querySelector("#ctl00_ContentPlaceHolder1_lblIntroduced2")),
          in_control: text(doc.querySelector("#ctl00_ContentPlaceHolder1_hypInControl")),
          on_agenda: text(doc.querySelector("#ctl00_ContentPlaceHolder1_lblOnAgenda2")),
          final_action: text(doc.querySelector("#ctl00_ContentPlaceHolder1_lblPassed2")),
          title: text(doc.querySelector("#ctl00_ContentPlaceHolder1_lblTitle2")),
          sponsors: text(doc.querySelector("#ctl00_ContentPlaceHolder1_lblSponsors2")),
        };

        // Attachments
        const attachmentLinks = doc.querySelectorAll(
          "#ctl00_ContentPlaceHolder1_lblAttachments2 a"
        );
        legislation.attachments = Array.from(attachmentLinks).map((a) => ({
          name: text(a),
          url: href(a),
        }));

        // Legislation text
        const textDiv = doc.querySelector("#divText");
        legislation.text = textDiv ? textDiv.textContent.trim().substring(0, 5000) : null;

        // Vote history
        const historyRows = doc.querySelectorAll(
          "#ctl00_ContentPlaceHolder1_gridLegislation_ctl00 > tbody > tr"
        );
        const history = [];
        for (const row of historyRows) {
          if (row.classList.contains("rgPager")) continue;
          const cells = row.querySelectorAll("td");
          if (cells.length < 4) continue;

          history.push({
            date: text(cells[0]),
            action_by: text(cells[1]),
            action: text(cells[2]),
            result: text(cells[3]),
          });
        }
        legislation.history = history;

        return ok({ municipality, legislation });
      } catch (e) {
        return err(`Failed to get legislation detail: ${e.message}`);
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Tool 4: List People (Elected Officials / Office Members)
  // ---------------------------------------------------------------------------

  navigator.modelContext.registerTool({
    name: "legistar_list_people",
    description:
      "List current elected officials and office members for " +
      municipality +
      ". Returns names, email addresses, and website links.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: { readOnlyHint: true },
    execute: async () => {
      try {
        const doc = await fetchDoc("/People.aspx");
        const rows = doc.querySelectorAll(
          "#ctl00_ContentPlaceHolder1_gridPeople_ctl00 > tbody > tr"
        );

        const people = [];
        for (const row of rows) {
          if (row.classList.contains("rgPager")) continue;
          const cells = row.querySelectorAll("td");
          if (cells.length < 2) continue;

          const nameLink = cells[0]?.querySelector('a[href*="PersonDetail.aspx"]');
          const emailLink = cells[1]?.querySelector('a[href^="mailto:"]');
          const websiteLink = cells[2]?.querySelector("a");

          people.push({
            name: text(nameLink) || text(cells[0]),
            person_url: href(nameLink),
            email: emailLink ? emailLink.getAttribute("href").replace("mailto:", "") : null,
            website: href(websiteLink),
          });
        }

        return ok({ municipality, person_count: people.length, people });
      } catch (e) {
        return err(`Failed to list people: ${e.message}`);
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Tool 5: List Departments (Committees / Legislative Bodies)
  // ---------------------------------------------------------------------------

  navigator.modelContext.registerTool({
    name: "legistar_list_departments",
    description:
      "List all committees, legislative bodies, and departments for " +
      municipality +
      ". Returns department names and types.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: { readOnlyHint: true },
    execute: async () => {
      try {
        const doc = await fetchDoc("/Departments.aspx");
        const rows = doc.querySelectorAll(
          "#ctl00_ContentPlaceHolder1_gridMain_ctl00 > tbody > tr"
        );

        const departments = [];
        for (const row of rows) {
          if (row.classList.contains("rgPager")) continue;
          const cells = row.querySelectorAll("td");
          if (cells.length < 2) continue;

          const nameLink = cells[0]?.querySelector('a[href*="DepartmentDetail.aspx"]');

          departments.push({
            name: text(nameLink) || text(cells[0]),
            department_url: href(nameLink),
            type: text(cells[1]),
            meeting_location: text(cells[2]),
          });
        }

        return ok({ municipality, department_count: departments.length, departments });
      } catch (e) {
        return err(`Failed to list departments: ${e.message}`);
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Tool 6: Search Legislation
  // ---------------------------------------------------------------------------

  navigator.modelContext.registerTool({
    name: "legistar_search_legislation",
    description:
      "Search for legislation (ordinances, resolutions, etc.) on the current " +
      "Legistar instance. Returns the default listing of recent legislative files " +
      "with file numbers, types, statuses, titles, and links to detail pages. " +
      "Note: full-text search requires ASP.NET postback and is not yet supported — " +
      "this tool returns the current page listing. Use legistar_get_legislation_detail " +
      "to drill into specific items.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: { readOnlyHint: true },
    execute: async () => {
      try {
        const doc = await fetchDoc("/Legislation.aspx");
        const rows = doc.querySelectorAll(
          "#ctl00_ContentPlaceHolder1_gridMain_ctl00 > tbody > tr"
        );

        const legislation = [];
        for (const row of rows) {
          if (row.classList.contains("rgPager")) continue;
          const cells = row.querySelectorAll("td");
          if (cells.length < 5) continue;

          const fileLink = cells[0]?.querySelector('a[href*="LegislationDetail.aspx"]');
          const titleLink = cells[4]?.querySelector("a");

          legislation.push({
            file_number: text(fileLink) || text(cells[0]),
            legislation_url: href(fileLink),
            legislation_params: extractParams(href(fileLink)),
            type: text(cells[1]),
            status: text(cells[2]),
            file_created: text(cells[3]),
            title: text(titleLink) || text(cells[4]),
          });
        }

        return ok({ municipality, legislation_count: legislation.length, legislation });
      } catch (e) {
        return err(`Failed to list legislation: ${e.message}`);
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Tool 7: Get Document URL
  // ---------------------------------------------------------------------------

  navigator.modelContext.registerTool({
    name: "legistar_get_document_url",
    description:
      "Construct a direct download URL for a Legistar document: agenda PDF, " +
      "minutes PDF, accessible agenda (HTML), accessible minutes, attachment, " +
      "or iCalendar export. Returns the URL — the agent or user can then open it.",
    inputSchema: {
      type: "object",
      properties: {
        document_type: {
          type: "string",
          description: "Type of document to retrieve",
          enum: [
            "agenda",
            "accessible_agenda",
            "minutes",
            "accessible_minutes",
            "attachment",
            "icalendar",
          ],
        },
        record_id: {
          type: "string",
          description:
            "Numeric ID of the meeting (for agenda/minutes/ical) or file (for attachments)",
        },
        record_guid: {
          type: "string",
          description: "GUID of the meeting or file",
        },
      },
      required: ["document_type", "record_id", "record_guid"],
    },
    annotations: { readOnlyHint: true },
    execute: async ({ document_type, record_id, record_guid }) => {
      const modes = {
        agenda: "A",
        accessible_agenda: "AADA",
        minutes: "M",
        accessible_minutes: "MADA",
        attachment: "F",
        icalendar: "IC",
      };
      const mode = modes[document_type];
      if (!mode) return err(`Unknown document_type: ${document_type}`);

      const url = `${baseUrl}/View.ashx?M=${mode}&ID=${encodeURIComponent(record_id)}&GUID=${encodeURIComponent(record_guid)}`;
      return ok({ municipality, document_type, url });
    },
  });

  // ---------------------------------------------------------------------------

  console.log(
    `[CivicWork WebMCP] Registered 7 Legistar tools for ${municipality}.legistar.com`
  );
})();
