import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, User as UserIcon, Menu } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const Header = ({ title, onMenuClick }: {
    title: string;
    onMenuClick?: () => void;
}) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);

    // Close profile menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setShowUserMenu(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);



    return (
        <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white h-14 min-[992px]:h-16 flex items-center justify-between px-4 min-[992px]:px-6 shadow-md sticky top-0 z-20 relative gap-2">

            {/* Hamburger: visible below 992px */}
            {onMenuClick && (
                <button
                    type="button"
                    onClick={onMenuClick}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 min-[992px]:hidden shrink-0"
                    aria-label="Open menu"
                >
                    <Menu size={24} />
                </button>
            )}

            {/* Left Side: Title */}
            <div className="flex-1 flex items-center min-w-0">
                <h1 className="text-lg min-[992px]:text-xl font-semibold tracking-tight animate-in fade-in slide-in-from-left-2 truncate">
                    {title}
                </h1>
            </div>

            {/* Right Side: Icons & Profile */}
            <div className="flex items-center gap-1 sm:gap-2 min-[992px]:gap-4 ml-2 min-[992px]:ml-4 shrink-0">


                {/* Vertical Divider */}
                {user && <div className="h-8 w-px bg-white/20 mx-1"></div>}

                {/* User Profile with Dropdown */}
                {user ? (
                    <div className="relative" ref={userMenuRef}>
                        <button
                            onClick={() => setShowUserMenu(!showUserMenu)}
                            className="flex items-center gap-3 cursor-pointer p-1 rounded-lg hover:bg-white/10 transition-all group"
                        >
                            {/* Avatar */}
                            <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 overflow-hidden flex items-center justify-center ring-2 ring-transparent group-hover:ring-white/20 transition-all">
                                {user.avatar ? (
                                    <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-sm font-semibold">{user.name.charAt(0).toUpperCase()}</div>
                                )}
                            </div>
                            <div className="hidden md:flex flex-col">
                                <span className="text-sm font-semibold leading-none mb-1">
                                    {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.name}
                                </span>
                                <span className="text-xs text-white/70 font-medium leading-none capitalize">{user.role}</span>
                            </div>
                            <ChevronDown
                                size={16}
                                className={`text-white/70 group-hover:text-white transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {/* User Dropdown Menu */}
                        {showUserMenu && (
                            <div className="absolute right-0 mt-3 w-56 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl overflow-hidden z-50 text-gray-800 animate-in fade-in slide-in-from-top-2 border border-blue-100/50 ring-1 ring-black/5">
                                <div className="p-4 border-b border-gray-100 bg-gray-50/80">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-100 overflow-hidden flex items-center justify-center">
                                            {user.avatar ? (
                                                <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="text-sm font-semibold text-indigo-600">{user.name.charAt(0).toUpperCase()}</div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">
                                                {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.name}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                            <p className="text-xs text-indigo-600 font-medium capitalize mt-0.5">{user.role}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="py-1">
                                    <button
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            navigate('/my-info');
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                                    >
                                        <UserIcon size={16} className="text-gray-400" />
                                        <span>My Profile</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            logout();
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                                    >
                                        <LogOut size={16} />
                                        <span>Logout</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </header>
    );
};

export default Header;
