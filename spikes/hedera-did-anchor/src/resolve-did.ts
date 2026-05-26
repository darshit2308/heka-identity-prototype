/**
 * resolve-did.ts
 *
 * Standalone DID resolver — pass a did:hedera string as CLI argument.
 *
 * Usage:
 *   npm run resolve -- did:hedera:testnet:z6Mk...
 *
 * This hits the Hedera mirror node REST API and returns the full DID Document.
 * If the DID was just created, wait 30-60 seconds before resolving.
 *
 * The resolved DID Document contains:
 *   - id: the full did:hedera string
 *   - verificationMethod: the Ed25519 public key anchored on HCS
 *   - authentication, assertionMethod references
 */

import 'dotenv/config'
import { resolveDID } from '@hiero-did-sdk/resolver'

const did = process.argv[2]

if (!did) {
  console.error('Usage: npm run resolve -- did:hedera:testnet:z6Mk...')
  console.error()
  console.error('Pass the DID string from evidence/hedera-did-anchor.json as the argument.')
  process.exit(1)
}

if (!did.startsWith('did:hedera:')) {
  console.error(`Error: Expected a did:hedera: identifier, got: ${did}`)
  process.exit(1)
}

console.log(`Resolving: ${did}`)
console.log('(querying Hedera testnet mirror node...)')
console.log()

const document = await resolveDID(did, 'application/did+json')

console.log('=== DID Document ===')
console.log(JSON.stringify(document, null, 2))
