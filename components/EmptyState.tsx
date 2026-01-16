import React from 'react';
import { MessageSquare, ShieldCheck, Zap, BarChart3, Radio } from 'lucide-react';

export const EmptyState: React.FC = () => {
    return (
        <div className="flex flex-col items-center justify-center h-full bg-slate-50 text-slate-600 p-8 select-none">
            <div className="bg-white p-8 rounded-3xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-slate-100 max-w-lg w-full text-center hover:shadow-xl transition-shadow duration-500">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-100 to-teal-50 rounded-2xl mb-6 shadow-inner ring-4 ring-white">
                    <MessageSquare className="w-10 h-10 text-emerald-600" />
                </div>

                <h1 className="text-3xl font-bold text-slate-800 mb-3 tracking-tight">MateChat Enterprise</h1>
                <p className="text-slate-500 mb-8 leading-relaxed">
                    Sistema de mensajería profesional conectado a <span className="font-semibold text-emerald-600">WhatsApp & Supabase</span>.
                    Selecciona un chat para comenzar a gestionar tus clientes.
                </p>

                <div className="grid grid-cols-2 gap-4 text-left">
                    <StatusCard
                        icon={<ShieldCheck className="w-5 h-5 text-blue-500" />}
                        title="Seguridad"
                        desc="Encriptado E2E"
                    />
                    <StatusCard
                        icon={<Zap className="w-5 h-5 text-amber-500" />}
                        title="Sincronización"
                        desc="Tiempo Real"
                    />
                    <StatusCard
                        icon={<Radio className="w-5 h-5 text-rose-500" />}
                        title="Conexión"
                        desc="Backend Activo"
                    />
                    <StatusCard
                        icon={<BarChart3 className="w-5 h-5 text-indigo-500" />}
                        title="Analítica"
                        desc="CRM Ready"
                    />
                </div>
            </div>

            <div className="mt-8 text-xs font-medium text-slate-400 flex items-center gap-2 opacity-70">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                System Operational • v4.0.0
            </div>
        </div>
    );
};

const StatusCard = ({ icon, title, desc }: { icon: any, title: string, desc: string }) => (
    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-white hover:border-slate-200 transition-colors group">
        <div className="flex items-center gap-3 mb-1">
            <div className="p-1.5 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform">
                {icon}
            </div>
            <span className="font-semibold text-slate-700 text-sm">{title}</span>
        </div>
        <div className="text-xs text-slate-400 pl-[38px]">{desc}</div>
    </div>
);
