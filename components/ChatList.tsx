
import React, { useState, useEffect, useMemo, memo } from 'react';
import type { Socket } from 'socket.io-client';
import type { Chat, Label, ChatLabels, User } from '../types';
import Avatar from './common/Avatar';
import { MoreVertical, Settings, Key, Zap, Webhook, CircleDashed, LogOut, ChevronDown, ListFilter, Trash2 } from 'lucide-react';
import { ServerStatus } from './ServerStatus';

// --- Sub-componentes internos ---

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    chatId: string | null;
}

const HighlightText: React.FC<{ text: string; highlight: string }> = ({ text, highlight }) => {
    if (!highlight.trim() || !text) {
        return <>{text}</>;
    }
    const escapedHighlight = highlight.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${escapedHighlight})`, 'gi');
    const parts = text.split(regex);

    return (
        <>
            {parts.map((part, i) =>
                regex.test(part) && part.toLowerCase() === highlight.toLowerCase() ? (
                    <span key={i} className="bg-emerald-100 text-emerald-800 rounded px-0.5 font-medium">
                        {part}
                    </span>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </>
    );
};

// ... (ChatListItem needs to be here or imported, I'll rewrite it inline for total control)
const ChatListItem: React.FC<{
    chat: Chat;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onContextMenu: (e: React.MouseEvent, chatId: string) => void;
    labels: Label[];
    chatLabelIds: string[];
    searchTerm: string;
}> = memo(({ chat, isSelected, onSelect, onContextMenu, labels, chatLabelIds, searchTerm }) => {
    const chatSpecificLabels = labels.filter(l => chatLabelIds.includes(l.id));

    return (
        <li
            onClick={() => onSelect(chat.id)}
            onContextMenu={(e) => onContextMenu(e, chat.id)}
            className={`p-4 cursor-pointer flex items-center gap-4 transition-all duration-200 border-b border-gray-50
                ${isSelected
                    ? 'bg-blue-50/50 border-blue-100'
                    : 'hover:bg-slate-50 border-transparent'
                }
            `}
        >
            <div className={`relative rounded-full p-0.5 ${isSelected ? 'bg-gradient-to-br from-blue-400 to-indigo-400' : 'bg-transparent'}`}>
                <div className="bg-white rounded-full p-0.5">
                    <Avatar name={chat.name} src={chat.profilePicUrl} size="lg" isGroup={chat.isGroup} />
                </div>
                {chat.unreadCount && chat.unreadCount > 0 ? (
                    <span className="absolute -top-0 -right-0 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                ) : null}
            </div>

            <div className="flex-1 overflow-hidden min-w-0">
                <div className="flex items-center justify-between mb-1">
                    <div className={`font-semibold text-base truncate ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                        <HighlightText text={chat.name} highlight={searchTerm} />
                    </div>
                </div>

                <div className="flex justify-between items-center">
                    <p className={`text-sm truncate pr-2 ${isSelected ? 'text-blue-700/80' : 'text-slate-500'}`}>
                        <HighlightText text={chat.lastMessage?.body || (chat.lastMessage?.hasMedia ? '📷 Foto/Video' : 'Sin mensajes')} highlight={searchTerm} />
                    </p>
                    {chat.unreadCount && chat.unreadCount > 0 ? (
                        <span className="flex-shrink-0 bg-emerald-500 text-white text-[10px] font-bold rounded-full h-5 min-w-[1.25rem] px-1.5 flex items-center justify-center shadow-lg shadow-emerald-200">
                            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </span>
                    ) : null}
                </div>

                {chatSpecificLabels.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {chatSpecificLabels.map(label => (
                            <span key={label.id} className="text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wide border border-black/5 flex items-center shadow-sm" style={{ backgroundColor: label.color + '20', color: label.color, borderColor: label.color + '40' }}>
                                {label.name}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {isSelected && (
                <div className="w-1 h-8 bg-blue-500 rounded-full absolute left-0 top-1/2 transform -translate-y-1/2 shadow-lg shadow-blue-200"></div>
            )}
        </li>
    );
});


interface ChatListProps {
    chats: Chat[];
    selectedChatId: string | null;
    onSelectChat: (id: string) => void;
    loading: boolean;
    userEmail?: string;
    allLabels: Label[];
    chatLabels: ChatLabels;
    onToggleLabels: () => void;
    socket: Socket | null;
    onShowApiKeyModal: () => void;
    onShowWebhooksModal: () => void; // Changed from onOpen to match App.tsx usually? wait. 
    // Checking previous usage in App.tsx: 
    // onShowApiKeyModal={...}
    // But verify props interface vs passed props.
    // In App.tsx I passed: onOpenApiKeyModal found in ChatListProps interface.
    // So here I should use onOpen...
    onOpenApiKeyModal: () => void;
    onOpenWebhooksModal: () => void;
    onOpenQuickRepliesModal: () => void;
    onOpenStatusModal: () => void;
    onResetConnection: () => void;
    currentUser: User | null; // Added
    onLogout: () => void;
    status: any; // ConnectionStatus
    serverStatusComp?: React.ReactNode;
}

export const ChatList: React.FC<ChatListProps> = ({
    chats,
    selectedChatId,
    onSelectChat,
    loading,
    allLabels,
    chatLabels,
    onToggleLabels,
    socket,
    onOpenApiKeyModal,
    onOpenWebhooksModal,
    onOpenQuickRepliesModal,
    onOpenStatusModal,
    onResetConnection,
    userEmail,
    currentUser,
    onLogout,
    status,
    serverStatusComp
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilters, setActiveFilters] = useState<string[]>([]);

    // ... logic ...
    const filteredChats = useMemo(() => {
        // First sort by timestamp desc (newest first)
        const sorted = [...chats].sort((a, b) => {
            const tA = a.lastMessage?.timestamp || 0;
            const tB = b.lastMessage?.timestamp || 0;
            return tB - tA;
        });

        return sorted.filter(chat => {
            // Filter by Labels
            const matchesLabels = activeFilters.length === 0 ||
                activeFilters.every(filterId => (chatLabels[chat.id] || []).includes(filterId));
            if (!matchesLabels) return false;

            // Filter by Search Term
            const term = searchTerm.toLowerCase().trim();
            if (!term) return true;

            const name = chat.name?.toLowerCase() || '';
            const lastMessage = chat.lastMessage?.body?.toLowerCase() || '';

            return name.includes(term) || lastMessage.includes(term);
        });
    }, [chats, searchTerm, activeFilters, chatLabels]);

    const handleFilterToggle = (labelId: string) => {
        setActiveFilters(prev =>
            prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]
        );
    };

    return (
        <aside className="flex flex-col h-full bg-white relative">
            {/* 1. Header Premium */}
            <div className="px-5 py-4 flex justify-between items-center border-b border-slate-100 bg-white sticky top-0 z-20">
                <div className="flex items-center gap-3">
                    <div className="relative group cursor-pointer">
                        <Avatar name="Me" size="md" />
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-800 leading-tight">MateChat</h2>
                        <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Online
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button title="Status Scheduler" onClick={onOpenStatusModal} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                        <CircleDashed className="w-5 h-5" />
                    </button>
                    <div className="h-6 w-px bg-slate-200 mx-1"></div>
                    <button title="Settings" onClick={onOpenApiKeyModal} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
                        <MoreVertical className="w-5 h-5" />
                    </button>
                    <button title="Webhooks" onClick={onOpenWebhooksModal} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                        <Webhook className="w-5 h-5" />
                    </button>
                    {status === 'CONNECTED' && (
                        <button title="Eliminar Conexión (Reset)" onClick={() => {
                            if (confirm('¿Seguro que quieres eliminar la conexión de WhatsApp? Tendrás que escanear el QR de nuevo.')) {
                                onResetConnection();
                            }
                        }} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all">
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                    <button title="Cerrar Sesión (Web)" onClick={onLogout} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* 2. Buscador & Filtros */}
            <div className="px-4 pt-4 pb-2 space-y-3 bg-white z-10">
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl leading-5 bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm sm:text-sm"
                        placeholder="Buscar conversaciones..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Filtros Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none mask-linear-fade">
                    <button
                        onClick={() => setActiveFilters([])}
                        className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${activeFilters.length === 0
                            ? 'bg-slate-800 text-white border-slate-800 shadow-md transform scale-105'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                    >
                        Todos
                    </button>
                    {allLabels.map(label => (
                        <button
                            key={label.id}
                            onClick={() => handleFilterToggle(label.id)}
                            className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${activeFilters.includes(label.id)
                                ? 'bg-white shadow-md transform scale-105 ring-2 ring-offset-1'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 opacity-80 hover:opacity-100'
                                }`}
                            style={activeFilters.includes(label.id)
                                ? { borderColor: label.color, color: label.color, ringColor: label.color }
                                : { borderLeftColor: label.color, borderLeftWidth: '3px' }
                            }
                        >
                            {label.name}
                        </button>
                    ))}
                    <button onClick={onToggleLabels} className="whitespace-nowrap px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors border border-dashed border-slate-300">
                        + Editar
                    </button>
                </div>
            </div>

            {/* 3. Lista de Chats */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50">
                {loading && chats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-3">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                        <p className="text-xs text-indigo-400 font-medium animate-pulse">Sincronizando chats...</p>
                    </div>
                ) : filteredChats.length > 0 ? (
                    <ul className="divide-y divide-slate-100">
                        {filteredChats.map(chat => (
                            <ChatListItem
                                key={chat.id}
                                chat={chat}
                                isSelected={selectedChatId === chat.id}
                                onSelect={onSelectChat}
                                onContextMenu={(e) => { e.preventDefault(); /* Todo: Implement context menu */ }}
                                labels={allLabels}
                                chatLabelIds={chatLabels[chat.id] || []}
                                searchTerm={searchTerm}
                            />
                        ))}
                    </ul>
                ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 p-8 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                            <ListFilter className="w-8 h-8 opacity-50" />
                        </div>
                        <p className="font-medium text-slate-500">No se encontraron chats</p>
                        <p className="text-xs mt-1">Intenta con otro término de búsqueda</p>
                    </div>
                )}
            </div>

            {/* Footer con Info de Servidor */}
            <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 text-xs">
                {serverStatusComp}
            </div>
        </aside>
    );
};