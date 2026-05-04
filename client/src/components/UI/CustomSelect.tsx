import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Option {
    value: string;
    label: string;
    level?: number;
}

interface CustomSelectProps {
    label?: string;
    options: (Option | string)[];
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

// Fully controlled component — the parent's `value` prop is always the single source of truth.
// Removed internal `selected` state to prevent race conditions when formData loads asynchronously.
const CustomSelect: React.FC<CustomSelectProps> = ({
    label,
    options,
    value = '',
    onChange,
    placeholder = "-- Select --",
    disabled = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Auto-focus search input when opened
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        } else {
            setSearchTerm('');
        }
    }, [isOpen]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (optionValue: string) => {
        if (onChange) onChange(optionValue);
        setIsOpen(false);
    };

    // Normalize options to object format
    const normalizedOptions = options.map(opt =>
        typeof opt === 'string' ? { value: opt, label: opt, level: 0 } : { ...opt, level: opt.level || 0 }
    );

    // Derive display label directly from the controlled `value` prop
    const selectedLabel = normalizedOptions.find(opt => opt.value === value)?.label || placeholder;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(prev => !prev);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) { setIsOpen(true); return; }
            const currentIndex = normalizedOptions.findIndex(opt => opt.value === value);
            const nextIndex = Math.min(currentIndex + 1, normalizedOptions.length - 1);
            if (onChange) onChange(normalizedOptions[nextIndex].value);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!isOpen) { setIsOpen(true); return; }
            const currentIndex = normalizedOptions.findIndex(opt => opt.value === value);
            const prevIndex = Math.max(currentIndex - 1, 0);
            if (onChange) onChange(normalizedOptions[prevIndex].value);
        }
    };

    return (
        <div className="space-y-1 relative" ref={containerRef}>
            {label && <label className="block text-sm font-semibold text-gray-700">{label}</label>}

            <button
                type="button"
                className={`w-full border ${isOpen && !disabled ? 'border-indigo-500 ring-1 ring-indigo-200' : 'border-slate-300'} rounded-lg ${disabled ? 'bg-gray-50 cursor-not-allowed' : 'bg-white cursor-pointer'} relative flex items-center justify-between transition-all ${!disabled && 'group hover:border-indigo-400 hover:bg-indigo-50/30'} focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                role="combobox"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
            >
                <span className={`px-3 py-2 text-sm ${value ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
                    {selectedLabel}
                </span>

                <div className="p-2 m-1 bg-indigo-50 rounded-md text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-fadeIn" role="listbox">
                    {/* Search Input Filter */}
                    <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                        <div className="relative">
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') setIsOpen(false);
                                }}
                            />
                            <div className="absolute left-2.5 top-1.5 text-slate-400">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div className="max-h-60 overflow-auto custom-scrollbar py-1">
                        <div
                            className="px-3 py-2 text-sm text-slate-400 cursor-pointer hover:bg-indigo-50 transition-colors"
                            onMouseDown={(e) => { e.preventDefault(); handleSelect(''); }}
                            role="option"
                            aria-selected={value === ''}
                        >
                            {placeholder}
                        </div>
                        {normalizedOptions
                            .filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()))
                            .map((opt) => (
                            <div
                                key={opt.value}
                                className={`px-3 py-2 text-sm cursor-pointer transition-colors ${value === opt.value
                                        ? 'bg-indigo-100 text-indigo-700 font-medium'
                                        : 'text-slate-700 hover:bg-indigo-50'
                                    }`}
                                style={{ paddingLeft: `${(opt.level * 16) + 16}px` }}
                                onMouseDown={(e) => { 
                                    e.preventDefault(); 
                                    handleSelect(opt.value); 
                                }}
                                role="option"
                                aria-selected={value === opt.value}
                            >
                                {opt.label}
                            </div>
                        ))}
                        {normalizedOptions.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                            <div className="px-3 py-8 text-center text-slate-400 text-xs italic">
                                No matches found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomSelect;
