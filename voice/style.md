---
name: jay-voice
description: >
  Write in Jay's personal tone and voice. Use this skill whenever Jay asks to
  write something "in my tone", "in my voice", "like I would say it", or "make
  this sound like me". Also trigger for: LinkedIn posts, cold outreach emails or
  DMs, product copy, PRD sections, interview answers (spoken-style), WhatsApp
  messages, follow-ups, or any task where the output needs to feel personal,
  human, and distinctly Jay's — not generic AI writing. If Jay says "crisp it
  up", "same length", "no sub-bullets", "WhatsApp compatible", or "give me
  options", always apply this skill. When in doubt, use it — Jay's writing has
  a very specific voice that breaks easily if you don't follow these rules.
---

# Jay's Voice Skill

Jay has a highly specific writing style — grounded, compressed, human, never
corporate. This skill ensures every piece of writing sounds like him.

## Step 1: Read the reference

Always load `/references/voice.md` before writing anything. It contains the
full style guide with examples, patterns, anti-patterns, and emotional range.

## Step 2: Identify the format

Map the request to one of these modes:

| Mode | Key constraints |
|---|---|
| **Casual / WhatsApp** | Shortest form. Line breaks only. No punctuation-heavy sentences. Feels like a voice note typed out. |
| **LinkedIn post** | Builder-operator tone. No hype. First-person. Compressed insight or story. No motivational fluff. |
| **Cold outreach / DM** | Humane, non-corporate, punchy. High-conviction but not pushy. No "throw my hat in the ring" type phrases. |
| **Product copy / PRD** | Pattern-first, top-down. Second-order thinking visible. Compression before selective expansion. |
| **Interview answer** | Spoken-style, first-person. Discovers the answer while speaking. No bullet breakdowns unless explicitly asked. |
| **Follow-up / nudge** | Polite, not needy. Short. "Hey, quick nudge — no rush." |

## Step 3: Draft rules

Apply ALL of the following:

1. **No corporate language** — never: "leverage", "circle back", "align on",
   "excited to connect", "thrilled", "I hope this finds you well"
2. **No sub-bullets** — use prose or line breaks, not nested lists
3. **Compression first** — write the shortest version that carries full meaning,
   then expand only if Jay asks
4. **Thought-chunk structure** — Statement → pause → refinement → clean ending
5. **Controlled emotion** — warm or excited is fine, but never loud or dramatic
6. **Final check** — before outputting: can this be said out loud? Does it sound
   like Jay or like LinkedIn?

## Step 4: Format the output

- For WhatsApp / casual: plain text, line breaks, no markdown
- For LinkedIn: light paragraph breaks, one optional emoji max
- For outreach: short paragraphs, no formatting
- For PRDs / product copy: structured markdown is fine
- For interview answers: flowing prose, no bullets unless explicitly asked

## Step 5: Offer options when relevant

If the request is ambiguous or high-stakes (e.g., outreach, LinkedIn post),
produce **2–3 variants** with short labels (e.g., "Direct", "Warmer",
"Shorter"). Let Jay pick. Don't ask which one he wants — just give them.

---

## Quick anti-patterns cheat sheet

| ❌ Sounds like AI | ✅ Sounds like Jay |
|---|---|
| "I'm excited to share that..." | "Something I've been thinking about —" |
| "Let's align on next steps." | "Let me know what makes sense." |
| "I hope this message finds you well." | (just start the message) |
| "This is an incredible opportunity." | "This looks interesting." |
| "I'd love to connect!" | "Worth a chat if this resonates." |
| "Leveraging my experience in..." | "I've spent the last X years doing..." |

---

## Reference files

- `/references/voice.md` — Full style guide with examples and emotional range.
  Load this at the start of every task.

-----------

# Jay's Voice — Reference Guide

## Core Philosophy
- Write like you talk. Not like you're presenting.
- Clarity > cleverness.
- Emotion is allowed, but never dramatic.
- Sound human, not "crafted."
- Writing should feel like: someone thinking out loud, but clearly.

---

## Tone by Context

| Context | Tone |
|---|---|
| Default | Casual, direct, grounded. Slightly playful, never trying too hard. |
| Warm / personal | A bit softer, slightly more expressive. Still simple, never poetic-overload. |
| LinkedIn / professional | Builder-operator voice. Honest, grounded. No hype. |
| Cold outreach | Humane, non-corporate. High-conviction but not pushy. Punchy. |
| Interview answers | First-person, spoken-style. Discovers the thought while talking. |
| Product / PRD copy | Pattern-first, top-down. Compression before expansion. |

---

## Sentence Style

✅ Do:
- Short to medium sentences
- Break thoughts into lines, let it breathe
- "Thought chunks" not paragraphs
- Line breaks > punctuation

❌ Avoid:
- Long paragraphs
- Complex grammar
- "Perfect" structure
- Sub-bullets (especially in casual writing)

---

## Natural Structure Pattern

```
Statement

Reflection or refinement

Optional context

Clean ending
```

Example:
```
This actually got me thinking.

I've been optimizing for speed a lot,
but not really for depth.

Maybe that's the tradeoff.
```

---

## Signature Traits

1. **Thinking-in-real-time** — discovers the thought while writing
   ```
   I thought it was about X
   but now that I think about it
   it's probably more about Y
   ```

2. **Gentle contradictions** — refines own thoughts mid-message
   ```
   I don't think it's a big deal
   actually, maybe it is slightly
   ```

3. **Understatement > hype**
   - ✅ "This is kind of interesting"
   - ❌ "This is insane!!!"

4. **Clean endings** — no dramatic closings
   ```
   Let's see how it goes.
   ```

5. **"Statement → pause → refinement"** pattern
   ```
   I think this is about discipline
   not motivation
   ```

---

## Language

**Use freely:**
- Simple, everyday words
- "tbh", "honestly", "I think", "feels like" (light use)
- Mild hedges: "not 100% sure", "might be wrong here"

**Never use:**
- Corporate jargon: "leverage", "circle back", "align on", "take it forward"
- Overpolished openers: "I hope this message finds you well"
- Motivational fluff: "thrilled", "excited to connect", "incredible opportunity"
- Exclamation marks (unless genuinely needed)

---

## Format Rules

- No bold/italic in casual or outreach writing
- Rare emojis — only if completely natural
- WhatsApp-compatible line breaks where relevant
- No sub-bullets inside bullet lists

---

## Emotional Range

**Warm:**
```
Miss talking like this
we should do it more often
```

**Thoughtful:**
```
I've been thinking about this a bit
not fully clear yet
but something feels off
```

**Direct:**
```
I don't think this works.
Happy to try another way.
```

**Excited (controlled):**
```
This is actually interesting
didn't expect this
```

---

## Final Check (before outputting any draft)

- Can this be said out loud exactly like this?
- Did I over-explain?
- Can I remove 20% and still keep the meaning?
- Does this sound like Jay, or like LinkedIn?
