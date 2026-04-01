import * as openpgp from 'openpgp'
import axios from 'axios'
import crypto from 'crypto'
import Database from 'better-sqlite3';

import '@hyperledger/aries-askar-nodejs'

import express from 'express'
import {
  Agent,
  InitConfig,
  KeyType,
  ClaimFormat,
  W3cCredential,
  W3cCredentialSubject,
  JwaSignatureAlgorithm,
  DidKey,
  W3cJwtVerifiableCredential,
} from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import { AskarModule } from '@credo-ts/askar'
import { ariesAskar } from '@hyperledger/aries-askar-nodejs'


// We have just replaced the in-memory storage from previous pushes, to this
// updated sqlite databse. We are using sqlite, because it is lightweight and 
// improves performance.

// Initialize SQLite Database (this creates a file named 'heka.db' in your folder)
const db = new Database('heka.db');

// Enable WAL(Write ahead logging) mode for better performance
db.pragma('journal_mode = WAL');

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
`);

console.log('🗄️  SQLite Database initialized');

function getStoredJwtCredential(storedValue: string): string {
  try {
    const parsedValue = JSON.parse(storedValue)

    if (typeof parsedValue === 'string') {
      return parsedValue
    }

    if (parsedValue?.jwt?.serializedJwt) {
      return parsedValue.jwt.serializedJwt
    }

    if (parsedValue?.serializedJwt) {
      return parsedValue.serializedJwt
    }
  } catch {
    // Stored value is already a raw JWT string.
  }

  return storedValue
}

const app = express()
app.use(express.json())

// Read sensitive config from environment variables.
// Set WALLET_ID and WALLET_KEY in your .env file.
// Never hardcode wallet credentials in source code.
const agentConfig: InitConfig = {
  label: 'Mock-Heka-Issuer',
  walletConfig: {
    id: process.env.WALLET_ID || 'heka-issuer-wallet',
    key: process.env.WALLET_KEY || 'heka-super-secret-wallet-key',
  },
}

// Creates and initialises the Credo agent with an Askar wallet.
// The Askar wallet handles all cryptographic key storage and signing operations.
async function createAgent(): Promise<Agent> {
  const agent = new Agent({
    config: agentConfig,
    dependencies: agentDependencies,
    modules: {
      askar: new AskarModule({ ariesAskar }), // Adds the wallet system (Askar) for the agent
    },
  })

  await agent.initialize()
  return agent
}

// Creates the master Issuer DID for the Heka backend.
// This DID represents the identity that signs all Verifiable Credentials.
// When a user opens a PR, the GitHub App verifies their VC. The VC contains
// this issuer DID, which tells the verifier WHO signed it. The verifier then
// resolves this DID to get the public key and mathematically checks the signature.
async function createIssuerDid(agent: Agent): Promise<string> {
  const result = await agent.dids.create({
    method: 'key',
    options: { keyType: KeyType.Ed25519 },
  })

  if (!result.didState.did) {
    throw new Error('Failed to create issuer DID')
  }

  return result.didState.did
}

function setupRoutes(agent: Agent, issuerDid: string) {

  // Health check — returns current issuer DID so you can verify the service is live
  app.get('/status', (_, res) => {
    res.json({
      status: 'ok',
      issuerDid,
    })
  })

  /**
   * GET /challenge/:username
   * 
   * Step 1 of the GPG ownership proof flow.
   * 
   * How sign/verify ownership proof works:
   * 1. Verify the GitHub user exists and has a GPG key registered
   * 2. Generate a random nonce and store it server-side with 5 minute expiry
   * 3. Return the plaintext nonce with a ready-to-run bash command
   * 
   * The user runs: echo "<nonce>" | gpg --clearsign
   * This produces a signed message block using their GPG private key.
   * They send this signature block to POST /onboard.
   * 
   * We then fetch their public key from GitHub and verify the signature.
   * Since only the holder of the GPG private key can produce a valid signature,
   * this proves they own the key registered on their GitHub account.
   * The private key never leaves their machine.
   */
  app.get('/challenge/:username', async (req, res) => {
    const github_username = req.params.username

    // ✅ Validate that the user exists AND has a GPG key on GitHub BEFORE issuing
    // a challenge. Without this check, a nonce would be issued for non-existent users,
    // wasting the challenge slot and giving a confusing error later in /onboard.
    try {
      const gpgResponse = await axios.get(`https://github.com/${github_username}.gpg`)
      if (!gpgResponse.data || gpgResponse.data.trim().length === 0) {
        return res.status(400).json({
          error: `No GPG key found for @${github_username} on GitHub. Please add a GPG key to your account first.`,
        })
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        return res.status(404).json({
          error: `GitHub user @${github_username} does not exist.`,
        })
      }
      console.error('Challenge generation error:', error)
      return res.status(503).json({
        error: 'Could not reach GitHub to validate your account. Please try again.',
      })
    }

    // Generate a cryptographically secure random nonce.
    // 16 bytes = 32 hex characters — sufficient entropy for a one-time challenge.
    const nonce = crypto.randomBytes(16).toString('hex')

    // Store the nonce server-side so we can verify the signature in /onboard.
    // The 5 minute expiry prevents stale challenges from being used later.
    // Save challenge to SQLite database
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes from now
    const insertChallenge = db.prepare('INSERT OR REPLACE INTO challenges (github_username, nonce, expires_at) VALUES (?, ?, ?)');
    insertChallenge.run(github_username, nonce, expiresAt);

    console.log(`🎲 Challenge generated for @${github_username}`)

    // Return the plaintext nonce with a ready-to-run bash command.
    // The user runs this command locally — their private key never leaves their machine.
    return res.json({
      message: 'Sign this nonce using your GPG key and send the signature block to POST /onboard',
      challenge: nonce,
      command_to_run: `echo "${nonce}" | gpg --clearsign`,
    })
  })

  /**
   * POST /onboard
   * 
   * Step 2 of the GPG ownership proof flow.
   * 
   * The user sends back the GPG-signed message block. We:
   * 1. Fetch their public key from GitHub (source of truth)
   * 2. Cryptographically verify the signature using openpgp
   * 3. Confirm the signed text matches our stored nonce (prevents cross-challenge attacks)
   * 4. Issue a W3C Verifiable Credential signed by the Heka issuer DID
   */
  app.post('/onboard', async (req, res) => {
    const { github_username, signature } = req.body // user provides the GPG signed message block

    if (!github_username || !signature) {
      return res.status(400).json({
        error: 'github_username and signature are both required',
      })
    }

    // Fetch the pending challenge for this user
    const pendingChallenge = db.prepare('SELECT * FROM challenges WHERE github_username = ?').get(github_username) as any;

    if (!pendingChallenge) {
      return res.status(401).json({
        error: 'No pending challenge found. Please call GET /challenge/:username first.',
      })
    }

    // Check if the challenge has expired
    // Check if the challenge has expired (Note the database column name is expires_at)
    if (Date.now() > pendingChallenge.expires_at) {
      db.prepare('DELETE FROM challenges WHERE github_username = ?').run(github_username);
      return res.status(401).json({
        error: 'Challenge expired. Please request a new one.',
      })
    }


    // Check database for existing identity
    const existingIdentity = db.prepare('SELECT * FROM identities WHERE github_username = ?').get(github_username) as any;
    
    if (existingIdentity) {
      db.prepare('DELETE FROM challenges WHERE github_username = ?').run(github_username);
      console.log(`ℹ️  @${github_username} is already onboarded. Returning existing credential.`)
      const serializedJwt = getStoredJwtCredential(existingIdentity.vc_jwt)
      return res.json({
        message: 'Already onboarded. Returning existing credential.',
        did: existingIdentity.did,
        credential: W3cJwtVerifiableCredential.fromSerializedJwt(serializedJwt),
      })
    }

    // Verify the GPG signature against the public key from GitHub
    try {
      // Fetch the user's public GPG key from GitHub — this is the source of truth.
      // GitHub exposes every user's public GPG keys at github.com/:username.gpg
      const githubResponse = await axios.get(`https://github.com/${github_username}.gpg`)
      const armoredKeys = githubResponse.data

      if (!armoredKeys || armoredKeys.trim().length === 0) {
        return res.status(400).json({
          error: `No GPG key found for @${github_username} on GitHub. Please add a GPG key to your account.`,
        })
      }

      // Parse the public key and the user's signed message block
      const publicKeys = await openpgp.readKeys({ armoredKeys })
      const signedMessage = await openpgp.readCleartextMessage({ cleartextMessage: signature })

      // Cryptographically verify the signature against the public key.
      // openpgp checks the EdDSA/RSA signature math — this cannot be forged.
      const verificationResult = await openpgp.verify({
        message: signedMessage,
        verificationKeys: publicKeys,
      })

      // verified is a Promise that resolves if valid and THROWS if invalid.
      // This is the line that actually enforces cryptographic correctness.
      const { verified } = verificationResult.signatures[0]
      await verified

      // Verify the signed content matches our nonce — prevents cross-challenge attacks
      // where a user signs a different challenge and tries to reuse it.
      // .trim() handles the trailing newline added by the echo command.
      const signedText = signedMessage.getText().trim()

      if (pendingChallenge.nonce !== signedText) {
        return res.status(401).json({
          error: 'Signature is valid, but it signed the wrong challenge. Please sign the exact challenge string.',
        })
      }

    } catch (error: any) {
      // Differentiate between GitHub API failures and actual signature failures
      // so the user gets an accurate error message in each case.
      if (error.response?.status === 404) {
        return res.status(400).json({
          error: `No GPG key found for @${github_username} on GitHub.`,
        })
      }
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || !error.response) {
        return res.status(503).json({
          error: 'Could not reach GitHub to verify your GPG key. Please try again.',
        })
      }
      // Actual cryptographic signature failure
      console.error('Signature verification failed:', error)
      return res.status(401).json({
        error: 'Invalid signature. We could not cryptographically verify your identity.',
      })
    }

    // GPG ownership proven — consume the challenge to prevent replay attacks
    db.prepare('DELETE FROM challenges WHERE github_username = ?').run(github_username);
    console.log(`✅ GPG ownership verified for @${github_username}`)

    try {
      // Step 1: Create a unique did:key DID for this contributor.
      // This DID represents the contributor's decentralized identity.
      // In production, this will be did:hedera anchored on the Hedera ledger.
      const userDidResult = await agent.dids.create({
        method: 'key',
        options: { keyType: KeyType.Ed25519 },
      })

      const userDid = userDidResult.didState.did
      if (!userDid) {
        throw new Error('User DID creation failed')
      }

      console.log(`🔑 User DID created: ${userDid}`)

      // Step 2: Build the verification method URL for the issuer.
      // For did:key, the verification method URL format is:
      //   did:key:z6Mk[fingerprint]#z6Mk[fingerprint]
      // The fragment after # identifies which key in the DID Document to use for signing.
      const issuerDidKey = DidKey.fromDid(issuerDid)
      const verificationMethod = `${issuerDidKey.did}#${issuerDidKey.key.fingerprint}`

      // Step 3: Sign a W3C Verifiable Credential using the issuer's Ed25519 private key.
      // The credential is serialised as a JWT (jwt_vc format) — a compact, URL-safe token
      // that can be verified by anyone who resolves the issuer's DID to get the public key.
      const credential = await agent.w3cCredentials.signCredential<ClaimFormat.JwtVc>({
        credential: new W3cCredential({
          context: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential', 'GithubContributorCredential'],
          issuer: issuerDid,
          issuanceDate: new Date().toISOString(),
          credentialSubject: new W3cCredentialSubject({
            id: userDid,
            // Credo-ts expects custom claims to go inside a 'claims' object
            // to survive the JWT serialisation and properly map to the subject.
            claims: {
              github_username: github_username,
              is_verified: true
            }
          }),
        }),
        verificationMethod,
        alg: JwaSignatureAlgorithm.EdDSA,
        format: ClaimFormat.JwtVc,
      })

      // Step 4: Store the DID and signed VC in the SQLite database for permanent lookup.
      const insertIdentity = db.prepare('INSERT OR REPLACE INTO identities (github_username, did, vc_jwt) VALUES (?, ?, ?)');
      insertIdentity.run(github_username, userDid, credential.serializedJwt);

      console.log(`🎉 Onboarding complete for @${github_username}`)

      return res.json({
        message: 'Onboarding successful. Verifiable Credential issued.',
        did: userDid,
        credential,
      })

    } catch (error) {
      console.error('Onboarding error:', error)
      return res.status(500).json({
        error: 'Failed to issue credential',
      })
    }
  })

  /**
   * POST /verify
   * 
   * Called by the GitHub App (mock-heka-bot) on every pull_request event.
   * 
   * Looks up the contributor's stored VC and feeds it into Credo's
   * verifyCredential() engine, which mathematically checks the EdDSA
   * signature against the issuer's public key resolved from the DID Document.
   * 
   * Returns { isValid: true, did } or { isValid: false, error }
   * The GitHub App uses this response to post a pass/fail Check on the PR.
   */
  app.post('/verify', async (req, res) => {
    // 1. Handle GitHub's initial "ping" event when you first create the webhook
    if (req.body.zen) {
      console.log(`👋 GitHub Webhook Ping received!`)
      return res.status(200).json({ message: 'Ping successful' })
    }

    // 2. Extract the username. 
    // It will look for 'github_username' first (for local testing).
    // If it's not there, it looks inside GitHub's 'sender.login' object.
    const github_username = req.body.github_username || req.body.sender?.login

    if (!github_username) {
      return res.status(400).json({ error: 'Could not find a username in the payload' })
    }

    console.log(`\n🔍 Verifying credential for: @${github_username}`)

    // Look up the contributor's credential in the mock cloud wallet
    const userRecord = db.prepare('SELECT * FROM identities WHERE github_username = ?').get(github_username) as any;
    if (!userRecord) {
      return res.status(404).json({
        isValid: false,
        error: `No credential found for @${github_username}. They need to onboard first.`,
      })
    }

    try {
      const serializedJwt = getStoredJwtCredential(userRecord.vc_jwt)
      const verificationResult = await agent.w3cCredentials.verifyCredential({
        credential: serializedJwt,
      })

      if (verificationResult.isValid) {
        console.log(`✅ Cryptographic signature is VALID for @${github_username}`)
        return res.json({
          status: 'verified',
          isValid: true,
          did: userRecord.did,
        })
      } else {
        console.log(`❌ Cryptographic signature is INVALID for @${github_username}`)
        return res.status(401).json({
          status: 'failed',
          isValid: false,
          error: 'The credential signature could not be verified',
        })
      }

    } catch (error) {
      console.error('Verification error:', error)
      return res.status(500).json({ error: 'Internal verification engine failure' })
    }
  })
}

