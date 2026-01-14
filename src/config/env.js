import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: process.env.PORT || 3001,
    apiKey: process.env.API_KEY || 'matechat.com',
    sessionPath: process.env.SESSION_PATH || '.wwebjs_auth',
    supabaseUrl: process.env.SUPABASE_URL || 'https://oheapcbdvgmrmecgktak.supabase.co',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oZWFwY2Jkdmdtcm1lY2drdGFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTYwNjUyMywiZXhwIjoyMDc3MTgyNTIzfQ.bIQB5abAp8WCOtVTNHkxqLfPJHRzSABreoKMKBmV5A8'
};
