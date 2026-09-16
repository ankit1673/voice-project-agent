import { useState, useRef } from "react";

// Voice-driven project agent: mic -> transcript -> LLM intent extraction -> confirm -> execute
// Uses browser-native Web Speech API — zero extra STT setup, works in Chrome/Edge.

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL?.trim() || "http://localhost:5000";

export default function VoiceAgent() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interpretation, setInterpretation] = useState(null); // { tool, params, confidence, clarification_needed }
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [typedText, setTypedText] = useState("");
  const recognitionRef = useRef(null);

  const startListening = async () => {
    setError(null);
    setResult(null);
    setInterpretation(null);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition not supported in this browser. Use Chrome or Edge on localhost.");
      return;
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (err) {
      setError("Microphone permission was blocked. Please allow mic access in the browser and try again.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onresult = async (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      setTranscript(text);
      await interpretCommand(text);
    };

    recognition.onerror = (event) => {
      const messageMap = {
        network: "Mic network error. Check your microphone and try again.",
        "not-allowed": "Microphone access was denied. Please allow the browser to use your mic.",
        "service-not-allowed": "Speech service is unavailable. Use Chrome/Edge and try again.",
        "no-speech": "No speech was detected. Please try again.",
      };

      setError(messageMap[event.error] || `Mic error: ${event.error}`);
      setListening(false);
    };

    recognition.onnomatch = () => {
      setError("I couldn’t understand that audio. Please speak more clearly.");
      setListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      setError("Mic is already in use. Please wait a moment and try again.");
      setListening(false);
    }
  };

  const interpretCommand = async (text) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/interpret`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setInterpretation(data);
    } catch (err) {
      setError(`Failed to interpret command: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const submitTypedCommand = async () => {
    const text = typedText.trim();
    if (!text) {
      setError("Please type a command first.");
      return;
    }

    setTranscript(text);
    setTypedText("");
    await interpretCommand(text);
  };

  const confirmAndExecute = async () => {
    if (!interpretation || interpretation.tool === "unknown") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: interpretation.tool, params: interpretation.params }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(`Execution failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const cancel = () => {
    setInterpretation(null);
    setTranscript("");
  };

  return (
    <div style={{ maxWidth: 560, margin: "40px auto", fontFamily: "system-ui, sans-serif" }}>
      <h2>Talk to Your Project</h2>
      <p style={{ color: "#666", fontSize: 14 }}>
        Try: "Mark RFI 104 as resolved" · "Show me overdue submittals" · "What RFIs are open"
      </p>

      <button
        onClick={startListening}
        disabled={listening || loading}
        style={{
          padding: "14px 28px",
          borderRadius: 8,
          border: "none",
          background: listening ? "#e63946" : "#111",
          color: "#fff",
          fontSize: 16,
          cursor: "pointer",
        }}
      >
        {listening ? "Listening..." : "🎤 Speak a command"}
      </button>

      <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={typedText}
          onChange={(e) => setTypedText(e.target.value)}
          placeholder="Or type a command here"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #ddd",
            fontSize: 14,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitTypedCommand();
          }}
        />
        <button onClick={submitTypedCommand} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#111", color: "#fff", cursor: "pointer" }}>
          Send
        </button>
      </div>

      {transcript && (
        <div style={{ marginTop: 16, padding: 12, background: "#f4f4f4", borderRadius: 8 }}>
          <strong>You said:</strong> "{transcript}"
        </div>
      )}

      {loading && <p style={{ marginTop: 12 }}>Thinking...</p>}
      {error && <p style={{ marginTop: 12, color: "#e63946" }}>{error}</p>}

      {/* Show the extracted intent/entities — judges want to SEE the reasoning, not just the outcome */}
      {interpretation && (
        <div style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
          <h4 style={{ margin: "0 0 8px" }}>Interpreted intent</h4>
          <pre style={{ background: "#f9f9f9", padding: 10, borderRadius: 6, fontSize: 13, overflowX: "auto" }}>
{JSON.stringify(interpretation, null, 2)}
          </pre>

          {interpretation.tool === "unknown" || interpretation.clarification_needed ? (
            <p style={{ color: "#b45309" }}>
              ⚠️ {interpretation.clarification_needed || "I couldn't map this to a known action."}
            </p>
          ) : (
            <>
              <p>Confirm this action before I execute it:</p>
              <button onClick={confirmAndExecute} style={{ marginRight: 8, padding: "8px 16px" }}>
                ✅ Confirm & Execute
              </button>
              <button onClick={cancel} style={{ padding: "8px 16px" }}>
                ❌ Cancel
              </button>
            </>
          )}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 16, padding: 16, background: result.success ? "#ecfdf5" : "#fef2f2", borderRadius: 8 }}>
          <strong>{result.success ? "✅ Done" : "❌ Failed"}:</strong> {result.message}
          {result.data && (
            <pre style={{ marginTop: 8, fontSize: 13 }}>{JSON.stringify(result.data, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
