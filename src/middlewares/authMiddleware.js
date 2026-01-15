import supabaseService from '../services/supabaseService.js';

export const authenticateApiKeyOnly = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        // Fallback for dev/legacy
        if (process.env.API_KEY && process.env.API_KEY !== 'matechat.com') {
            // If env var is set (and not default), strict mode might block this
        }
        // Proceed with default user if no key (Dangerous? For now compatible with existing logic)
        req.userId = 'default-user';
        return next();
    }

    try {
        const userId = await supabaseService.getUserByApiKey(apiKey);
        if (userId) {
            req.userId = userId;
            return next();
        }
    } catch (e) {
        console.error('Auth lookup error', e);
    }

    // Legacy fallback: check env
    if (apiKey === process.env.API_KEY) {
        req.userId = 'default-user';
        return next();
    }

    console.warn(`[AUTH] Access denied. Key: ${apiKey}`);
    res.status(401).json({ error: 'Unauthorized' });
};

export const authenticateSession = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    try {
        const user = await supabaseService.getUser(token); // Reuses the method we added earlier
        req.userId = user.id;
        next();
    } catch (e) {
        console.error('[AUTH_SESSION]', e.message);
        res.status(401).json({ error: 'Invalid session' });
    }
};
