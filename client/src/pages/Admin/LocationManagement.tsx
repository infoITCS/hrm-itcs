import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Plus, Edit2, ShieldAlert, X, Cpu, Clock } from 'lucide-react';
import { attendanceApi } from '../../modules/attendance/api/attendanceApi';
import AlertModal from '../../components/UI/AlertModal';

interface DeviceLocation {
    deviceSN: string;
    locationName: string;
    shiftStart: string;
    shiftEnd: string;
    graceMinutes: number;
    halfDayThresholdHours: number;
    isActive: boolean;
}

const LocationManagement = () => {
    const [devices, setDevices] = useState<DeviceLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<DeviceLocation>({
        deviceSN: '',
        locationName: '',
        shiftStart: '09:00',
        shiftEnd: '18:00',
        graceMinutes: 15,
        halfDayThresholdHours: 4,
        isActive: true,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'info' | 'success' | 'warning' | 'error' | 'confirm';
        onConfirm?: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info'
    });

    useEffect(() => {
        fetchDevices();
    }, []);

    const fetchDevices = async () => {
        setLoading(true);
        try {
            const data = await attendanceApi.admin.getDevices();
            setDevices(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (device?: DeviceLocation) => {
        if (device) {
            setIsEditing(true);
            setFormData({ ...device });
        } else {
            setIsEditing(false);
            setFormData({
                deviceSN: '',
                locationName: '',
                shiftStart: '09:00',
                shiftEnd: '18:00',
                graceMinutes: 15,
                halfDayThresholdHours: 4,
                isActive: true,
            });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await attendanceApi.admin.updateDevice(formData.deviceSN, formData);
            await fetchDevices();
            setShowModal(false);
            setAlertConfig({
                isOpen: true,
                title: 'Success',
                message: `Device/Location ${isEditing ? 'updated' : 'created'} successfully.`,
                type: 'success'
            });
        } catch (err: any) {
            setAlertConfig({
                isOpen: true,
                title: 'Error',
                message: err.message,
                type: 'error'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 animate-slide-up">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">Biometric Devices & Locations</h3>
                    <p className="text-sm text-slate-500">Map your physical machines to office locations and set timing defaults.</p>
                </div>
                <button 
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold shadow-sm hover:shadow-indigo-200 hover:shadow-lg active:scale-95 whitespace-nowrap"
                >
                    <Plus size={18} /> Add New Device
                </button>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3">
                    <ShieldAlert size={20} />
                    <span className="font-medium">{error}</span>
                </div>
            )}

            <div className="bg-white rounded-3xl shadow-xl shadow-indigo-100/20 border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Location</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Device SN</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Default Timings</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                Array(3).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={5} className="px-6 py-8"><div className="h-4 bg-slate-100 rounded w-full"></div></td>
                                    </tr>
                                ))
                            ) : devices.length > 0 ? (
                                devices.map((device) => (
                                    <tr key={device.deviceSN} className="hover:bg-indigo-50/20 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                                    <MapPin size={16} />
                                                </div>
                                                <span className="text-sm font-bold text-slate-800">{device.locationName}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 font-mono text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100 w-fit">
                                                <Cpu size={12} />
                                                {device.deviceSN}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                                    <Clock size={12} className="text-slate-400" />
                                                    {device.shiftStart} — {device.shiftEnd}
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-medium">
                                                    Grace: {device.graceMinutes}m · Threshold: {device.halfDayThresholdHours}h
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${device.isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                                                {device.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={() => handleOpenModal(device)}
                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                    title="Edit Device"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="p-4 bg-slate-50 rounded-full">
                                                <Cpu size={32} className="text-slate-300" />
                                            </div>
                                            <p className="font-medium text-sm">No devices mapped yet. Add a machine SN to start.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Device Modal */}
            {showModal && createPortal(
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-start justify-center p-4 pt-8 sm:pt-12 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[calc(100vh-6rem)] sm:max-h-[calc(100vh-8rem)]">
                        <div className="p-6 border-b border-slate-100 bg-slate-50 relative shrink-0">
                            <h3 className="text-xl font-bold text-slate-800">{isEditing ? 'Edit Device Mapping' : 'Register New Device'}</h3>
                            <p className="text-sm text-slate-500 mt-1">Map a machine SN to a physical location and set default timings.</p>
                            <button 
                                onClick={() => setShowModal(false)}
                                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Device Serial Number (SN)</label>
                                    <input 
                                        type="text" 
                                        required
                                        disabled={isEditing}
                                        placeholder="e.g. CAHT214760099"
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.deviceSN}
                                        onChange={e => setFormData({...formData, deviceSN: e.target.value})}
                                    />
                                    <p className="text-[10px] text-slate-400 italic">Unique ID found on machine sticker</p>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Location Name</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="e.g. ISB-Office, Karachi"
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                        value={formData.locationName}
                                        onChange={e => setFormData({...formData, locationName: e.target.value})}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Location Start Time</label>
                                    <input 
                                        type="time" 
                                        required
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                        value={formData.shiftStart}
                                        onChange={e => setFormData({...formData, shiftStart: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Location End Time</label>
                                    <input 
                                        type="time" 
                                        required
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                        value={formData.shiftEnd}
                                        onChange={e => setFormData({...formData, shiftEnd: e.target.value})}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Grace Period (Mins)</label>
                                    <input 
                                        type="number" 
                                        required
                                        min="0"
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                        value={formData.graceMinutes}
                                        onChange={e => setFormData({...formData, graceMinutes: parseInt(e.target.value) || 0})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Half-Day Threshold (Hrs)</label>
                                    <input 
                                        type="number" 
                                        required
                                        min="1"
                                        step="0.5"
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                        value={formData.halfDayThresholdHours}
                                        onChange={e => setFormData({...formData, halfDayThresholdHours: parseFloat(e.target.value) || 0})}
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3">
                                <button 
                                    type="button" 
                                    onClick={() => setShowModal(false)}
                                    className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-sm transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Saving...
                                        </>
                                    ) : 'Save Mapping'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            <AlertModal 
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
                showCancel={alertConfig.type === 'confirm'}
            />
        </div>
    );
};

export default LocationManagement;
