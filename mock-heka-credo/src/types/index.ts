import { Agent, W3cJwtVerifiableCredential } from '@credo-ts/core'

export interface Challenge {
  github_username: string
  nonce: string
  expires_at: number
}

export interface Identity {
  github_username: string
  did: string
  vc_jwt: string
}

export interface ChallengeResponse {
  message: string
  challenge: string
  command_to_run: string
}

export interface OnboardResponse {
  message: string
  did: string
  credential: W3cJwtVerifiableCredential
}

export interface VerifyResponse {
  status: string
  isValid: boolean
  did?: string
}

export interface ErrorResponse {
  error: string
}

export interface StatusResponse {
  status: string
  issuerDid: string
}
