const path = require("path");
const Database = require("better-sqlite3");
const seed = require("./seedData");

// New file name (gauge3.db) so older databases with a different schema are never touched.
const db = new Database(path.join(__dirname, "gauge3.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS problems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt TEXT NOT NULL,
    options TEXT NOT NULL,
    correct_index INTEGER NOT NULL,
    lure_index INTEGER,
    topic TEXT,
    difficulty TEXT,
    explanation TEXT
  );
  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    focus TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    round_id INTEGER,
    problem_id INTEGER NOT NULL,
    confidence INTEGER NOT NULL,
    chosen_index INTEGER NOT NULL,
    is_correct INTEGER NOT NULL,
    ms INTEGER,
    reflection TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(problem_id) REFERENCES problems(id)
  );
`);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Seed once. Options are shuffled here so the right answer is not always in the same position.
if (db.prepare("SELECT COUNT(*) AS n FROM problems").get().n === 0) {
  const ins = db.prepare(
    "INSERT INTO problems (prompt, options, correct_index, lure_index, topic, difficulty, explanation) VALUES (?,?,?,?,?,?,?)"
  );
  db.transaction(() => {
    for (const q of seed) {
      const order = shuffle(q.options.map((_, i) => i)); // new position -> old index
      const options = order.map((o) => q.options[o]);
      ins.run(q.prompt, JSON.stringify(options), order.indexOf(q.correct),
        q.lure === undefined ? null : order.indexOf(q.lure), q.topic, q.difficulty, q.explanation);
    }
  })();
  console.log(`Seeded ${seed.length} questions.`);
}

module.exports = db;
