const express = require("express");
const path = require("path");
const db = require("./db");
const { analyse, bucketize } = require("./lib/analysis");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const BASE_SQL = `SELECT a.id, a.user_id, a.round_id, a.problem_id, a.confidence, a.is_correct, a.chosen_index,
  a.ms, a.reflection, u.name, p.prompt, p.topic, p.lure_index
  FROM attempts a JOIN users u ON u.id = a.user_id JOIN problems p ON p.id = a.problem_id`;
const toRow = (r) => ({
  ...r, correct: !!r.is_correct, hasLure: r.lure_index !== null,
  lure: !r.is_correct && r.lure_index !== null && r.chosen_index === r.lure_index,
});
const userRows = (uid) => db.prepare(BASE_SQL + " WHERE a.user_id = ? ORDER BY a.id").all(uid).map(toRow);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---- Users: a name only, so attempts persist per person ----
app.post("/api/users", (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: "name is required" });
  let user = db.prepare("SELECT id, name FROM users WHERE name = ?").get(name);
  if (!user) user = { id: db.prepare("INSERT INTO users (name) VALUES (?)").run(name).lastInsertRowid, name };
  res.json(user);
});

// ---- Rounds: 10 questions, unseen ones first. "targeted" favours the student's weakest topics ----
app.post("/api/rounds", (req, res) => {
  const uid = parseInt(req.body.user_id, 10);
  if (!Number.isInteger(uid)) return res.status(400).json({ error: "user_id is required" });
  const profile = analyse(userRows(uid));
  const seen = new Set(db.prepare("SELECT DISTINCT problem_id FROM attempts WHERE user_id = ?").all(uid).map((r) => r.problem_id));
  const all = shuffle(db.prepare("SELECT id, prompt, options, topic FROM problems").all()).sort((a, b) => seen.has(a.id) - seen.has(b.id));
  const targeted = req.body.focus === "targeted" && profile.weakTopics.length > 0;
  let pick = targeted ? all.filter((p) => profile.weakTopics.includes(p.topic)).slice(0, 6) : [];
  pick = pick.concat(all.filter((p) => !pick.includes(p))).slice(0, 10);
  const info = db.prepare("INSERT INTO rounds (user_id, focus) VALUES (?, ?)").run(uid, targeted ? "targeted" : "mixed");
  res.json({
    round_id: info.lastInsertRowid,
    focus: targeted ? "targeted" : "mixed",
    topics: targeted ? profile.weakTopics : [],
    problems: shuffle(pick).map((p) => ({ id: p.id, prompt: p.prompt, options: JSON.parse(p.options), topic: p.topic })),
  });
});

// ---- Attempts: confidence is stated before this call; correctness is decided here ----
app.post("/api/attempts", (req, res) => {
  const { user_id, round_id, problem_id, confidence, chosen_index } = req.body;
  const ms = Math.max(0, Math.min(600000, parseInt(req.body.ms, 10) || 0));
  if (![user_id, round_id, problem_id, confidence, chosen_index].every(Number.isInteger) || confidence < 0 || confidence > 100) {
    return res.status(400).json({ error: "user_id, round_id, problem_id, confidence (0-100), chosen_index must be integers" });
  }
  const p = db.prepare("SELECT correct_index, lure_index, explanation FROM problems WHERE id = ?").get(problem_id);
  if (!p) return res.status(404).json({ error: "problem not found" });
  const correct = chosen_index === p.correct_index ? 1 : 0;
  const info = db.prepare(
    "INSERT INTO attempts (user_id, round_id, problem_id, confidence, chosen_index, is_correct, ms) VALUES (?,?,?,?,?,?,?)"
  ).run(user_id, round_id, problem_id, confidence, chosen_index, correct, ms);
  res.json({
    attempt_id: info.lastInsertRowid, correct: !!correct, correct_index: p.correct_index,
    explanation: p.explanation, lure: !correct && p.lure_index !== null && chosen_index === p.lure_index,
  });
});

app.post("/api/attempts/:id/reflection", (req, res) => {
  const text = String(req.body.text || "").slice(0, 500);
  db.prepare("UPDATE attempts SET reflection = ? WHERE id = ?").run(text, parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// ---- Student judgment profile ----
app.get("/api/users/:id/profile", (req, res) => {
  const rows = userRows(parseInt(req.params.id, 10));
  res.json({ ...analyse(rows), buckets: bucketize(rows) });
});

// ---- Educator view: class-wide picture ----
app.get("/api/class", (req, res) => {
  const rows = db.prepare(BASE_SQL + " ORDER BY a.id").all().map(toRow);
  const byUser = {};
  rows.forEach((r) => (byUser[r.name] = byUser[r.name] || []).push(r));
  const students = Object.entries(byUser).map(([name, rs]) => {
    const a = analyse(rs);
    return { name, n: a.n, accuracy: a.accuracy, avgConfidence: a.avgConfidence, gap: a.gap, label: a.label, discrimination: a.discrimination };
  }).sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));
  const groups = {};
  students.forEach((s) => (groups[s.label] = (groups[s.label] || 0) + 1));

  const trapMap = {};
  rows.filter((r) => !r.correct && r.confidence >= 60).forEach((r) => {
    const t = (trapMap[r.prompt] = trapMap[r.prompt] || { prompt: r.prompt, misses: 0, sum: 0 });
    t.misses++; t.sum += r.confidence;
  });
  const traps = Object.values(trapMap).sort((a, b) => b.misses - a.misses).slice(0, 3)
    .map((t) => ({ prompt: t.prompt, misses: t.misses, avgConfidence: Math.round(t.sum / t.misses) }));

  const notes = rows.filter((r) => r.reflection);
  res.json({
    n: rows.length, students, groups, buckets: bucketize(rows), traps,
    reflectionCount: notes.length,
    reflections: notes.slice(-6).reverse().map((r) => ({ name: r.name, correct: r.correct, confidence: r.confidence, reflection: r.reflection })),
  });
});

app.listen(PORT, () => console.log(`Gauge running at http://localhost:${PORT}`));
