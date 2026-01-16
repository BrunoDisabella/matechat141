# MateChat Professional

Bienvenido a la versión **Profesional** de MateChat.
Este proyecto ha sido refactorizado para ser robusto, persistente y escalable.

## 🚀 Arquitectura "Indestructible"

### 1. Sistema de Procesos (PM2)
La aplicación ya no corre "suelta" en la terminal. Ahora es gestionada por **PM2**, un gestor de procesos de producción.
- **Auto-Reinicio**: Si la app falla, se levanta sola en menos de 1 segundo.
- **Segundo Plano**: Funciona 24/7 sin necesitar una terminal abierta.
- **Gestión**: `pm2 logs`, `pm2 monit`, `pm2 stop matechat-server`.

### 2. Base de Datos & Persistencia (Supabase)
Adiós a la pérdida de datos.
- **Sincronización Total**: Cada mensaje (entrante/saliente) se guarda en tiempo real en la tabla `messages` de Supabase.
- **Chat Metadata**: La tabla `chats` se actualiza automáticamente con cada interacción.
- **Modo Offline**: Si el servidor se apaga, los datos están seguros en la nube.

### 3. TypeScript Core
El "cerebro" del backend ha sido reescrito en **TypeScript** para máxima estabilidad.
- `server.ts`: Punto de entrada robusto.
- `whatsappService.ts`: Gestión de cliente con reconexión inteligente y manejo de sesiones.
- `socketService.ts`: Comunicación tiempo real con el frontend.
- `webhookDispatcher.ts`: Envío garantizado de datos a n8n/CRM, con sanitización de IDs.

## 🛠️ Comandos Clave

**Instalación:**
```bash
npm install
```

**Iniciar (Modo Producción):**
```bash
pm2 start ecosystem.config.cjs
```

**Ver Logs:**
```bash
pm2 logs matechat-server
```

**Desarrollo (Tests):**
```bash
npm run dev
```

## 🔌 Webhooks & Integración
El sistema envía eventos a los webhooks configurados (vía UI o DB).
- **Formato de ChatID**: `59899123456@c.us` (Formato estándar de WhatsApp).
- **Eventos**: `message_received`, `message_sent`.

---
*Desarrollado con ❤️ y TypeScript.*
