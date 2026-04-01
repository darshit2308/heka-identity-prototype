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
  const [onboardResult, setOnboardResult] = useState<OnboardResponse | null>(
    null,
  );
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
      const data = (await response.json()) as {
        error?: string;
      } & Partial<ChallengeResponse>;

      if (!response.ok) {
        throw new Error(data.error || "Could not fetch challenge");
      }

      setChallenge(data as ChallengeResponse);
      setSignature("");
      setOnboardResult(null);
      setVerifyResult(null);
      setNotice(
        "Challenge generated. Run the command in your terminal, then paste the clearsigned output here.",
      );
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
      setError(
        "Paste the GPG clearsigned output before submitting onboarding.",
      );
      setPanelState("error");
      return;
    }

    setError("");
    setNotice("");
    setPanelState("loading");

    try {
      const response = await fetch(`${apiBase}/onboard`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          github_username: username.trim(),
          signature,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
      } & Partial<OnboardResponse>;

      if (!response.ok) {
        throw new Error(data.error || "Onboarding failed");
      }

      const onboardData = data as OnboardResponse;
      setOnboardResult(onboardData);
      setNotice(
        "Credential issued successfully. Next, confirm the stored credential with /verify.",
      );
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ github_username: trimmedUsername }),
      });

      const data = (await response.json()) as
        | VerifyResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Verification failed");
      }

      setVerifyResult(data as VerifyResponse);
      setNotice(
        "Verification complete. The GitHub App can now surface this result as a PR check.",
      );
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
    panelState === "success"
      ? "good"
      : panelState === "error"
        ? "bad"
        : "neutral";

  return (
    <div className="shell">
      <div className="background-orb background-orb-one" />
      <div className="background-orb background-orb-two" />
      <main className="app-frame">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow-row">
              <span className="eyebrow">LFDT Issue #87</span>
              <span className={`status-pill ${statusTone}`}>
                {"did:key prototype"}
              </span>
            </div>
            <h1>Heka Identity Portal</h1>
            <p>
              A one-page React onboarding console for contributor identity
              verification. It replaces terminal-only cURL steps with a clear
              flow for challenge, GPG signing, credential issuance, and PR
              verification.
            </p>
            <div className="hero-metrics">
              <div>
                <span>API mode</span>
                <strong>{gitHubApiLabel}</strong>
              </div>
              <div>
                <span>Current DID</span>
                <strong>did:key</strong>
              </div>
              <div>
                <span>Next major step</span>
                <strong>did:hedera anchor</strong>
              </div>
            </div>
          </div>

          <aside className="hero-card roadmap-card">
            <div className="roadmap-title">
              <span className="mono-label">Roadmap</span>
              <strong>Prototype gap analysis</strong>
            </div>
            <ul className="roadmap-list">
              <li>
                <span>Now</span>
                <p>
                  GPG proof, VC issuance, SQLite persistence, GitHub App checks.
                </p>
              </li>
              <li>
                <span>Next</span>
                <p>Swap local DID generation for a public Hedera DID anchor.</p>
              </li>
              <li>
                <span>Then</span>
                <p>Add VP / OID4VP style holder-presented verification.</p>
              </li>
            </ul>
          </aside>
        </section>

        <section className="step-strip">
          {stepCopy.map((step, index) => (
            <article
              key={step.id}
              className={`step-card ${activeStep === index + 1 ? "active" : ""}`}
            >
              <span className="step-number">{step.id}</span>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </article>
          ))}
        </section>

        <section className="workspace-grid">
          <div className="panel panel-primary">
            <div className="panel-header">
              <div>
                <span className="mono-label">Step 1 - 3</span>
                <h2>Contributor onboarding</h2>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={resetFlow}
              >
                Reset flow
              </button>
            </div>

            <label className="field">
              <span>GitHub username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="darshit2308"
                autoComplete="off"
              />
            </label>

            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                onClick={requestChallenge}
              >
                Fetch challenge
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => copyText(challenge?.command_to_run ?? "")}
                disabled={!challenge}
              >
                Copy sign command
              </button>
            </div>

            <div className="terminal-block">
              <div className="terminal-header">
                <span>Command to run</span>
                <button
                  type="button"
                  onClick={() => copyText(commandToRun)}
                  disabled={!commandToRun}
                >
                  Copy
                </button>
              </div>
              <pre>
                {commandToRun ||
                  "Fetch a challenge to generate the sign command."}
              </pre>
            </div>

            <label className="field">
              <span>Clearsigned GPG output</span>
              <textarea
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                placeholder="Paste the full gpg --clearsign block here"
                rows={10}
              />
            </label>

            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                onClick={submitOnboard}
              >
                Submit onboarding
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={verifyCredential}
              >
                Verify credential
              </button>
            </div>

            {(notice || error) && (
              <div className={`message ${error ? "error" : "success"}`}>
                <strong>{error ? "Problem" : "Ready"}</strong>
                <p>{error || notice}</p>
              </div>
            )}
          </div>

          <div className="panel panel-secondary">
            <div className="panel-header">
              <div>
                <span className="mono-label">Live output</span>
                <h2>Response console</h2>
              </div>
            </div>

            <section className="result-card">
              <h3>Challenge response</h3>
              <pre>{challenge ? pretty(challenge) : "No challenge yet."}</pre>
            </section>

            <section className="result-card">
              <h3>Onboarding result</h3>
              <pre>
                {onboardResult ? pretty(onboardResult) : "No VC issued yet."}
              </pre>
            </section>

            <section className="result-card">
              <h3>Verification result</h3>
              <pre>
                {verifyResult
                  ? pretty(verifyResult)
                  : "No verification result yet."}
              </pre>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
