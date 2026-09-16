// Express backend: voice command -> LLM intent/entity extraction -> tool execution
// Two-step flow: /interpret (no side effects) then /execute (only after user confirms)

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { findRfi, updateRfiStatus, getOverdueSubmittals, getOpenRfis } = require("./data");

const app = express();
app.use(cors());
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const client = null;

function interpretTranscriptFallback(transcript) {
  const text = transcript.toLowerCase().trim();

  const openRfiPatterns = [
    /(list|show|get|what).*(open.*rfi|rfi.*open)/i,
    /(open|currently open).*rfi/i,
    /what.*rfi.*open/i,
    /rfi.*open/i,
    /open rfi/i,
  ];

  const overdueSubmittalPatterns = [
    /(list|show|get|what).*(overdue.*submittal|submittal.*overdue)/i,
    /overdue submittal/i,
    /submittals.*overdue/i,
    /what.*overdue.*submittal/i,
  ];

  if (openRfiPatterns.some((pattern) => pattern.test(text))) {
    return { tool: "list_open_rfis", params: {}, confidence: "high", clarification_needed: null };
  }

  if (overdueSubmittalPatterns.some((pattern) => pattern.test(text))) {
    return { tool: "list_overdue_submittals", params: {}, confidence: "high", clarification_needed: null };
  }

  const rfiMatch = text.match(/rfi\s*[- ]?([a-z0-9]+)/i);
  const shouldUpdate = /(mark|update|set|change|resolve|resolved|close|closed|done)/i.test(text);

  if (rfiMatch && shouldUpdate) {
    const rawId = rfiMatch[1].trim();
    const normalizedId = rawId.toUpperCase().startsWith("RFI-") ? rawId.toUpperCase() : `RFI-${rawId.toUpperCase()}`;
    const status = /(resolve|resolved|close|closed|complete|done)/i.test(text) ? "resolved" : "open";
    return {
      tool: "update_rfi_status",
      params: { rfi_id: normalizedId, new_status: status },
      confidence: "high",
      clarification_needed: null,
    };
  }

  if (rfiMatch) {
    return {
      tool: "update_rfi_status",
      params: { rfi_id: `RFI-${rfiMatch[1].toUpperCase()}` },
      confidence: "low",
      clarification_needed: "Which status should I apply to that RFI?",
    };
  }

  if (/^what is$/i.test(text) || /^what is\??$/i.test(text)) {
    return {
      tool: "unknown",
      params: {},
      confidence: "low",
      clarification_needed: "I can only handle RFI status updates and overdue/open listings. Please say something like 'show open RFIs' or 'mark RFI 104 as resolved'.",
    };
  }

  return {
    tool: "unknown",
    params: {},
    confidence: "low",
    clarification_needed: "I can only handle RFI status updates and overdue/open listings. Please rephrase your request.",
  };
}

// ---- Tool definitions (what the agent is allowed to do) ----
// Keep this list SMALL and explicit. This is your "human-in-the-loop" boundary:
// the LLM can only ever pick from these named tools, never invent an action.
const TOOLS = {
  update_rfi_status: {
    description: "Update the status of an RFI by its ID",
    params: ["rfi_id", "new_status"],
  },
  list_overdue_submittals: {
    description: "List submittals that are pending and past due date",
    params: [],
  },
  list_open_rfis: {
    description: "List all RFIs that are still open",
    params: [],
  },
};

// STEP 1: interpret — transcript in, structured intent out. No side effects yet.
app.post("/interpret", async (req, res) => {
  const { transcript } = req.body;
  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: "Empty transcript" });
  }

  const systemPrompt = `You are an intent extraction engine for a construction/architecture project voice assistant.
Given a spoken command transcript, output ONLY valid JSON (no prose, no markdown fences) matching this shape:

{
  "tool": "<one of: update_rfi_status, list_overdue_submittals, list_open_rfis, unknown>",
  "params": { ... },
  "confidence": "high" | "low",
  "clarification_needed": null | "<question to ask the user if entity is ambiguous or missing>"
}

Rules:
- If the transcript references an entity (like an RFI ID) that is ambiguous or missing, set tool to the best guess, confidence "low", and fill clarification_needed with a specific question.
- If the command doesn't match any known tool, set tool to "unknown" and explain in clarification_needed.
- Never invent an RFI ID that wasn't mentioned in the transcript — extract only what's actually said.
- Available tools: ${JSON.stringify(TOOLS)}`;

  try {
    if (!client) {
      return res.json(interpretTranscriptFallback(transcript));
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    res.json(parsed);
  } catch (err) {
    console.error("Interpret error:", err);
    const fallback = interpretTranscriptFallback(transcript);
    res.status(200).json(fallback);
  }
});

// STEP 2: execute — only called after the user confirms the interpreted intent.
app.post("/execute", (req, res) => {
  const { tool, params } = req.body;

  try {
    switch (tool) {
      case "update_rfi_status": {
        const { rfi_id, new_status } = params;
        const existing = findRfi(rfi_id);
        if (!existing) {
          // Graceful failure — this is the moment to show in your demo video
          return res.status(404).json({
            success: false,
            message: `No RFI found with ID "${rfi_id}". I won't guess — please check the ID.`,
          });
        }
        const updated = updateRfiStatus(rfi_id, new_status || "resolved");
        return res.json({ success: true, message: `${updated.id} marked as ${updated.status}.`, data: updated });
      }

      case "list_overdue_submittals": {
        const overdue = getOverdueSubmittals();
        return res.json({
          success: true,
          message: overdue.length ? `${overdue.length} overdue submittal(s) found.` : "No overdue submittals.",
          data: overdue,
        });
      }

      case "list_open_rfis": {
        const open = getOpenRfis();
        return res.json({
          success: true,
          message: open.length ? `${open.length} open RFI(s).` : "No open RFIs.",
          data: open,
        });
      }

      default:
        return res.status(400).json({ success: false, message: `Unknown tool: ${tool}` });
    }
  } catch (err) {
    console.error("Execute error:", err);
    res.status(500).json({ success: false, message: "Execution failed", detail: err.message });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Voice agent backend running on port ${PORT}`));
