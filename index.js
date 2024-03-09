import express from 'express'
import {Octokit} from '@octokit/core'
import {paginateRest} from '@octokit/plugin-paginate-rest'
import {throttling} from '@octokit/plugin-throttling'
import {retry} from '@octokit/plugin-retry'
import {App, createNodeMiddleware} from '@octokit/app'

const port = process.env.OSST_ACTIONS_BOT_PORT || 3000
const appID = process.env.OSST_ACTIONS_BOT_APP_ID
const appPrivateKey = process.env.OSST_ACTIONS_BOT_APP_PRIVATE_KEY
const appSecret = process.env.OSST_ACTIONS_BOT_APP_WEBHOOK_SECRET
const requiredChecks = [
    'policy-enforce-pr',
    'policy-enforce-pr-2'
]
const _Octokit = Octokit.plugin(paginateRest, retry, throttling).defaults({
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

const middleware = createNodeMiddleware(octokit)
const app = express()
app.use(middleware)

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

const fetchWorkflowRun = async (octokit, owner, repo, suiteID, ref, sha, runID) => {
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

const processRerunRequiredWorkflows = async (octokit, body, owner, repo, number, actor, metadata) => {
    console.log(`[${metadata}] Retrieving PR information`)
    const pr = await fetchPull(octokit, owner, repo, number)
    for (const name of requiredChecks) {
        try {
            console.log(`[${metadata}] Retrieving latest check suite for ${name}`)
            const suiteID = await fetchCheck(octokit, owner, repo, pr.head.ref, name)

            console.log(`[${metadata}] Retrieving workflow runs for check suite ${suiteID}`)
            const runID = await fetchWorkflowRun(octokit, owner, repo, suiteID, pr.head.ref, pr.head.sha, pr.id)

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
        const metadata = `${actor}:${owner}:${repo}:${issueNumber}:${payload.comment.id}`
        console.log(`[${metadata}] Received command: '${body}' from ${actor}`)
        if (body.startsWith('/actions-bot')) {
            console.log(`[${metadata}] Processing command`)
            if (body.includes('rerun-required-workflows')) {
                console.log(`[${metadata}] Processing rerun-required-workflows`)
                await processRerunRequiredWorkflows(octokit, body, owner, repo, issueNumber, actor, metadata)
            }
        }
    } catch (e) {
        console.log(`Error: ${e.message}`)
    }
})

const main = async () => {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`)
    })
}

main()