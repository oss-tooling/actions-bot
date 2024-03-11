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

export const rerunRequiredWorkflows = async (octokit, metadata, owner, repo, number, checks) => {
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
