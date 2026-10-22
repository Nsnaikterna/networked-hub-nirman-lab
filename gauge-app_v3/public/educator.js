(function () {
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  async function load() {
    const d = await (await fetch("/api/class")).json();
    el("overview").innerHTML =
      `<div><div class="stat-k">STUDENTS</div><div class="stat-v">${d.students.length}</div></div>` +
      `<div><div class="stat-k">ANSWERS</div><div class="stat-v">${d.n}</div></div>` +
      `<div><div class="stat-k">REASONING NOTES</div><div class="stat-v">${d.reflectionCount}</div></div>`;
    renderReliability(el("relSvg"), d.buckets);

    el("groups").innerHTML = Object.keys(d.groups).length
      ? Object.entries(d.groups).map(([k, v]) => `<div><div class="stat-v">${v}</div><div class="legend-note">${esc(k)}</div></div>`).join("")
      : `<p class="empty-note">No students yet.</p>`;

    el("students").innerHTML = d.students.length
      ? `<table class="tbl"><tr><th>STUDENT</th><th>ANSWERS</th><th>ACCURACY</th><th>AVG CONF.</th><th>GAP</th><th>PROFILE</th></tr>` +
        d.students.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.n}</td><td>${s.accuracy}%</td><td>${s.avgConfidence}%</td><td>${s.gap}</td><td>${esc(s.label)}</td></tr>`).join("") + `</table>`
      : `<p class="empty-note">No attempts yet.</p>`;

    el("traps").innerHTML = d.traps.length
      ? d.traps.map((t) => `<div class="reason"><small>${t.misses} confident misses, average confidence ${t.avgConfidence}%</small>${esc(t.prompt)}</div>`).join("")
      : `<p class="empty-note">No confident-but-wrong answers yet.</p>`;

    el("reasons").innerHTML = d.reflections.length
      ? d.reflections.map((r) => `<div class="reason"><small>${esc(r.name)} · ${r.confidence}% confident · ${r.correct ? "correct" : "incorrect"}</small>${esc(r.reflection)}</div>`).join("")
      : `<p class="empty-note">No reasoning notes yet.</p>`;
  }
  load();
  setInterval(load, 5000);
})();
