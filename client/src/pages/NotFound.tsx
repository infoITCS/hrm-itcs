import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, HelpCircle } from 'lucide-react';
import logo from '../assets/logo.png';
import { useAuth } from '../contexts/AuthContext';

export default function NotFound() {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 selection:bg-indigo-500 selection:text-white">
            <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/80 shadow-xl p-8 text-center space-y-6 animate-fadeIn">
                {/* Logo */}
                <div className="flex justify-center">
                    <img src={logo} alt="ITCS Logo" className="h-10 w-auto object-contain" />
                </div>

                {/* 404 Badge & Graphic */}
                <div className="relative flex justify-center items-center py-4">
                    <span className="text-8xl font-black text-slate-100 select-none tracking-widest">404</span>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner animate-bounce">
                            <HelpCircle size={32} />
                        </div>
                    </div>
                </div>

                {/* Title & Description */}
                <div className="space-y-2">
                    <h1 className="text-xl font-bold text-slate-900">Page Not Found</h1>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                        The page or module you are looking for might have been moved, removed, or requires specific permissions.
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-full sm:w-1/2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-sm"
                    >
                        <ArrowLeft size={14} />
                        <span>Go Back</span>
                    </button>
                    <button
                        onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}
                        className="w-full sm:w-1/2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-500/20 transition-all active:scale-95 cursor-pointer"
                    >
                        <Home size={14} />
                        <span>{isAuthenticated ? 'Dashboard' : 'Sign In'}</span>
                    </button>
                </div>
            </div>

            {/* Footer note */}
            <p className="mt-8 text-[11px] text-slate-400 text-center">
                ITCS Human Resource Management &bull; Internal Portal
            </p>
        </div>
    );
}