async function startServer() {
  console.log('🚀 Starting Mock Heka Identity Service...')

  const agent = await createAgent()
  console.log('✅ Credo agent initialised')
  console.log('🛡️  Wallet created and unlocked')

  const issuerDid = await createIssuerDid(agent)
  console.log(`📜 Issuer DID: ${issuerDid}`)

  setupRoutes(agent, issuerDid)

  // Graceful shutdown — always call agent.shutdown() on process exit.
  // Without this, the Askar wallet can get corrupted on abrupt termination (Ctrl+C).
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 ${signal} received. Shutting down agent gracefully...`)
    await agent.shutdown()
    console.log('Agent shut down cleanly.')
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))   // Ctrl+C in terminal
  process.on('SIGTERM', () => shutdown('SIGTERM'))  // Docker stop / system shutdown

  const PORT = parseInt(process.env.PORT || '3000')
  app.listen(PORT, () => {
    console.log(`\n🌐 API running at http://localhost:${PORT}`)
    console.log(`   GET  /status              — health check + issuer DID`)
    console.log(`   GET  /challenge/:username  — Step 1: get nonce to sign`)
    console.log(`   POST /onboard             — Step 2: submit GPG signature + receive VC`)
    console.log(`   POST /verify              — verify contributor (called by GitHub App)`)
  })
}

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

startServer().catch((err) => {
  console.error('Fatal error during startup:', err)
  process.exit(1)
})