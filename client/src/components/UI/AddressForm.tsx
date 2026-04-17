import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { getCountries, getStates, getCities } from '../../data/addressData';

interface AddressValue {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
}

interface AddressFormProps {
    title: string;
    subtitle?: string;
    value: AddressValue;
    onChange: (field: keyof AddressValue, val: string) => void;
    inputClass?: string;
}

// ─── Scrollable custom dropdown (shows 5 rows, scrolls for more) ────────────
interface ScrollDropdownProps {
    options: string[];
    value: string;
    onChange: (val: string) => void;
    placeholder: string;
    disabled?: boolean;
    className?: string;
}

const ScrollDropdown = ({
    options,
    value,
    onChange,
    placeholder,
    disabled = false,
    className = '',
}: ScrollDropdownProps) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(prev => !prev);
        } else if (e.key === 'Escape') {
            setOpen(false);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) { setOpen(true); return; }
            const currentIndex = options.indexOf(value);
            const nextIndex = Math.min(currentIndex + 1, options.length - 1);
            onChange(options[nextIndex]);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) { setOpen(true); return; }
            const currentIndex = options.indexOf(value);
            const prevIndex = Math.max(currentIndex - 1, 0);
            onChange(options[prevIndex]);
        }
    };

    return (
        <div ref={ref} className="relative w-full">
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setOpen(prev => !prev)}
                onKeyDown={handleKeyDown}
                onBlur={() => setTimeout(() => setOpen(false), 200)}
                className={`w-full flex items-center justify-between ${className} text-left ${
                    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
            >
                <span className={value ? 'text-gray-800' : 'text-gray-400'}>
                    {value || placeholder}
                </span>
                <ChevronDown
                    size={14}
                    className={`ml-2 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && !disabled && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {/* 5 rows × 36px = 180px max-height, scrollable */}
                    <div className="overflow-y-auto" style={{ maxHeight: '180px' }}>
                        {options.map(opt => (
                            <div
                                key={opt}
                                onClick={() => { onChange(opt); setOpen(false); }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer hover:bg-indigo-50 hover:text-indigo-700
                                    ${value === opt ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-gray-700'}`}
                            >
                                {opt}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── AddressForm ─────────────────────────────────────────────────────────────
const AddressForm = ({ title, subtitle, value, onChange, inputClass }: AddressFormProps) => {
    const countries = getCountries();
    const states    = getStates(value.country);
    const cities    = getCities(value.country, value.state);

    const baseInput = inputClass ||
        'w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all';

    const handleCountryChange = (newCountry: string) => {
        onChange('country', newCountry);
        onChange('state', '');
        onChange('city', '');
    };

    const handleStateChange = (newState: string) => {
        onChange('state', newState);
        onChange('city', '');
    };

    return (
        <div>
            <h3 className="text-lg font-medium text-gray-700 mb-1">{title}</h3>
            {subtitle && <p className="text-xs text-gray-400 mb-4">{subtitle}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-5 bg-slate-50 rounded-2xl border border-slate-100">

                {/* Street — free text */}
                <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">Street</label>
                    <input
                        type="text"
                        placeholder="e.g. House 12, Street 4"
                        value={value.street}
                        onChange={(e) => onChange('street', e.target.value)}
                        className={baseInput}
                    />
                </div>

                {/* Country — custom scrollable dropdown */}
                <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">Country</label>
                    <ScrollDropdown
                        options={countries}
                        value={value.country}
                        onChange={handleCountryChange}
                        placeholder="Select Country"
                        className={baseInput}
                    />
                </div>

                {/* Province / State */}
                <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">Province / State</label>
                    {states.length > 0 ? (
                        <ScrollDropdown
                            options={states}
                            value={value.state}
                            onChange={handleStateChange}
                            placeholder="Select Province / State"
                            disabled={!value.country}
                            className={baseInput}
                        />
                    ) : (
                        <input
                            type="text"
                            placeholder="Province / State"
                            value={value.state}
                            onChange={(e) => onChange('state', e.target.value)}
                            className={baseInput}
                        />
                    )}
                </div>

                {/* City */}
                <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">City</label>
                    {cities.length > 0 ? (
                        <ScrollDropdown
                            options={cities}
                            value={value.city}
                            onChange={(val) => onChange('city', val)}
                            placeholder="Select City"
                            disabled={!value.state}
                            className={baseInput}
                        />
                    ) : (
                        <input
                            type="text"
                            placeholder="City"
                            value={value.city}
                            onChange={(e) => onChange('city', e.target.value)}
                            className={baseInput}
                        />
                    )}
                </div>

                {/* Zip / Postal Code — free text */}
                <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">Zip / Postal Code</label>
                    <input
                        type="text"
                        placeholder="e.g. 54000"
                        value={value.zipCode}
                        onChange={(e) => onChange('zipCode', e.target.value)}
                        className={baseInput}
                    />
                </div>

            </div>
        </div>
    );
};

export default AddressForm;
