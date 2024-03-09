import express from 'express'
import {Octokit} from '@octokit/core'
import { paginateRest } from '@octokit/plugin-paginate-rest'
import { throttling } from '@octokit/plugin-throttling'
import { retry } from '@octokit/plugin-retry'
import {createAppAuth} from '@octokit/auth-app'
import {App, createNodeMiddleware} from '@octokit/app'

const app = express()
const port = process.env.OSST_ACTIONS_BOT_PORT || 3000
const appID = process.env.OSST_ACTIONS_BOT_APP_ID
const appPrivateKey = process.env.OSST_ACTIONS_BOT_APP_PRIVATE_KEY
const appSecret = process.env.OSST_ACTIONS_BOT_APP_WEBHOOK_SECRET

const _Octokit = Octokit.plugin(paginateRest, retry, throttling).defaults({
    userAgent: 'oss-tooling-actions-bot/v1.0.0',
    throttle: {
        onRateLimit: (retryAfter, options) => {
            if(options.request.retryCount === 0) {
                console.log(`Request quota exhausted for request ${options.url}`)
                return true
            }
        },
        onSecondaryRateLimit: (retryAfter, options) => {
            console.log(`Abuse detected for request ${options.url}`)
            return true
        }
    }
})

const octokit = new App({
    appId: appID,
    privateKey: appPrivateKey,
    Octokit: _Octokit,
    oauth: {
        clientId: "",
        clientSecret: ""
    },
    webhooks: {
        secret: appSecret
    }
})

app.use(express.json())
app.use(createNodeMiddleware(octokit))

app.post('/webhooks', async (req, res) => {
    console.log(req.body)
    res.status(200).send('OK')
})

const main = async () => {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`)
    })
}

main()