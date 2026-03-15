# Legistar WebMCP Site Analysis
## Source: countyofkane.legistar.com (live inspection, March 5, 2026)

---

## Critical Finding: Subdomain Mismatch

**Kane County's Legistar subdomain is `countyofkane`, NOT `kanecountyil`.** The `kanecountyil.legistar.com` domain does not resolve. Kane County uses `kanecountyil.iqm2.com` for a separate meeting portal, which is a different product entirely. Always verify the correct subdomain before building configs.

---

## Platform Architecture

Legistar is a Granicus product built on **ASP.NET WebForms** with **Telerik RadGrid** for all data tables. This has several implications for agent interaction:

- **Postback-based navigation**: Sorting, filtering, and pagination use `__doPostBack()` JavaScript calls, not URL parameters. This means you can't construct a URL that says "show me page 2 of results" — you have to load the page and simulate a click.
- **ViewState**: Every page carries `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, and `__EVENTVALIDATION` hidden fields. POST-based interactions must include these.
- **No REST API**: Legistar has a separate REST API (`webapi.legistar.com/v1/{client}/`) that some municipalities expose, but it's not guaranteed and not the same as the web UI. The webMCP config targets the public web UI.
- **Consistent cross-municipality structure**: The HTML element IDs and CSS class patterns are identical across municipalities. The nav structure, grid layouts, and URL patterns are all standardized by the platform.

---

## URL Pattern Map

All URLs follow the pattern: `https://{municipality}.legistar.com/{page}`

### Primary Pages
| Page | URL | Purpose |
|------|-----|---------|
| Calendar | `/Calendar.aspx` | Meeting list + calendar view |
| Meeting Detail | `/MeetingDetail.aspx?ID={id}&GUID={guid}` | Single meeting with agenda items |
| Legislation Search | `/Legislation.aspx` | Search/browse legislative files |
| Legislation Detail | `/LegislationDetail.aspx?ID={id}&GUID={guid}` | Single legislative file with history |
| People | `/People.aspx` | Elected officials and office members |
| Person Detail | `/PersonDetail.aspx?ID={id}&GUID={guid}` | Individual member record |
| Departments | `/Departments.aspx` | Committees and legislative bodies |
| Department Detail | `/DepartmentDetail.aspx?ID={id}&GUID={guid}` | Committee membership + meetings |

### Document Endpoints (View.ashx)
| Mode Parameter | Document Type | Example |
|---------------|--------------|---------|
| `M=A` | Agenda PDF | `/View.ashx?M=A&ID={meetingId}&GUID={guid}` |
| `M=AADA` | Accessible Agenda (HTML) | `/View.ashx?M=AADA&ID={meetingId}&GUID={guid}` |
| `M=M` | Minutes PDF | `/View.ashx?M=M&ID={meetingId}&GUID={guid}` |
| `M=MADA` | Accessible Minutes (HTML) | `/View.ashx?M=MADA&ID={meetingId}&GUID={guid}` |
| `M=F` | File Attachment | `/View.ashx?M=F&ID={fileId}&GUID={guid}` |
| `M=IC` | iCalendar Export | `/View.ashx?M=IC&ID={meetingId}&GUID={guid}` |

### Report Endpoints (ViewReport.ashx)
| Report | URL Pattern |
|--------|-------------|
| Legislation Text | `/ViewReport.ashx?M=R&N=Text&GID={gid}&ID={id}&GUID={guid}` |
| Legislation Details | `/ViewReport.ashx?M=R&N=Master&GID={gid}&ID={id}&GUID={guid}` |
| Details + Text | Same as above with `&Extra=WithText` |

---

## DOM Structure: Key Selectors

### Navigation Bar
```
#menuMain > li > a
  - Home → /
  - Search Agenda Items → /Legislation.aspx
  - Calendar → /Calendar.aspx
  - County Board → /MainBody.aspx (label varies by municipality)
  - Departments → /Departments.aspx
  - Office Members → /People.aspx
```

