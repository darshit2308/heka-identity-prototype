import Database from 'better-sqlite3'

// We have just replaced the in-memory storage from previous pushes, to this
// updated sqlite databse. We are using sqlite, because it is lightweight and 
// improves performance.

export function initializeDatabase(): Database.Database {
  // Initialize SQLite Database (this creates a file named 'heka.db' in your folder)
  const db = new Database('heka.db')

  // Enable WAL(Write ahead logging) mode for better performance
  db.pragma('journal_mode = WAL')

  // Create our tables if they don't exist yet
  db.exec(`
    CREATE TABLE IF NOT EXISTS challenges (
      github_username TEXT PRIMARY KEY,
      nonce TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS identities (
      github_username TEXT PRIMARY KEY,
      did TEXT NOT NULL,
      vc_jwt TEXT NOT NULL
    );
  `)

  console.log('🗄️  SQLite Database initialized')
  return db
}
