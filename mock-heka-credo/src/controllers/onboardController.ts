import { Request, Response } from 'express'
import { Agent } from '@credo-ts/core'
import { GPGService } from '../services/gpgService'
import { IdentityService } from '../services/identityService'
import { CredentialService } from '../services/credentialService'
import { getStoredJwtCredential } from '../utils/jwt'
import { W3cJwtVerifiableCredential } from '@credo-ts/core'

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
export function createOnboardController(
  gpgService: GPGService,
  identityService: IdentityService,
  credentialService: CredentialService,
  issuerDid: string
) {
  return async (req: Request, res: Response) => {
    const { github_username, signature } = req.body // user provides the GPG signed message block

    if (!github_username || !signature) {
      return res.status(400).json({
        error: 'github_username and signature are both required',
      })
    }

    try {
      // Fetch the pending challenge for this user
      const pendingChallenge = identityService.getChallenge(github_username)

      if (!pendingChallenge) {
        return res.status(401).json({
          error: 'No pending challenge found. Please call GET /challenge/:username first.',
        })
      }

      // Check if the challenge has expired
      if (identityService.isChallengeExpired(pendingChallenge)) {
        identityService.deleteChallenge(github_username)
        return res.status(401).json({
          error: 'Challenge expired. Please request a new one.',
        })
      }

      // Check database for existing identity
      const existingIdentity = identityService.getIdentity(github_username)

      if (existingIdentity) {
        identityService.deleteChallenge(github_username)
        console.log(`ℹ️  @${github_username} is already onboarded. Returning existing credential.`)
        const serializedJwt = getStoredJwtCredential(existingIdentity.vc_jwt)
        return res.json({
          message: 'Already onboarded. Returning existing credential.',
          did: existingIdentity.did,
          credential: W3cJwtVerifiableCredential.fromSerializedJwt(serializedJwt),
        })
      }

      // Verify the GPG signature against the public key from GitHub
      const armoredKeys = await gpgService.getGitHubPublicGPGKey(github_username)
      await gpgService.verifySignature(armoredKeys, signature, pendingChallenge.nonce)

      // GPG ownership proven — consume the challenge to prevent replay attacks
      identityService.deleteChallenge(github_username)
      console.log(`✅ GPG ownership verified for @${github_username}`)

      // Step 1: Create a unique did:key DID for this contributor.
      const userDid = await credentialService.createUserDid()
      console.log(`🔑 User DID created: ${userDid}`)

      // Step 2: Issue a W3C Verifiable Credential
      const credential = await credentialService.issueCredential(
        userDid,
        github_username,
        issuerDid
      )

      // Step 3: Store the DID and signed VC in the SQLite database for permanent lookup.
      identityService.storeIdentity(github_username, userDid, credential.serializedJwt)

      console.log(`🎉 Onboarding complete for @${github_username}`)

      return res.json({
        message: 'Onboarding successful. Verifiable Credential issued.',
        did: userDid,
        credential,
      })
    } catch (error: any) {
      console.error('Onboarding error:', error)
      return res.status(500).json({
        error: error.message || 'Failed to issue credential',
      })
    }
  }
}
