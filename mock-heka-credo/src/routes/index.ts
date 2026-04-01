import { Express } from 'express'
import { Agent } from '@credo-ts/core'
import Database from 'better-sqlite3'

import { getStatus } from '../controllers/statusController'
import { createChallengeController } from '../controllers/challengeController'
import { createOnboardController } from '../controllers/onboardController'
import { createVerifyController } from '../controllers/verifyController'

import { GPGService } from '../services/gpgService'
import { IdentityService } from '../services/identityService'
import { CredentialService } from '../services/credentialService'

export function setupRoutes(app: Express, agent: Agent, issuerDid: string, db: Database.Database) {
  // Initialize services
  const gpgService = new GPGService()
  const identityService = new IdentityService(db)
  const credentialService = new CredentialService(agent)

  // Health check — returns current issuer DID so you can verify the service is live
  app.get('/status', getStatus(issuerDid))

  // Step 1: Get challenge nonce
  app.get('/challenge/:username', createChallengeController(gpgService, identityService))

  // Step 2: Submit GPG signature and receive VC
  app.post(
    '/onboard',
    createOnboardController(gpgService, identityService, credentialService, issuerDid)
  )

  // Verify contributor (called by GitHub App)
  app.post('/verify', createVerifyController(credentialService, identityService))
}
