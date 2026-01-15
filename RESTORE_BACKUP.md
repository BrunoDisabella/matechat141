# Cómo Restaurar la Copia de Seguridad

Si algo falla críticamente, puedes restaurar la versión anterior del código.

## Ubicación del Backup
El backup se encuentra en: `c:\Users\Home\Desktop\funcio-matechat-7_12_backup_2026_01_15`

## Pasos para Restaurar

1. **Detener el servidor actual**:
   Preciona `Ctrl + C` en la terminal donde corre el servidor.

2. **Renombrar la carpeta actual (opcional)**:
   Puedes renombrar la carpeta `funcio-matechat-7_12` a `funcio-matechat-7_12_BROKEN` por seguridad.

3. **Copiar el backup**:
   Copia todo el contenido de la carpeta de backup y pégalo en `c:\Users\Home\Desktop\funcio-matechat-7_12`.

   Comando rápido en PowerShell:
   ```powershell
   Copy-Item -Path 'c:\Users\Home\Desktop\funcio-matechat-7_12_backup_2026_01_15\*' -Destination 'c:\Users\Home\Desktop\funcio-matechat-7_12' -Recurse -Force
   ```

4. **Instalar dependencias (si es necesario)**:
   Si la carpeta `node_modules` no se copió bien (aunque el backup debería tenerla), ejecuta:
   ```bash
   npm install
   ```

5. **Iniciar el servidor**:
   ```bash
   npm start
   ```
