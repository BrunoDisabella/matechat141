import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from './services/supabase';
import { Login } from './components/Login';
import { ChatList } from './components/ChatList';
import { ChatWindow } from './components/ChatWindow';
import { QRCodeDisplay } from './components/QRCodeDisplay';
import { Chat, Message, User, ConnectionStatus, QuickReply, Session, Label, ChatLabels, ScheduledMessage } from './types';
import { blobToBase64 } from './utils/formatters';
import { ConsoleProvider, useConsole } from './contexts/ConsoleContext';
import { SocketProvider, useSocket } from './contexts/SocketContext'; // Import Context
import { Settings, WifiOff, ScanLine } from 'lucide-react'; // Iconos añadidos

// Modales
import { ApiKeyManagerModal } from './components/modals/ApiKeyManagerModal';
import { WebhookManagerModal } from './components/modals/WebhookManagerModal';
import { QuickReplyManagerModal } from './components/modals/QuickReplyManagerModal';
import { LabelManagerModal } from './components/modals/LabelManagerModal';
import { StatusSchedulerModal } from './components/modals/StatusSchedulerModal';

// Componente interno para usar hooks dentro del provider
const MateChatApp: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const { socket, status, qrCode, serverError, initializeSocket, resetConnection, disconnectSocket } = useSocket();

    // Estados de UI
    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [scheduledMessages, setScheduledMessages] = useState<Record<string, ScheduledMessage[]>>({});
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false); // Estado para paginación
    const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);

    // Estado de Conexión y Configuración de Servidor
    const [customServerUrl, setCustomServerUrl] = useState<string>(() => {
        return localStorage.getItem('matechat_server_url') || '';
    });
    const [isConfiguringServer, setIsConfiguringServer] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false); // Nuevo estado para ver QR manualmente en modo espejo

    // Estados de Etiquetas
    const [labels, setLabels] = useState<Label[]>([]);
    const [chatLabels, setChatLabels] = useState<ChatLabels>({});

    // Estados de Modales
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [showWebhooksModal, setShowWebhooksModal] = useState(false);
    const [showQuickRepliesModal, setShowQuickRepliesModal] = useState(false);
    const [showLabelManagerModal, setShowLabelManagerModal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);

    const { logEvent } = useConsole();

    // Determinar URL base
    const getServerUrl = useCallback(() => {
        if (customServerUrl) return customServerUrl;
        const hostname = window.location.hostname;
        // Si es localhost explícito
        if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:3001';
        // Si estamos en producción (mismo dominio)
        // FIX: Safely access import.meta.env
        const env = (import.meta as any).env;
        if (env && env.PROD) return window.location.origin;
        // Default fallback (probablemente fallará en cloud IDEs sin config manual)
        return window.location.origin;
    }, [customServerUrl]);

    const API_BASE_URL = getServerUrl();

    // Auth
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session: supabaseSession } }) => {
            if (supabaseSession?.user) {
                setUser({ id: supabaseSession.user.id, email: supabaseSession.user.email });
                setSession({ access_token: supabaseSession.access_token, user: { id: supabaseSession.user.id } });
                logEvent('Auth', 'info', 'Sesión recuperada', supabaseSession.user.email);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, supabaseSession) => {
            if (supabaseSession?.user) {
                setUser({ id: supabaseSession.user.id, email: supabaseSession.user.email });
                setSession({ access_token: supabaseSession.access_token, user: { id: supabaseSession.user.id } });
            } else {
                setUser(null);
                setSession(null);
            }
        });

        return () => subscription.unsubscribe();
    }, [logEvent]);

    // --- CARGA DE DATOS DESDE SUPABASE (MODO ESPEJO/OFFLINE) ---

    // 1. Cargar Chats
    const fetchChatsFromSupabase = useCallback(async () => {
        if (!user) return;
        try {
            logEvent('DB', 'info', 'Cargando chats desde Supabase...');
            const { data: dbChats, error } = await supabase
                .from('chats')
                .select('*')
                .eq('user_id', user.id)
                .order('last_message_timestamp', { ascending: false });

            if (error) throw error;

            if (dbChats) {
                const formattedChats: Chat[] = dbChats.map(c => ({
                    id: c.id,
                    name: c.name || c.id.replace('@c.us', ''),
                    isGroup: c.is_group,
                    lastMessage: c.last_message_body ? {
                        body: c.last_message_body,
                        timestamp: new Date(c.last_message_timestamp).getTime() / 1000,
                        fromMe: false, // No podemos saberlo solo con esto, pero sirve para visualizar
                        id: 'prev',
                        type: 'chat',
                        hasMedia: false
                    } : undefined,
                    unreadCount: 0,
                    profilePicUrl: null // No guardamos esto en DB aún
                }));

                setChats(prev => {
                    // Si ya tenemos chats del socket (más completos), no sobreescribir con datos básicos de DB a menos que esté vacío
                    if (prev.length > 0 && status === ConnectionStatus.CONNECTED) return prev;
                    return formattedChats;
                });
                logEvent('DB', 'info', `Cargados ${formattedChats.length} chats desde DB.`);
            }
        } catch (e: any) {
            logEvent('DB', 'error', 'Error cargando chats de DB', e.message);
        }
    }, [user, status, logEvent]);

    // 2. Cargar Etiquetas y Asignaciones
    const fetchLabelsFromSupabase = useCallback(async () => {
        if (!user) return;
        try {
            logEvent('DB', 'info', 'Cargando etiquetas desde Supabase...');

            // Fetch Labels
            const { data: dbLabels, error: labelsError } = await supabase
                .from('labels')
                .select('*')
                .eq('user_id', user.id);

            if (labelsError) throw labelsError;

            if (dbLabels) {
                setLabels(dbLabels);
            }

            // Fetch Chat Assignments
            const { data: dbAssignments, error: assignError } = await supabase
                .from('chat_labels')
                .select('chat_id, label_id')
                .eq('user_id', user.id);

            if (assignError) throw assignError;

            if (dbAssignments) {
                const mapping: ChatLabels = {};
                dbAssignments.forEach((item: any) => {
                    if (!mapping[item.chat_id]) mapping[item.chat_id] = [];
                    mapping[item.chat_id].push(item.label_id);
                });
                setChatLabels(mapping);
            }

            logEvent('DB', 'info', `Cargadas ${dbLabels?.length || 0} etiquetas y sus asignaciones.`);
        } catch (e: any) {
            logEvent('DB', 'error', 'Error cargando etiquetas de DB', e.message);
        }
    }, [user, logEvent]);

    // Ejecutar cargas iniciales de DB
    useEffect(() => {
        if (user) {
            fetchChatsFromSupabase();
            fetchLabelsFromSupabase();
        }
    }, [user, fetchChatsFromSupabase, fetchLabelsFromSupabase]);

    // Cargar historial desde DB cuando se selecciona chat (Fallback si no hay socket)
    const fetchMessagesFromSupabase = useCallback(async (chatId: string) => {
        if (!user) return;
        try {
            const { data: dbMessages } = await supabase
                .from('messages')
                .select('*')
                .eq('chat_id', chatId)
                .eq('user_id', user.id)
                .order('timestamp', { ascending: false })
                .limit(50);

            if (dbMessages) {
                const formattedMessages: Message[] = dbMessages.reverse().map(m => ({
                    id: m.id,
                    body: m.body,
                    fromMe: m.from_me,
                    timestamp: new Date(m.timestamp).getTime() / 1000,
                    type: m.type,
                    hasMedia: m.has_media,
                    media: undefined
                }));
                setMessages(prev => ({ ...prev, [chatId]: formattedMessages }));
                setLoadingHistory(false);
            }
        } catch (e) {
            console.error(e);
        }
    }, [user]);

    // Fetch Quick Replies
    const fetchQuickReplies = useCallback(async () => {
        if (!session) return;
        try {
            // Aseguramos que la URL no termine en barra para evitar dobles barras
            const baseUrl = API_BASE_URL.replace(/\/$/, '');
            const res = await fetch(`${baseUrl}/api/quick-replies`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await res.json();
            if (data.success) {
                setQuickReplies(data.quickReplies);
                logEvent('Data', 'info', `Cargadas ${data.quickReplies.length} respuestas rápidas`);
            }
        } catch (e) {
            logEvent('Data', 'error', 'Error cargando respuestas rápidas', e);
        }
    }, [session, logEvent, API_BASE_URL]);

    useEffect(() => {
        if (session && !serverError) fetchQuickReplies();
    }, [session, fetchQuickReplies, serverError]);


    // Socket Initialization via Context
    useEffect(() => {
        if (!user || !session) return;
        const connectionUrl = API_BASE_URL;
        initializeSocket(session.access_token, connectionUrl);
    }, [user, session, API_BASE_URL, initializeSocket]);

    // Bind Data Events to Socket
    useEffect(() => {
        if (!socket) return;

        socket.on('chats', (incomingChats: Chat[]) => {
            setChats(incomingChats);
            logEvent('WhatsApp', 'info', `Recibidos ${incomingChats.length} chats`);
        });

        socket.on('chat-history', ({ chatId, messages: history }: { chatId: string, messages: Message[] }) => {
            const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
            setMessages(prev => ({ ...prev, [chatId]: sortedHistory }));
            setLoadingHistory(false);
            logEvent('Chat', 'info', `Historial cargado para ${chatId}`);
        });

        socket.on('more-messages-loaded', ({ chatId, messages: newMessages }: { chatId: string, messages: Message[] }) => {
            setMessages(prev => {
                const currentMessages = prev[chatId] || [];
                const existingIds = new Set(currentMessages.map(m => m.id));
                const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));

                if (uniqueNew.length === 0) return prev;

                const merged = [...uniqueNew, ...currentMessages].sort((a, b) => a.timestamp - b.timestamp);
                return { ...prev, [chatId]: merged };
            });
            setLoadingMore(false);
            logEvent('Chat', 'info', `Cargados ${newMessages.length} mensajes antiguos para ${chatId}`);
        });

        socket.on('scheduled-messages', ({ chatId, messages }) => {
            setScheduledMessages(prev => ({ ...prev, [chatId]: messages }));
        });

        socket.on('new-message', (msg: Message & { chatId: string }) => {
            setChats(prevChats => prevChats.map(c => {
                if (c.id === msg.chatId) {
                    return {
                        ...c,
                        lastMessage: msg,
                        unreadCount: msg.fromMe || selectedChatId === msg.chatId ? 0 : (c.unreadCount || 0) + 1
                    };
                }
                return c;
            }).sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0)));

            setMessages(prev => {
                const chatMsgs = prev[msg.chatId] || [];
                if (chatMsgs.find(m => m.id === msg.id)) return prev;
                return { ...prev, [msg.chatId]: [...chatMsgs, msg].sort((a, b) => a.timestamp - b.timestamp) };
            });

            if (msg.fromMe) logEvent('Chat', 'info', 'Mensaje enviado confirmado', msg.id);
            else logEvent('Chat', 'info', 'Nuevo mensaje recibido', msg.id);
        });

        socket.on('message-media-update', ({ chatId, messageId, media }) => {
            setMessages(prev => {
                const chatMsgs = prev[chatId] || [];
                return {
                    ...prev,
                    [chatId]: chatMsgs.map(m => m.id === messageId ? { ...m, media, hasMedia: true } : m)
                };
            });
        });

        socket.on('chat-profile-pic-update', ({ chatId, profilePicUrl }) => {
            setChats(prev => prev.map(c => c.id === chatId ? { ...c, profilePicUrl } : c));
        });

        socket.on('all-labels', (serverLabels: Label[]) => {
            setLabels(serverLabels);
        });

        socket.on('chat-labels-updated', (data: ChatLabels) => {
            setChatLabels(data);
        });

        return () => {
            socket.off('chats');
            socket.off('chat-history');
            socket.off('more-messages-loaded');
            socket.off('scheduled-messages');
            socket.off('new-message');
            socket.off('message-media-update');
            socket.off('chat-profile-pic-update');
            socket.off('all-labels');
            socket.off('chat-labels-updated');
        };
    }, [socket, selectedChatId, logEvent]);

    const handleSelectChat = (chatId: string) => {
        setSelectedChatId(chatId);

        if (!messages[chatId]) {
            setLoadingHistory(true);
            if (status === ConnectionStatus.CONNECTED) {
                socket?.emit('select-chat', chatId);
            } else {
                // Fallback DB
                fetchMessagesFromSupabase(chatId);
            }
        }
        if (status === ConnectionStatus.CONNECTED) {
            socket?.emit('get-scheduled-messages', chatId);
        }
    };

    const handleLoadMoreMessages = useCallback(async () => {
        if (!selectedChatId || loadingMore || !user) return;

        const currentMessages = messages[selectedChatId] || [];
        if (currentMessages.length === 0) return;

        const oldestMessage = currentMessages[0]; // Asumimos orden ascendente [viejo ... nuevo]
        setLoadingMore(true);

        // Estrategia híbrida: Si hay socket, pedimos a WA. Si no, pedimos a DB (paginación offline).
        if (status === ConnectionStatus.CONNECTED && socket) {
            logEvent('Chat', 'info', 'Pidiendo más mensajes al socket...', oldestMessage.id);
            socket.emit('load-more-messages', {
                chatId: selectedChatId,
                limit: 20,
                beforeId: oldestMessage.id
            });
        } else {
            // Fallback Offline (Supabase Pagination)
            logEvent('Chat', 'info', 'Pidiendo más mensajes a Supabase (Offline)...');
            try {
                const { data: dbMessages } = await supabase
                    .from('messages')
                    .select('*')
                    .eq('chat_id', selectedChatId)
                    .eq('user_id', user.id)
                    .lt('timestamp', new Date(oldestMessage.timestamp * 1000).toISOString()) // Buscar anteriores a este
                    .order('timestamp', { ascending: false })
                    .limit(20);

                if (dbMessages && dbMessages.length > 0) {
                    const formattedMessages: Message[] = dbMessages.reverse().map(m => ({
                        id: m.id,
                        body: m.body,
                        fromMe: m.from_me,
                        timestamp: new Date(m.timestamp).getTime() / 1000,
                        type: m.type,
                        hasMedia: m.has_media,
                        media: undefined
                    }));

                    setMessages(prev => {
                        const chatMsgs = prev[selectedChatId] || [];
                        return { ...prev, [selectedChatId]: [...formattedMessages, ...chatMsgs] };
                    });
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingMore(false);
            }
        }
    }, [selectedChatId, messages, loadingMore, status, socket, user, logEvent]);

    const handleSendMessage = async (text: string, audioBlob?: Blob, scheduledTime?: number) => {
        if (!socket || !selectedChatId) return;

        if (status !== ConnectionStatus.CONNECTED) {
            alert("No estás conectado a WhatsApp.");
            return;
        }

        if (audioBlob) {
            try {
                logEvent('Chat', 'info', 'Procesando envío de audio...');
                const base64Audio = await blobToBase64(audioBlob);
                socket.emit('send-message', {
                    to: selectedChatId,
                    text: '',
                    audioBase64: base64Audio,
                    audioMime: audioBlob.type,
                    isVoiceMessage: true
                });
            } catch (e) {
                logEvent('Chat', 'error', 'Error codificando audio', e);
            }
        } else if (text) {
            socket.emit('send-message', {
                to: selectedChatId,
                text,
                scheduledTime
            });

            if (scheduledTime) {
                logEvent('Schedule', 'info', 'Mensaje programado enviado al servidor');
            }
        }
    };

    const handleToggleSchedule = (id: string, active: boolean) => {
        socket?.emit('toggle-schedule', { id, active, chatId: selectedChatId });
    };

    const handleDeleteSchedule = (id: string) => {
        if (confirm('¿Eliminar mensaje programado?')) {
            socket?.emit('delete-schedule', { id, chatId: selectedChatId });
        }
    };

    // Handler para etiquetas en ChatWindow
    const handleToggleLabel = (labelId: string, isChecked: boolean) => {
        if (!selectedChatId || !socket) return;
        const event = isChecked ? 'assign-label' : 'unassign-label';
        socket.emit(event, { chatId: selectedChatId, labelId });
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        disconnectSocket();
        setUser(null);
        setSession(null);
    };

    const handleResetConnection = () => {
        resetConnection();
        setShowQrModal(true);
    };

    const handleSaveServerUrl = (url: string) => {
        const cleanUrl = url.replace(/\/$/, ''); // Quitar slash final
        setCustomServerUrl(cleanUrl);
        localStorage.setItem('matechat_server_url', cleanUrl);
        setIsConfiguringServer(false);
        // Esto disparará el useEffect de conexión automáticamente
    };

    if (!user) return <Login />;

    // Determinar si debemos mostrar la pantalla de bloqueo (QR/Loading)
    // Mostramos bloqueo si: NO estamos conectados Y NO tenemos chats (ni de DB ni de Socket)
    const shouldBlockUI = status !== ConnectionStatus.CONNECTED && chats.length === 0;

    return (
        <div className="flex h-screen overflow-hidden flex-col relative">
            {/* Banner de Error de Servidor / Configuración */}
            {serverError && (
                <div className="bg-red-600 text-white px-4 py-3 z-50 w-full shadow-md flex items-center justify-between animate-in slide-in-from-top flex-shrink-0 relative">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <WifiOff className="w-5 h-5" />
                        <span>Desconectado del servidor. Intentando reconectar... ({API_BASE_URL})</span>
                    </div>
                    <button
                        onClick={() => setIsConfiguringServer(true)}
                        className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded text-xs font-bold transition-colors flex items-center gap-1"
                    >
                        <Settings className="w-3 h-3" /> Configurar Servidor
                    </button>
                </div>
            )}

            {/* Banner de QR Pendiente (si tenemos chats pero falta auth) */}
            {!serverError && status === ConnectionStatus.QR_READY && chats.length > 0 && !showQrModal && (
                <div className="bg-yellow-500 text-white px-4 py-2 z-50 w-full shadow-sm flex items-center justify-between animate-in slide-in-from-top flex-shrink-0 relative">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <ScanLine className="w-5 h-5" />
                        <span>WhatsApp desconectado. Escanea el código QR para reconectar.</span>
                    </div>
                    <button
                        onClick={() => setShowQrModal(true)}
                        className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded text-xs font-bold transition-colors"
                    >
                        Ver Código QR
                    </button>
                </div>
            )}

            {/* Modal de Configuración de Servidor (Simple Overlay) */}
            {isConfiguringServer && (
                <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-bold text-gray-800 mb-2">Configurar URL del Backend</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            En entornos Cloud (Google IDX, Codespaces), el puerto del backend (3001) tiene una URL diferente al frontend.
                            Ingresa la URL pública de tu puerto 3001 aquí:
                        </p>
                        <input
                            type="text"
                            defaultValue={customServerUrl}
                            placeholder="https://tu-backend-3001.preview.app"
                            className="w-full border border-gray-300 rounded p-2 mb-4 focus:ring-2 focus:ring-[#00a884] outline-none font-mono text-sm"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveServerUrl(e.currentTarget.value);
                            }}
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setIsConfiguringServer(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={(e) => {
                                    const input = e.currentTarget.parentElement?.previousElementSibling as HTMLInputElement;
                                    handleSaveServerUrl(input.value);
                                }}
                                className="px-4 py-2 bg-[#00a884] text-white rounded hover:bg-[#008f6f]"
                            >
                                Guardar y Conectar
                            </button>
                        </div>
                        {window.location.hostname !== 'localhost' && (
                            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                                <strong>Tip:</strong> Busca en tu panel de "Puertos" o "Ports" la URL asignada al puerto 3001.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal QR (Manual trigger when in mirror mode) */}
            {showQrModal && (
                <div className="fixed inset-0 z-[60] bg-white flex flex-col">
                    <div className="p-4 flex justify-end">
                        <button onClick={() => setShowQrModal(false)} className="text-gray-500 hover:text-gray-800 font-bold px-4 py-2 bg-gray-100 rounded">Cerrar</button>
                    </div>
                    <div className="flex-1">
                        <QRCodeDisplay
                            qrCode={qrCode}
                            error={null}
                            onLogout={handleLogout}
                            onResetConnection={handleResetConnection}
                        />
                    </div>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden pt-0 relative">
                {/* Modales */}
                {session && (
                    <>
                        <ApiKeyManagerModal
                            isOpen={showApiKeyModal}
                            onClose={() => setShowApiKeyModal(false)}
                            session={session}
                        />
                        <WebhookManagerModal
                            isOpen={showWebhooksModal}
                            onClose={() => setShowWebhooksModal(false)}
                            session={session}
                        />
                        <QuickReplyManagerModal
                            isOpen={showQuickRepliesModal}
                            onClose={() => setShowQuickRepliesModal(false)}
                            session={session}
                            quickReplies={quickReplies}
                            onUpdate={fetchQuickReplies}
                        />
                        <LabelManagerModal
                            isOpen={showLabelManagerModal}
                            onClose={() => setShowLabelManagerModal(false)}
                            session={session}
                            labels={labels}
                            socket={socket}
                        />
                        <StatusSchedulerModal
                            isOpen={showStatusModal}
                            onClose={() => setShowStatusModal(false)}
                            socket={socket}
                        />
                    </>
                )}

                {shouldBlockUI ? (
                    <div className="w-full h-full absolute inset-0 z-10 bg-white">
                        <QRCodeDisplay
                            qrCode={qrCode}
                            error={null}
                            onLogout={handleLogout}
                            onResetConnection={handleResetConnection}
                        />
                    </div>
                ) : (
                    <>
                        <div className={`${selectedChatId ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full`}>
                            <ChatList
                                chats={chats}
                                userEmail={user?.email} // Pass user email
                                selectedChatId={selectedChatId}
                                onSelectChat={handleSelectChat}
                                loading={status === ConnectionStatus.CONNECTING && chats.length === 0}
                                allLabels={labels}
                                chatLabels={chatLabels}
                                onToggleLabels={() => setShowLabelManagerModal(true)}
                                socket={socket}
                                onOpenApiKeyModal={() => setShowApiKeyModal(true)}
                                onOpenWebhooksModal={() => setShowWebhooksModal(true)}
                                onOpenQuickRepliesModal={() => setShowQuickRepliesModal(true)}
                                onOpenStatusModal={() => setShowStatusModal(true)}
                                onResetConnection={handleResetConnection}
                            />
                        </div>

                        <div className={`${!selectedChatId ? 'hidden md:flex' : 'flex'} flex-1 h-full relative`}>
                            {selectedChatId && (
                                <button
                                    onClick={() => setSelectedChatId(null)}
                                    className="md:hidden absolute top-3 left-3 z-30 bg-white/90 p-2 rounded-full shadow text-gray-600 border border-gray-200"
                                >
                                    ←
                                </button>
                            )}

                            <ChatWindow
                                chat={chats.find(c => c.id === selectedChatId) || null}
                                messages={selectedChatId ? (messages[selectedChatId] || []) : []}
                                scheduledMessages={selectedChatId ? (scheduledMessages[selectedChatId] || []) : []}
                                currentUserId={user.id}
                                onSendMessage={handleSendMessage}
                                loadingHistory={loadingHistory}
                                loadingMore={loadingMore} // Nueva prop
                                onLoadMore={handleLoadMoreMessages} // Nueva prop
                                quickReplies={quickReplies}
                                onToggleSchedule={handleToggleSchedule}
                                onDeleteSchedule={handleDeleteSchedule}

                                // Nuevas props para Etiquetas
                                allLabels={labels}
                                currentChatLabels={selectedChatId ? (chatLabels[selectedChatId] || []) : []}
                                onToggleLabel={handleToggleLabel}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const App: React.FC = () => (
    <ConsoleProvider>
        <SocketProvider>
            <MateChatApp />
        </SocketProvider>
    </ConsoleProvider>
);

export default App;