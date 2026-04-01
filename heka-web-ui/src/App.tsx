import { useMemo, useState } from "react";

type ChallengeResponse = {
  message: string;
  challenge: string;
  command_to_run: string;
};

type OnboardResponse = {
  message: string;
  did: string;
  credential: unknown;
};

type VerifyResponse = {
  status?: string;
  isValid: boolean;
  did?: string;
  error?: string;
};

type PanelState = "idle" | "loading" | "success" | "error";

const apiBase = import.meta.env.VITE_HEKA_API_URL ?? "/api";

const stepCopy = [
  {
    id: "01",
    title: "Fetch challenge",
    body: "Ask Heka for a nonce tied to your GitHub username.",
  },
  {
    id: "02",
    title: "Sign with GPG",
    body: "Run the copy-ready command in your terminal and paste the clearsigned block back here.",
  },
  {
    id: "03",
    title: "Issue VC and verify",
    body: "The backend issues a credential, then the GitHub App checks it on pull requests.",
  },
];

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function copyText(value: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(value).catch(() => {});
  }
}

export default function App() {
  const [username, setUsername] = useState("darshit2308");
  const [signature, setSignature] = useState("");
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [onboardResult, setOnboardResult] = useState<OnboardResponse | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [activeStep, setActiveStep] = useState(1);

  const commandToRun = challenge?.command_to_run ?? "";
  const gitHubApiLabel = useMemo(
    () => apiBase.replace(/\/api$/, "") || "local proxy",
    [],
  );

  async function requestChallenge() {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("Enter a GitHub username first.");
      setPanelState("error");
      return;
    }
    setError("");
    setNotice("");
    setPanelState("loading");
    setActiveStep(1);
    try {
      const response = await fetch(
        `${apiBase}/challenge/${encodeURIComponent(trimmedUsername)}`,
      );
      const data = (await response.json()) as { error?: string } & Partial<ChallengeResponse>;
      if (!response.ok) throw new Error(data.error || "Could not fetch challenge");
      setChallenge(data as ChallengeResponse);
      setSignature("");
      setOnboardResult(null);
      setVerifyResult(null);
      setNotice("Challenge generated. Run the command in your terminal, then paste the clearsigned output here.");
      setActiveStep(2);
      setPanelState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Challenge request failed");
      setPanelState("error");
    }
  }

  async function submitOnboard() {
    if (!challenge) {
      setError("Fetch a challenge before onboarding.");
      setPanelState("error");
      return;
    }
    if (!signature.trim()) {
      setError("Paste the GPG clearsigned output before submitting onboarding.");
      setPanelState("error");
      return;
    }
    setError("");
    setNotice("");
    setPanelState("loading");
    try {
      const response = await fetch(`${apiBase}/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_username: username.trim(), signature }),
      });
      const data = (await response.json()) as { error?: string } & Partial<OnboardResponse>;
      if (!response.ok) throw new Error(data.error || "Onboarding failed");
      const onboardData = data as OnboardResponse;
      setOnboardResult(onboardData);
      setNotice("Credential issued successfully. Next, confirm the stored credential with /verify.");
      setActiveStep(3);
      setPanelState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
      setPanelState("error");
    }
  }

  async function verifyCredential() {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("Enter a GitHub username first.");
      setPanelState("error");
      return;
    }
    setError("");
    setNotice("");
    setPanelState("loading");
    try {
      const response = await fetch(`${apiBase}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_username: trimmedUsername }),
      });
      const data = (await response.json()) as VerifyResponse | { error?: string };
      if (!response.ok) throw new Error(data.error || "Verification failed");
      setVerifyResult(data as VerifyResponse);
      setNotice("Verification complete. The GitHub App can now surface this result as a PR check.");
      setPanelState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setPanelState("error");
    }
  }

  function resetFlow() {
    setChallenge(null);
    setSignature("");
    setOnboardResult(null);
    setVerifyResult(null);
    setNotice("");
    setError("");
    setPanelState("idle");
    setActiveStep(1);
  }

  const statusTone =
    panelState === "success" ? "good"
    : panelState === "error" ? "bad"
    : panelState === "loading" ? "loading"
    : "neutral";

  return (
    <div className="shell">
      <div className="bg-grid" />
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />

      <main className="app-frame">

        {/* ── Header ── */}
        <header className="app-header">
          <div className="header-left">
            <div className="brand-lockup">
              <div className="brand-icon">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2L2 6v8l8 4 8-4V6L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M10 2v12M2 6l8 4 8-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div className="brand-tag">LFDT Issue #87 · Hiero Ecosystem</div>
                <h1 className="brand-name">Heka Identity Portal</h1>
              </div>
            </div>
          </div>
          <div className="header-right">
            <div className="meta-chip">
              <span className="chip-dot" />
              <span className="chip-label">API</span>
              <span className="chip-val">{gitHubApiLabel}</span>
            </div>
            <div className="meta-chip">
              <span className="chip-dot" />
              <span className="chip-label">Method</span>
              <span className="chip-val">did:key</span>
            </div>
            <div className={`status-badge status-${statusTone}`}>
              {panelState === "loading" && <span className="spinner" />}
              {panelState === "success" && "● Active"}
              {panelState === "error" && "● Error"}
              {panelState === "idle" && "● Ready"}
              {panelState === "loading" && "Processing"}
            </div>
          </div>
        </header>

        <p className="app-tagline">
          One-page contributor onboarding console — cryptographic GPG challenge,
          VC issuance via Heka Identity Service, and GitHub App PR verification.
        </p>

        {/* ── Step Tracker ── */}
        <div className="step-track">
          {stepCopy.map((step, index) => {
            const state =
              activeStep === index + 1 ? "active"
              : activeStep > index + 1 ? "done"
              : "pending";
            return (
              <div key={step.id} className={`step-item step-${state}`}>
                {index < stepCopy.length - 1 && (
                  <div className={`step-line ${state === "done" || activeStep > index + 1 ? "filled" : ""}`} />
                )}
                <div className="step-node">
                  {state === "done" ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <span>{step.id}</span>
                  )}
                </div>
                <div className="step-text">
                  <div className="step-title">{step.title}</div>
                  <div className="step-body">{step.body}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Workspace ── */}
        <div className="workspace">

          {/* Left – Action Panel */}
          <div className="panel panel-action">
            <div className="panel-head">
              <div>
                <div className="overline">Onboarding Console</div>
                <h2 className="panel-title">Contributor Flow</h2>
              </div>
              <button className="btn-ghost" type="button" onClick={resetFlow}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 7a6 6 0 1 0 1.5-3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  <path d="M1 2.5V7h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Reset
              </button>
            </div>

            <label className="field">
              <span className="field-label">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M1 11c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                GitHub Username
              </span>
              <div className="input-wrapper">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="darshit2308"
                  autoComplete="off"
                />
              </div>
            </label>

            <div className="btn-row">
              <button className="btn-primary" type="button" onClick={requestChallenge}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1v6M4 4l3-3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1 9v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                Fetch Challenge
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => copyText(challenge?.command_to_run ?? "")}
                disabled={!challenge}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="4" y="4" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M4 3V2a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Copy Command
              </button>
            </div>

            <div className="terminal-block">
              <div className="terminal-head">
                <div className="terminal-dots">
                  <span className="dot-red" />
                  <span className="dot-yellow" />
                  <span className="dot-green" />
                </div>
                <span className="terminal-label">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M1 3l3 2.5L1 8M5 8h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  shell
                </span>
                <button
                  type="button"
                  className="terminal-copy-btn"
                  onClick={() => copyText(commandToRun)}
                  disabled={!commandToRun}
                >
                  Copy
                </button>
              </div>
              <pre className="terminal-body">
                {commandToRun || "$ — fetch a challenge to generate the GPG sign command"}
              </pre>
            </div>

            <label className="field">
              <span className="field-label">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M4 6h4M4 4h4M4 8h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Clearsigned GPG Output
              </span>
              <textarea
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder={"-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\nPaste your full gpg --clearsign output here\n-----END PGP SIGNATURE-----"}
                rows={10}
              />
            </label>

            <div className="btn-row">
              <button className="btn-primary" type="button" onClick={submitOnboard}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1L1 5v4l6 4 6-4V5L7 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M7 1v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Submit &amp; Issue VC
              </button>
              <button className="btn-secondary" type="button" onClick={verifyCredential}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Verify Credential
              </button>
            </div>

            {(notice || error) && (
              <div className={`alert ${error ? "alert-error" : "alert-success"}`}>
                <div className="alert-icon">
                  {error
                    ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M7.13 2.5L1.5 12.5h13L9.87 2.5a1 1 0 0 0-1.74 0z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/><path d="M5 8l2.5 2.5L11 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  }
                </div>
                <div className="alert-body">
                  <strong>{error ? "Error" : "Success"}</strong>
                  <p>{error || notice}</p>
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="right-col">

            {/* Output panel */}
            <div className="panel panel-output">
              <div className="panel-head">
                <div>
                  <div className="overline">Live Output</div>
                  <h2 className="panel-title">Response Console</h2>
                </div>
                <div className={`live-dot ${panelState === "loading" ? "pulsing" : ""}`} />
              </div>

              <div className="output-block">
                <div className="output-label">
                  <span className="output-dot out-challenge" />
                  Challenge Response
                </div>
                <pre className="output-pre">
                  {challenge ? pretty(challenge) : "// awaiting challenge request…"}
                </pre>
              </div>

              <div className="output-block">
                <div className="output-label">
                  <span className="output-dot out-vc" />
                  Onboarding Result
                </div>
                <pre className="output-pre">
                  {onboardResult ? pretty(onboardResult) : "// awaiting onboarding submission…"}
                </pre>
              </div>

              <div className="output-block">
                <div className="output-label">
                  <span className="output-dot out-verify" />
                  Verification Result
                </div>
                <pre className="output-pre">
                  {verifyResult ? pretty(verifyResult) : "// awaiting credential verification…"}
                </pre>
              </div>
            </div>

            {/* Roadmap panel */}
            <div className="panel panel-roadmap">
              <div className="overline">Implementation Roadmap</div>
              <div className="roadmap-items">
                <div className="roadmap-item rm-now">
                  <div className="rm-marker">
                    <div className="rm-dot" />
                    <div className="rm-line" />
                  </div>
                  <div className="rm-content">
                    <div className="rm-when">Now · Active</div>
                    <p>GPG proof, VC issuance, SQLite persistence, GitHub App PR checks.</p>
                  </div>
                </div>
                <div className="roadmap-item rm-next">
                  <div className="rm-marker">
                    <div className="rm-dot" />
                    <div className="rm-line" />
                  </div>
                  <div className="rm-content">
                    <div className="rm-when">Next · Planned</div>
                    <p>Swap <code>did:key</code> for public <code>did:hedera</code> anchor on testnet.</p>
                  </div>
                </div>
                <div className="roadmap-item rm-then">
                  <div className="rm-marker">
                    <div className="rm-dot" />
                  </div>
                  <div className="rm-content">
                    <div className="rm-when">Then · Research</div>
                    <p>Add VP / OID4VP holder-presented credential verification flow.</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <footer className="app-footer">
          <span>Heka Identity Portal · LFDT Issue #87 · Hiero Ecosystem</span>
          <span>Node.js + TypeScript · credo-ts · did:key → did:hedera</span>
        </footer>

      </main>
    </div>
  );
}