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
 * Replace with persistent DB (e.g. PostgreSQL) in production.
 * Key: github_username → Value: { did, vc (signed JWT) }
 */
const identityStore: Record<string, { did: string; vc: W3cJwtVerifiableCredential }> = {}

const app = express()
app.use(express.json())

// ✅ FIX (Issue 3): Read sensitive config from environment variables
// Never hardcode wallet keys — set these in your .env file
const agentConfig: InitConfig = {
  label: 'Mock-Heka-Issuer',
  walletConfig: {
    id: process.env.WALLET_ID || 'heka-issuer-wallet',
    key: process.env.WALLET_KEY || 'heka-super-secret-wallet-key',
  },
}

async function createAgent(): Promise<Agent> {
  const agent = new Agent({
    config: agentConfig,
    dependencies: agentDependencies,
    modules: {
      askar: new AskarModule({ ariesAskar }),
    },
  })

  await agent.initialize()
  return agent
}

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

  // Onboards a contributor: creates their DID, signs a VC, stores in wallet
  app.post('/onboard', async (req, res) => {
    const { github_username } = req.body

    if (!github_username) {
      return res.status(400).json({
        error: 'github_username is required',
      })
    }

    // ✅ FIX (Issue 2): Prevent silent overwrite if same user onboards twice.
    // In production, you'd want to re-issue with a new credential, but for the
    // MVP, returning the existing credential is the safe and correct behaviour.
    if (identityStore[github_username]) {
      console.log(`ℹ️  @${github_username} is already onboarded. Returning existing credential.`)
      return res.json({
        message: 'Already onboarded. Returning existing credential.',
        did: identityStore[github_username].did,
        credential: identityStore[github_username].vc,
      })
    }

    try {
      // Step 1: Create a unique DID for this contributor
      const userDidResult = await agent.dids.create({
        method: 'key',
        options: { keyType: KeyType.Ed25519 },
      })

      const userDid = userDidResult.didState.did
      if (!userDid) {
        throw new Error('User DID creation failed')
      }

      console.log(`🔑 User DID created: ${userDid}`)

      // Step 2: Build the verification method URL for the issuer
      // For did:key, the format is: did:key:z6Mk...#z6Mk...
      // The fragment after # is the key fingerprint (same as the multibase part)
      const issuerDidKey = DidKey.fromDid(issuerDid)
      const verificationMethod = `${issuerDidKey.did}#${issuerDidKey.key.fingerprint}`

      // Step 3: Sign a W3C Verifiable Credential using the issuer's key
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

      // Step 4: Store the signed credential in the mock cloud wallet
      // ✅ FIX (Bug 1): Correctly typed as W3cJwtVerifiableCredential, not W3cCredential
      identityStore[github_username] = {
        did: userDid,
        vc: credential as W3cJwtVerifiableCredential,
      }

      console.log(`✅ Onboarding complete for @${github_username}`)

      return res.json({
        message: 'Onboarding successful',
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

  // This route checks if the user's digital certificate is genuine or not.
  // Called by the GitHub App (mock-heka-bot) when a PR is opened.
  app.post('/verify', async (req, res) => {
    const { github_username } = req.body

    if (!github_username) {
      return res.status(400).json({ error: 'github_username is required' })
    }

    console.log(`\n🔍 Verifying credential for: @${github_username}`)

    // Step 1: Fetch the user's credential from the Mock Cloud Wallet
    const userRecord = identityStore[github_username]
    if (!userRecord) {
      // Not a server error — user simply hasn't onboarded yet
      return res.status(404).json({
        isValid: false,
        error: 'No credential found. This contributor needs to onboard first.',
      })
    }

    try {
      // Step 2: Cryptographically verify the JWT signature using Credo's engine.
      // This checks the signature against the issuer's public key from the DID Document.
      // ✅ FIX (Bug 1 critical): Pass the stored vc directly — it is already a
      // W3cJwtVerifiableCredential (the signed form), NOT a W3cCredential (unsigned form).
      // The original code cast it as W3cCredential which would silently break verification.
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

  // ✅ FIX (Issue 4): Graceful shutdown — always call agent.shutdown() on exit.
  // Without this, the Askar wallet file can get corrupted on abrupt termination.
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 ${signal} received. Shutting down agent...`)
    await agent.shutdown()
    console.log('Agent shut down cleanly.')
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))   // Ctrl+C
  process.on('SIGTERM', () => shutdown('SIGTERM'))  // Docker / system stop

  const PORT = parseInt(process.env.PORT || '3000')
  app.listen(PORT, () => {
    console.log(`\n🌐 API running at http://localhost:${PORT}`)
    console.log(`   GET  /status  — health check`)
    console.log(`   POST /onboard — issue VC to contributor`)
    console.log(`   POST /verify  — verify contributor credential`)
  })
}

/*
  Flow of code:

  [Boot]
    └── createAgent()       → Askar wallet initialised
    └── createIssuerDid()   → Master did:key created (represents Heka authority)
    └── setupRoutes()       → Express endpoints registered
    └── app.listen()        → Server ready

  [/onboard]
    └── Create user did:key
    └── Sign W3C VC (JWT format) with issuer key
    └── Store in identityStore
    └── Return credential to caller

  [/verify — called by GitHub App on every PR]
    └── Look up user in identityStore
    └── Feed VC into Credo verifyCredential()
    └── Return { isValid: true/false, did }
*/

startServer().catch((err) => {
  console.error('Fatal error during startup:', err)
  process.exit(1)
})