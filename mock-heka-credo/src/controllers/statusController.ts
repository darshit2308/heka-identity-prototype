import { Request, Response } from 'express'

/**
 * GET /status
 * Health check — returns current issuer DID so you can verify the service is live
 */
export function getStatus(issuerDid: string) {
  return (_: Request, res: Response) => {
    res.json({
      status: 'ok',
      issuerDid,
    })
  }
}
