import express from 'express'
import * as crypto from 'crypto'
import {App, Octokit} from 'octokit'
import {rateLimit} from 'express-rate-limit'

const port = process.env.OSST_ACTIONS_BOT_PORT || process.env.PORT || 8080
const appID = process.env.OSST_ACTIONS_BOT_APP_ID
const appPrivateKey = Buffer.from(process.env.OSST_ACTIONS_BOT_APP_PRIVATE_KEY, 'base64').toString('utf-8')
const appSecret = process.env.OSST_ACTIONS_BOT_APP_WEBHOOK_SECRET

const octokit = new App({
    appId: appID,
    privateKey: appPrivateKey,
    Octokit: Octokit.defaults({
        userAgent: 'oss-tooling-actions-bot/v1.0.0',
        throttle: {
            onRateLimit: (retryAfter, options) => {
                if (options.request.retryCount === 0) {
                    console.log(`Request quota exhausted for request ${options.url}`)
                    return true
                }
            },
            onSecondaryRateLimit: (retryAfter, options) => {
                console.log(`Abuse detected for request ${options.url}`)
                return true
            }
        }
    }),
    oauth: {clientId: null, clientSecret: null},
    webhooks: {
        secret: appSecret
    }
})

const retrieveRequiredChecks = async (properties) => {
    const requiredChecks = []
    for (const [_key, value] of Object.entries(properties)) {
        const key = _key.trim().toLowerCase()
        if (key.startsWith('osst_actions_bot')) {
            requiredChecks.push(value)
        }
    }
    return requiredChecks
}

const fetchPull = async (octokit, owner, repo, number) => {
    const {data} = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner: owner,
        repo: repo,
        pull_number: number
    })
    return data
}

const fetchCheck = async (octokit, owner, repo, ref, check) => {
    const {data} = await octokit.request('GET /repos/{owner}/{repo}/commits/{ref}/check-runs', {
        owner: owner,
        repo: repo,
        ref: ref,
        check_name: check,
        filter: 'latest',
        per_page: 1
    })
    return data.check_runs[0].check_suite.id
}

const fetchWorkflowRun = async (octokit, owner, repo, suiteID, ref, sha) => {
    const {data} = await octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
        owner: owner,
        repo: repo,
        check_suite_id: suiteID,
        branch: ref,
        head_sha: sha,
        event: 'pull_request',
        per_page: 1
    })
    return data.workflow_runs[0].id
}

const rerunWorkflow = async (octokit, owner, repo, runID) => {
    await octokit.request('POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun', {
        owner: owner,
        repo: repo,
        run_id: runID
    })
}

const processRerunRequiredWorkflows = async (octokit, metadata, owner, repo, number, checks) => {
    console.log(`[${metadata}] Retrieving PR information`)
    const pr = await fetchPull(octokit, owner, repo, number)
    for (const name of checks) {
        try {
            console.log(`[${metadata}] Retrieving latest check suite for ${name}`)
            const suiteID = await fetchCheck(octokit, owner, repo, pr.head.ref, name)

            console.log(`[${metadata}] Retrieving workflow runs for check suite ${suiteID}`)
            const runID = await fetchWorkflowRun(octokit, owner, repo, suiteID, pr.head.ref, pr.head.sha)

            console.log(`[${metadata}] Rerunning workflow run ${runID}`)
            await rerunWorkflow(octokit, owner, repo, runID)
        } catch (e) {
            console.error(`[${metadata}] Error retrieving check suite ${name}: ${e.message}`)
        }
    }
}

const verifyGitHubWebhook = (req, res, next) => {
    const payload = JSON.stringify(req.body)
    if (!payload) {
        return next('Request body empty')
    }

    const sig = req.get('X-Hub-Signature-256') || ''
    const hmac = crypto.createHmac('sha256', appSecret)
    const digest = Buffer.from('sha256=' + hmac.update(payload).digest('hex'), 'utf8')
    const checksum = Buffer.from(sig, 'utf8')
    if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
        return next(`Request body digest (${digest}) did not match X-Hub-Signature-256 (${checksum})`)
    }
    return next()
}

const verifyIssueCommentCreatedEvent = (req, res, next) => {
    if (req.get('X-GitHub-Event') === 'issue_comment') {
        if (req.body.action === 'created') {
            return next()
        }
    }
    return next(`X-GitHub-Event is not issue_comment.created`)
}

const verifyIsPR = async (req, res, next) => {
    const isPR = req.body.issue.pull_request
    if (isPR) {
        return next()
    }
    return next(`Issue is not a pull request`)
}

const verifyCommand = (req, res, next) => {
    const command = req.body.comment.body.trim().toLowerCase()
    if (command.startsWith('/actions-bot') && command.includes('rerun-required-workflows')) {
        return next()
    }
    return next(`Not a command: '${command}'`)

}

const hydrateKey = (req, res, next) => {
    const actor = req.body.comment.user.login
    const owner = req.body.repository.owner.login
    const repo = req.body.repository.name
    const pr = req.body.issue.number
    const commentID = req.body.comment.id
    const commentNodeID = req.body.comment.node_id
    req.key = `${actor}:${owner}:${repo}:${pr}:${commentID}:${commentNodeID}`
    return next()
}

const hydrateOctokit = async (req, res, next) => {
    req.octokit = await octokit.getInstallationOctokit(req.body.installation.id)
    return next()
}

const verifyMembership = async (req, res, next) => {
    if (req.body.comment.author_association === 'MEMBER') {
        return next()
    }
    return next('User is not a member')
}

const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 10, // limit each IP to 1 requests per windowMs
    keyGenerator: (req) => req.body.issue.node_id,
    handler: (req, res, next, options) => {
        console.log(`[${req.key}] Rate limit exceeded`)
        return res.status(options.statusCode).send(options.message)
    }
})

const app = express()
app.use(express.json())
app.use(hydrateKey)
app.use(limiter)
app.use(verifyGitHubWebhook)
app.use(verifyIsPR)
app.use(verifyIssueCommentCreatedEvent)
app.use(verifyMembership)
app.use(verifyCommand)
app.use(hydrateOctokit)

app.post('/api/github/webhooks', async (req) => {
    try {
        const command = req.body.comment.body.trim().toLowerCase()
        console.log(`[${req.key}] Processing command '${command}'`)
        const properties = req.body.repository.custom_properties
        console.log(`[${req.key}] Processing properties: ${JSON.stringify(properties)}`)
        const checks = await retrieveRequiredChecks(properties)
        if (checks.length === 0) {
            return console.log(`[${req.key}] No required checks found`)
        }
        console.log(`[${req.key}] Processing rerun-required-workflows`)
        await processRerunRequiredWorkflows(req.octokit, req.key, req.body.repository.owner.login, req.body.repository.name, req.body.issue.number, checks)
    } catch (e) {
        console.error(`Error: ${e.message}`)
    }
})

app.get('/', (req, res) => {
    res.send('OK')
})

app.get('/healthz', (req, res) => {
    res.send('OK')
})

const main = async () => {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`)
    })
}

main()