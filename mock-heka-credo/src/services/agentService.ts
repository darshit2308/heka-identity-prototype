import '@hyperledger/aries-askar-nodejs'

import {
  Agent,
  KeyType,
} from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import { AskarModule } from '@credo-ts/askar'
import { ariesAskar } from '@hyperledger/aries-askar-nodejs'

import { agentConfig } from '../config/agentConfig'

// Creates and initialises the Credo agent with an Askar wallet.
// The Askar wallet handles all cryptographic key storage and signing operations.
export async function createAgent(): Promise<Agent> {
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
export async function createIssuerDid(agent: Agent): Promise<string> {
  const result = await agent.dids.create({
    method: 'key',
    options: { keyType: KeyType.Ed25519 },
  })

  if (!result.didState.did) {
    throw new Error('Failed to create issuer DID')
  }

  return result.didState.did
}
