import { Probot } from 'probot';
import axios from 'axios';

// we set the Set HEKA_SERVICE_URL in your .env file
const HEKA_URL = process.env.HEKA_SERVICE_URL || 'http://localhost:3000';

export default (app: Probot) => {
  app.log.info('Mock Heka bot is live and listening!');

  // This line tells Probot to trigger when a PR is opened or updated
  app.on(['pull_request.opened', 'pull_request.synchronize'], async (context) => {

    // Fetching the information from the GitHub webhook payload
    const username = context.payload.pull_request.user.login;
    const sha = context.payload.pull_request.head.sha; // commit hash
    const repoInfo = context.repo(); // used to get the repo owner and name

    app.log.info(`\nSpotted a PR from @${username}. Starting verification...`);

    // As soon as the above step happens, we post an 'In Progress' status on the PR
    await context.octokit.checks.create({
      ...repoInfo,
      name: 'Heka Identity Verification',
      head_sha: sha,
      status: 'in_progress',
    });

    // storing the verification in a variable
    let verificationResult: { isValid: boolean; did?: string } = { isValid: false };

    try {
      // Now we connect with the Mock Heka Identity Server running on port 3000
      // Another feature, got the tip to add from AI: Added 5s timeout so a dead Heka service fails fast
      // instead of hanging the webhook for 30 seconds until GitHub times it out
      const response = await axios.post(
        `${HEKA_URL}/verify`,
        { github_username: username },
        { timeout: 5000 }
      );

      // Store the result so we can use it outside this try block
      verificationResult = response.data;

    } catch (error: any) {
      // This catch ONLY handles Heka API failures (network error, timeout, 404, etc.)
      // It does not handle GitHub API errors
      app.log.error(`Heka API call failed for @${username}: ${error.message}`);
      // verificationResult stays { isValid: false } , as default value
    }

    // The Heka might respond with valid or invalid
    if (verificationResult.isValid) {
      app.log.info(`✅ Successfully verified @${username}`);

      // After the user is verified, update the PR panel in GitHub
      await context.octokit.checks.create({
        ...repoInfo,
        name: 'Heka Identity Verification',
        head_sha: sha,
        status: 'completed',
        conclusion: 'success',
        output: {
          title: 'Contributor Verified ✅',
          summary: `Identity of **@${username}** has been verified cryptographically.\n\n**Decentralized Identifier (DID):** \`${verificationResult.did}\``,
        },
      });

    } else {
      app.log.warn(`❌ Verification failed for @${username} — no valid credential found.`);

      // If the verification faced some issue, update the PR panel
      await context.octokit.checks.create({
        ...repoInfo,
        name: 'Heka Identity Verification',
        head_sha: sha,
        status: 'completed',
        conclusion: 'failure',
        output: {
          title: 'Unverified Contributor ❌',
          summary: `We could not verify a decentralized identity credential for **@${username}**.\n\nPlease onboard via the Heka Portal to receive your Verifiable Credential before contributing.`,
        },
      });
    }
  });
};