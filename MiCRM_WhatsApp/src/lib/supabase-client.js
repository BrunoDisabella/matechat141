// Importamos desde el archivo que descargaste en el Paso 1
import { createClient } from './supabase-dist.js'; 
import { ChromeStorageAdapter } from './storage-adapter.js';

// TUS DATOS REALES (Proyecto: bapoxdhqycobflxzrqrc)
const SUPABASE_URL = 'https://bapoxdhqycobflxzrqrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhcG94ZGhxeWNvYmZseHpycXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyMjY3MTYsImV4cCI6MjA4MTgwMjcxNn0.izNuFMT6aHG4It6sc-rQSvMi3Bn4rwr3DqR6w8Hf1SA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ChromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});