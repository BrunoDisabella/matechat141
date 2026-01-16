import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';

// Simple check for backend health via HTTP
const checkServerHealth = async (url: string) => {
    try {
        const res = await fetch(`${url}/api/health`, { method: 'GET' });
        return res.ok;
    } catch {
        return false;
    }
};

interface ServerStatusProps {
    apiUrl: string;
}

export const ServerStatus: React.FC<ServerStatusProps> = ({ apiUrl }) => {
    const { status, serverError } = useSocket();
    const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);

    useEffect(() => {
        const interval = setInterval(async () => {
            const isHealthy = await checkServerHealth(apiUrl);
            setBackendHealthy(isHealthy);
        }, 30000);

        checkServerHealth(apiUrl).then(setBackendHealthy);
        return () => clearInterval(interval);
    }, [apiUrl]);

    if (!serverError && status === 'connected') return null; // All good, hide

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
            {serverError && (
                <div className="bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm animate-pulse">
                    <WifiOff size={16} />
                    <span>Sin conexión al Backend</span>
                </div>
            )}
            {!serverError && status !== 'connected' && (
                <div className="bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm">
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Reconectando WhatsApp...</span>
                </div>
            )}
        </div>
    );
};
