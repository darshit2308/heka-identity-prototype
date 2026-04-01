import express from 'express'

import { initializeDatabase } from './database/db'
import { createAgent, createIssuerDid } from './services/agentService'
import { setupRoutes } from './routes'

/*
  Complete flow:

  [Boot]
    └── createAgent()        → Askar wallet initialised with Ed25519 keypair
    └── createIssuerDid()    → Master did:key created (represents Heka's signing authority)
    └── setupRoutes()        → Express endpoints registered
    └── app.listen()         → Server ready

  [Step 1 — GPG Proof: contributor runs this once]
    └── GET /challenge/:username
          → Verify GitHub user exists and has GPG key
          → Generate random nonce, store with 5min expiry
          → Return plaintext nonce + ready-to-run bash command

    └── Contributor runs locally: echo "<nonce>" | gpg --clearsign
          → Produces a signed message block using their GPG private key
          → Private key never leaves their machine

  [Step 2 — Onboard]
    └── POST /onboard { github_username, signature }
          → Fetch public GPG key from github.com/:username.gpg
          → openpgp.verify() checks signature math against public key
          → Confirm signed text matches stored nonce
          → Create contributor did:key DID
          → Sign W3C VC (JWT format) with issuer Ed25519 key
          → Store { did, vc } in identityStore
          → Return credential

  [PR Verification — runs automatically on every pull_request event]
    └── GitHub webhook → mock-heka-bot
    └── mock-heka-bot → POST /verify { github_username }
          → Look up VC in identityStore
          → Credo verifyCredential() checks EdDSA signature against issuer DID
          → Return { isValid, did }
    └── mock-heka-bot → GitHub Checks API (✅ success or ❌ failure on PR)
*/

async function startServer() {
  console.log('🚀 Starting Mock Heka Identity Service...')

  // Initialize database
  const db = initializeDatabase()

  // Initialize Credo agent and create issuer DID
  const agent = await createAgent()
  console.log('✅ Credo agent initialised')
  console.log('🛡️  Wallet created and unlocked')

  const issuerDid = await createIssuerDid(agent)
  console.log(`📜 Issuer DID: ${issuerDid}`)

  // Create Express app and setup routes
  const app = express()
  app.use(express.json())

  setupRoutes(app, agent, issuerDid, db)

  // Graceful shutdown — always call agent.shutdown() on process exit.
  // Without this, the Askar wallet can get corrupted on abrupt termination (Ctrl+C).
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 ${signal} received. Shutting down agent gracefully...`)
    await agent.shutdown()
    console.log('Agent shut down cleanly.')
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT')) // Ctrl+C in terminal
  process.on('SIGTERM', () => shutdown('SIGTERM')) // Docker stop / system shutdown

  const PORT = parseInt(process.env.PORT || '3000')
  app.listen(PORT, () => {
    console.log(`\n🌐 API running at http://localhost:${PORT}`)
    console.log(`   GET  /status              — health check + issuer DID`)
    console.log(`   GET  /challenge/:username  — Step 1: get nonce to sign`)
    console.log(`   POST /onboard             — Step 2: submit GPG signature + receive VC`)
    console.log(`   POST /verify              — verify contributor (called by GitHub App)`)
  })
}

startServer().catch((err) => {
  console.error('Fatal error during startup:', err)
  process.exit(1)
})