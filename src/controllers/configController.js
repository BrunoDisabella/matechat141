import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

export const updateApiKey = async (req, res) => {
    try {
        const { apiKey } = req.body;
        if (!apiKey) return res.status(400).json({ success: false, error: 'API Key is required' });

        // Update in memory
        process.env.API_KEY = apiKey;

        // Persist to .env
        let envContent = '';
        if (fs.existsSync(ENV_PATH)) {
            envContent = fs.readFileSync(ENV_PATH, 'utf8');
        }

        const lines = envContent.split('\n');
        let found = false;
        const newLines = lines.map(line => {
            if (line.startsWith('API_KEY=')) {
                found = true;
                return `API_KEY=${apiKey}`;
            }
            return line;
        });

        if (!found) {
            newLines.push(`API_KEY=${apiKey}`);
        }

        fs.writeFileSync(ENV_PATH, newLines.join('\n'));

        console.log(`[CONFIG] API Key updated to: ${apiKey}`);

        res.json({ success: true, message: 'API Key updated successfully' });
    } catch (e) {
        console.error('[CONFIG_ERROR]', e);
        res.status(500).json({ success: false, error: e.message });
    }
};

export const getApiKey = async (req, res) => {
    // Optional: Retrieve current key (masked) if needed, but for now just update.
    res.json({ success: true, apiKey: process.env.API_KEY || '' });
};
