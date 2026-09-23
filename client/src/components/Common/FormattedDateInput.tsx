import React, { useRef, useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';

interface FormattedDateInputProps {
    value: string; // ISO format YYYY-MM-DD
    onChange: (value: string) => void;
    min?: string;
    max?: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
    placeholder?: string;
    id?: string;
}

/**
 * Converts YYYY-MM-DD to DD/MM/YYYY
 */
export const toDMY = (iso: string): string => {
    if (!iso || typeof iso !== 'string') return '';
    const clean = iso.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
        const [y, m, d] = parts;
        if (y && m && d) {
            return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
        }
    }
    return '';
};

/**
 * Converts DD/MM/YYYY to YYYY-MM-DD
 */
export const toISO = (dmy: string): string => {
    if (!dmy || typeof dmy !== 'string') return '';
    const parts = dmy.split(/[/.-]/);
    if (parts.length === 3) {
        const [d, m, y] = parts;
        if (d && m && y && y.length === 4) {
            const dayNum = parseInt(d, 10);
            const mNum = parseInt(m, 10);
            const yNum = parseInt(y, 10);
            if (mNum >= 1 && mNum <= 12 && dayNum >= 1 && dayNum <= 31 && yNum >= 1900 && yNum <= 2100) {
                return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
        }
    }
    return '';
};

export const FormattedDateInput: React.FC<FormattedDateInputProps> = ({
    value,
    onChange,
    min,
    max,
    disabled = false,
    required = false,
    className = '',
    placeholder = 'DD/MM/YYYY',
    id
}) => {
    const hiddenDateInputRef = useRef<HTMLInputElement>(null);
    const [displayText, setDisplayText] = useState<string>(() => toDMY(value));

    // Synchronize display text whenever the external YYYY-MM-DD value changes
    useEffect(() => {
        setDisplayText(toDMY(value));
    }, [value]);

    const handlePickerClick = () => {
        if (disabled) return;
        if (hiddenDateInputRef.current) {
            try {
                if (typeof hiddenDateInputRef.current.showPicker === 'function') {
                    hiddenDateInputRef.current.showPicker();
                } else {
                    hiddenDateInputRef.current.focus();
                    hiddenDateInputRef.current.click();
                }
            } catch {
                hiddenDateInputRef.current.focus();
                hiddenDateInputRef.current.click();
            }
        }
    };

    const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const iso = e.target.value;
        onChange(iso);
        setDisplayText(toDMY(iso));
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let input = e.target.value.replace(/[^\d/]/g, '');

        // Auto-add slash after 2 digits and after 5 chars
        if (input.length === 2 && !displayText.endsWith('/')) {
            input += '/';
        } else if (input.length === 5 && !displayText.endsWith('/')) {
            input += '/';
        } else if (input.length > 10) {
            input = input.slice(0, 10);
        }

        setDisplayText(input);

        if (input.length === 10) {
            const iso = toISO(input);
            if (iso) {
                onChange(iso);
            }
        } else if (input.length === 0) {
            onChange('');
        }
    };

    const handleBlur = () => {
        if (!displayText) {
            onChange('');
            return;
        }
        const iso = toISO(displayText);
        if (iso) {
            onChange(iso);
            setDisplayText(toDMY(iso));
        } else {
            // Revert back to previous valid value
            setDisplayText(toDMY(value));
        }
    };

    return (
        <div className={`relative group flex items-center ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}>
            {/* Left Calendar Icon */}
            <Calendar 
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" 
                size={14} 
            />

            {/* Display formatted input (DD/MM/YYYY) */}
            <input
                id={id}
                type="text"
                value={displayText}
                onChange={handleTextChange}
                onBlur={handleBlur}
                placeholder={placeholder}
                disabled={disabled}
                required={required}
                maxLength={10}
                className={className || "w-full bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-9 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-medium text-slate-600"}
            />

            {/* Right Interactive Native Calendar Trigger */}
            <button
                type="button"
                tabIndex={-1}
                disabled={disabled}
                onClick={handlePickerClick}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer rounded"
                title="Select date"
            >
                <Calendar size={14} />
            </button>

            {/* Hidden native date picker overlay */}
            <input
                ref={hiddenDateInputRef}
                type="date"
                value={value || ''}
                min={min}
                max={max}
                disabled={disabled}
                onChange={handleNativeDateChange}
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
            />
        </div>
    );
};

export default FormattedDateInput;
