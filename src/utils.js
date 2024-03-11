export const retrieveRequiredChecks = async (properties) => {
    const requiredChecks = []
    for (const [_key, value] of Object.entries(properties)) {
        const key = _key.trim().toLowerCase()
        if (key.startsWith('osst_actions_bot')) {
            requiredChecks.push(value)
        }
    }
    return requiredChecks
}