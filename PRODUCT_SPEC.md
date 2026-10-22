# ONCE: Product Spec

**Tagline:** Teach once. Let it teach anyone, forever.

## The promise

A human teaches something the AI didn't know about that person. ONCE preserves
it. Another human can retrieve the method and check what is still unconfirmed.

Everything else exists to make that one promise work.

## Users

- **Teacher**: wants to pass on a personal method once (their own packing list,
  a household routine). Non-technical, possibly older.
- **Learner**: wants exactly that method, with honest "not confirmed" feedback.

## The shipped experience

> **Scope change (2026-10-22):** the browser-workflow PhotoShare demo was
> removed at product direction. The backend learning engine remains, but the
> browser guidance surface is not shipped.

### A. Pack my bag (memory + verification)

Teacher says: *"Remember how I pack my bag for events. I take a charger, water
bottle, extra bag, pen, notebook and mobile phone."* → structured skill with six
required items. Days later: *"I'm going to an event. I've packed my charger,
water bottle and pen. What am I missing?"* → ONCE retrieves the **actual stored
list** (charger ✓, water bottle ✓, pen ✓ → still unconfirmed: extra bag,
notebook, phone).

Honesty rule: `not_verified ≠ missing`. A photo of a closed bag can never
declare an item missing, it's inside or unseen, and ONCE says which.

## Skill record (source of truth: [backend/app/models/core.py](backend/app/models/core.py))

```json
{
  "skill_id": "…", "owner_id": "…", "title": "My Event Bag",
  "type": "packing", "version": 1, "source": "text",
  "items": [
    {"name": "Charger", "required": true, "aliases": ["phone charger"],
     "verification": "confirmed_packed"}
  ],
  "steps": [
    {"order": 0, "instruction": "Boil the water"},
    {"order": 1, "instruction": "Warm the cup"},
    {"order": 2, "instruction": "Steep the leaves for three minutes"}
  ],
  "visibility": "private",
  "share_grants": [{"learner_id": "bob", "revoked": false}]
}
```

Skill types: `packing | checklist | household_procedure | browser_workflow`.
Teaching sources: `voice | text | photo | camera_demo | screen_demo`.

## Design language

- Warm cream background, near-black text, Alexa-blue action color, warm-orange
  secondary accent, soft 24-28px cards.
- Large controls; large microphone; captions for voice; keyboard support;
  reduced-motion respected; the interface *becomes* the task (a packing skill
  becomes a checklist).
- No dashboards, no particles, no metaphor the user must decode. The MCP
  protocol is visible in an optional developer drawer, not forced into the
  primary conversation.

## Why this is not a generic assistant

A generic assistant can generate a packing list. ONCE cannot: it may only
retrieve the list the user actually taught, compare it with what the user
explicitly confirms, and report the rest as **not confirmed**. The value is
grounded memory, not fluent text.

## Who feels the pain first

- **Families:** an older parent's routines, medication checklist, or "how I
  close up the house" can be preserved and retrieved without a screen
  recording.
- **Small teams:** the one person who knows the legacy checklist records it
  once; the next hire retrieves the stored method instead of a stale wiki.
- **Accessibility:** voice-first teaching and spoken step repetition help people
  who cannot read a long procedure or navigate a dense UI.

## Non-goals

- No OS-level global overlays or arbitrary third-party website automation. The
  browser-workflow demo was removed.
- No fabricated Alexa+ claims: official Alexa+ Add-on SDK access is unavailable
  to hackathon participants. We ship a real self-hosted MCP server, a real
  browser MCP client, and a simulated experience, labeled truthfully.
- No claim that inference runs on AWS. The AWS story is the verified data layer
  (DynamoDB, S3, IAM); this account's model access is blocked (see
  `FRICTION_LOG.md`).
