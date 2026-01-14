import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useConsole } from './ConsoleContext';
import { ConnectionStatus } from '../types';

interface SocketContextData {
    socket: Socket | null;
    status: ConnectionStatus;
    qrCode: string | null;
    serverError: boolean;
    initializeSocket: (token: string, serverUrl: string) => void;
    disconnectSocket: () => void;
    resetConnection: () => void;
}

const SocketContext = createContext<SocketContextData>({} as SocketContextData);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [serverError, setServerError] = useState(false);

    // Anti-flap ref to prevent multiple connections
    const connectionRef = useRef<Socket | null>(null);
    const { logEvent } = useConsole();

    const initializeSocket = useCallback((token: string, serverUrl: string) => {
        if (connectionRef.current?.connected) {
            console.log('[SOCKET_C] Already connected');
            return;
        }

        if (connectionRef.current) {
            connectionRef.current.disconnect();
        }

        logEvent('Socket', 'info', 'Initializing connection...', serverUrl);
        setStatus(ConnectionStatus.CONNECTING);
        setServerError(false);

        const newSocket = io(serverUrl, {
            auth: { token },
            transports: ['websocket', 'polling'], // Fallback enabled
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
            timeout: 20000
        });

        connectionRef.current = newSocket;

        newSocket.on('connect', () => {
            logEvent('Socket', 'info', 'Connected to Socket.IO Server');
            setServerError(false);
            newSocket.emit('client-ready');
            newSocket.emit('get-all-labels');
        });

        newSocket.on('connect_error', (err) => {
            console.error('[SOCKET_ERR]', err.message);
            // Don't spam logs if it's polling error
            if (err.message !== 'xhr poll error') {
                logEvent('Socket', 'error', 'Connection Error', err.message);
            }
            setServerError(true);
        });

        newSocket.on('disconnect', (reason) => {
            logEvent('Socket', 'warn', 'Disconnected', reason);
            if (reason === 'io server disconnect' || reason === 'transport close') {
                // If server closed connection (e.g. restart), let auto-reconnect handle it
                // but update status
                setStatus(ConnectionStatus.DISCONNECTED);
            }
        });

        newSocket.on('connected', (isConnected: boolean) => {
            if (isConnected) {
                setStatus(ConnectionStatus.CONNECTED);
                setQrCode(null);
                logEvent('WhatsApp', 'info', 'Client Ready & Authenticated');
            } else {
                setStatus(ConnectionStatus.QR_READY);
                logEvent('WhatsApp', 'warn', 'Waiting for QR Scan');
            }
        });

        newSocket.on('qr', (qr: string) => {
            setStatus(ConnectionStatus.QR_READY);
            setQrCode(qr);
            logEvent('WhatsApp', 'info', 'New QR Code received');
        });

        setSocket(newSocket);
    }, [logEvent]);

    const disconnectSocket = useCallback(() => {
        if (connectionRef.current) {
            connectionRef.current.disconnect();
            connectionRef.current = null;
        }
        setSocket(null);
        setStatus(ConnectionStatus.DISCONNECTED);
    }, []);

    const resetConnection = useCallback(() => {
        if (socket) {
            logEvent('Auth', 'warn', 'Requesting Session Reset...');
            // Reset local state immediately
            setStatus(ConnectionStatus.CONNECTING);
            setQrCode(null);

            socket.emit('reset-session');
            // Server should respond with events, but we can force UI update
        }
    }, [socket, logEvent]);

    return (
        <SocketContext.Provider value={{
            socket,
            status,
            qrCode,
            serverError,
            initializeSocket,
            disconnectSocket,
            resetConnection
        }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => useContext(SocketContext);
