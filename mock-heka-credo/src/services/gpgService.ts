import * as openpgp from 'openpgp'
import axios from 'axios'

/**
 * Service for GPG-based ownership verification
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
export class GPGService {
  /**
   * Validate that the user exists AND has a GPG key on GitHub BEFORE issuing
   * a challenge. Without this check, a nonce would be issued for non-existent users,
   * wasting the challenge slot and giving a confusing error later in /onboard.
   */
  async validateUserHasGPGKey(github_username: string): Promise<boolean> {
    try {
      const gpgResponse = await axios.get(`https://github.com/${github_username}.gpg`)
      return gpgResponse.data && gpgResponse.data.trim().length > 0
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`GitHub user @${github_username} does not exist.`)
      }
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || !error.response) {
        throw new Error('Could not reach GitHub to validate your account. Please try again.')
      }
      throw error
    }
  }

  /**
   * Fetch the user's public GPG key from GitHub — this is the source of truth.
   * GitHub exposes every user's public GPG keys at github.com/:username.gpg
   */
  async getGitHubPublicGPGKey(github_username: string): Promise<string> {
    try {
      const githubResponse = await axios.get(`https://github.com/${github_username}.gpg`)
      const armoredKeys = githubResponse.data

      if (!armoredKeys || armoredKeys.trim().length === 0) {
        throw new Error(`No GPG key found for @${github_username} on GitHub.`)
      }

      return armoredKeys
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`No GPG key found for @${github_username} on GitHub.`)
      }
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || !error.response) {
        throw new Error('Could not reach GitHub to verify your GPG key. Please try again.')
      }
      throw error
    }
  }

  /**
   * Cryptographically verify the GPG signature against the public key.
   * Confirms the signed text matches the expected nonce (prevents cross-challenge attacks).
   * 
   * Returns the signed text if valid, throws if invalid.
   */
  async verifySignature(armoredKeys: string, signature: string, expectedNonce: string): Promise<string> {
    try {
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

      if (expectedNonce !== signedText) {
        throw new Error(
          'Signature is valid, but it signed the wrong challenge. Please sign the exact challenge string.'
        )
      }

      return signedText
    } catch (error: any) {
      // Differentiate between GitHub API failures and actual signature failures
      // so the user gets an accurate error message in each case.
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new Error('Could not reach GitHub to verify your GPG key. Please try again.')
      }
      // Actual cryptographic signature failure
      throw new Error(`Signature verification failed: ${error.message}`)
    }
  }
}
