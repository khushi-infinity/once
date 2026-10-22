# ONCE — Product Spec

**Tagline:** Teach once. Let it teach anyone, forever.

## The promise

A human teaches something the AI didn't know about that person. ONCE preserves
it. Another human uses that knowledge successfully, and ONCE helps when they
make a mistake.

Everything else exists to make that one promise work.

## Users

- **Teacher** — wants to pass on a personal method once (their own packing list, their workflow on a website). Non-technical, possibly older.
- **Learner** — wants exactly that method, guided step by step, with friendly correction when they go wrong.

## The two experiences that must work

### A. Pack my bag (memory + verification)

Teacher says: *"Remember how I pack my bag for events. I take a charger, water
bottle, extra bag, pen, notebook and mobile phone."* → structured skill with six
required items. Days later: *"I'm going to an event. I've packed my charger,
water bottle and pen. What am I missing?"* → ONCE retrieves the **actual stored
list** (charger ✓, water bottle ✓, pen ✓ → still unconfirmed: extra bag,
notebook, phone).

Honesty rule: `not_verified ≠ missing`. A photo of a closed bag can never
declare an item missing — it's inside or unseen, and ONCE says which.

### B. Teach someone how to use a computer (browser guidance)

Teacher records a task in the controlled **PhotoShare** demo app (open contact →
attach → choose photo → send). Another authorized user opens the same app, and
ONCE highlights the right element, waits, verifies the actual event, and only
advances on real success — with Repeat / I'm stuck / Previous always available.

No fake timers "advancing" steps. No predetermined success animation. Changed
or missing UI elements produce visible errors.

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
    {"order": 0, "instruction": "Open the contact Ravi",
     "target_element_id": "contact-ravi", "expected_event": "click"}
  ],
  "visibility": "private",
  "share_grants": [{"learner_id": "bob", "revoked": false}]
}
```

Skill types: `packing | checklist | household_procedure | browser_workflow`.
Teaching sources: `voice | text | photo | camera_demo | screen_demo`.

## Design language

- Warm cream background, near-black text, Alexa-blue action color, warm-orange
  secondary accent, soft 24–28px cards.
- Large controls; large microphone; captions for voice; keyboard support;
  reduced-motion respected; the interface *becomes* the task (packing skill →
  checklist; browser workflow → highlight overlay).
- No dashboards, no particles, no metaphor the user must decode. The MCP
  protocol is visible in an optional developer drawer, not forced into the
  primary conversation.

## Why this is not a generic assistant

A generic assistant can generate a packing list. ONCE cannot: it may only
retrieve the list the user actually taught, compare it with what the user
explicitly confirms, and report the rest as **not confirmed**. A generic
assistant can describe a workflow. ONCE stores the exact DOM element and
expected event, outlines it in the live page, and refuses to advance on a wrong
click. The value is grounded memory + verified guidance, not fluent text.

## Who feels the pain first

- **Families:** an older parent's routines, medication checklist, or "how I
  close up the house" can be preserved and guided without a screen recording.
- **Small teams:** the one person who knows the legacy internal tool records it
  once; the next hire follows verified steps instead of a stale wiki.
- **Accessibility:** voice-first teaching and spoken step repetition help people
  who cannot read a long procedure or navigate a dense UI.

## Non-goals

- No OS-level global overlays or arbitrary third-party website automation
  (guided browser learning happens inside the controlled PhotoShare demo app).
- No fabricated Alexa+ claims: official Alexa+ Add-on SDK access is unavailable
  to hackathon participants. We ship a real self-hosted MCP server, a real
  browser MCP client, and a simulated experience, labeled truthfully.
- No claim that inference runs on AWS. The AWS story is the verified data layer
  (DynamoDB, S3, IAM); this account's model access is blocked (see
  `FRICTION_LOG.md`).
