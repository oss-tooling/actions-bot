import {retrieveRequiredChecks} from "./utils.js";
import {rerunRequiredWorkflows} from "./github.js";

export const respond = (req, res) => {
    res.send('OK')
}

export const processWebhook = async (req, res) => {
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
        await rerunRequiredWorkflows(req.octokit, req.key, req.body.repository.owner.login, req.body.repository.name, req.body.issue.number, checks)
    } catch (e) {
        console.error(`Error: ${e.message}`)
    }
}