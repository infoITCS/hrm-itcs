import React, { useEffect, useState, useRef } from 'react';
import { X, Download, FileText, AlertCircle, RefreshCw } from 'lucide-react';

interface SheetPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    fetchData: () => Promise<string>;
    downloadFileName: string;
}

const parseCSV = (csvText: string): string[][] => {
    const result: string[][] = [];
    let row: string[] = [];
    let inQuotes = false;
    let currentValue = '';
    
    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            row.push(currentValue.trim());
            currentValue = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++; 
            }
            row.push(currentValue.trim());
            if (row.length > 0 && !(row.length === 1 && row[0] === '')) {
                result.push(row);
            }
            row = [];
            currentValue = '';
        } else {
            currentValue += char;
        }
    }
    if (currentValue || row.length > 0) {
        row.push(currentValue.trim());
        result.push(row);
    }
    return result;
};

const SheetPreviewModal: React.FC<SheetPreviewModalProps> = ({
    isOpen,
    onClose,
    title,
    subtitle,
    fetchData,
    downloadFileName
}) => {
    const [loading, setLoading] = useState(true);
    const [rawCsv, setRawCsv] = useState('');
    const [rows, setRows] = useState<string[][]>([]);
    const [error, setError] = useState<string | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        const loadSheet = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await fetchData();
                setRawCsv(data);
                const parsed = parseCSV(data);
                setRows(parsed);
            } catch (err: any) {
                console.error('Failed to fetch sheet preview:', err);
                setError(err.message || 'Unable to fetch attendance sheet data.');
            } finally {
                setLoading(false);
            }
        };

        loadSheet();
    }, [isOpen, fetchData]);

    // Escape key handling
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    if (!isOpen) return null;

    const handleDownload = () => {
        if (!rawCsv) return;
        const blob = new Blob([rawCsv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', downloadFileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const headers = rows[0] || [];
    const bodyRows = rows.slice(1) || [];

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div 
                ref={modalRef}
                className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                            <FileText size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-indigo-600 text-white rounded-md tracking-wider">ITCS</span>
                                <h3 className="text-base font-black text-slate-800">
                                    {title}
                                </h3>
                            </div>
                            {subtitle && (
                                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                        aria-label="Close Preview"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto bg-slate-50/30 p-6 min-h-[300px] flex flex-col justify-center">
                    {loading ? (
                        <div className="text-center py-16 flex flex-col items-center justify-center gap-3">
                            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Generating Sheet Preview...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-16 max-w-md mx-auto">
                            <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
                                <AlertCircle size={24} />
                            </div>
                            <h4 className="text-sm font-bold text-slate-700 mb-1">Preview Generation Failed</h4>
                            <p className="text-xs text-slate-400 mb-6">{error}</p>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                            >
                                Close Window
                            </button>
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="text-center py-16 text-slate-400">
                            No records found inside the sheet.
                        </div>
                    ) : (
                        <div className="flex-1 w-full bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col max-h-[55vh]">
                            <div className="overflow-auto flex-1">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                                        <tr>
                                            {headers.map((h, idx) => (
                                                <th 
                                                    key={idx} 
                                                    className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200"
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {bodyRows.map((r, rIdx) => (
                                            <tr 
                                                key={rIdx} 
                                                className="hover:bg-slate-50/40 transition-colors even:bg-slate-50/20"
                                            >
                                                {r.map((val, cIdx) => (
                                                    <td key={cIdx} className="py-2.5 px-4 text-slate-600 font-medium whitespace-nowrap">
                                                        {val || '—'}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-200/60 text-[10px] font-bold text-slate-400 flex items-center justify-between">
                                <span>{bodyRows.length} Row(s) Rendered</span>
                                <span className="uppercase tracking-widest text-[9px]">ITCS Attendance Sheet</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={loading || !!error || rows.length === 0}
                        className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100 hover:shadow-lg hover:shadow-indigo-200 disabled:opacity-50 disabled:shadow-none"
                    >
                        <Download size={14} /> Download CSV Sheet
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SheetPreviewModal;
