import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: process.env.PORT || 3001,
    apiKey: process.env.API_KEY || 'matechat.com',
    sessionPath: process.env.SESSION_PATH || '.wwebjs_auth'
};
