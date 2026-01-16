import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from './services/supabase';
import { Login } from './components/Login';
import { ChatList } from './components/ChatList';
import { ChatWindow } from './components/ChatWindow';
import { QRCodeDisplay } from './components/QRCodeDisplay';
import { Chat, Message, User, ConnectionStatus, QuickReply, Session, Label, ChatLabels, ScheduledMessage } from './types';
import { blobToBase64 } from './utils/formatters';
import { ConsoleProvider, useConsole } from './contexts/ConsoleContext';
import { SocketProvider, useSocket } from './contexts/SocketContext';
import { Settings, WifiOff, ScanLine, LogOut } from 'lucide-react';
import { ServerStatus } from './components/ServerStatus';
import { ApiKeyManagerModal } from './components/modals/ApiKeyManagerModal';
import { WebhookManagerModal } from './components/modals/WebhookManagerModal';
import { QuickReplyManagerModal } from './components/modals/QuickReplyManagerModal';
import { LabelManagerModal } from './components/modals/LabelManagerModal';
import { StatusSchedulerModal } from './components/modals/StatusSchedulerModal';
import { EmptyState } from './components/EmptyState';

const MateChatApp: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const { socket, status, qrCode, serverError, initializeSocket, resetConnection, disconnectSocket } = useSocket();

    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [scheduledMessages, setScheduledMessages] = useState<Record<string, ScheduledMessage[]>>({});
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);

    const [customServerUrl, setCustomServerUrl] = useState<string>(() => {
        return localStorage.getItem('matechat_server_url') || '';
    });
    const [isConfiguringServer, setIsConfiguringServer] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);

    const [labels, setLabels] = useState<Label[]>([]);
    const [chatLabels, setChatLabels] = useState<ChatLabels>({});

    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [showWebhooksModal, setShowWebhooksModal] = useState(false);
    const [showQuickRepliesModal, setShowQuickRepliesModal] = useState(false);
    const [showLabelManagerModal, setShowLabelManagerModal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);

    const { logEvent } = useConsole();

    const getServerUrl = useCallback(() => {
        if (customServerUrl) return customServerUrl;
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:3001';
        const env = (import.meta as any).env;
        if (env && env.PROD) return window.location.origin;
        return window.location.origin;
    }, [customServerUrl]);

    const API_BASE_URL = getServerUrl();

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
                        fromMe: false,
                        id: 'prev',
                        type: 'chat',
                        hasMedia: false
                    } : undefined,
                    unreadCount: 0,
                    profilePicUrl: null
                }));

                setChats(prev => {
                    if (prev.length > 0 && status === ConnectionStatus.CONNECTED) return prev;
                    return formattedChats;
                });
                logEvent('DB', 'info', `Cargados ${formattedChats.length} chats desde DB.`);
            }
        } catch (e: any) {
            logEvent('DB', 'error', 'Error cargando chats de DB', e.message);
        }
    }, [user, status, logEvent]);

    const fetchLabelsFromSupabase = useCallback(async () => {
        if (!user) return;
        try {
            logEvent('DB', 'info', 'Cargando etiquetas desde Supabase...');
            const { data: dbLabels, error: labelsError } = await supabase.from('labels').select('*').eq('user_id', user.id);
            if (labelsError) throw labelsError;
            if (dbLabels) setLabels(dbLabels);

            const { data: dbAssignments, error: assignError } = await supabase.from('chat_labels').select('chat_id, label_id').eq('user_id', user.id);
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

    useEffect(() => {
        if (user) {
            fetchChatsFromSupabase();
            fetchLabelsFromSupabase();
        }
    }, [user, fetchChatsFromSupabase, fetchLabelsFromSupabase]);

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
                })); // Fixed: Ensure media is undefined or handled if DB stored it
                setMessages(prev => ({ ...prev, [chatId]: formattedMessages }));
                setLoadingHistory(false);
            }
        } catch (e) {
            console.error(e);
        }
    }, [user]);

    const fetchQuickReplies = useCallback(async () => {
        if (!session) return;
        try {
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

    useEffect(() => {
        if (!user || !session) return;
        const connectionUrl = API_BASE_URL;
        initializeSocket(session.access_token, connectionUrl);
    }, [user, session, API_BASE_URL, initializeSocket]);

    // Auto-open QR modal when QR code is received (e.g. after remote logout)
    useEffect(() => {
        if (qrCode) {
            setShowQrModal(true);
            setChats([]); // Also clear chats if not already cleared
            setMessages({});
        }
    }, [qrCode]);

    useEffect(() => {
        if (!socket) return;

        socket.on('chats', (incomingChats: Chat[]) => {
            // Always update from socket as it is the source of truth for the active session
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
        const oldestMessage = currentMessages[0];
        setLoadingMore(true);

        if (status === ConnectionStatus.CONNECTED && socket) {
            logEvent('Chat', 'info', 'Pidiendo más mensajes al socket...', oldestMessage.id);
            socket.emit('load-more-messages', {
                chatId: selectedChatId,
                limit: 20,
                beforeId: oldestMessage.id
            });
        } else {
            logEvent('Chat', 'info', 'Pidiendo más mensajes a Supabase (Offline)...');
            try {
                const { data: dbMessages } = await supabase
                    .from('messages')
                    .select('*')
                    .eq('chat_id', selectedChatId)
                    .eq('user_id', user.id)
                    .lt('timestamp', new Date(oldestMessage.timestamp * 1000).toISOString())
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
        setChats([]); // Clear immediately on UI
        setMessages({});
        resetConnection();
        setShowQrModal(true);
    };

    const handleSaveServerUrl = (url: string) => {
        const cleanUrl = url.replace(/\/$/, '');
        setCustomServerUrl(cleanUrl);
        localStorage.setItem('matechat_server_url', cleanUrl);
        setIsConfiguringServer(false);
    };

    // --- RENDERIZADO "PREMIUM" ---
    if (!user) return <Login />;

    if (showQrModal) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm">
                <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full relative border border-slate-200">
                    <button
                        onClick={() => setShowQrModal(false)}
                        className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors bg-slate-100 p-2 rounded-full"
                    >
                        ✕
                    </button>
                    <h2 className="text-2xl font-bold mb-6 text-center text-slate-800">
                        {qrCode ? 'Escanea para Conectar' : 'Conectando...'}
                    </h2>

                    {qrCode ? (
                        <>
                            <QRCodeDisplay qrCode={qrCode} status={status} />
                            <p className="text-center mt-6 text-sm text-slate-500">
                                Abre WhatsApp en tu móvil &gt; Dispositivos vinculados &gt; Vincular dispositivo
                            </p>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-16 h-16 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-500 font-medium">Generando código QR...</p>
                            <p className="text-xs text-slate-400 mt-2">Por favor espera un momento</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <ConsoleProvider>
            <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
                {/* --- SIDEBAR (Lista de Chats) --- */}
                <div className="w-[400px] flex-shrink-0 flex flex-col border-r border-slate-200 bg-white h-full relative shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-10">
                    <ChatList
                        chats={chats}
                        onSelectChat={handleSelectChat}
                        selectedChatId={selectedChatId}
                        status={status}
                        currentUser={user}
                        onLogout={handleLogout}
                        labels={labels}
                        chatLabels={chatLabels}
                        onToggleLabels={() => setShowLabelManagerModal(true)}
                        onShowApiKeyModal={() => setShowApiKeyModal(true)}
                        onShowWebhooksModal={() => setShowWebhooksModal(true)}
                        onShowQuickRepliesModal={() => setShowQuickRepliesModal(true)}
                        onOpenStatusModal={() => setShowStatusModal(true)}
                        onResetConnection={handleResetConnection}
                        loading={status === ConnectionStatus.CONNECTING && chats.length === 0}
                        allLabels={labels} // Legacy prop name fix
                        userEmail={user.email}
                        onOpenApiKeyModal={() => setShowApiKeyModal(true)} // Prop duplication fix if needed but handled above
                        onOpenWebhooksModal={() => setShowWebhooksModal(true)}
                        onOpenQuickRepliesModal={() => setShowQuickRepliesModal(true)}
                    />
                </div>

                {/* --- MAIN AREA (Ventana de Chat) --- */}
                <div className="flex-1 flex flex-col bg-slate-50 h-full relative">
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                    }}></div>

                    {selectedChatId ? (
                        <ChatWindow
                            chatId={selectedChatId}
                            chatName={chats.find(c => c.id === selectedChatId)?.name || selectedChatId || 'Chat'}
                            messages={messages[selectedChatId] || []}
                            userId={user.id}
                            onSendMessage={handleSendMessage}
                            loading={loadingHistory}
                            onScrollTop={() => { }}
                            labels={labels}
                            chatLabels={chatLabels[selectedChatId] || []}
                            quickReplies={quickReplies}
                            currentUserId={user.id}
                            loadingHistory={loadingHistory}
                            scheduledMessages={scheduledMessages[selectedChatId] || []}
                            onToggleSchedule={handleToggleSchedule}
                            onDeleteSchedule={handleDeleteSchedule}
                            currentChatLabels={chatLabels[selectedChatId] || []}
                            onToggleLabel={handleToggleLabel}
                            allLabels={labels}
                            loadingMore={loadingMore}
                            onLoadMore={handleLoadMoreMessages}
                        />
                    ) : (
                        <EmptyState />
                    )}
                </div>
            </div>

            {/* --- MODALES --- */}
            {session && (
                <>
                    {showApiKeyModal && <ApiKeyManagerModal isOpen={showApiKeyModal} onClose={() => setShowApiKeyModal(false)} session={session} />}
                    {showWebhooksModal && <WebhookManagerModal isOpen={showWebhooksModal} onClose={() => setShowWebhooksModal(false)} session={session} />}
                </>
            )}
            {showQuickRepliesModal && <QuickReplyManagerModal isOpen={showQuickRepliesModal} onClose={() => setShowQuickRepliesModal(false)} />}
            {showLabelManagerModal && session && <LabelManagerModal isOpen={showLabelManagerModal} onClose={() => setShowLabelManagerModal(false)} session={session} labels={labels} socket={socket} />}
            {showStatusModal && <StatusSchedulerModal isOpen={showStatusModal} onClose={() => setShowStatusModal(false)} socket={socket} />}
        </ConsoleProvider>
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