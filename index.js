import express from 'express'
import {limiter} from './src/limiter.js'
import {processWebhook, respond} from './src/routes.js'
import {
    debugRequest,
    hydrateKey,
    hydrateOctokit,
    verifyCommand,
    verifyGitHubWebhook,
    verifyIsPR,
    verifyIssueCommentCreatedEvent,
    verifyMembership
} from './src/middleware.js'

const app = express()
app.use(express.json())

app.get('/healthz', respond)
app.post('/api/github/webhooks',
    debugRequest,
    hydrateKey,
    limiter,
    verifyIsPR,
    verifyIssueCommentCreatedEvent,
    verifyGitHubWebhook,
    verifyMembership,
    verifyCommand,
    hydrateOctokit,
    processWebhook)

const main = async () => {
    const port = process.env.OSST_ACTIONS_BOT_PORT || process.env.PORT || 8080
    console.log(`Starting server on port ${port}`)
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`)
    })
}

main()