import { InitConfig } from '@credo-ts/core'

// Read sensitive config from environment variables.
// Set WALLET_ID and WALLET_KEY in your .env file.
// Never hardcode wallet credentials in source code.
export const agentConfig: InitConfig = {
  label: 'Mock-Heka-Issuer',
  walletConfig: {
    id: process.env.WALLET_ID || 'heka-issuer-wallet',
    key: process.env.WALLET_KEY || 'heka-super-secret-wallet-key',
  },
}
