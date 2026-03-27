<div align="center">

# 🔐 Heka Identity Prototype

### Decentralized Contributor Identity Verification for Open Source

_A working prototype built for the [LF Decentralized Trust Mentorship Program — Issue #87](https://github.com/LF-Decentralized-Trust-Mentorships/mentorship-program/issues/87)_

---

![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Credo-ts](https://img.shields.io/badge/Credo--ts-0.5.3-FF6B6B?style=for-the-badge)
![Probot](https://img.shields.io/badge/Probot-GitHub_App-24292e?style=for-the-badge&logo=github&logoColor=white)
![W3C VC](https://img.shields.io/badge/W3C-Verifiable_Credentials-005A9C?style=for-the-badge)
![DID](https://img.shields.io/badge/DID-did:key-6B4FBB?style=for-the-badge)
![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge)

<br/>
<!-- 
> **"Every commit tells a story. But who is really telling it?"**
>
> This prototype answers that question — cryptographically. -->

</div>

---

## 📖 The Problem

Open source contribution platforms like GitHub rely on email addresses and usernames for contributor attribution. This trust model has three fundamental weaknesses:

| Weakness                | Reality                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| **Identity Spoofing**   | Anyone can set `git config user.email linus@kernel.org` and commit as Linus Torvalds              |
| **Fragmented Identity** | A contributor's reputation is siloed per-platform with no portable proof                          |
| **Agentic AI Flooding** | AI agents can now impersonate developers and flood repositories with low-quality or malicious PRs |

These risks are not hypothetical. As open source becomes critical infrastructure, the integrity of who contributes what becomes a security concern — not just a social one.

---

## 💡 The Solution

**Heka Identity Prototype** implements a decentralized trust layer on top of GitHub's existing workflow using:

- **Decentralized Identifiers (DIDs)** — a globally unique, cryptographically verifiable identity anchor owned by the contributor, not a platform
- **W3C Verifiable Credentials (VCs)** — a tamper-proof, digitally signed certificate issued by a trusted authority (the Heka Issuer)
- **GitHub Checks API** — native PR-level enforcement that blocks unverified contributors automatically

When a contributor opens a Pull Request, the system doesn't ask _"who does GitHub think you are?"_ — it asks _"can you prove it cryptographically?"_

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      HEKA IDENTITY SYSTEM                           │
│                                                                     │
│   ┌──────────────┐    POST /onboard     ┌────────────────────────┐  │
│   │              │ ──────────────────── │                        │  │
│   │  Contributor │                      │  mock-heka-credo       │  │
│   │   (GitHub)   │ ◀──────────────────  │  (Identity Service)    │  │
│   │              │    VC + DID issued   │                        │  │
│   └──────┬───────┘                      │  • Credo-ts Agent      │  │
│          │                              │  • Askar Wallet        │  │
│          │ Opens Pull Request           │  • did:key creation    │  │
│          ▼                              │  • W3C VC issuance     │  │
│   ┌──────────────┐   webhook event      │  • JWT signing (EdDSA) │  │
│   │              │ ──────────────────── │  • /verify endpoint    │  │
│   │    GitHub    │                      └───────────┬────────────┘  │
│   │  Repository  │                                  │               │
│   │              │ ◀────────────────────────────────┘               │
│   └──────────────┘   ✅ Check: Verified / ❌ Check: Unverified       │
│          ▲                                                          │
│          │           POST /verify                                   │
│   ┌──────┴───────┐ ──────────────────── ┌────────────────────────┐  │
│   │              │                      │                        │  │
│   │ mock-heka-   │ ◀──────────────────  │  mock-heka-credo       │  │
│   │    bot       │  { isValid, did }    │  (same service)        │  │
│   │ (Probot App) │                      │                        │  │
│   │              │                      └────────────────────────┘  │
│   └──────────────┘                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

                    CRYPTOGRAPHIC TRUST FLOW
                    ─────────────────────────
    Issuer (Heka) ──signs──▶ VC ──stored in──▶ Wallet (in-memory)
                                                      │
                                               verified by
                                                      │
                              GitHub App ◀──────────VP/VC
```

### Component Breakdown

| Component         | Technology                   | Role                                                            |
| ----------------- | ---------------------------- | --------------------------------------------------------------- |
| `mock-heka-credo` | Node.js + Credo-ts + Express | Identity Issuer — creates DIDs, signs VCs, verifies credentials |
| `mock-heka-bot`   | Probot + TypeScript          | GitHub App — listens for PR events, enforces identity checks    |
| Askar Wallet      | `@hyperledger/aries-askar`   | Secure key management and cryptographic operations              |
| DID Method        | `did:key` (Ed25519)          | Portable, self-sovereign decentralized identifier               |
| Credential Format | W3C VC / JWT (`jwt_vc`)      | Tamper-proof signed identity certificate                        |
| Webhook Tunnel    | Smee.io                      | Routes GitHub webhook events to local development server        |

---

## 🔄 Flow Diagrams

### Flow 1 — Contributor Onboarding

```
Contributor                 Heka Identity Service
    │                               │
    │  POST /onboard                │
    │  { github_username }          │
    │ ─────────────────────────────▶│
    │                               │── Create Ed25519 keypair
    │                               │── Generate did:key DID
    │                               │── Sign W3C Verifiable Credential
    │                               │   (issuer: Heka Master DID)
    │                               │── Store VC in Askar Wallet
    │  { did, credential (JWT) }    │
    │ ◀─────────────────────────────│
    │                               │
```

### Flow 2 — Pull Request Verification

```
Contributor      GitHub Repo        Probot Bot        Heka Service
    │                │                  │                   │
    │── Open PR ────▶│                  │                   │
    │                │── webhook ──────▶│                   │
    │                │                  │── POST /verify ──▶│
    │                │                  │  { github_username}│
    │                │                  │                   │── Lookup VC
    │                │                  │                   │── verifyCredential()
    │                │                  │                   │── Check signature
    │                │                  │  { isValid, did } │
    │                │                  │◀──────────────────│
    │                │◀─── Check ───────│                   │
    │                │  ✅ success OR   │                   │
    │                │  ❌ failure      │                   │
```

---

## ✅ Live Demo
Watch the live demo here -> https://youtu.be/P9EdRm2D2v8

The following screenshots show the system running end-to-end on a real GitHub repository.

### Unverified Contributor — PR Blocked ❌

> A PR opened by a contributor who has not onboarded with Heka receives an automatic failure check.

![alt text](image.png)



### Verified Contributor — PR Approved ✅

> After onboarding, the contributor's DID appears in the PR check summary.

![alt text](image-3.png)

---

## 🚀 Getting Started

### Prerequisites

| Requirement    | Version                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------ |
| Node.js        | **v20.x LTS only** (v18.x also works — v21+ is NOT supported due to native Askar bindings) |
| npm            | v9+                                                                                        |
| GitHub Account | Required to install the GitHub App                                                         |
| Smee.io        | Free — no account needed                                                                   |

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/darshit2308/heka-identity-prototype.git
cd heka-identity-prototype
```

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

### Step 4 — Test the Full Flow

**Onboard a contributor:**

```bash
curl -X POST http://localhost:3000/onboard \
  -H "Content-Type: application/json" \
  -d '{"github_username": "your-github-username"}'
```

Expected response:

```json
{
  "message": "Onboarding successful",
  "did": "did:key:z6Mk...",
  "credential": "eyJhbGciOiJFZERTQSJ9..."
}
```

**Verify a credential:**

```bash
curl -X POST http://localhost:3000/verify \
  -H "Content-Type: application/json" \
  -d '{"github_username": "your-github-username"}'
```

Expected response:

```json
{
  "status": "verified",
  "isValid": true,
  "did": "did:key:z6Mk..."
}
```

**Open a Pull Request** on a repository where your GitHub App is installed. Watch the Heka Identity Verification check appear automatically.

---

## 📁 Project Structure

```
heka-identity-prototype/
│
├── mock-heka-credo/              # Identity Issuer Service
│   ├── src/
│   │   └── index.ts              # Agent setup, Express routes
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── mock-heka-bot/                # GitHub Probot App
│   ├── src/
│   │   └── index.ts              # Webhook handlers, GitHub Checks
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
└── README.md
```

---

## 🛠️ API Reference

### Identity Service (`mock-heka-credo`) — Port 3000

| Method | Endpoint   | Description                                           |
| ------ | ---------- | ----------------------------------------------------- |
| `GET`  | `/status`  | Health check — returns issuer DID                     |
| `POST` | `/onboard` | Issues a Verifiable Credential for a contributor      |
| `POST` | `/verify`  | Cryptographically verifies a contributor's credential |

**`POST /onboard`**

```json
// Request
{ "github_username": "darshit2308" }

// Response
{
  "message": "Onboarding successful",
  "did": "did:key:z6MkrJ...",
  "credential": "<signed JWT>"
}
```

**`POST /verify`**

```json
// Request
{ "github_username": "darshit2308" }

// Response (verified)
{ "status": "verified", "isValid": true, "did": "did:key:z6MkrJ..." }

// Response (not found)
{ "isValid": false, "error": "No credential found. Contributor needs to onboard first." }
```

---

## 🔬 Technical Deep Dive

### Why Credo-ts?

[Credo-ts](https://github.com/openwallet-foundation/credo-ts) (formerly Aries Framework JavaScript) is the OpenWallet Foundation's production-grade TypeScript framework for decentralized identity. It is the same framework used internally by the Heka Identity Platform — making this prototype architecturally compatible with the real system from day one.

### Why `did:key`?

For the MVP, `did:key` was chosen because it is:

- **Self-contained** — no external ledger required to resolve
- **Immediately verifiable** — the public key is encoded directly in the DID
- **Production-compatible** — the system is designed to swap in `did:hedera` with minimal changes

In production, the DID will be anchored on the Hedera Testnet using the Hedera DID Method, providing immutable, publicly auditable identity records.

### Cryptographic Verification Chain

```
Issuer generates Ed25519 keypair
         │
         ▼
Master DID created (did:key:z6Mk[issuer-pubkey])
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
      "is_verified": true
    }
  }
         │
         ▼
JWT serialized and stored in Askar wallet
         │
         ▼
On /verify: Credo verifyCredential() checks EdDSA signature
against issuer's public key resolved from DID Document
```

---

## 🗺️ MVP vs Production

This prototype deliberately simplifies certain components to focus on proving the hardest architectural pieces. Here is an honest breakdown:

| Feature              | MVP (This Prototype)          | Production                                                                                              |
| -------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| **DID Method**       | `did:key` (local, no ledger)  | `did:hedera` anchored on Hedera Testnet/Mainnet                                                         |
| **Identity Storage** | In-memory JavaScript object   | Persistent DB (PostgreSQL) or Hedera Smart Contract                                                     |
| **Onboarding Auth**  | GitHub username trusted as-is | GPG challenge-response — contributor signs a server nonce with their GPG private key to prove ownership |
| **VC Format**        | W3C JWT VC                    | SD-JWT (Selective Disclosure JWT) for privacy-preserving presentation                                   |
| **Wallet**           | Askar in-process              | Full Heka Identity Platform cloud wallet                                                                |
| **Verification**     | Simple VC signature check     | Linked VP from contributor DID Document (Option 1 in issue)                                             |
| **GitHub App**       | Checks API only               | Full status checks + PR comments + repo-specific configuration                                          |

---

## 🔭 Future Work

The following items represent the production roadmap discussed in [Issue #87](https://github.com/LF-Decentralized-Trust-Mentorships/mentorship-program/issues/87):

- **GPG Challenge-Response Onboarding** — Server issues a random nonce, contributor signs with GPG private key, server verifies signature against public key before issuing VC. This prevents username spoofing.
- **Hedera DID Anchoring** — Replace `did:key` with `did:hedera` using `@hashgraph/did-sdk`. The issuer DID and user DIDs get anchored on the Hedera Testnet for public auditability.
- **SD-JWT Selective Disclosure** — Contributors can prove specific claims (e.g., "I am a verified contributor") without revealing their full identity profile.
- **Persistent Storage** — Replace in-memory `identityStore` with PostgreSQL or a Hedera Smart Contract.
- **Linked VP in DID Document** — Contributor's DID Document contains a Linked Verifiable Presentation, enabling verification without querying the Heka service directly (Option 1 from the issue sequence diagram).
- **Repository-Specific Configuration** — Allow repo maintainers to configure verification strictness (warn-only vs. blocking).
- **React Onboarding UI** — Replace curl-based onboarding with a proper web interface using GitHub OAuth login.

---

## 🤝 Relation to LFDT and Hiero

This prototype is built as a pre-application MVP for the **LF Decentralized Trust Mentorship Program (LFDT-2026)**, specifically [Issue #87 — Hiero: Contributor Identity Verification Prototype](https://github.com/LF-Decentralized-Trust-Mentorships/mentorship-program/issues/87).

The architecture is designed to integrate with:

- **Heka Identity Platform** — the existing Hiero identity ecosystem (Credo-ts is used internally by Heka)
- **Identity Collaboration Hub** — the prototype can be tested against real Hiero repositories
- **OpenVTC LFDT Lab** — the decentralized trust graph initiative for Linux Kernel contribution flow

This project serves as a reference implementation demonstrating that decentralized identity verification in open-source workflows is not just theoretically sound — it is practically buildable today.

---

## 👨‍💻 Author

**Darshit Khandelwal**

- GitHub: [@darshit2308](https://github.com/darshit2308)
- LinkedIn: [darshit-khandelwal](https://www.linkedin.com/in/darshit-khandelwal-49bb25288)
- Built as part of the LFDT Mentorship Program application — 2026

---

## 📄 License

This project is licensed under the Apache License 2.0 — see the [LICENSE](LICENSE) file for details.

---
