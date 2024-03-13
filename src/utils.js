export const retrieveRequiredChecks = async (properties) => {
    const requiredChecks = []
    for (const [_key, value] of Object.entries(properties)) {
        const key = _key.trim().toLowerCase()
        if (key.startsWith('osst-actions-bot')) {
            requiredChecks.push(value)
        }
    }
    return requiredChecks
}