---
name: jay-outreach
description: Run a full outreach email workflow for a company. Generates a 3-email sequence via Gemini, pushes it to a Notion "Outreach Pipeline" table with status tracking, and creates a Gmail draft for Email 1. Invoke with /jay outreach <company name> [website URL] [optional context].
---

# /jay outreach — Outreach Email Workflow

Generate a personalised 3-email cold outreach sequence, track it in Notion, and draft Email 1 in Gmail.

---

## Step 1 — Extract Company Info

Extract from the user's message (ask if missing):
- **Company name** (required)
- **Website URL** (optional but preferred for research)
- **Contact name / email** (optional)
- **Extra context** (role they're targeting, screenshot notes, recent news)

Build a `companyInfo` object in your working memory:
```
name: <company>
website: <url or null>
description: null (to be filled in Step 2)
contactName: <name or null>
contactEmail: <email or null>
```

---

## Step 2 — Research the Company

If `website` is provided:

1. `WebFetch { url: website }` — read homepage
2. `WebFetch { url: website + "/about" }` — read about page (ignore 404s)

Summarise into 3–5 sentences covering:
- Core product and what problem it solves
- Target customer
- Company size / stage / any growth signals visible on the page
- Mission or values if stated

Set `companyInfo.description` to this summary.

If no website is provided, use any context the user shared (screenshot description, notes, etc.) and note that research was skipped.

---

## Step 3 — Gather User Background

Check if the user has already described themselves in this session. If not, ask for:
- Name
- Current title
- 2–3 sentence professional summary (what they do, what makes them distinct)
- Top 3–5 skills most relevant to this company

Build a `userBackground` object:
```
name: <candidate name>
currentTitle: <title>
summary: <2-3 sentences>
topSkills: [skill1, skill2, skill3]
```

---

## Step 4 — Generate Email Sequence

Call `generateEmailSequence(companyInfo, userBackground)` from `services/outreachService.ts`.

This returns an `EmailSequence` with `.emails[]` — 3 `OutreachEmail` objects:
- `emails[0]`: type `initial`, sendAfterDays `0`
- `emails[1]`: type `follow_up_1`, sendAfterDays `5`
- `emails[2]`: type `follow_up_2`, sendAfterDays `12`

Count words in each email body. Flag (but don't block) if:
- Email 1 > 150 words
- Email 2 > 100 words
- Email 3 > 80 words

---

## Step 5 — Find or Create the Notion "Outreach Pipeline" Database

Use `notion-search` to find an existing database:
```json
{ "query": "Outreach Pipeline", "filter": { "value": "database" } }
```

**If found**: record the `databaseId`.

**If not found**: use `notion-create-database` with this schema:
```json
{
  "parent": { "type": "page_id", "page_id": "<ask user for their root Notion page ID>" },
  "title": [{ "type": "text", "text": { "content": "Outreach Pipeline" } }],
  "properties": {
    "Company":           { "title": {} },
    "Website":           { "url": {} },
    "Contact":           { "rich_text": {} },
    "Status": {
      "select": {
        "options": [
          { "name": "Research",     "color": "gray"   },
          { "name": "Draft",        "color": "blue"   },
          { "name": "Sent Email 1", "color": "yellow" },
          { "name": "Sent Email 2", "color": "orange" },
          { "name": "Sent Email 3", "color": "red"    },
          { "name": "Replied",      "color": "green"  },
          { "name": "Closed",       "color": "default"}
        ]
      }
    },
    "Email 1 Subject":   { "rich_text": {} },
    "Email 1 Body":      { "rich_text": {} },
    "Email 2 Subject":   { "rich_text": {} },
    "Email 2 Body":      { "rich_text": {} },
    "Email 3 Subject":   { "rich_text": {} },
    "Email 3 Body":      { "rich_text": {} },
    "Gmail Thread ID":   { "rich_text": {} },
    "Notes":             { "rich_text": {} },
    "Created":           { "date": {} }
  }
}
```

---

## Step 6 — Add Row to Notion

Use `notion-create-pages`:
```json
{
  "parent": { "database_id": "<databaseId>" },
  "properties": {
    "Company":           { "title":     [{ "text": { "content": "<companyInfo.name>" } }] },
    "Website":           { "url": "<companyInfo.website or null>" },
    "Contact":           { "rich_text": [{ "text": { "content": "<contactName + contactEmail, or empty>" } }] },
    "Status":            { "select": { "name": "Draft" } },
    "Email 1 Subject":   { "rich_text": [{ "text": { "content": "<emails[0].subject>" } }] },
    "Email 1 Body":      { "rich_text": [{ "text": { "content": "<emails[0].body>" } }] },
    "Email 2 Subject":   { "rich_text": [{ "text": { "content": "<emails[1].subject>" } }] },
    "Email 2 Body":      { "rich_text": [{ "text": { "content": "<emails[1].body>" } }] },
    "Email 3 Subject":   { "rich_text": [{ "text": { "content": "<emails[2].subject>" } }] },
    "Email 3 Body":      { "rich_text": [{ "text": { "content": "<emails[2].body>" } }] },
    "Gmail Thread ID":   { "rich_text": [{ "text": { "content": "" } }] },
    "Notes":             { "rich_text": [{ "text": { "content": "<companyInfo.description, max 500 chars>" } }] },
    "Created":           { "date": { "start": "<today ISO 8601 date>" } }
  }
}
```

Record `notionPageId` from `response.id`.

---

## Step 7 — Create Gmail Draft for Email 1

Use `create_draft`:
```json
{
  "to":      "<companyInfo.contactEmail if available, otherwise leave empty>",
  "subject": "<emails[0].subject>",
  "body":    "<emails[0].body>"
}
```

Record `draftId` from the response. If `contactEmail` is unknown, leave `to` empty — the user fills it before sending.

---

## Step 8 — Link Gmail Draft Back to Notion

Use `notion-update-page`:
```json
{
  "page_id": "<notionPageId>",
  "properties": {
    "Gmail Thread ID": { "rich_text": [{ "text": { "content": "<draftId>" } }] }
  }
}
```

---

## Step 9 — Present Summary

Output a clean summary:

```
── Outreach sequence ready: <Company Name> ──

Email 1 — Send now
  Subject: <emails[0].subject>
  Preview: <first 100 chars of body>...
  Words: <N>

Email 2 — Send in 5 days (~<today + 5 days, e.g. "May 20">)
  Subject: <emails[1].subject>
  Preview: <first 80 chars>...

Email 3 — Final bump in 12 days (~<today + 12 days>)
  Subject: <emails[2].subject>
  Preview: <first 80 chars>...

Notion: Row added to "Outreach Pipeline" (Status: Draft)
Gmail: Draft created — search Drafts for "<emails[0].subject>"

Next steps:
1. Open Gmail Drafts, add the contact email, review, and send
2. After sending, reply here with the Gmail thread ID so I can
   set up Email 2 as a reply in the same thread
3. Use `/jay outreach follow-up <company>` to queue the next email
```

---

## Threading Follow-up Workflow

When the user sends Email 1 and provides the Gmail thread ID:

1. `notion-update-page` — set "Gmail Thread ID" to the actual thread ID and Status → "Sent Email 1"
2. When ready to send Email 2: `get_thread` to confirm thread is active, then `create_draft` as a reply in that thread for `emails[1]`
3. After Email 2 sent: `notion-update-page` Status → "Sent Email 2"; create Email 3 draft similarly
4. If user reports a reply: Status → "Replied"

---

## Error Handling

| Error | Action |
|-------|--------|
| WebFetch fails | Proceed without description; note research was skipped |
| Gemini API fails | Surface the error; do not continue with empty emails |
| Notion creation fails | Surface error; still create Gmail draft and show emails in chat |
| Gmail draft fails | Surface error; Notion row already saved; paste emails in chat |
| Notion rich_text too long | Truncate body to 1900 chars and append "… [truncated]" |
