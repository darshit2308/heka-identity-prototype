import Database from 'better-sqlite3'
import { Challenge, Identity } from '../types'

export class IdentityService {
  constructor(private db: Database.Database) {}

  /**
   * Store a challenge for a GitHub user
   * The 5 minute expiry prevents stale challenges from being used later.
   */
  storeChallenge(github_username: string, nonce: string): void {
    const expiresAt = Date.now() + 5 * 60 * 1000 // 5 minutes from now
    const insertChallenge = this.db.prepare(
      'INSERT OR REPLACE INTO challenges (github_username, nonce, expires_at) VALUES (?, ?, ?)'
    )
    insertChallenge.run(github_username, nonce, expiresAt)
  }

  /**
   * Retrieve a pending challenge for a GitHub user
   */
  getChallenge(github_username: string): Challenge | null {
    const getChallenge = this.db.prepare('SELECT * FROM challenges WHERE github_username = ?')
    return getChallenge.get(github_username) as Challenge | null
  }

  /**
   * Delete a challenge after verification (prevent replay attacks)
   */
  deleteChallenge(github_username: string): void {
    const deleteChallenge = this.db.prepare('DELETE FROM challenges WHERE github_username = ?')
    deleteChallenge.run(github_username)
  }

  /**
   * Check if a challenge has expired
   */
  isChallengeExpired(challenge: Challenge): boolean {
    return Date.now() > challenge.expires_at
  }

  /**
   * Store a GitHub user's identity (DID + VC)
   */
  storeIdentity(github_username: string, did: string, vc_jwt: string): void {
    const insertIdentity = this.db.prepare(
      'INSERT OR REPLACE INTO identities (github_username, did, vc_jwt) VALUES (?, ?, ?)'
    )
    insertIdentity.run(github_username, did, vc_jwt)
  }

  /**
   * Retrieve a stored identity by GitHub username
   */
  getIdentity(github_username: string): Identity | null {
    const getIdentity = this.db.prepare('SELECT * FROM identities WHERE github_username = ?')
    return getIdentity.get(github_username) as Identity | null
  }
}
