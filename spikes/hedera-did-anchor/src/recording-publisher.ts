/**
 * RecordingPublisher
 *
 * Wraps the Hedera Client to implement the Hiero DID SDK Publisher interface.
 * Each call to publish() signs, executes, and records the transaction ID for evidence.
 *
 * This class:
 *  1. Implements the abstract Publisher from @hiero-did-sdk/core
 *  2. Records every Hedera transaction ID into the evidence object
 *  3. Is passed to createDID() as the publisher provider
 *
 * See: https://github.com/hiero-ledger/hiero-did-sdk-js/blob/main/packages/core/src/interfaces/publisher.ts
 */

import { Client, PublicKey, Transaction, TransactionReceipt } from '@hiero-ledger/sdk'
import { Publisher, Network } from '@hiero-did-sdk/core'

export class RecordingPublisher extends Publisher {
  constructor(
    public readonly client: Client,
    private readonly evidence: { transactions: string[] }
  ) {
    super()
  }

  /**
   * Returns the Hiero network name this publisher is connected to.
   * The SDK uses this to build the correct HCS topic ID namespace.
   */
  override network(): Network {
    const ledgerId = this.client.ledgerId
    if (!ledgerId) throw new Error('Client has no ledger ID — was setOperator() called?')
    if (ledgerId.isTestnet()) return 'testnet'
    if (ledgerId.isMainnet()) return 'mainnet'
    if (ledgerId.isPreviewnet()) return 'previewnet'
    if (ledgerId.isLocalNode()) return 'local-node'
    throw new Error(`Unknown Hedera network: ${ledgerId.toString()}`)
  }

  /**
   * Returns the operator public key for signing DID owner messages.
   * The SDK uses this to derive the DID's initial verification method.
   */
  override publicKey(): PublicKey {
    if (!this.client.operatorPublicKey) {
      throw new Error('Client has no operator public key — was setOperator() called with a valid key?')
    }
    return this.client.operatorPublicKey
  }

  /**
   * Signs and submits a prepared Hedera transaction, then records its ID.
   * The SDK calls this once for each HCS consensus operation (topic create + message submit).
   */
  override async publish(transaction: Transaction): Promise<TransactionReceipt> {
    const frozenTx = await transaction.freezeWith(this.client)
    const response = await frozenTx.execute(this.client)
    const txId = response.transactionId.toString()
    this.evidence.transactions.push(txId)
    console.log(`  -> Transaction submitted: ${txId}`)
    return response.getReceipt(this.client)
  }
}
