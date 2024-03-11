import {rateLimit} from "express-rate-limit";

export const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 10, // limit each IP to 10 requests per windowMs
    keyGenerator: (req) => req.body.issue.node_id, // Rate limit based on the issue, allowing 10 requests per minute per issue (this is a failsafe to prevent abuse and should never be reached in normal operation)
    handler: (req, res, next, options) => {
        console.log(`[${req.key}] Rate limit exceeded`)
        return res.status(options.statusCode).send(options.message)
    }
})
