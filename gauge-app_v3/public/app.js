(function () {
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const api = (url, body) => fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined).then((r) => r.json());
  const view = (id) => ["startCard", "problemCard", "summaryCard"].forEach((v) => (el(v).style.display = v === id ? "" : "none"));
  const QUAD = [["sureRight", "Knew it and knew that you knew"], ["unsureRight", "Knew it but doubted yourself"],
    ["sureWrong", "Felt sure but were wrong (the riskiest)"], ["unsureWrong", "Did not know and knew it (healthy)"]];
  let user, round, idx, conf, t0, attemptId, results;

  el("startBtn").addEventListener("click", login);
  el("nameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
  el("mixedBtn").addEventListener("click", () => startRound("mixed"));
  el("targetBtn").addEventListener("click", () => startRound("targeted"));
  el("profileBtn").addEventListener("click", async () => renderSummary(await api(`/api/users/${user.id}/profile`), false));
  el("homeBtn").addEventListener("click", home);
  el("confSlider").addEventListener("input", (e) => { conf = parseInt(e.target.value, 10); el("confVal").textContent = conf; });
  el("lockBtn").addEventListener("click", showOptions);
  el("nextBtn").addEventListener("click", next);

  async function login() {
    const name = el("nameInput").value.trim();
    if (!name) return;
    user = await api("/api/users", { name });
    el("loginCard").style.display = "none";
    el("appArea").style.display = "";
    el("userLabel").textContent = "SESSION: " + user.name;
    home();
  }

  async function home() {
    const p = await api(`/api/users/${user.id}/profile`);
    const r = p.rounds.length;
    el("startText").textContent = p.n === 0
      ? "Each round has 10 questions. Rate your confidence, answer, and Gauge compares the two."
      : `You have answered ${p.n} questions in ${r} round${r === 1 ? "" : "s"}.`;
    const targeted = p.n >= 8 && p.weakTopics.length > 0;
    el("targetBtn").style.display = targeted ? "" : "none";
    el("targetBtn").textContent = targeted ? "Targeted round: " + p.weakTopics.join(", ") : "";
    el("profileBtn").style.display = p.n > 0 ? "" : "none";
    view("startCard");
  }

  async function startRound(focus) {
    round = await api("/api/rounds", { user_id: user.id, focus });
    idx = 0; results = [];
    showQuestion();
  }

  function showQuestion() {
    const p = round.problems[idx];
    el("progressLabel").textContent = `QUESTION ${idx + 1} OF ${round.problems.length}`;
    el("topicLabel").textContent = p.topic.toUpperCase();
    el("problemText").textContent = p.prompt;
    el("predictPhase").style.display = "";
    el("answerPhase").style.display = "none";
    el("revealPhase").style.display = "none";
    el("confSlider").value = 50; el("confVal").textContent = "50"; conf = 50;
    el("reflectInput").value = "";
    t0 = Date.now();
    view("problemCard");
  }

  function showOptions() {
    el("predictPhase").style.display = "none";
    el("answerPhase").style.display = "";
    const list = el("optionsList");
    list.innerHTML = "";
    round.problems[idx].options.forEach((text, i) => {
      const b = document.createElement("button");
      b.className = "opt-btn";
      b.textContent = text;
      b.addEventListener("click", () => answer(i, list));
      list.appendChild(b);
    });
  }

  function message(r, c) {
    if (r.correct && c >= 60) return `Correct, and you were sure (${c}%). Well calibrated.`;
    if (r.correct) return `Correct, but you only said ${c}%. You knew more than you gave yourself credit for.`;
    if (c >= 60) return `Incorrect despite ${c}% confidence.` + (r.lure ? " You picked the tempting answer." : "");
    return `Incorrect, and you were unsure (${c}%). Your doubt was justified.`;
  }

  async function answer(i, list) {
    const p = round.problems[idx];
    const r = await api("/api/attempts", { user_id: user.id, round_id: round.round_id, problem_id: p.id, confidence: conf, chosen_index: i, ms: Date.now() - t0 });
    attemptId = r.attempt_id;
    results.push({ correct: r.correct, conf });
    [...list.children].forEach((b, k) => {
      b.disabled = true;
      if (k === r.correct_index) b.classList.add("correct");
      else if (k === i) b.classList.add("incorrect");
    });
    el("answerPhase").style.display = "";
    el("revealPhase").style.display = "";
    const line = el("revealLine");
    line.className = "reveal-line " + (r.correct ? "good" : "bad");
    line.textContent = message(r, conf);
    el("explainLine").textContent = r.explanation || "";
    el("nextBtn").textContent = idx + 1 < round.problems.length ? "Next →" : "Finish round →";
  }

  async function next() {
    const text = el("reflectInput").value.trim();
    if (text && attemptId) await api(`/api/attempts/${attemptId}/reflection`, { text });
    attemptId = null;
    if (++idx < round.problems.length) return showQuestion();
    renderSummary(await api(`/api/users/${user.id}/profile`), true);
  }

  function renderSummary(p, finished) {
    el("sumSub").textContent = p.n + " ANSWERS";
    let rb = "";
    if (finished) {
      const n = results.length, ok = results.filter((r) => r.correct).length;
      const ac = Math.round((100 * ok) / n), cf = Math.round(results.reduce((s, r) => s + r.conf, 0) / n);
      rb += `<p class="reveal-line neutral">This round: ${ok} of ${n} correct, average confidence ${cf}%, gap ${cf - ac} points.</p>`;
    }
    if (p.rounds.length >= 2) {
      const a = p.rounds[p.rounds.length - 2], b = p.rounds[p.rounds.length - 1];
      rb += `<p class="legend-note">Round ${b.round} vs round ${a.round}: calibration gap ${Math.abs(a.gap)} → ${Math.abs(b.gap)} points, accuracy ${a.accuracy}% → ${b.accuracy}%.</p>`;
    }
    el("roundBox").innerHTML = rb;
    let h;
    if (p.n < 8) {
      h = `<p class="legend-note">Answer at least 8 questions to see your profile. So far: ${p.n}.</p>`;
    } else {
      h = `<p class="profile-label">${esc(p.label)}</p>` +
        `<p class="legend-note">Accuracy ${p.accuracy}%, average confidence ${p.avgConfidence}%, gap ${p.gap} points` +
        (p.discrimination !== null ? `, confidence separation ${p.discrimination} (0.5 means your confidence does not tell right from wrong, 1 means it always does)` : "") + `.</p>`;
      h += `<div class="quad">` + QUAD.map(([k, t]) => `<div><div class="stat-v">${p.quadrants[k]}</div><div class="legend-note">${t}</div></div>`).join("") + `</div>`;
      h += `<table class="tbl"><tr><th>TOPIC</th><th>ANSWERED</th><th>ACCURACY</th><th>AVG CONF.</th><th>SURE BUT WRONG</th></tr>` +
        p.topics.map((t) => `<tr><td>${esc(t.topic)}</td><td>${t.n}</td><td>${t.accuracy}%</td><td>${t.avgConfidence}%</td><td>${t.sureWrong}</td></tr>`).join("") + `</table>`;
      h += `<div class="card-label" style="margin-top:18px;"><span>TRY THIS NEXT ROUND</span></div>` + p.tips.map((t) => `<p class="tip">${esc(t)}</p>`).join("");
    }
    el("profileBox").innerHTML = h;
    renderReliability(el("relSvg"), p.buckets || []);
    view("summaryCard");
  }
})();
