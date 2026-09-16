// Mock project data — replace with Mongo later if you have time.
// Keep this small (5-10 items) — enough to demo, not enough to waste setup time on.

let rfis = [
  { id: "RFI-101", subject: "HVAC duct routing clash with beam", status: "open", raisedBy: "Contractor", dueDate: "2026-09-18" },
  { id: "RFI-102", subject: "Facade panel finish clarification", status: "open", raisedBy: "Fabricator", dueDate: "2026-09-14" }, // overdue
  { id: "RFI-103", subject: "Electrical conduit sizing", status: "resolved", raisedBy: "Consultant", dueDate: "2026-09-10" },
  { id: "RFI-104", subject: "Lobby flooring material swap approval", status: "open", raisedBy: "Interior Designer", dueDate: "2026-09-20" },
];

let submittals = [
  { id: "SUB-201", item: "Marble sample - lobby", status: "pending", vendor: "Stone Co", dueDate: "2026-09-15" }, // overdue
  { id: "SUB-202", item: "Window glazing spec", status: "approved", vendor: "GlassTech", dueDate: "2026-09-05" },
  { id: "SUB-203", item: "Door hardware finish", status: "pending", vendor: "HardwareX", dueDate: "2026-09-19" },
];

function findRfi(id) {
  return rfis.find(r => r.id.toLowerCase() === String(id).toLowerCase());
}

function updateRfiStatus(id, status) {
  const rfi = findRfi(id);
  if (!rfi) return null;
  rfi.status = status;
  return rfi;
}

function getOverdueSubmittals() {
  const today = new Date("2026-09-16"); // demo "today" — matches submission deadline day
  return submittals.filter(s => s.status === "pending" && new Date(s.dueDate) < today);
}

function getOpenRfis() {
  return rfis.filter(r => r.status === "open");
}

module.exports = { rfis, submittals, findRfi, updateRfiStatus, getOverdueSubmittals, getOpenRfis };
