# 🔐 Heka Identity Prototype

### Decentralized Contributor Identity Verification for Open Source

_A working prototype built for and selected by the [LF Decentralized Trust Mentorship Program — Issue #87](https://github.com/LF-Decentralized-Trust-Mentorships/mentorship-program/issues/87)_

---

![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Credo-ts](https://img.shields.io/badge/Credo--ts-0.5.3-FF6B6B?style=for-the-badge)
![Probot](https://img.shields.io/badge/Probot-GitHub_App-24292e?style=for-the-badge&logo=github&logoColor=white)
![W3C VC](https://img.shields.io/badge/W3C-Verifiable_Credentials-005A9C?style=for-the-badge)
![DID](https://img.shields.io/badge/DID-did:key-6B4FBB?style=for-the-badge)
![GPG](https://img.shields.io/badge/Auth-GPG_Sign%2FVerify-4A90D9?style=for-the-badge)
![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge)

<br/>

---

## 📖 The Problem

Open source contribution platforms like GitHub rely on email addresses and usernames for contributor attribution. This trust model has three fundamental weaknesses:

| Weakness | Reality |
| --- | --- |
| **Identity Spoofing** | Anyone can set `git config user.email linus@kernel.org` and commit as Linus Torvalds |
| **Fragmented Identity** | A contributor's reputation is siloed per-platform with no portable proof |
| **Agentic AI Flooding** | AI agents can now impersonate developers and flood repositories with low-quality or malicious PRs |

These risks are not hypothetical. As open source becomes critical infrastructure, the integrity of who contributes what becomes a security concern — not just a social one.

---

## 💡 The Solution

**Heka Identity Prototype** implements a decentralized trust layer on top of GitHub's existing workflow using:

- **GPG Cryptographic Proof** — contributor proves ownership of their GitHub GPG key by signing a server-issued nonce. The private key never leaves their machine.
- **Decentralized Identifiers (DIDs)** — a globally unique, cryptographically verifiable identity anchor owned by the contributor, not a platform
- **W3C Verifiable Credentials (VCs)** — a tamper-proof, digitally signed certificate issued by a trusted authority (the Heka Issuer)
- **GitHub Checks API** — native PR-level enforcement that blocks unverified contributors automatically

When a contributor opens a Pull Request, the system doesn't ask _"who does GitHub think you are?"_ — it asks _"can you prove it cryptographically?"_

---

## 🎯 Implemented Features (MVP)

| Feature | Status | Description |
| --- | --- | --- |
| **React Onboarding Console** | ✅ Live | Modern web UI replacing terminal CURL commands for contributor onboarding |
| **GPG Challenge-Response** | ✅ Live | Cryptographic proof of GitHub GPG key ownership before VC issuance — private key never leaves the machine |
| **SQLite Persistent Storage** | ✅ Live | Challenges, credentials, and identities survive server restarts using a lightweight embedded database |
| **GitHub App (Probot)** | ✅ Live | Intercepts PR events and blocks unverified contributors automatically based on SQLite credential state |
| **W3C Verifiable Credentials** | ✅ Live | Tamper-proof, digitally signed identity certificates issued by the Heka Issuer |
| **Decentralized Identifiers** | ✅ Live | Self-sovereign DIDs (`did:key`) for portable, platform-independent identity anchors |
| **Credo-ts Integration** | ✅ Live | Production-grade identity framework compatible with Heka Identity Platform |
| **Hedera DID Spike** | ✅ Spike | `did:hedera` creation and resolution verified on Hedera testnet (`spikes/hedera-did-anchor`) |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                       HEKA IDENTITY SYSTEM                           │
│                                                                      │
│   ┌──────────────┐  GET /challenge  ┌─────────────────────────────┐  │
│   │              │ ───────────────▶ │                             │  │
│   │  Contributor │   { nonce }      │   mock-heka-credo           │  │
│   │   (GitHub)   │ ◀─────────────── │   (Identity Service)        │  │
│   │              │                  │                             │  │
│   │  [signs with │  POST /onboard   │   • Credo-ts Agent          │  │
│   │   GPG key]   │ ───────────────▶ │   • Askar Wallet            │  │
│   │              │  VC + DID issued │   • GPG sign/verify         │  │
│   │              │ ◀─────────────── │   • did:key creation        │  │
│   └──────┬───────┘                  │   • W3C VC issuance         │  │
│          │                          │   • JWT signing (EdDSA)     │  │
│          │ Opens Pull Request       │   • /verify endpoint        │  │
│          ▼                          └──────────────┬──────────────┘  │
│   ┌──────────────┐  webhook event                  │                 │
│   │              │ ──────────────▶ ┌───────────────┴──────────────┐  │
│   │    GitHub    │                 │        mock-heka-bot          │  │
│   │  Repository  │                 │        (Probot App)           │  │
│   │              │ ◀────────────── │  POST /verify → isValid?      │  │
│   └──────────────┘  ✅ / ❌ Check  └──────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘


                     CRYPTOGRAPHIC TRUST FLOW
                     ──────────────────────────
  GitHub GPG Key ──proves──▶ Ownership ──unlocks──▶ VC Issuance
  Issuer DID     ──signs───▶ VC        ──stored──▶  Wallet
  GitHub App     ──verifies─▶ VC       ──posts───▶  PR Check
```

<img width="800" alt="Architecture Overview" src="https://github.com/user-attachments/assets/26141c52-da7f-4ae1-b9c0-9f8e88c44529" style="max-width: 100%; height: auto;" />

<img width="800" alt="Cryptographic Trust Flow" src="https://github.com/user-attachments/assets/a71370a4-5269-4e4f-9d66-cfd4238f63b7" style="max-width: 100%; height: auto;" />

### Component Breakdown

| Component | Technology | Role |
| --- | --- | --- |
| `mock-heka-credo` | Node.js + Credo-ts + Express | Identity Issuer — GPG verification, DID creation, VC issuance |
| `mock-heka-bot` | Probot + TypeScript | GitHub App — webhook listener, PR enforcement |
| Askar Wallet | `@hyperledger/aries-askar` | Secure key management and cryptographic operations |
| DID Method | `did:key` (Ed25519) | Portable, self-sovereign decentralized identifier |
| Credential Format | W3C VC / JWT (`jwt_vc`) | Tamper-proof signed identity certificate |
| GPG Auth | OpenPGP.js | Cryptographic proof of GitHub key ownership |
| Webhook Tunnel | Smee.io | Routes GitHub webhook events to local development server |

---

## 🔄 Flow Diagrams

### Flow 1 — Contributor Onboarding (GPG Ownership Proof)

```
Contributor                      Heka Identity Service
    │                                     │
    │  GET /challenge/:username           │
    │ ───────────────────────────────────▶│
    │                                     │── Fetch GPG public key from
    │                                     │   github.com/:username.gpg
    │                                     │── Validate user + key exists
    │                                     │── Generate random nonce
    │                                     │── Store nonce (5 min expiry)
    │  { challenge: "a3f9...", cmd }       │
    │ ◀───────────────────────────────────│
    │                                     │
    │  [runs: echo "a3f9..." | gpg --clearsign]
    │  [private key signs the nonce locally]
    │  [private key NEVER leaves machine] │
    │                                     │
    │  POST /onboard                      │
    │  { github_username, signature }     │
    │ ───────────────────────────────────▶│
    │                                     │── Fetch public key from GitHub
    │                                     │── openpgp.verify(signature)
    │                                     │── Confirm signed text = nonce
    │                                     │── Create did:key DID
    │                                     │── Sign W3C VC (EdDSA/JWT)
    │                                     │── Store in Askar wallet
    │  { did, credential (JWT) }          │
    │ ◀───────────────────────────────────│
```

<img width="800" alt="Flow 1: Onboarding Diagram" src="https://github.com/user-attachments/assets/6b736610-6331-43f7-a2c6-4ebb47f40b2e" style="max-width: 100%; height: auto;" />

### Flow 2 — Pull Request Verification

#### Step 1: GitHub PR Webhook → Probot Bot

<img width="800" alt="Flow 2: PR Verification - Webhook Triggered" src="https://github.com/user-attachments/assets/6587805e-a118-4d82-ac33-131045631c1e" style="max-width: 100%; height: auto;" />

#### Step 2: Heka Service Verification → GitHub Check

<img width="800" alt="Flow 2: PR Verification - Credential Check & Result" src="https://github.com/user-attachments/assets/60ba3237-ef6f-45b1-b101-c09113d058af" style="max-width: 100%; height: auto;" />

---

## ✅ Live Demo

**Watch the latest demo here** → [https://www.youtube.com/watch?v=EVA5NBKnafA](https://www.youtube.com/watch?v=EVA5NBKnafA)

_This demo showcases the complete MVP including the React Web UI, GPG challenge-response flow, SQLite persistence, and GitHub App enforcement._

### Unverified Contributor — PR Blocked ❌

> A PR opened by a contributor who has not onboarded with Heka receives an automatic failure check.

![Unverified PR](image.png)

### Verified Contributor — PR Approved ✅

> After onboarding with GPG proof, the contributor's DID appears in the PR check summary.

![Verified PR](image-3.png)

---

## 🖼️ Visual Assets & Screenshots

### React Web UI Console

<img width="800" alt="React Web UI Console" src="https://github.com/user-attachments/assets/f457ae48-5bf9-47d2-b9d9-0fd8d0682ef5" style="max-width: 100%; height: auto;" />

### SQLite Schema Diagram

<img width="800" alt="SQLite Schema" src="https://github.com/user-attachments/assets/32130ab0-ecce-4714-93c9-ca93e22cb91f" style="max-width: 100%; height: auto;" />

### Component Interaction Diagram

<img width="800" alt="Component Interaction" src="https://github.com/user-attachments/assets/c98f1a53-932c-45c3-9442-68a84424961b" style="max-width: 100%; height: auto;" />

### Cryptographic Verification Flow

<img width="800" alt="Crypto Verification Flow" src="https://github.com/user-attachments/assets/33fb2b37-d55a-4bf1-92ac-7fa43461a21a" style="max-width: 100%; height: auto;" />

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version |
| --- | --- |
| Node.js | **v20.x LTS only** (v18.x also works — v21+ is NOT supported due to native Askar bindings) |
| npm | v9+ |
| GPG Key | Must be added to your GitHub account ([guide](https://docs.github.com/en/authentication/managing-commit-signature-verification/adding-a-gpg-key-to-your-github-account)) |
| GitHub Account | Required to install the GitHub App |
| Smee.io | Free — no account needed |

---

### Step 1 — Set Up the React Onboarding UI (`heka-web-ui`)

```bash
cd heka-web-ui
npm install
npm run dev
```

The React UI will start at `http://localhost:5173`.

---

### Step 2 — Set Up the Identity Service (`mock-heka-credo`)

```bash
cd mock-heka-credo
npm install
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
WALLET_ID=heka-issuer-wallet
WALLET_KEY=your-strong-wallet-passphrase-here
```

Start the service:

```bash
npm start
```

You should see:

```
🚀 Starting Mock Heka Identity Service...
✅ Credo agent initialised
🛡️  Wallet created and unlocked
📜 Issuer DID: did:key:z6Mk...
🌐 API running at http://localhost:3000
   GET  /status              — health check + issuer DID
   GET  /challenge/:username  — Step 1: get nonce to sign
   POST /onboard             — Step 2: submit GPG signature + receive VC
   POST /verify              — verify contributor (called by GitHub App)
```

---

### Step 3 — Set Up the GitHub App (`mock-heka-bot`)

```bash
cd ../mock-heka-bot
npm install
cp .env.example .env
```

Create a GitHub App:

1. Go to **GitHub → Settings → Developer Settings → GitHub Apps → New GitHub App**
2. Set the Webhook URL to your Smee.io channel (get one free at [smee.io](https://smee.io))
3. Set permissions: **Checks → Read & Write**, **Pull Requests → Read**
4. Subscribe to events: **Pull Request**
5. Download your private key

Edit `.env`:

```env
APP_ID=your_github_app_id
PRIVATE_KEY_PATH=./private-key.pem
WEBHOOK_SECRET=your_webhook_secret
WEBHOOK_PROXY_URL=https://smee.io/your-channel-id
HEKA_SERVICE_URL=http://localhost:3000
```

Start the bot:

```bash
npm start
```

---

### Step 4 — Onboard as a Verified Contributor (GPG Proof Flow)

**4a — Request your challenge nonce:**

```bash
curl http://localhost:3000/challenge/YOUR_GITHUB_USERNAME
```

Response:

```json
{
  "message": "Sign this nonce using your GPG key and send the signature block to POST /onboard",
  "challenge": "8998b3d666a3301e7ac9b961eef73db3",
  "command_to_run": "echo \"8998b3d666a3301e7ac9b961eef73db3\" | gpg --clearsign"
}
```

**4b — Sign the nonce with your GPG private key:**

```bash
echo "8998b3d666a3301e7ac9b961eef73db3" | gpg --clearsign > sig.txt
```

Your private key **never leaves your machine**.

**4c — Build the request payload:**

```bash
node -e '
  const fs = require("fs");
  const sig = fs.readFileSync("sig.txt", "utf8");
  fs.writeFileSync("payload.json", JSON.stringify({
    github_username: "YOUR_GITHUB_USERNAME",
    signature: sig
  }, null, 2));
'
```

**4d — Submit the proof and receive your Verifiable Credential:**

```bash
curl -X POST http://localhost:3000/onboard \
  -H "Content-Type: application/json" \
  -d @payload.json
```

Expected response:

```json
{
  "message": "Onboarding successful. Verifiable Credential issued.",
  "did": "did:key:z6Mk...",
  "credential": "eyJhbGciOiJFZERTQSJ9..."
}
```

---

### Step 5 — Verify Your Credential

```bash
curl -X POST http://localhost:3000/verify \
  -H "Content-Type: application/json" \
  -d '{"github_username": "YOUR_GITHUB_USERNAME"}'
```

Expected response:

```json
{
  "status": "verified",
  "isValid": true,
  "did": "did:key:z6Mk..."
}
```

---

### Step 6 — Open a Pull Request

Open a PR on any repository where your GitHub App is installed. The **Heka Identity Verification** check will appear automatically within seconds — ✅ for onboarded contributors, ❌ for unregistered ones.

---

## 📁 Project Structure

```
heka-identity-prototype/
│
├── heka-web-ui/                  # React Onboarding Console
│   ├── src/
│   │   ├── App.tsx               # Main React component
│   │   ├── main.tsx              # Entry point
│   │   └── styles.css            # UI styling
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── mock-heka-credo/              # Identity Issuer Service
│   ├── src/
│   │   ├── index.ts              # Express server, agent setup, GPG verification
│   │   ├── database/
│   │   │   └── db.ts             # SQLite database initialization
│   │   ├── config/
│   │   │   └── env.ts
│   │   ├── handlers/
│   │   │   └── pullRequestHandler.ts
│   │   ├── services/
│   │   │   ├── hekaService.ts
│   │   │   ├── credentialService.ts
│   │   │   ├── gpgService.ts
│   │   │   └── identityService.ts
│   │   └── types/
│   │       └── verification.ts
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
│
├── mock-heka-bot/                # GitHub Probot App
│   ├── src/
│   │   ├── index.ts              # Webhook handlers, GitHub Checks API
│   │   ├── config/
│   │   │   └── env.ts
│   │   ├── controllers/
│   │   │   ├── challengeController.ts
│   │   │   ├── onboardController.ts
│   │   │   ├── statusController.ts
│   │   │   └── verifyController.ts
│   ├── .env.example
│   └── package.json
│
├── spikes/
│   └── hedera-did-anchor/        # ✅ Verified: did:hedera creation + resolution on testnet
│
└── README.md
```

---

## 🛠️ API Reference

### Identity Service (`mock-heka-credo`) — Port 3000

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/status` | Health check — returns issuer DID |
| `GET` | `/challenge/:username` | Step 1 — generate nonce for GPG signing |
| `POST` | `/onboard` | Step 2 — verify GPG signature + issue Verifiable Credential |
| `POST` | `/verify` | Cryptographically verify a contributor's credential |

---

## 🔬 Technical Deep Dive

### Why Credo-ts?

[Credo-ts](https://github.com/openwallet-foundation/credo-ts) (formerly Aries Framework JavaScript) is the OpenWallet Foundation's production-grade TypeScript framework for decentralized identity. It is the same framework used internally by the Heka Identity Platform — making this prototype architecturally compatible with the real system from day one.

### Why GPG Sign/Verify?

The sign/verify pattern is the industry standard for cryptographic proof of key ownership — the same mechanism used by SSH key authentication, code signing, and certificate issuance.

The security guarantee: the server fetches the contributor's public key directly from `github.com/:username.gpg` — the source of truth owned by GitHub itself. The signature is verified against that key mathematically. This is unforgeable without access to the contributor's private key.

### Why `did:key` for the MVP?

For the MVP, `did:key` was chosen because it is:

- **Self-contained** — no external ledger required to resolve
- **Immediately verifiable** — the public key is encoded directly in the DID
- **Production-compatible** — the system is architecturally designed to transition to `did:hedera` with minimal changes

In the mentorship, contributor and issuer DIDs will be anchored on the **Hedera Testnet** using the Hedera DID Method, providing immutable, publicly auditable identity records.

### Cryptographic Verification Chain

```
Contributor's GitHub GPG Key
         │
         ▼
Signs server nonce → Heka verifies ownership via openpgp
         │
         ▼
Heka creates Ed25519 keypair for contributor
         │
         ▼
Master Issuer DID (did:key:z6Mk[issuer-pubkey])
         │
         ▼
User DID created (did:key:z6Mk[user-pubkey])
         │
         ▼
W3C VC signed with issuer's Ed25519 private key
  {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    "type": ["VerifiableCredential", "GithubContributorCredential"],
    "issuer": "did:key:z6Mk[issuer]",
    "credentialSubject": {
      "id": "did:key:z6Mk[user]",
      "github_username": "darshit2308",
      "is_verified": true,
      "gpg_fingerprint": "8998b3d666a3301e7ac9b961eef73db3"
    }
  }
         │
         ▼
JWT serialised and stored in Askar wallet
         │
         ▼
On /verify: Credo verifyCredential() checks EdDSA signature
against issuer's public key resolved from DID Document
```

---

## 🗺️ MVP vs Mentorship Target

This prototype deliberately simplifies certain components to focus on proving the hardest architectural pieces first. Here is an honest breakdown:

| Feature | MVP (This Prototype) | Mentorship Target |
| --- | --- | --- |
| **DID Method** | `did:key` (local, no ledger) | `did:hedera` anchored on Hedera Testnet |
| **Identity Storage** | ✅ SQLite registry for challenges and issued VCs | Wallet-managed credential custody in Heka |
| **Onboarding UI** | ✅ React Web Console | GitHub OAuth-integrated contributor portal in Heka Web UI |
| **Onboarding Auth** | ✅ GPG sign/verify challenge-response | Same — plus wallet binding, key rotation, and revocation |
| **VC Format** | W3C JWT VC | SD-JWT VC for selective disclosure |
| **Wallet** | Server-side Askar wallet (issuer keys only) | Contributor cloud wallet in Heka (server-managed Askar keys; device-sovereign custody is post-mentorship) |
| **Verification** | VC signature check via backend registry | OID4VP-based Verifiable Presentation from contributor wallet |
| **Linked VP** | Not implemented | Under active evaluation — may be simplified, made optional, or deferred post-mentorship depending on Heka Web Wallet feasibility |
| **GitHub App** | ✅ Checks API enforcement | Full status checks + PR comments + per-repository configuration |
| **Interoperability** | N/A | Credo-ts-based reference wallet (note: Sphereon OID4VC wallet does not support `did:hedera` — this is a known constraint for interop testing scope) |

---

## 🚧 Explicit Prototype Boundaries

To avoid any ambiguity, this repository currently proves the following only:

1. A contributor can request a nonce from the backend.
2. The contributor can sign that nonce with a GitHub-linked GPG key.
3. The backend can verify the signature using the public key fetched from GitHub.
4. The backend can issue a W3C Verifiable Credential.
5. The backend can store and later re-read that credential from SQLite.
6. The GitHub App can verify that stored credential and post a PR check result.

It does **not** yet prove the mentorship target's full production model. In particular, it does not yet:

1. Log the contributor in with GitHub OAuth.
2. Create a contributor cloud wallet managed by Heka.
3. Issue the VC into that wallet via OID4VCI.
4. Use OID4VP for pull request verification end-to-end.
5. Use `did:hedera` as the primary DID method in the main flow (spike only).
6. Implement SD-JWT VC selective disclosure.
7. Provide revocation, key rotation, or repository-level policy configuration.

---

## 📋 What Is Not Done Yet

The items below are the gap between the current MVP and the mentorship target.

| Not Done Yet | Current State | Mentorship Target |
| --- | --- | --- |
| GitHub OAuth login | Contributors do not sign in through GitHub OAuth | GitHub-authenticated onboarding entry point in the Heka Web UI |
| Contributor cloud wallet | No contributor-owned wallet is created | Heka creates and manages a cloud wallet per contributor (Askar, server-side keys) |
| VC custody in contributor wallet | Credentials stored server-side in SQLite | VC issued into the contributor wallet; SQLite replaced by wallet-backed storage |
| OID4VCI issuance flow | Not implemented | Standards-based credential issuance into the contributor wallet |
| OID4VP presentation flow | Not implemented | Contributor wallet presents a Verifiable Presentation to the Heka verifier |
| Linked VP | Not implemented | Under evaluation — Linked VP provides a fast verification path but requires VP refresh and DID Document updates; may be optional or post-mentorship depending on Heka Web Wallet feasibility |
| `did:hedera` in main flow | Spike only (`spikes/hedera-did-anchor`) | `did:hedera` anchored on Hedera Testnet for both issuer and contributor DIDs |
| SD-JWT VC format | Not implemented | Privacy-preserving credential with selective disclosure |
| VC revocation registry | Not implemented | Credential invalidation mechanism for compromised or expired identities |
| Credential lifecycle management | Not implemented | Key rotation, re-issuance, and revocation workflows |
| Repository-specific policies | Not implemented | Per-repository enforcement mode (`warn` / `enforce` / `disabled`), trusted issuers, and grace periods via `.heka/config.yml` |
| Warn-only mode | Not implemented | Non-blocking policy mode for gradual adoption |
| Self-sovereign wallet custody | Not implemented | Device-sovereign key management — documented as a post-mentorship extension beyond the prototype scope |

---

## 🔭 Next Steps: Mentorship Roadmap

The following items represent the implementation plan for the LFDT 2026 Mentorship (June 15 – November 30, 2026):

1. **`did:hedera` Testnet Integration** ✅ Spike Complete
   - Replace `did:key` with `did:hedera` in the main Heka flow
   - Anchor both issuer and contributor DIDs on Hedera Testnet
   - Integrate with Hiera DID SDK and Heka's existing Credo Hedera module
   - _Note: Sphereon OID4VC wallet does not support `did:hedera` — interoperability testing will target a Credo-ts-based reference wallet_

2. **SD-JWT Selective Disclosure**
   - Contributors prove specific claims without revealing their full identity profile
   - Privacy-preserving credential presentation aligned with data minimization principles

3. **OID4VCI + OID4VP End-to-End**
   - Standards-based credential issuance (OID4VCI) into contributor cloud wallet
   - Verifiable Presentation-based PR verification (OID4VP) replacing the current backend registry lookup

4. **Linked VP (Under Evaluation)**
   - Provides a fast-path verification option by anchoring pre-signed VPs to the contributor DID Document
   - Feasibility for the prototype scope is being evaluated with the mentor — may be simplified, made optional, or deferred to post-mentorship if a Heka Web Wallet approach is adopted instead

5. **VC Revocation Registry**
   - Credential invalidation when a GPG key is compromised or a contributor's binding changes
   - Maintains trust integrity in the verification pipeline over time

6. **Repository-Specific Configuration**
   - Per-repository enforcement via `.heka/config.yml`
   - Supports `warn`, `enforce`, and `disabled` modes with trusted issuer lists and contributor grace periods

7. **Key Rotation and Lifecycle Management**
   - GPG key rotation and re-issuance workflows
   - Issuer DID rollover runbook for operator key compromise scenarios

---

## 🤝 Relation to LFDT and Hiero

This prototype was built as a pre-application MVP for the **LF Decentralized Trust Mentorship Program (LFDT-2026)** and was selected for [Issue #87 — Hiero: Contributor Identity Verification Prototype](https://github.com/LF-Decentralized-Trust-Mentorships/mentorship-program/issues/87).

The architecture is designed to integrate with:

- **Heka Identity Platform** — the existing Hiero identity ecosystem (Credo-ts is used internally by Heka)
- **Identity Collaboration Hub** — the prototype will be validated against real Hiero repositories
- **OpenVTC LFDT Lab** — the decentralized trust graph initiative for Linux Kernel contribution flow

This project serves as a reference implementation demonstrating that decentralized identity verification in open-source workflows is not just theoretically sound — it is practically buildable today.

---

## 👨‍💻 Author

**Darshit Khandelwal**

- GitHub: [@darshit2308](https://github.com/darshit2308)
- LinkedIn: [darshit-khandelwal](https://www.linkedin.com/in/darshit-khandelwal-49bb25288)
- Built as part of the LFDT Mentorship Program — 2026

---

## 📄 License

This project is licensed under the Apache License 2.0 — see the [LICENSE](LICENSE) file for details.

---
