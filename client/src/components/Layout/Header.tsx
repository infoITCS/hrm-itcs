import { ChevronDown } from 'lucide-react';

const Header = ({ title }: { title: string }) => {
    return (
        <header className="bg-primary text-white h-16 flex items-center justify-between px-6 shadow-sm sticky top-0 z-20">
            <h1 className="text-xl font-medium">{title}</h1>

            <div className="flex items-center gap-4">
                {/* User Profile */}
                <div className="flex items-center gap-3 cursor-pointer">
                    {/* Placeholder Avatar */}
                    <div className="w-8 h-8 rounded-full bg-gray-300 overflow-hidden flex items-center justify-center">
                        <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80" alt="User" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-sm font-medium">Malik Abubakar Shafeeq</span>
                    <ChevronDown size={16} />
                </div>
            </div>
        </header>
    );
};

export default Header;
