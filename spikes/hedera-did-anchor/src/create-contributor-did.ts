/**
 * create-contributor-did.ts
 *
 * Spike: Create a real did:hedera on Hedera Testnet.
 *
 * What this script does:
 *   1. Loads operator credentials from .env
 *   2. Builds a Hedera Client for testnet and attaches it to a RecordingPublisher
 *   3. Calls createDID() from the Hiero DID SDK registrar
 *      - The SDK generates a fresh Ed25519 keypair for the DID owner
 *      - It creates an HCS topic and publishes the DID owner message via HCS
 *      - It waits for the mirror node to confirm DID visibility
 *   4. Resolves the DID back from the mirror node to confirm it is live
 *   5. Saves public evidence JSON to evidence/hedera-did-anchor.json
 *   6. Saves the DID owner private key to .local/private/ (gitignored — keep safe)
 *
 * Usage:
 *   npm run create
 *
 * Prerequisites:
 *   - Copy .env.example to .env and fill in HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY
 *   - Ensure your testnet account has HBAR (get from https://portal.hedera.com)
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { Client, AccountBalanceQuery } from '@hiero-ledger/sdk'
import { createDID } from '@hiero-did-sdk/registrar'
import { resolveDID } from '@hiero-did-sdk/resolver'
import { parseDID } from '@hiero-did-sdk/core'
import { RecordingPublisher } from './recording-publisher.js'

// ── 1. Load and validate operator credentials ─────────────────────────────────

const network = process.env.HEDERA_NETWORK ?? 'testnet'
const accountId = process.env.HEDERA_OPERATOR_ID
const privateKey = process.env.HEDERA_OPERATOR_KEY
const timeoutMs = Number(process.env.DID_VISIBILITY_TIMEOUT_MS ?? 180000)

if (!accountId || !privateKey) {
  console.error('Error: Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY in .env')
  console.error('Copy .env.example to .env and fill in your Hedera testnet account details.')
  process.exit(1)
}

console.log('=== Heka did:hedera Anchor Spike ===')
console.log(`Network:     ${network}`)
console.log(`Operator ID: ${accountId}`)
console.log(`Timeout:     ${timeoutMs}ms`)
console.log()

// ── 2. Build Hedera client ────────────────────────────────────────────────────

const client = network === 'testnet' ? Client.forTestnet() : Client.forName(network)
client.setOperator(accountId, privateKey)

// Increase default gRPC timeout from 10s to 30s — testnet nodes can be slow
client.setRequestTimeout(30_000)
// Use TLS transport — helps bypass firewalls that block plaintext gRPC on port 50211
client.setTransportSecurity(true)

// ── 2a. Pre-flight connectivity check ─────────────────────────────────────────

console.log('Testing gRPC connectivity to Hedera testnet...')
try {
  const balance = await new AccountBalanceQuery()
    .setAccountId(accountId)
    .execute(client)
  console.log(`Connected. Account balance: ${balance.hbars.toString()}`)
  console.log()
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('Failed to connect to Hedera testnet gRPC nodes.')
  console.error(`Error: ${msg}`)
  console.error()
  console.error('Possible causes:')
  console.error('  1. Your network/firewall is blocking gRPC (ports 50211/50212)')
  console.error('  2. The Hedera testnet nodes are temporarily down')
  console.error('  3. Your operator credentials are invalid')
  console.error()
  console.error('Try:')
  console.error('  - Switch to a different WiFi or use a hotspot')
  console.error('  - Disable VPN if active')
  console.error('  - Check https://status.hedera.com for testnet status')
  process.exit(1)
}

// ── 3. Build evidence scaffold ────────────────────────────────────────────────

interface Evidence {
  network: string
  operatorId: string
  createdAt: string
  transactions: string[]
  did?: string
  topicId?: string
  hashscanTopicUrl?: string
  didDocument?: unknown
}

const evidence: Evidence = {
  network,
  operatorId: accountId,
  createdAt: new Date().toISOString(),
  transactions: [],
}

// ── 4. Create the DID via Hiero DID SDK registrar ────────────────────────────

const publisher = new RecordingPublisher(client, evidence)

console.log('Creating did:hedera on testnet...')
console.log('(This creates an HCS topic and publishes the DID owner message — expect 2 transactions)')
console.log()

const result = await createDID(
  {
    waitForDIDVisibility: true,
    visibilityTimeoutMs: timeoutMs,
  },
  { publisher }
)

console.log()
console.log(`DID created: ${result.did}`)

// ── 5. Parse DID to extract the HCS topic ID ─────────────────────────────────

const parsed = parseDID(result.did)

// ── 6. Resolve DID back from mirror node ─────────────────────────────────────

console.log('Resolving DID from mirror node...')
const resolved = await resolveDID(result.did, 'application/did+json')
console.log('DID resolved successfully.')
console.log()

// ── 7. Assemble public evidence JSON ─────────────────────────────────────────

evidence.did = result.did
evidence.topicId = parsed.topicId
evidence.hashscanTopicUrl = `https://hashscan.io/testnet/topic/${parsed.topicId}`
evidence.didDocument = resolved

const evidenceDir = new URL('../evidence', import.meta.url).pathname
const evidencePath = path.join(evidenceDir, 'hedera-did-anchor.json')
fs.mkdirSync(evidenceDir, { recursive: true })
fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2))
console.log(`Evidence written to: ${evidencePath}`)

// ── 8. Save DID owner private key (gitignored) ───────────────────────────────

if (result.privateKey) {
  const privateDir = new URL('../.local/private', import.meta.url).pathname
  fs.mkdirSync(privateDir, { recursive: true })
  const keyPath = path.join(privateDir, 'did-owner-private-key.txt')
  fs.writeFileSync(keyPath, result.privateKey.toString(), { mode: 0o600 })
  console.log(`DID owner private key saved to: ${keyPath}`)
  console.log('IMPORTANT: This key controls the DID — keep it secret and backed up.')
  console.log()
}

// ── 9. Print summary ──────────────────────────────────────────────────────────

client.close()

console.log('=== Summary ===')
console.log(JSON.stringify(evidence, null, 2))
