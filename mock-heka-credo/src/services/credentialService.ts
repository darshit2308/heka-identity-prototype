import {
  Agent,
  KeyType,
  ClaimFormat,
  W3cCredential,
  W3cCredentialSubject,
  JwaSignatureAlgorithm,
  DidKey,
  W3cJwtVerifiableCredential,
} from '@credo-ts/core'

export class CredentialService {
  constructor(private agent: Agent) {}

  /**
   * Create a unique did:key DID for a contributor.
   * This DID represents the contributor's decentralized identity.
   * In production, this will be did:hedera anchored on the Hedera ledger.
   */
  async createUserDid(): Promise<string> {
    const userDidResult = await this.agent.dids.create({
      method: 'key',
      options: { keyType: KeyType.Ed25519 },
    })

    const userDid = userDidResult.didState.did
    if (!userDid) {
      throw new Error('User DID creation failed')
    }

    return userDid
  }

  /**
   * Sign a W3C Verifiable Credential using the issuer's Ed25519 private key.
   * The credential is serialised as a JWT (jwt_vc format) — a compact, URL-safe token
   * that can be verified by anyone who resolves the issuer's DID to get the public key.
   */
  async issueCredential(
    userDid: string,
    github_username: string,
    issuerDid: string
  ): Promise<W3cJwtVerifiableCredential> {
    // Step 1: Build the verification method URL for the issuer.
    // For did:key, the verification method URL format is:
    //   did:key:z6Mk[fingerprint]#z6Mk[fingerprint]
    // The fragment after # identifies which key in the DID Document to use for signing.
    const issuerDidKey = DidKey.fromDid(issuerDid)
    const verificationMethod = `${issuerDidKey.did}#${issuerDidKey.key.fingerprint}`

    // Step 2: Sign a W3C Verifiable Credential using the issuer's Ed25519 private key.
    const credential = await this.agent.w3cCredentials.signCredential<ClaimFormat.JwtVc>({
      credential: new W3cCredential({
        context: ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential', 'GithubContributorCredential'],
        issuer: issuerDid,
        issuanceDate: new Date().toISOString(),
        credentialSubject: new W3cCredentialSubject({
          id: userDid,
          // Credo-ts expects custom claims to go inside a 'claims' object
          // to survive the JWT serialisation and properly map to the subject.
          claims: {
            github_username: github_username,
            is_verified: true,
          },
        }),
      }),
      verificationMethod,
      alg: JwaSignatureAlgorithm.EdDSA,
      format: ClaimFormat.JwtVc,
    })

    return credential
  }

  /**
   * Verify a W3C Verifiable Credential.
   * Feeds it into Credo's verifyCredential() engine, which mathematically checks
   * the EdDSA signature against the issuer's public key resolved from the DID Document.
   */
  async verifyCredential(serializedJwt: string): Promise<boolean> {
    const verificationResult = await this.agent.w3cCredentials.verifyCredential({
      credential: serializedJwt,
    })

    return verificationResult.isValid
  }
}
