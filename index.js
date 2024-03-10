import express from 'express'
import {App, createNodeMiddleware, Octokit} from 'octokit'

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

const middleware = createNodeMiddleware(octokit)
const app = express()
app.use(middleware)

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

octokit.webhooks.on('issue_comment.created', async ({octokit, payload}) => {
    try {
        const body = payload.comment.body.trim().toLowerCase()
        const owner = payload.repository.owner.login
        const repo = payload.repository.name
        const issueNumber = payload.issue.number
        const actor = payload.comment.user.login
        const commentID = payload.comment.id
        const metadata = `${actor}:${owner}:${repo}:${issueNumber}:${commentID}`

        if (!payload.issue.pull_request) {
            return console.log(`[${metadata}] Issue is not a pull request`)

        }
        if (!body.startsWith('/actions-bot') || !body.includes('rerun-required-workflows')) {
            return console.log(`[${metadata}] Not a command: '${body}'`)
        }

        console.log(`[${metadata}] Processing command '${body}'`)
        const properties = payload.repository.custom_properties
        console.log(`[${metadata}] Processing properties: ${JSON.stringify(properties)}`)
        const checks = await retrieveRequiredChecks(properties)
        if (checks.length === 0) {
            return console.log(`[${metadata}] No required checks found`)
        }
        console.log(`[${metadata}] Processing rerun-required-workflows`)
        await processRerunRequiredWorkflows(octokit, metadata, owner, repo, issueNumber, checks)
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