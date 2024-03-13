import express from 'express'
import {limiter} from './src/limiter.js'
import {processWebhook, respond} from './src/routes.js'
import {unless} from './src/utils.js'
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
app.use(unless('/healthz'), express.json())
app.use(unless('/healthz'), debugRequest)
app.use(unless('/healthz'), hydrateKey)
app.use(unless('/healthz'), limiter)
app.use(unless('/healthz'), verifyIsPR)
app.use(unless('/healthz'), verifyIssueCommentCreatedEvent)
app.use(unless('/healthz'), verifyGitHubWebhook)
app.use(unless('/healthz'), verifyMembership)
app.use(unless('/healthz'), verifyCommand)
app.use(unless('/healthz'), hydrateOctokit)

app.get('/healthz', respond)
app.post('/api/github/webhooks', processWebhook)

const main = async () => {
    const port = process.env.OSST_ACTIONS_BOT_PORT || process.env.PORT || 8080
    console.log(`Starting server on port ${port}`)
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`)
    })
}

main()