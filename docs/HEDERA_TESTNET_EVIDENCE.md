# Hedera Testnet Anchoring Evidence

This document provides cryptographically verifiable proof of the `did:hedera` identity anchoring spike implemented for the Heka Identity Prototype.

## The Proof

The Heka Identity Prototype includes a standalone spike (`spikes/hedera-did-anchor`) that successfully proves the ability to create, anchor, and resolve decentralized identifiers on the Hedera Testnet using the Hiero DID SDK.

**Date of creation**: `2026-05-26T19:33:14.626Z`
**Network**: Hedera Testnet
**Operator Account ID**: `0.0.8383202` (used for transaction fees only)

### 1. The DID

The following DID was successfully generated and anchored:
```
did:hedera:testnet:HaEeV8GBvSSb5qCsjxiFu1y6QHkoeJQbswb29GKnVuu6_0.0.9062989
```

### 2. Hedera Consensus Service (HCS) Topic

The identity document is anchored to the following HCS Topic ID:
- **Topic ID**: `0.0.9062989`
- **Hashscan Explorer Link**: [https://hashscan.io/testnet/topic/0.0.9062989](https://hashscan.io/testnet/topic/0.0.9062989)

### 3. Transaction Evidence

The DID creation resulted in 2 HCS transactions (Topic Creation + DID Document Message):
1. `0.0.8383202@1779823989.459001406`
2. `0.0.8383202@1779823992.292767120`

### 4. Resolved DID Document

The DID is publicly resolvable from Hedera mirror nodes back into a standard W3C DID Document:

```json
{
  "id": "did:hedera:testnet:HaEeV8GBvSSb5qCsjxiFu1y6QHkoeJQbswb29GKnVuu6_0.0.9062989",
  "controller": "did:hedera:testnet:HaEeV8GBvSSb5qCsjxiFu1y6QHkoeJQbswb29GKnVuu6_0.0.9062989",
  "verificationMethod": [
    {
      "id": "did:hedera:testnet:HaEeV8GBvSSb5qCsjxiFu1y6QHkoeJQbswb29GKnVuu6_0.0.9062989#did-root-key",
      "controller": "did:hedera:testnet:HaEeV8GBvSSb5qCsjxiFu1y6QHkoeJQbswb29GKnVuu6_0.0.9062989",
      "type": "Ed25519VerificationKey2020",
      "publicKeyMultibase": "z6Mkw2Vh5NWdFyw4CL3aRXg6k7X6Ds2f4BexZxVwyYHoR8gU"
    }
  ],
  "authentication": [
    "did:hedera:testnet:HaEeV8GBvSSb5qCsjxiFu1y6QHkoeJQbswb29GKnVuu6_0.0.9062989#did-root-key"
  ],
  "assertionMethod": [
    "did:hedera:testnet:HaEeV8GBvSSb5qCsjxiFu1y6QHkoeJQbswb29GKnVuu6_0.0.9062989#did-root-key"
  ]
}
```

## Significance

While the core MVP of this prototype relies on `did:key` to demonstrate the GPG-to-DID flow without a ledger dependency, this spike proves that the architectural transition to `did:hedera` is fully viable and verified. The next iteration of the prototype will replace `did:key` with this Hedera anchoring flow, enabling immutable, publicly auditable identities for open source contributors.
