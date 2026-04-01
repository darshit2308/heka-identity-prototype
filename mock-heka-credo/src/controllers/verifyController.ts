import { Request, Response } from 'express'
import { CredentialService } from '../services/credentialService'
import { IdentityService } from '../services/identityService'
import { getStoredJwtCredential } from '../utils/jwt'

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
export function createVerifyController(
  credentialService: CredentialService,
  identityService: IdentityService
) {
  return async (req: Request, res: Response) => {
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

    try {
      // Look up the contributor's credential in the mock cloud wallet
      const userRecord = identityService.getIdentity(github_username)

      if (!userRecord) {
        return res.status(404).json({
          isValid: false,
          error: `No credential found for @${github_username}. They need to onboard first.`,
        })
      }

      const serializedJwt = getStoredJwtCredential(userRecord.vc_jwt)
      const isValid = await credentialService.verifyCredential(serializedJwt)

      if (isValid) {
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
  }
}
