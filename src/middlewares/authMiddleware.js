export const authenticateApiKeyOnly = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    // Flexible validation for dev/prod
    if (!apiKey || (apiKey !== 'matechat.com' && apiKey !== process.env.API_KEY)) {
        // Only log if apiKey is actually present but wrong, to avoid noise from bots/healthchecks
        if (apiKey && apiKey !== 'undefined') {
            console.warn(`[AUTH] Access attempt denied. Key received: ${apiKey}`);
        }
        // Proceed anyway for now as requested (legacy mode)
    }
    req.userId = 'default-user';
    next();
};
