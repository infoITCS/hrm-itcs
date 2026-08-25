import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import countriesData from '../../data/countries.json';
import { locationService, type CSCState, type CSCCity } from '../../services/locationService';

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
    headerAction?: React.ReactNode;
    disabled?: boolean;
}

// ─── Scrollable custom dropdown (shows 5 rows, scrolls for more) ────────────
interface ScrollDropdownProps {
    options: string[];
    value: string;
    onChange: (val: string) => void;
    placeholder: string;
    disabled?: boolean;
    loading?: boolean;
    allowCustom?: boolean;
    className?: string;
}

const ScrollDropdown = ({
    options,
    value,
    onChange,
    placeholder,
    disabled = false,
    loading = false,
    allowCustom = true,
    className = '',
}: ScrollDropdownProps) => {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Auto-focus search input when opened
    useEffect(() => {
        if (open && searchInputRef.current) {
            searchInputRef.current.focus();
        } else {
            setSearchQuery('');
        }
    }, [open]);

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
                className={`w-full flex items-center justify-between ${className} text-left ${
                    disabled ? 'bg-gray-50 opacity-60 cursor-not-allowed' : 'cursor-pointer'
                }`}
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    {loading && <Loader2 size={14} className="animate-spin text-indigo-500 shrink-0" />}
                    <span className={`truncate ${value ? 'text-gray-800' : 'text-gray-400'}`}>
                        {loading && !value ? 'Loading...' : (value || placeholder)}
                    </span>
                </div>
                <ChevronDown
                    size={14}
                    className={`ml-2 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && !disabled && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-fadeIn">
                    {/* Search Input Filter */}
                    <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                        <div className="relative">
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder={allowCustom ? "Search or type custom..." : "Search..."}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') setOpen(false);
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const trimmed = searchQuery.trim();
                                        const filtered = options.filter(opt => opt.toLowerCase().includes(trimmed.toLowerCase()));
                                        if (filtered.length > 0) {
                                            onChange(filtered[0]);
                                        } else if (allowCustom && trimmed) {
                                            onChange(trimmed);
                                        }
                                        setOpen(false);
                                    }
                                }}
                            />
                            <div className="absolute left-2.5 top-1.5 text-slate-400">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: '180px' }}>
                        {allowCustom && searchQuery.trim() && !options.some(opt => opt.toLowerCase() === searchQuery.trim().toLowerCase()) && (
                            <div
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    onChange(searchQuery.trim());
                                    setOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold bg-indigo-50/90 hover:bg-indigo-100 text-indigo-700 transition-colors cursor-pointer border-b border-indigo-100 flex items-center gap-1.5"
                            >
                                <span className="font-bold text-sm leading-none text-indigo-500">+</span>
                                <span>Use &ldquo;<span className="underline font-bold">{searchQuery.trim()}</span>&rdquo;</span>
                            </div>
                        )}
                        {options
                            .filter(opt => opt.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(opt => (
                            <div
                                key={opt}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    onChange(opt);
                                    setOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer hover:bg-indigo-50 hover:text-indigo-700
                                    ${value === opt ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-700'}`}
                            >
                                {opt}
                            </div>
                        ))}
                        {options.filter(opt => opt.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && !searchQuery.trim() && (
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

// ─── Pakistan Regional Districts / Cities Supplement ───────────────────────
const PAKISTAN_REGIONAL_CITIES: Record<string, string[]> = {
    'Gilgit-Baltistan': [
        'Skardu',
        'Kharmang',
        'Shigar',
        'Ghanche',
        'Roundu',
        'Gilgit',
        'Hunza',
        'Nagar',
        'Ghizer',
        'Diamer',
        'Astore',
    ],
    'Azad Jammu and Kashmir': [
        'Muzaffarabad',
        'Mirpur',
        'Rawalakot',
        'Kotli',
        'Bhimber',
        'Bagh',
        'Haveli',
        'Sudhanoti',
        'Neelam',
        'Hattian Bala',
    ],
    'Islamabad': [
        'Islamabad',
    ],
    'Balochistan': [
        'Quetta',
        'Gwadar',
        'Turbat',
        'Khuzdar',
        'Hub',
        'Chaman',
        'Sibi',
        'Zhob',
        'Loralai',
        'Pishin',
        'Dera Murad Jamali',
    ],
    'Khyber Pakhtunkhwa': [
        'Peshawar',
        'Mardan',
        'Abbottabad',
        'Swat',
        'Kohat',
        'Dera Ismail Khan',
        'Mansehra',
        'Nowshera',
        'Charsadda',
        'Swabi',
        'Haripur',
        'Bannu',
    ],
    'Punjab': [
        'Lahore',
        'Faisalabad',
        'Rawalpindi',
        'Gujranwala',
        'Multan',
        'Sialkot',
        'Bahawalpur',
        'Sargodha',
        'Sheikhupura',
        'Gujrat',
        'Jhang',
        'Rahim Yar Khan',
        'Kasur',
        'Sahiwal',
        'Okara',
        'Wah Cantonment',
        'Dera Ghazi Khan',
    ],
    'Sindh': [
        'Karachi',
        'Hyderabad',
        'Sukkur',
        'Larkana',
        'Nawabshah',
        'Mirpur Khas',
        'Thatta',
        'Jacobabad',
        'Shikarpur',
    ],
};

// ─── AddressForm ─────────────────────────────────────────────────────────────
const AddressForm = ({ title, subtitle, value, onChange, inputClass, headerAction, disabled = false }: AddressFormProps) => {
    // Local country list from static JSON
    const countriesOptions = useMemo(() => 
        countriesData.map(c => `${c.flag} ${c.name}`), []
    );

    const [states, setStates] = useState<CSCState[]>([]);
    const [cities, setCities] = useState<CSCCity[]>([]);
    const [loadingStates, setLoadingStates] = useState(false);
    const [loadingCities, setLoadingCities] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Get ISO codes for API calls
    const currentCountryIso = useMemo(() => {
        if (!value.country) return '';
        // Handle both "🇦🇫 Afghanistan" and just "Afghanistan" formats
        const countryName = value.country.includes(' ') 
            ? value.country.split(' ').slice(1).join(' ') 
            : value.country;
        
        // Find by name matching either the full string or the part after the flag
        return countriesData.find(c => 
            c.name === countryName || c.name === value.country
        )?.isoCode || '';
    }, [value.country]);

    const currentStateIso = useMemo(() => {
        if (!value.state || states.length === 0) return '';
        return states.find(s => s.name === value.state)?.iso2 || '';
    }, [value.state, states]);

    // Fetch States when Country changes
    useEffect(() => {
        const controller = new AbortController();
        const fetchStates = async () => {
            if (!currentCountryIso) {
                setStates([]);
                return;
            }
            setLoadingStates(true);
            setFetchError(null);
            try {
                const data = await locationService.getStates(currentCountryIso, controller.signal);
                if (!controller.signal.aborted) {
                    setStates(data);
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error('[AddressForm] Failed to fetch states:', err);
                    setFetchError('Failed to load provinces. Please try again.');
                    setStates([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoadingStates(false);
                }
            }
        };
        fetchStates();
        return () => controller.abort();
    }, [currentCountryIso]);

    // Fetch Cities when State changes
    useEffect(() => {
        const controller = new AbortController();
        const fetchCities = async () => {
            if (!currentCountryIso || !currentStateIso) {
                setCities([]);
                return;
            }
            setLoadingCities(true);
            setFetchError(null);
            try {
                const data = await locationService.getCities(currentCountryIso, currentStateIso, controller.signal);
                if (!controller.signal.aborted) {
                    setCities(data);
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error('[AddressForm] Failed to fetch cities:', err);
                    setFetchError('Failed to load cities. Please try again.');
                    setCities([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoadingCities(false);
                }
            }
        };
        fetchCities();
        return () => controller.abort();
    }, [currentCountryIso, currentStateIso]);

    // Merge API cities with local regional districts / clean up bogus entries
    const cityOptions = useMemo(() => {
        let list = cities.map(c => c.name).filter(c => c.toLowerCase() !== 'barishal');
        
        if (currentCountryIso === 'PK' && value.state) {
            const stateLower = value.state.toLowerCase();
            const matchedKey = Object.keys(PAKISTAN_REGIONAL_CITIES).find(k => 
                stateLower.includes(k.toLowerCase()) || k.toLowerCase().includes(stateLower)
            );
            if (matchedKey) {
                const regional = PAKISTAN_REGIONAL_CITIES[matchedKey] || [];
                for (const rc of regional) {
                    if (!list.some(item => item.toLowerCase() === rc.toLowerCase())) {
                        list.push(rc);
                    }
                }
            }
        }
        return list;
    }, [cities, currentCountryIso, value.state]);

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
        <div className={disabled ? 'opacity-75 pointer-events-none' : ''}>
            <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-medium text-gray-700">{title}</h3>
                {headerAction}
            </div>
            {subtitle && <p className="text-xs text-gray-400 mb-4">{subtitle}</p>}
            
            {fetchError && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-600 text-xs font-medium animate-fadeIn">
                    <span className="flex-1">{fetchError}</span>
                    <button 
                        onClick={() => setFetchError(null)}
                        className="p-1 hover:bg-rose-100 rounded-lg transition-colors"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-5 bg-slate-50 rounded-2xl border border-slate-100">

                {/* Street — free text */}
                <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">Street</label>
                    <input
                        type="text"
                        disabled={disabled}
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
                        options={countriesOptions}
                        value={value.country}
                        onChange={handleCountryChange}
                        placeholder="Select Country"
                        disabled={disabled}
                        allowCustom={false}
                        className={baseInput}
                    />
                </div>

                {/* Province / State */}
                <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">Province / State</label>
                    <ScrollDropdown
                        options={states.map(s => s.name)}
                        value={value.state}
                        onChange={handleStateChange}
                        placeholder={loadingStates ? "Loading Provinces..." : "Select Province / State"}
                        disabled={disabled || !value.country}
                        loading={loadingStates}
                        allowCustom={true}
                        className={baseInput}
                    />
                </div>

                {/* City / District */}
                <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">City / District</label>
                    <ScrollDropdown
                        options={cityOptions}
                        value={value.city}
                        onChange={(val) => onChange('city', val)}
                        placeholder={loadingCities ? "Loading Cities..." : "Select or type City / District"}
                        disabled={disabled || !value.state}
                        loading={loadingCities}
                        allowCustom={true}
                        className={baseInput}
                    />
                </div>

                {/* Zip / Postal Code — free text */}
                <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-500">Zip / Postal Code</label>
                    <input
                        type="text"
                        disabled={disabled}
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
