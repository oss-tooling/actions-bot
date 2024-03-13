import express from 'express'
import {limiter} from './src/limiter.js'
import {processWebhook, respond} from './src/routes.js'
import {
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
app.use(verifyIsPR)
app.use(verifyIssueCommentCreatedEvent)
app.use(hydrateKey)
app.use(limiter)
app.use(verifyGitHubWebhook)
app.use(verifyMembership)
app.use(verifyCommand)
app.use(hydrateOctokit)

app.get('/', respond)
app.get('/healthz', respond)
app.post('/api/github/webhooks', processWebhook)

const main = async () => {
    const port = process.env.OSST_ACTIONS_BOT_PORT || process.env.PORT || 8080
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`)
    })
}

main()