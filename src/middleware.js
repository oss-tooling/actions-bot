import crypto from "crypto"
import {App, Octokit} from "octokit";

const appID = process.env.OSST_ACTIONS_BOT_APP_ID
const appPrivateKey = Buffer.from(process.env.OSST_ACTIONS_BOT_APP_PRIVATE_KEY, 'base64').toString('utf-8')
const appSecret = process.env.OSST_ACTIONS_BOT_APP_WEBHOOK_SECRET
const debug = process.env.OSST_ACTIONS_BOT_DEBUG === 'true'

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

export const debugRequest = (req, res, next) => {
    if (debug) {
        console.log(req.body)
    }
    next()
}

export const verifyGitHubWebhook = (req, res, next) => {
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

export const verifyIssueCommentCreatedEvent = (req, res, next) => {
    if (req.get('X-GitHub-Event') === 'issue_comment') {
        if (req.body.action === 'created') {
            return next()
        }
    }
    return next(`X-GitHub-Event is not issue_comment.created`)
}

export const verifyIsPR = async (req, res, next) => {
    const isPR = req.body.issue.pull_request
    if (isPR) {
        return next()
    }
    return next(`Issue is not a pull request`)
}

export const verifyCommand = (req, res, next) => {
    const command = req.body.comment.body.trim().toLowerCase()
    if (command.startsWith('/actions-bot') && command.includes('rerun-required-workflows')) {
        return next()
    }
    return next(`Not a command: '${command}'`)

}

export const hydrateKey = (req, res, next) => {
    const actor = req.body.comment.user.login
    const owner = req.body.repository.owner.login
    const repo = req.body.repository.name
    const pr = req.body.issue.number
    const commentID = req.body.comment.id
    const commentNodeID = req.body.comment.node_id
    req.key = `${actor}:${owner}:${repo}:${pr}:${commentID}:${commentNodeID}`
    return next()
}

export const hydrateOctokit = async (req, res, next) => {
    req.octokit = await octokit.getInstallationOctokit(req.body.installation.id)
    return next()
}

export const verifyMembership = async (req, res, next) => {
    if (req.body.comment.author_association === 'MEMBER') {
        return next()
    }
    return next('User is not a member')
}
