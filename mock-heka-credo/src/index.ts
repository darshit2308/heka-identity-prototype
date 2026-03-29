import * as openpgp from 'openpgp'
import axios from 'axios'
import crypto from 'crypto'

import '@hyperledger/aries-askar-nodejs'

import express from 'express'
import {
  Agent,
  InitConfig,
  KeyType,
  W3cCredential,
  W3cCredentialSubject,
  JwaSignatureAlgorithm,
  DidKey,
  W3cJwtVerifiableCredential,
} from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import { AskarModule } from '@credo-ts/askar'
import { ariesAskar } from '@hyperledger/aries-askar-nodejs'

/**
 * In-memory store for issued identities.
 * Key: github_username → Value: { did, vc (signed JWT credential) }
 * 
 * Typed as W3cJwtVerifiableCredential — the signed form returned by signCredential().
 * This is distinct from W3cCredential (the unsigned form). Using the wrong type
 * causes silent failures when verifyCredential() is called later.
 * 
 * Replace with persistent DB (e.g. PostgreSQL) in production.
 */
const identityStore: Record<string, {
  did: string;
  vc: W3cJwtVerifiableCredential
}> = {}

/**
 * In-memory store for pending GPG authentication challenges.
 * Each entry is keyed by github_username and contains:
 * - nonce: the random string the user must sign with their GPG private key
 * - expiresAt: Unix timestamp after which the challenge is invalid
 * 
 * Challenges are single-use — deleted immediately after successful verification
 * to prevent replay attacks.
 */
const challengeStore: Record<string, { nonce: string; expiresAt: number }> = {}

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
    challengeStore[github_username] = {
      nonce,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes from now
    }

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
    const pendingChallenge = challengeStore[github_username]

    if (!pendingChallenge) {
      return res.status(401).json({
        error: 'No pending challenge found. Please call GET /challenge/:username first.',
      })
    }

    // Check if the challenge has expired
    if (Date.now() > pendingChallenge.expiresAt) {
      delete challengeStore[github_username] // clean up the expired entry
      return res.status(401).json({
        error: 'Challenge expired. Please request a new one.',
      })
    }

    // Now we check, if the decrypted message was equal to nonce
    if (pendingChallenge.nonce != decrypted_challenge) {
      return res.status(401).json({
        error: 'Invalid challenge response. Decryption failed, or the decrypted message was wrong'
      })
    }
    delete challengeStore[github_username]
    console.log(`GPG authentication successfull for @${github_username} `)

    if (identityStore[github_username]) {
      delete challengeStore[github_username] // clean up the used challenge
      console.log(`ℹ️  @${github_username} is already onboarded. Returning existing credential.`)
      return res.json({
        message: 'Already onboarded. Returning existing credential.',
        did: identityStore[github_username].did,
        credential: identityStore[github_username].vc,
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
    delete challengeStore[github_username]
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
      const credential = await agent.w3cCredentials.signCredential({
        credential: new W3cCredential({
          contexts: ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential', 'GithubContributorCredential'],
          issuer: issuerDid,
          issuanceDate: new Date().toISOString(),
          credentialSubject: new W3cCredentialSubject({
            id: userDid,
            github_username,
            is_verified: true,
          }),
        }),
        verificationMethod,
        alg: JwaSignatureAlgorithm.EdDSA,
        format: 'jwt_vc',
      })

      // Step 4: Store the DID and signed VC in the mock cloud wallet for fast lookup.
      // Cast to W3cJwtVerifiableCredential — signCredential() returns the union type
      // W3cVerifiableCredential, but format: 'jwt_vc' guarantees the JWT subtype.
      identityStore[github_username] = {
        did: userDid,
        vc: credential as W3cJwtVerifiableCredential,
      }

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
    const { github_username } = req.body

    if (!github_username) {
      return res.status(400).json({ error: 'github_username is required' })
    }

    console.log(`\n🔍 Verifying credential for: @${github_username}`)

    // Look up the contributor's credential in the mock cloud wallet
    const userRecord = identityStore[github_username]
    if (!userRecord) {
      // Not a server error — the user simply hasn't onboarded yet
      return res.status(404).json({
        isValid: false,
        error: 'No credential found. This contributor needs to onboard via the Heka portal first.',
      })
    }

    try {
      // Cryptographically verify the JWT signature using Credo's engine.
      // Credo resolves the issuer DID from the VC, fetches the public key from the
      // DID Document, and checks the EdDSA signature. This cannot be forged.
      // 
      // userRecord.vc is typed as W3cJwtVerifiableCredential (the signed JWT form).
      // Do NOT cast this to W3cCredential (unsigned) — that breaks verification.
      const verificationResult = await agent.w3cCredentials.verifyCredential({
        credential: userRecord.vc,
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