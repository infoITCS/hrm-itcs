import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Bell, Search, X, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const Header = ({ title }: { title: string }) => {
    const { user, logout } = useAuth();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const notificationRef = useRef<HTMLDivElement>(null);
    const userMenuRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Mock Notifications
    const [notifications, setNotifications] = useState([
        { id: 1, text: "New candidate applied for 'Senior Dev'", time: "2 min ago", read: false },
        { id: 2, text: "Meeting with HR Team", time: "1 hour ago", read: false },
        { id: 3, text: "Payroll report is ready", time: "3 hours ago", read: true },
    ]);

    const unreadCount = notifications.filter(n => !n.read).length;

    // Close notifications and user menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
                setShowNotifications(false);
            }
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setShowUserMenu(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Focus search input when opened
    useEffect(() => {
        if (isSearchOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isSearchOpen]);

    const markAsRead = (id: number) => {
        setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllAsRead = () => {
        setNotifications(notifications.map(n => ({ ...n, read: true })));
    };

    return (
        <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white h-16 flex items-center justify-between px-6 shadow-md sticky top-0 z-20 relative">

            {/* Left Side: Title or Search Bar */}
            <div className="flex-1 flex items-center">
                {isSearchOpen ? (
                    <div className="relative w-full max-w-md flex items-center animate-in fade-in zoom-in duration-200 origin-left">
                        <Search className="absolute left-3 text-indigo-500" size={18} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search employees, jobs, reports..."
                            className="w-full pl-10 pr-10 py-2 rounded-full text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300 shadow-inner"
                        />
                        <button
                            onClick={() => setIsSearchOpen(false)}
                            className="absolute right-3 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                ) : (
                    <h1 className="text-xl font-semibold tracking-tight animate-in fade-in slide-in-from-left-2 truncate">
                        {title}
                    </h1>
                )}
            </div>

            {/* Right Side: Icons & Profile */}
            <div className="flex items-center gap-2 sm:gap-4 ml-4">

                {/* Search Toggle (only visible when search is closed) */}
                {!isSearchOpen && (
                    <button
                        onClick={() => setIsSearchOpen(true)}
                        className="p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
                        title="Search"
                    >
                        <Search size={20} />
                    </button>
                )}

                {/* Notifications */}
                <div className="relative" ref={notificationRef}>
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={`relative p-2 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 ${showNotifications ? 'bg-white/20' : 'hover:bg-white/10'}`}
                        title="Notifications"
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && (
                            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-indigo-600 animate-pulse"></span>
                        )}
                    </button>

                    {/* Notification Dropdown */}
                    {showNotifications && (
                        <div className="absolute right-0 mt-3 w-80 bg-white rounded-xl shadow-2xl overflow-hidden z-50 text-gray-800 animate-in fade-in slide-in-from-top-2 border border-blue-100/50 ring-1 ring-black/5">
                            <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/80 backdrop-blur-sm">
                                <h3 className="font-semibold text-sm text-gray-700">Notifications</h3>
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllAsRead}
                                        className="text-xs text-indigo-600 font-medium hover:text-indigo-700 hover:underline"
                                    >
                                        Mark all read
                                    </button>
                                )}
                            </div>
                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                {notifications.length > 0 ? (
                                    notifications.map((notification) => (
                                        <div
                                            key={notification.id}
                                            onClick={() => markAsRead(notification.id)}
                                            className={`p-3 text-sm cursor-pointer border-b border-gray-50 last:border-0 transition-all hover:bg-gray-50 flex items-start gap-3 relative group ${!notification.read ? 'bg-indigo-50/40' : ''}`}
                                        >
                                            <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 transition-colors ${!notification.read ? 'bg-indigo-500' : 'bg-transparent'}`}></div>
                                            <div className="flex-1">
                                                <p className={`leading-snug text-sm ${!notification.read ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                                                    {notification.text}
                                                </p>
                                                <p className="text-xs text-gray-400 mt-1">{notification.time}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center text-gray-400 flex flex-col items-center">
                                        <Bell size={24} className="mb-2 opacity-20" />
                                        <span className="text-sm">No new notifications</span>
                                    </div>
                                )}
                            </div>
                            <div className="p-2 text-center border-t border-gray-100 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors group">
                                <span className="text-xs font-medium text-indigo-600 group-hover:text-indigo-700">View All Notifications</span>
                            </div>
                        </div>
                    )}
                </div>

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
                                <span className="text-sm font-semibold leading-none mb-1">{user.name}</span>
                                <span className="text-xs text-white/70 font-medium leading-none capitalize">{user.role}</span>
                            </div>
                            <ChevronDown 
                                size={16} 
                                className={`text-white/70 group-hover:text-white transition-transform ${showUserMenu ? 'rotate-180' : ''}`} 
                            />
                        </button>

                        {/* User Dropdown Menu */}
                        {showUserMenu && (
                            <div className="absolute right-0 mt-3 w-56 bg-white rounded-xl shadow-2xl overflow-hidden z-50 text-gray-800 animate-in fade-in slide-in-from-top-2 border border-blue-100/50 ring-1 ring-black/5">
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
                                            <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                                            <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                            <p className="text-xs text-indigo-600 font-medium capitalize mt-0.5">{user.role}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="py-1">
                                    <button
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            // Navigate to profile page if you have one
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
