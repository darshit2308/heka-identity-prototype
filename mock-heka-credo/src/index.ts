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
} from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import { AskarModule } from '@credo-ts/askar'
import { ariesAskar } from '@hyperledger/aries-askar-nodejs'

/**
 * In-memory store for issued identities.
 * We will replace with some persistent DB later
 */
const identityStore: Record<string, { did: string; vc: unknown }> = {}

/**
 * In-memory store for pending authentication challenge
 */
const challengeStore: Record<string, { nonce: string; expiresAt: number }> = {}


const app = express()
app.use(express.json())

// defines the configuration for the credo agent 
const agentConfig: InitConfig = {
  label: 'Mock-Heka-Issuer',
  walletConfig: {
    id: 'heka-issuer-wallet',
    key: 'heka-super-secret-wallet-key',
  },
}

// function to create and start the agent
async function createAgent(): Promise<Agent> {
  const agent = new Agent({
    config: agentConfig,
    dependencies: agentDependencies,
    modules: {
      askar: new AskarModule({ ariesAskar }), // Adds the wallet system (Askar) for your agent
    },
  })

  await agent.initialize()
  return agent
}

// We create the DID for the issuer (Heka backend in our case). This DID represents the identity that will sign credentials.
// When a user opens a PR, their VC is verified. The VC contains the issuer DID, which tells us who issued it.
// We then use this issuer DID to verify the signature of the VC.
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
  // as the name suggests, it tell the status
  app.get('/status', (_, res) => {
    res.json({
      status: 'ok',
      issuerDid,
    })
  })

  // This route is used to get the Github GPG key
  app.get('/challenge/:username', async(req, res) => {
    const github_username = req.params.username;

    try {
      // We fetch the user's GPG key directly from the github
      const githubResponse = await axios.get(`https://github.com/${github_username}.gpg`)
      // The armored key is just a human readable format of the raw keys, which we convert
      // The raw keys may not be a valid text encoding(UTF-8), so the system may crash
      // Thats why we use Base64 encoding to convert it.
      const armoredKeys = githubResponse.data

      if (!armoredKeys || armoredKeys.trim().length === 0) {
        return res.status(400).json({error: `No GPG keys found for Github user @${github_username}. Please add a GPG key to your Github account `})
      }
      // Now, the backend generates a random, highly secure 32-character hex string (nonce)
      const nonce = crypto.randomBytes(16).toString('hex')

      // Now, we need to store it in server's memory, since it would be used to compare with the user's generate string

      challengeStore[github_username] = {
        nonce, 
        expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes in future
      }

      //now, w cannot directly use the gpg key, you need to extract it firstly
      const publicKeys = await openpgp.readKeys({armoredKeys});

      // Now, we convert that random string(nonce) into an encryptable format
      const message = await openpgp.createMessage({text:nonce})
      
      // Now encrypt the nonce and public key
      const encryptchallenge = await openpgp.encrypt({
        message, 
        encryptionKeys: publicKeys,
      })

      console.log(`Challenge generated for @${github_username}`)

      // Now sent this encrypted message to the user
      return res.json({
        message: 'Decrypt this PGP message and send the orignal text to /onboard', 
        encrypted_challenge: encryptchallenge
      })
    } catch(error: any) {
      if(error.response?.status == 404) {
        return res.status(404).json({error: `GitHub user @${github_username} does not exist.`})
      }
      console.error(`challenge generation error: `, error)
      return res.status(500).json({error: 'Failed to generate challenge'})

    }
  })

  // When the user goes to the heka for the first time for generating DID
  // We will let the user onboard, only if the user provides the correct decrypted message(that randome nonce)
  app.post('/onboard', async (req, res) => {
    const { github_username, decrypted_challenge } = req.body // user generates the decrypted message

    if (!github_username || !decrypted_challenge) {
      return res.status(400).json({
        error: 'github_username and decrypted_challenge, both required',
      })
    }

    // fetching the pending challenge from server's memory
    const pendingChallenge = challengeStore[github_username]

    if(!pendingChallenge) {
      return res.status(401).json({
        error: `No pending challenge found. Please call /challenge/:username first .`,
      })
    }

    // Now we check, if the challenge timed out 
    if(Date.now() > pendingChallenge.expiresAt) {
      delete challengeStore[github_username]; // remove the expired challenge
      return res.status(401).json({
        error: 'Challenge expired, please request a new one !!' ,
      })
    }

    // Now we check, if the decrypted message was equal to nonce
    if(pendingChallenge.nonce != decrypted_challenge){
      return res.status(401).json({
        error: 'Invalid challenge response. Decryption failed, or the decrypted message was wrong'
      })
    }
    delete challengeStore[github_username]
    console.log(`GPG authentication successfull for @${github_username} `)

    if (identityStore[github_username]) {
      console.log(`ℹ️  @${github_username} is already onboarded. Returning existing credential.`)
      return res.json({
        message: 'Already onboarded. Returning existing credential.',
        did: identityStore[github_username].did,
        credential: identityStore[github_username].vc,
      })
    }

    try {
      const userDidResult = await agent.dids.create({ // heka backend creates the DID
        method: 'key',
        options: { keyType: KeyType.Ed25519 },
      })

      const userDid = userDidResult.didState.did
      if (!userDid) { 
        throw new Error('User DID creation failed')
      }

      const issuerDidKey = DidKey.fromDid(issuerDid) // getting the issuer's key information
      const verificationMethod = `${issuerDidKey.did}#${issuerDidKey.key.fingerprint}` // we use the exact same above key to sign the VC

      const credential = await agent.w3cCredentials.signCredential({ // VC is been created now, and then signed
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
      // storing the did and vc in the storage, for fast lookup
      identityStore[github_username] = {
        did: userDid,
        vc: credential,
      }

      return res.json({
        message: 'onboarding successful',
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

  // This route checks if the user's digital certificate is genuine or not
  app.post('/verify', async (req, res) => {
    const { github_username } = req.body

    if (!github_username) {
      return res.status(400).json({ error: 'github_username is required' })
    }

    console.log(`\n🔍 Verifying credential for: @${github_username}`);

    // Fetch the user's credential from the Mock Cloud Wallet
    const userRecord = identityStore[github_username]
    if (!userRecord) {
      return res.status(404).json({ error: 'No credential found for this user. They need to onboard first.' })
    }

    try {
      // Cryptographically verify the JWT signature using Credo
      const verificationResult = await agent.w3cCredentials.verifyCredential({
        credential: userRecord.vc as W3cCredential,
      })

      if (verificationResult.isValid) {
        console.log(`✅ Cryptographic signature is VALID!`);
        return res.json({
          status: 'verified',
          isValid: true,
          did: userRecord.did
        })
      } else {
        console.log(`❌ Cryptographic signature is INVALID!`);
        return res.status(401).json({
          status: 'failed',
          isValid: false,
          error: 'The credential signature could not be verified'
        })
      }

    } catch (error) {
      console.error('Verification error:', error)
      return res.status(500).json({ error: 'Internal verification engine failure' })
    }
  })



}

async function startServer() {
  const agent = await createAgent()
  const issuerDid = await createIssuerDid(agent)

  console.log(`Issuer DID: ${issuerDid}`)

  setupRoutes(agent, issuerDid)

  const PORT = 3000
  app.listen(PORT, () => {
    console.log(`API running at http://localhost:${PORT}`)
  })
}

startServer().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})

/*
Flow of code -->

User → /onboard
   ↓
Create DID
   ↓
Create credential
   ↓
Sign credential
   ↓
Store it
   ↓
Return proof
*/