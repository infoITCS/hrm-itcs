import { ChevronDown, Bell, Search } from 'lucide-react';

const Header = ({ title }: { title: string }) => {
    return (
        <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white h-16 flex items-center justify-between px-6 shadow-md sticky top-0 z-20">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>

            <div className="flex items-center gap-4">
                {/* Search Icon */}
                <button className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                    <Search size={20} />
                </button>
                
                {/* Notifications */}
                <button className="relative p-2 rounded-lg hover:bg-white/10 transition-colors">
                    <Bell size={20} />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full border-2 border-primary"></span>
                </button>

                {/* User Profile */}
                <div className="flex items-center gap-3 cursor-pointer pl-4 border-l border-white/20">
                    {/* Placeholder Avatar */}
                    <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 overflow-hidden flex items-center justify-center ring-2 ring-white/20">
                        <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80" alt="User" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold">Malik Abubakar Shafeeq</span>
                        <span className="text-xs text-white/80">Administrator</span>
                    </div>
                    <ChevronDown size={18} className="text-white/80" />
                </div>
            </div>
        </header>
    );
};

export default Header;
