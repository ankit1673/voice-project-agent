# Talk to Your Project — Voice Command Agent (AS-03)

## The Problem
On active architecture/construction projects, updating status or checking on items (RFIs, submittals) requires navigating through multiple screens. This agent lets a user speak a command and have it understood, confirmed, and executed — no clicking through menus.

## Architecture
```
Browser mic (Web Speech API)
   → transcript
   → POST /interpret  (LLM extracts: tool, params, confidence, clarification_needed)
   → user reviews & confirms
   → POST /execute     (runs the named tool against project data)
   → result shown, including graceful failure if entity not found
```

Two-step flow (interpret → confirm → execute) is deliberate: the LLM never takes an action
without an explicit human confirmation step, and it can only ever choose from a fixed,
named tool list — it cannot invent actions.

## Setup
### Backend
```
cd backend
npm install
cp .env.example .env   # add your OpenAI API key
npm start
```

### Frontend
Drop `VoiceAgent.jsx` into any React app (Vite/Next/CRA). Update `BACKEND_URL` if deployed.
Requires Chrome or Edge (Web Speech API support).

## What AI helped with
- Scaffolding the interpret/execute route structure
- Drafting the intent-extraction system prompt
- (Fill in what you actually used — Claude/ChatGPT/Cursor/etc. — and what you changed)

## Difficulties faced (fill in your real ones)
- Example: Ambiguous entity references ("that submittal") with no ID — solved by having
  the LLM return `clarification_needed` instead of guessing, surfaced to the user before
  any execution.

## What I'd build next
- Multi-turn clarification (ask follow-up instead of failing outright)
- More tools/intents beyond the 3 implemented
- Real project data source instead of mock dataset
- Confidence-based auto-execute for high-confidence, low-risk actions only