### Calendar Page Grid
```
Container: #ctl00_ContentPlaceHolder1_gridCalendar_ctl00
Rows: tbody > tr (class varies: rgRow, rgAltRow)
Columns (11 total):
  1. Name (committee link → DepartmentDetail.aspx)
  2. Meeting Date (text, M/D/YYYY format)
  3. iCal export link (View.ashx?M=IC)
  4. Meeting Time (text, e.g. "9:00 AM")
  5. Meeting Location (text, may include ***CANCELLED*** or ***SPECIAL MEETING***)
  6. Meeting Details (link → MeetingDetail.aspx, text "Meeting details")
  7. Agenda (link → View.ashx?M=A, or "Not available")
  8. Accessible Agenda (link → View.ashx?M=AADA, or "Not available")
  9. Minutes (link → View.ashx?M=M, or "Not available")
  10. Accessible Minutes (link → View.ashx?M=MADA, or "Not available")
  11. Minutes Packet (link or "Not available")

Filters:
  - Year: select element with options including year values and relative ranges
  - Department: select element listing all committees/bodies
```

### Meeting Detail Page
```
Header Fields:
  - Meeting Name: #ctl00_ContentPlaceHolder1_hypBody (link)
  - Date/Time: #ctl00_ContentPlaceHolder1_lblDate
  - Location: #ctl00_ContentPlaceHolder1_lblLocation
  - Agenda Status: #ctl00_ContentPlaceHolder1_lblAgendaStatus
  - Minutes Status: #ctl00_ContentPlaceHolder1_lblMinutesStatus

Agenda Items Grid: #ctl00_ContentPlaceHolder1_gridMain_ctl00
Columns (6):
  1. File # (link → LegislationDetail.aspx)
  2. Type (Resolution, Ordinance, Proclamation, etc.)
  3. Title (text)
  4. Action (text, e.g. "approved by roll call vote")
  5. Result (Pass/Fail)
  6. Action Details (expandable link)

Record count shown: "51 records" style indicator
Supports toggling between "Legislation only" and "All agenda items"
```

### Legislation Detail Page
```
Header Table:
  - File #, Type, Status
  - File created, In control (link to DepartmentDetail)
  - On agenda, Final action (dates)
  - Title (full text)
  - Attachments (numbered links → View.ashx?M=F)

Tabs: History, Text, Reports

History Grid: #ctl00_ContentPlaceHolder1_gridLegislation_ctl00
Columns:
  1. Date
  2. Action By (committee/body name)
  3. Action (e.g. "moved forward by roll call vote")
  4. Result (Pass/Fail)
  5. Action Details (expandable)
  6. Meeting Details (link → MeetingDetail.aspx)

Text Tab: Contains full legislation text in #divText
Reports Tab: Links to PDF/printable versions
```

### People Page
```
Grid: #ctl00_ContentPlaceHolder1_gridPeople_ctl00
Columns (3):
  1. Person Name (link → PersonDetail.aspx)
  2. E-mail (mailto link)
  3. Web Site (link, often empty)

View Toggle: Current / Past / All
Record count: "41 records" (for Kane County)
```

---

## Pagination Behavior

All grids use Telerik RadGrid pagination:
- Default page size: 25 rows
- Pager controls at bottom: `.rgPager`
- Page navigation via `__doPostBack()` — no URL parameter for page number
- Can export to Excel, PDF, or Word via grid toolbar
- "Group by" options available for most columns

---

## Observations for Agent Design

1. **Legistar is read-only for public users.** All tools should be marked `readOnlyHint: true`. No write operations are possible without authentication.

2. **"Not available" is a meaningful state.** When agenda/minutes columns show "Not available," it means the document hasn't been published yet — NOT that the page is broken. This is extremely common for future meetings.

3. **Meeting location field carries status metadata.** Cancellations and special meetings are indicated by `***CANCELLED***` or `***SPECIAL MEETING***` appended to the location text. Parse this.

4. **The accessible agenda (AADA) is HTML, not PDF.** This is actually more useful for agent processing than the PDF agenda. Prefer the accessible version when extracting text content.

5. **Committee flow is visible in vote history.** A typical Kane County item flows: Committee → Executive Committee → County Board. The history tab on legislation detail shows this path with dates and votes at each stop.

6. **GID (Government ID) is municipality-specific.** Kane County's GID is `907`. This appears in ViewReport URLs but is consistent within a municipality. It can be discovered from any existing report link on the site.

---

## Legistar REST API (Alternative)

Some municipalities also expose `https://webapi.legistar.com/v1/{client}/`. For Kane County, the client would be `countyofkane`. This API returns JSON and supports filtering — potentially more reliable than DOM parsing for production use. However, not all municipalities enable it, and it requires a separate investigation to map. The webMCP config above targets the guaranteed-available public web UI.
