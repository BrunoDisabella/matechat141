import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: process.env.PORT || 3001,
    apiKey: process.env.API_KEY || 'matechat.com',
    sessionPath: process.env.SESSION_PATH || '.wwebjs_auth',
    supabaseUrl: process.env.SUPABASE_URL || 'https://oheapcbdvgmrmecgktak.supabase.co',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
};
