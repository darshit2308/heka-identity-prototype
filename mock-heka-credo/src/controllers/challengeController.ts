import { Request, Response } from 'express'
import crypto from 'crypto'
import { GPGService } from '../services/gpgService'
import { IdentityService } from '../services/identityService'

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
export function createChallengeController(gpgService: GPGService, identityService: IdentityService) {
  return async (req: Request, res: Response) => {
    const github_username = Array.isArray(req.params.username) 
      ? req.params.username[0] 
      : req.params.username

    try {
      // ✅ Validate that the user exists AND has a GPG key on GitHub BEFORE issuing
      // a challenge. Without this check, a nonce would be issued for non-existent users,
      // wasting the challenge slot and giving a confusing error later in /onboard.
      const hasGPGKey = await gpgService.validateUserHasGPGKey(github_username)

      if (!hasGPGKey) {
        return res.status(400).json({
          error: `No GPG key found for @${github_username} on GitHub. Please add a GPG key to your account first.`,
        })
      }

      // Generate a cryptographically secure random nonce.
      // 16 bytes = 32 hex characters — sufficient entropy for a one-time challenge.
      const nonce = crypto.randomBytes(16).toString('hex')

      // Store the nonce server-side so we can verify the signature in /onboard.
      identityService.storeChallenge(github_username, nonce)

      console.log(`🎲 Challenge generated for @${github_username}`)

      // Return the plaintext nonce with a ready-to-run bash command.
      // The user runs this command locally — their private key never leaves their machine.
      return res.json({
        message: 'Sign this nonce using your GPG key and send the signature block to POST /onboard',
        challenge: nonce,
        command_to_run: `echo "${nonce}" | gpg --clearsign`,
      })
    } catch (error: any) {
      console.error('Challenge generation error:', error)

      if (error.message?.includes('does not exist')) {
        return res.status(404).json({ error: error.message })
      }

      return res.status(503).json({
        error: error.message || 'Could not reach GitHub to validate your account. Please try again.',
      })
    }
  }
}
