import { supabase } from './lib/supabase-client.js';

console.log('🤖 FUSION CRM: Service Worker (v4.0 - Hybrid)');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("📨 Background recibió:", request.type);

  if (request.type === 'LOGIN_GOOGLE') {
    handleLogin().then(sendResponse);
    return true;
  }

  // Solo mantenemos la lógica de servidor para mensajes programados
  // Los mensajes rápidos ahora son locales en crm_logic.js
  if (request.type === 'SAVE_SCHEDULED_MSG') {
    saveScheduledMessage(request.payload).then(sendResponse);
    return true;
  }

  // --- NUEVO: COLA DE MENSAJES (Enterprise Architecture) ---
  if (request.type === 'QUEUE_MESSAGE') {
    enqueueMessage(request.payload).then(sendResponse);
    return true;
  }
});

// --- Lógica de Login ---
async function handleLogin() {
  try {
    const redirectURL = chrome.identity.getRedirectURL();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectURL,
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    });
    if (error) throw error;
    return { success: true, user: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// --- Lógica de Mensajes Programados (Supabase) ---
async function saveScheduledMessage(msgData) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };

  const { data, error } = await supabase
    .from('scheduled_messages')
    .insert({
      user_id: user.id,
      contact_wpp_jid: msgData.chatId,
      content: msgData.text,
      scheduled_time: new Date(msgData.time).toISOString(),
      status: 'pending'
    });
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// --- Helper: Encolar Mensaje ---
async function enqueueMessage(payload) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Sin sesión activa.' };

  const { data, error } = await supabase
    .from('message_queue')
    .insert({
      chat_id: payload.chatId,
      body: payload.text,
      type: payload.type || 'text',
      media_url: payload.mediaUrl || null,
      media_caption: payload.caption || null,
      status: 'pending'
    });

  if (error) {
    console.error('Error encolando:', error);
    return { success: false, error: error.message };
  }
  return { success: true, data };
}