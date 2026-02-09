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
}

const CustomSelect: React.FC<CustomSelectProps> = ({
    label,
    options,
    value,
    onChange,
    placeholder = "-- Select --"
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selected, setSelected] = useState(value || '');
    const containerRef = useRef<HTMLDivElement>(null);

    // Handle outside click to close
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
        setSelected(optionValue);
        if (onChange) onChange(optionValue);
        setIsOpen(false);
    };

    // Normalize options to object format
    const normalizedOptions = options.map(opt =>
        typeof opt === 'string' ? { value: opt, label: opt, level: 0 } : { ...opt, level: opt.level || 0 }
    );

    const selectedLabel = normalizedOptions.find(opt => opt.value === selected)?.label || placeholder;

    return (
        <div className="space-y-1 relative" ref={containerRef}>
            {label && <label className="block text-sm font-medium text-gray-600">{label}</label>}

            <div
                className={`w-full border ${isOpen ? 'border-primary ring-1 ring-primary' : 'border-gray-300'} rounded-lg bg-white cursor-pointer relative flex items-center justify-between transition-all group hover:border-primary`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={`px-3 py-2 text-sm ${selected ? 'text-gray-700' : 'text-gray-400'}`}>
                    {selectedLabel}
                </span>

                <div className="p-2 m-1 bg-slate-100 rounded-md text-gray-500 group-hover:bg-slate-200 transition-colors">
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg py-1 max-h-60 overflow-auto">
                    <div
                        className="px-4 py-2 text-sm text-gray-400 cursor-pointer hover:bg-gray-50"
                        onClick={() => handleSelect('')}
                    >
                        {placeholder}
                    </div>
                    {normalizedOptions.map((opt) => (
                        <div
                            key={opt.value}
                            className={`px-4 py-2 text-sm cursor-pointer transition-colors ${selected === opt.value ? 'bg-primary/5 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                            style={{ paddingLeft: `${(opt.level * 16) + 16}px` }}
                            onClick={() => handleSelect(opt.value)}
                        >
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CustomSelect;
