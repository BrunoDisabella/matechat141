# Arquitectura de MateChat

## Estructura de Servicios

### 1. WhatsApp Service (`src/services/whatsappService.js`)
- Gestiona las instancias de `whatsapp-web.js`.
- Utiliza **LocalAuth** para la persistencia de sesión en la carpeta `.wwebjs_auth`.
- **Nuevo:** Al iniciar la aplicación, busca automáticamente sesiones existentes y las conecta (`restoreSessions`), permitiendo que el bot funcione sin interacción del navegador.
- Emite eventos (`message`, `qr`, `ready`) que son consumidos por el Socket y el WebhookDispatcher.

### 2. Webhook Dispatcher (`src/services/webhookDispatcher.js`)
- Escucha eventos de `whatsappService`.
- **Caché (Nuevo):** Cachea la configuración de webhooks de Supabase en memoria durante 60 segundos. Esto evita latencia y saturación de la base de datos en mensajes frecuentes.
- **Reintentos (Nuevo):** Si n8n (o el endpoint destino) falla, el sistema reintenta el envío 3 veces con espera exponencial (2s, 4s, 8s).
- **Asíncrono:** El envío de webhooks no bloquea el hilo principal de WhatsApp.

### 3. Socket Service (`src/services/socketService.js`)
- Gestiona la comunicación en tiempo real con el Frontend (React).
- Autentica usuarios vía token de Supabase.
- Permite escanear QRs y ver el estado de la conexión.

## Flujo de Datos (Webhooks)

1. **Mensaje Entrante**: WhatsApp Web cliente recibe mensaje.
2. **Evento**: `whatsappService` emite evento `message`.
3. **Dispatcher**: `webhookDispatcher` captura el evento.
4. **Consulta Config (Caché)**: Verifica si hay webhooks configurados para ese usuario (lee de RAM si es reciente, o Supabase si expiró).
5. **Envío**: Envía POST a la URL configurada (ej. n8n).
6. **Fallo/Reintento**: Si falla, espera y reintenta.

## Restauración y Backup

- **Backup**: Se ha creado un script/comando para copiar la carpeta raíz completa.
- **Restauración**: Ver `RESTORE_BACKUP.md`.
