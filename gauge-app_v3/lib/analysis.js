// All judgment-profile maths lives here so the student profile and the educator view agree.
const SURE = 60; // confidence at or above this counts as "sure"

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Probability that a random correct answer carried higher confidence than a random wrong one.
function auroc(rows) {
  const pos = rows.filter((r) => r.correct), neg = rows.filter((r) => !r.correct);
  if (!pos.length || !neg.length) return null;
  let s = 0;
  pos.forEach((p) => neg.forEach((n) => { s += p.confidence > n.confidence ? 1 : p.confidence === n.confidence ? 0.5 : 0; }));
  return s / (pos.length * neg.length);
}

function summary(rows) {
  const acc = mean(rows.map((r) => (r.correct ? 100 : 0)));
  const conf = mean(rows.map((r) => r.confidence));
  return { n: rows.length, accuracy: Math.round(acc), avgConfidence: Math.round(conf), gap: Math.round(conf - acc) };
}

function bucketize(rows) {
  const defs = [["25–40", 0, 40], ["45–60", 41, 60], ["65–80", 61, 80], ["85–100", 81, 100]];
  return defs.map(([label, lo, hi]) => {
    const r = rows.filter((x) => x.confidence >= lo && x.confidence <= hi);
    return {
      label, n: r.length,
      accuracy: r.length ? Math.round((r.filter((x) => x.correct).length / r.length) * 100) : null,
      avgConfidence: r.length ? Math.round(mean(r.map((x) => x.confidence))) : null,
    };
  });
}

function analyse(rows) {
  const base = summary(rows), n = rows.length;
  const quadrants = { sureRight: 0, unsureRight: 0, sureWrong: 0, unsureWrong: 0 };
  rows.forEach((r) => { quadrants[(r.confidence >= SURE ? "sure" : "unsure") + (r.correct ? "Right" : "Wrong")]++; });

  const auc = auroc(rows);
  const byTopic = {};
  rows.forEach((r) => (byTopic[r.topic] = byTopic[r.topic] || []).push(r));
  const topics = Object.entries(byTopic).map(([topic, rs]) => ({
    topic, ...summary(rs), sureWrong: rs.filter((r) => !r.correct && r.confidence >= SURE).length,
  })).map(({ topic, n, accuracy, avgConfidence, sureWrong }) => ({ topic, n, accuracy, avgConfidence, sureWrong }));
  const weakTopics = topics.filter((t) => t.n >= 2 && (t.accuracy < 70 || t.sureWrong > 0))
    .sort((a, b) => b.sureWrong - a.sureWrong || a.accuracy - b.accuracy).slice(0, 2).map((t) => t.topic);

  const lureQs = rows.filter((r) => r.hasLure);
  const lureRate = lureQs.length >= 3 ? Math.round((100 * lureQs.filter((r) => r.lure).length) / lureQs.length) : null;

  const drops = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    if (!a.correct && a.confidence >= SURE && a.round_id === b.round_id) drops.push(a.confidence - b.confidence);
  }
  const adjustAfterMiss = drops.length >= 2 ? Math.round(mean(drops)) : null;

  const isSureWrong = (r) => !r.correct && r.confidence >= SURE;
  const sw = rows.filter((r) => isSureWrong(r) && r.ms).map((r) => r.ms);
  const rest = rows.filter((r) => !isSureWrong(r) && r.ms).map((r) => r.ms);
  const impulsive = sw.length >= 2 && rest.length >= 3 && median(sw) < 0.8 * median(rest);

  const byRound = {};
  rows.forEach((r) => { if (r.round_id) (byRound[r.round_id] = byRound[r.round_id] || []).push(r); });
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b).map((id, i) => ({ round: i + 1, ...summary(byRound[id]) }));

  let label = "Not enough data yet";
  const tips = [];
  if (n >= 8) {
    if (base.gap > 10) label = "Overconfident";
    else if (base.gap < -10) label = "Underconfident";
    else if (auc !== null && auc < 0.55) label = "Confidence not tracking correctness";
    else label = "Well-calibrated";

    if (label === "Overconfident") tips.push("Your confidence ran ahead of your accuracy. Next round, cap yourself at 70% unless you can name why the other options are wrong.");
    if (label === "Underconfident") tips.push("You were right more often than you expected. Next round, choose your answer first, then rate your confidence.");
    if (label === "Confidence not tracking correctness") tips.push("Your confidence did not track which answers were right. Before locking in, write down one reason you might be wrong.");
    if (lureRate !== null && lureRate >= 50) tips.push(`You picked the tempting wrong answer on ${lureRate}% of the questions that had one. When an answer feels instantly obvious, check it once more.`);
    if (impulsive) tips.push("Your confident wrong answers were your quickest ones. Take ten seconds to re-check before you answer.");
    if (adjustAfterMiss !== null && adjustAfterMiss >= 10) tips.push(`After a confident miss you lowered your confidence by about ${adjustAfterMiss} points. Keep doing that.`);
    if (!tips.length) tips.push("Your confidence tracks your accuracy well. Try a targeted round to see whether that holds on your weaker topics.");
  }

  return {
    ...base, quadrants, discrimination: auc === null ? null : Math.round(auc * 100) / 100,
    topics, weakTopics, lureRate, adjustAfterMiss, impulsive, rounds, label, tips: tips.slice(0, 2),
  };
}

module.exports = { analyse, bucketize };
