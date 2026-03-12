import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface RelationSelectProps {
    value: string;
    onChange: (val: string) => void;
    options: string[];
    placeholder?: string;
    className?: string;
}

const RelationSelect = ({
    value,
    onChange,
    options,
    placeholder = 'Select Relation',
    className = '',
}: RelationSelectProps) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const baseClass =
        className ||
        'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all bg-white';

    return (
        <div ref={ref} className="relative w-full">
            {/* Trigger button — looks like a select */}
            <button
                type="button"
                onClick={() => setOpen(prev => !prev)}
                className={`w-full flex items-center justify-between ${baseClass} text-left cursor-pointer`}
            >
                <span className={value ? 'text-gray-800' : 'text-gray-400'}>
                    {value || placeholder}
                </span>
                <ChevronDown
                    size={14}
                    className={`ml-2 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Dropdown panel — shows 5 rows (5 × 36px ≈ 180px), scrolls for more */}
            {open && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {/* Fixed-height scroll container: 5 items × 36px = 180px */}
                    <div className="overflow-y-auto" style={{ maxHeight: '180px' }}>
                        {options.map(opt => (
                            <button
                                key={opt}
                                type="button"
                                onClick={() => { onChange(opt); setOpen(false); }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-indigo-50 hover:text-indigo-700
                                    ${value === opt ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-gray-700'}`}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RelationSelect;
