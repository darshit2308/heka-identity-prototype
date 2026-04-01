import { Probot } from 'probot'
import { handlePullRequestEvent } from './handlers/pullRequestHandler.js'

export default (app: Probot) => {
  app.log.info('Mock Heka bot is live and listening!')

  // This line tells Probot to trigger when a PR is opened or updated
  app.on(['pull_request.opened', 'pull_request.synchronize'], async (context) => {
    await handlePullRequestEvent(app, context)
  })
}