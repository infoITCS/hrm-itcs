import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    Network,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    X,
    Maximize2,
    Printer,
    ExternalLink,
    Settings,
    Image as ImageIcon,
    Sparkles,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { formatEmployeeFullName } from '../../utils/nameHelper';
import { usePermissions } from '../../hooks/usePermissions';

export interface OrgEmployee {
    employeeId: string;
    userId?: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    avatar?: string;
    workEmail?: string;
    phone?: string;
    simNumber?: string;
    jobInfo?: {
        designation?: string;
        department?: string;
        reportingManager?: string;
        workLocation?: string;
    };
    employmentStatus?: {
        status?: string;
    };
    attachments?: any[];
}

interface OrgHierarchyModalProps {
    isOpen: boolean;
    onClose: () => void;
    employees: OrgEmployee[];
    onEmployeeUpdated?: (updated: OrgEmployee) => void;
}

// Standard HRM Departments
export const STANDARD_DEPTS = [
    'TECH',
    'DEV',
    'SALES',
    'FINANCE',
    'HR & ADMIN',
    'MARKETING',
    'INTERNS'
] as const;

// Helper to normalize department names from DB into system departments
export function canonicalDepartment(rawDept?: string, designation?: string): string {
    const d = (rawDept || '').trim().toUpperCase();
    const des = (designation || '').toLowerCase();

    // Interns
    if (des.includes('intern') || d === 'INTERNS' || d === 'INTERN') return 'INTERNS';
    // Tech
    if (d === 'TECH' || d === 'TECHNICAL' || d.includes('TECH')) return 'TECH';
    // Dev
    if (d === 'DEV' || d === 'SOFTWARE DEVELOPMENT' || d.includes('DEVELOP') || d.includes('SOFTWARE')) return 'DEV';
    // Sales
    if (d === 'SALES' || d.includes('SALE') || d.includes('PRESALE') || d.includes('BUSINESS')) return 'SALES';
    // Finance
    if (d === 'FINANCE' || d === 'ACCOUNTS' || d.includes('ACCOUNT') || d.includes('FINANCE')) return 'FINANCE';
    // HR & Admin
    if (d === 'HR & ADMIN' || d === 'ADMIN & HR' || d === 'ADMIN' || d === 'HR' || d.includes('ADMIN') || d.includes('HUMAN RESOURCE') || d === 'ADMIN SUPPORT') return 'HR & ADMIN';
    // Marketing
    if (d === 'MARKETING' || d.includes('MARKET')) return 'MARKETING';
    // Management
    if (d === 'MANAGEMENT' || des.includes('ceo')) return 'MANAGEMENT';

    return d || 'TECH';
}

// Helper to detect employee work location from location field or designation
export function getEmpLocation(emp: OrgEmployee): 'KARACHI' | 'ISLAMABAD' | 'LAHORE' | 'OTHER' {
    const loc = (emp.jobInfo?.workLocation || '').trim().toUpperCase();
    const desig = (emp.jobInfo?.designation || '').trim().toUpperCase();

    if (loc.includes('KARACHI') || loc.includes('KHI') || desig.includes('KARACHI') || desig.includes('KHI')) return 'KARACHI';
    if (loc.includes('ISLAMABAD') || loc.includes('ISB') || desig.includes('ISLAMABAD') || desig.includes('ISB')) return 'ISLAMABAD';
    if (loc.includes('LAHORE') || loc.includes('LHR') || desig.includes('LAHORE') || desig.includes('LHR')) return 'LAHORE';

    return 'OTHER';
}

// Executive corporate color palettes matching reference infographic
const TECH_COLORS = ['bg-[#2563EB]', 'bg-[#1E40AF]', 'bg-[#0284C7]', 'bg-[#7C3AED]', 'bg-[#8B5CF6]'];
const SALES_COLORS = ['bg-[#059669]', 'bg-[#0D9488]', 'bg-[#06B6D4]', 'bg-[#10B981]', 'bg-[#84CC16]'];
const FINANCE_COLORS = ['bg-[#F59E0B]', 'bg-[#0284C7]', 'bg-[#7C3AED]', 'bg-[#D97706]'];
const HR_STAFF_COLORS = ['bg-[#EAB308]', 'bg-[#F59E0B]', 'bg-[#D97706]'];
const HR_ADMIN_COLORS = ['bg-[#F97316]', 'bg-[#EA580C]', 'bg-[#C2410C]'];
const INTERN_COLORS = ['bg-[#EC4899]', 'bg-[#C026D3]', 'bg-[#E11D48]', 'bg-[#DB2777]'];
const DEV_COLORS = ['bg-[#1E3A8A]', 'bg-[#1E40AF]', 'bg-[#2563EB]'];

// Visual Node Card representation for the panoramic chart
interface ChartNode {
    id: string;
    name: string;
    title: string;
    location?: string;
    colorClass: string;
    isVacancy?: boolean;
    employee?: OrgEmployee;
}

export const OrgHierarchyModal: React.FC<OrgHierarchyModalProps> = ({
    isOpen,
    onClose,
    employees
}) => {
    const navigate = useNavigate();
    const { role } = usePermissions();
    const canManageSettings = ['super-admin', 'admin', 'hr'].includes(role);

    // View Mode: 'dynamic' (Live Corporate Infographic) | 'original' (High-res reference picture)
    const [viewMode, setViewMode] = useState<'dynamic' | 'original'>('dynamic');

    // Pan & Zoom state
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [startPan, setStartPan] = useState({ x: 0, y: 0 });

    const viewportRef = useRef<HTMLDivElement>(null);
    const chartContentRef = useRef<HTMLDivElement>(null);

    // Fit to view calculation based on current viewport
    const handleFitView = useCallback(() => {
        if (!viewportRef.current) return;
        const padX = 32;
        const padY = 32;
        const vw = Math.max(300, viewportRef.current.clientWidth - padX);
        const vh = Math.max(300, viewportRef.current.clientHeight - padY);
        const chartW = viewMode === 'original' ? 1840 : 1920;
        const chartH = viewMode === 'original' ? 1040 : 1080;
        const calculated = Math.min(vw / chartW, vh / chartH, 1.0);
        // Allow zoom down to 0.18 so it GUARANTEES fitting on any monitor or split-screen without clipping
        setZoom(Math.max(0.18, Number(calculated.toFixed(2))));
        setPan({ x: 0, y: 0 });
    }, [viewMode]);

    // Auto-fit on open or viewMode change
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            // Allow DOM to compute clientWidth/Height, then auto-fit with dual timers
            const timer1 = setTimeout(() => handleFitView(), 40);
            const timer2 = setTimeout(() => handleFitView(), 180);
            return () => {
                clearTimeout(timer1);
                clearTimeout(timer2);
            };
        } else {
            document.body.style.overflow = 'unset';
        }
    }, [isOpen, viewMode, handleFitView]);

    // Handle window resize auto-fit
    useEffect(() => {
        if (!isOpen) return;
        const handleResize = () => handleFitView();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isOpen, handleFitView]);

    // Window-level mouse move & mouse up for drag panning
    useEffect(() => {
        if (!isPanning) return;
        const handleWindowMouseMove = (e: MouseEvent) => {
            setPan({
                x: e.clientX - startPan.x,
                y: e.clientY - startPan.y
            });
        };
        const handleWindowMouseUp = () => {
            setIsPanning(false);
        };
        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
        };
    }, [isPanning, startPan]);

    // Keyboard shortcuts (Escape to close, +/- to zoom, Arrow keys to pan)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === '+' || e.key === '=') {
                setZoom(z => Math.min(2.5, z + 0.1));
            } else if (e.key === '-') {
                setZoom(z => Math.max(0.18, z - 0.1));
            } else if (e.key === '0') {
                handleFitView();
            } else if (e.key === 'ArrowRight') {
                setPan(p => ({ ...p, x: p.x - 240 }));
            } else if (e.key === 'ArrowLeft') {
                setPan(p => ({ ...p, x: p.x + 240 }));
            } else if (e.key === 'ArrowUp') {
                setPan(p => ({ ...p, y: p.y + 180 }));
            } else if (e.key === 'ArrowDown') {
                setPan(p => ({ ...p, y: p.y - 180 }));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, handleFitView]);

    // Mouse drag pan start handler
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only main left click
        setIsPanning(true);
        setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };

    // Wheel handler: Zoom if Ctrl/Cmd is held; Pan (X and Y) on normal scroll/swipe!
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            const zoomDelta = e.deltaY < 0 ? 0.06 : -0.06;
            setZoom(z => Math.min(2.5, Math.max(0.18, z + zoomDelta)));
            return;
        }

        // Shift + Wheel converts vertical mouse wheel into horizontal pan
        let dx = e.deltaX * 1.2;
        let dy = e.deltaY * 1.2;
        if (e.shiftKey) {
            dx = e.deltaY * 1.5;
            dy = 0;
        }

        setPan(p => ({
            x: p.x - dx,
            y: p.y - dy
        }));
    };

    // Print action
    const handlePrint = () => {
        window.print();
    };

    // Open image in new tab
    const handleOpenInTab = () => {
        window.open('/org-chart.png', '_blank');
    };

    // Navigate to Admin Settings Org Hierarchy tab
    const handleGoToSettings = () => {
        onClose();
        navigate('/admin/settings?tab=org-hierarchy');
    };

    // -------------------------------------------------------------
    // Intelligent dynamic mapping of DB employees into the corporate poster
    // -------------------------------------------------------------
    const mappedStructure = useMemo(() => {
        const usedIds = new Set<string>();

        // 1. CEO / Top Executive Node:
        const ceoEmp = employees.find(e => {
            const desig = (e.jobInfo?.designation || '').toLowerCase();
            const name = formatEmployeeFullName(e, '').toLowerCase();
            const dept = (e.jobInfo?.department || '').toLowerCase();
            return desig.includes('ceo') || name.includes('faraz') || dept === 'management';
        }) || employees[0];

        if (ceoEmp) usedIds.add(ceoEmp.employeeId);

        const ceoNode: ChartNode = {
            id: ceoEmp?.employeeId || 'ceo',
            name: ceoEmp ? formatEmployeeFullName(ceoEmp, 'Faraz Anwer').toUpperCase() : 'FARAZ ANWER',
            title: (ceoEmp?.jobInfo?.designation || 'CEO').toUpperCase(),
            location: ceoEmp?.jobInfo?.workLocation?.toUpperCase(),
            colorClass: 'bg-[#EA4B5B]',
            employee: ceoEmp
        };

        const makeNode = (emp: OrgEmployee, color: string): ChartNode => ({
            id: emp.employeeId,
            name: formatEmployeeFullName(emp, 'Employee').toUpperCase(),
            title: (emp.jobInfo?.designation || 'MEMBER').toUpperCase(),
            location: (emp.jobInfo?.workLocation || '').trim().toUpperCase() || undefined,
            colorClass: color,
            employee: emp
        });

        // Department Pools
        const techPool: OrgEmployee[] = [];
        const devPool: OrgEmployee[] = [];
        const salesPool: OrgEmployee[] = [];
        const financePool: OrgEmployee[] = [];
        const hrPool: OrgEmployee[] = [];
        const marketingPool: OrgEmployee[] = [];
        const internPool: OrgEmployee[] = [];

        employees.forEach(emp => {
            if (usedIds.has(emp.employeeId)) return;
            const dept = canonicalDepartment(emp.jobInfo?.department, emp.jobInfo?.designation);

            switch (dept) {
                case 'TECH':
                    techPool.push(emp);
                    break;
                case 'DEV':
                    devPool.push(emp);
                    break;
                case 'SALES':
                    salesPool.push(emp);
                    break;
                case 'FINANCE':
                    financePool.push(emp);
                    break;
                case 'HR & ADMIN':
                    hrPool.push(emp);
                    break;
                case 'MARKETING':
                    marketingPool.push(emp);
                    break;
                case 'INTERNS':
                    internPool.push(emp);
                    break;
                default:
                    if ((emp.jobInfo?.designation || '').toLowerCase().includes('intern')) {
                        internPool.push(emp);
                    } else {
                        hrPool.push(emp);
                    }
                    break;
            }
        });

        // -------------------------------------------------------------
        // Pillar 1: TECH & DEV
        // -------------------------------------------------------------
        let techMgrEmp: OrgEmployee | undefined = techPool.find(e => {
            const des = (e.jobInfo?.designation || '').toLowerCase();
            return des.includes('technical manager') || (des.includes('manager') && !des.includes('asst'));
        });
        if (!techMgrEmp && techPool.length > 0) {
            techMgrEmp = techPool[0];
        }

        const techMgrNode: ChartNode | null = techMgrEmp ? {
            ...makeNode(techMgrEmp, 'bg-[#5B6BBF]'),
            title: (techMgrEmp.jobInfo?.designation || 'TECHNICAL MANAGER').toUpperCase()
        } : null;

        const techRemaining = techPool.filter(e => e.employeeId !== techMgrEmp?.employeeId);

        const techKhiEmps: OrgEmployee[] = [];
        const techIsbEmps: OrgEmployee[] = [];
        const techLhrEmps: OrgEmployee[] = [];

        techRemaining.forEach(e => {
            const loc = getEmpLocation(e);
            if (loc === 'KARACHI') techKhiEmps.push(e);
            else if (loc === 'LAHORE') techLhrEmps.push(e);
            else if (loc === 'ISLAMABAD') techIsbEmps.push(e);
            else {
                if (techKhiEmps.length <= techIsbEmps.length) techKhiEmps.push(e);
                else techIsbEmps.push(e);
            }
        });

        const techKhi = techKhiEmps.map((e, i) => makeNode(e, TECH_COLORS[i % TECH_COLORS.length]));
        const techIsb = techIsbEmps.map((e, i) => makeNode(e, TECH_COLORS[i % TECH_COLORS.length]));
        const techLhr = techLhrEmps.map((e, i) => makeNode(e, TECH_COLORS[i % TECH_COLORS.length]));

        const devMembers = devPool.map((e, i) => makeNode(e, DEV_COLORS[i % DEV_COLORS.length]));

        // -------------------------------------------------------------
        // Pillar 2: SALES & FINANCE
        // -------------------------------------------------------------
        let salesLeadEmp: OrgEmployee | undefined = salesPool.find(e => {
            const des = (e.jobInfo?.designation || '').toLowerCase();
            return des.includes('hod') || des.includes('rsm') || des.includes('manager');
        });
        if (!salesLeadEmp && salesPool.length > 0) {
            salesLeadEmp = salesPool[0];
        }

        const salesHodNode: ChartNode | null = salesLeadEmp ? {
            ...makeNode(salesLeadEmp, 'bg-[#0D9488]'),
            title: (salesLeadEmp.jobInfo?.designation || 'REGIONAL SALES MANAGER').toUpperCase()
        } : null;

        const salesRemaining = salesPool.filter(e => e.employeeId !== salesLeadEmp?.employeeId);

        const salesKhiEmps: OrgEmployee[] = [];
        const salesIsbEmps: OrgEmployee[] = [];
        const salesLhrEmps: OrgEmployee[] = [];

        salesRemaining.forEach(e => {
            const loc = getEmpLocation(e);
            if (loc === 'KARACHI') salesKhiEmps.push(e);
            else if (loc === 'LAHORE') salesLhrEmps.push(e);
            else if (loc === 'ISLAMABAD') salesIsbEmps.push(e);
            else {
                if (salesKhiEmps.length === 0) salesKhiEmps.push(e);
                else salesIsbEmps.push(e);
            }
        });

        const salesKhi = salesKhiEmps.map((e, i) => makeNode(e, SALES_COLORS[i % SALES_COLORS.length]));
        const salesIsb = salesIsbEmps.map((e, i) => makeNode(e, SALES_COLORS[i % SALES_COLORS.length]));
        const salesLhr = salesLhrEmps.map((e, i) => makeNode(e, SALES_COLORS[i % SALES_COLORS.length]));

        // Finance Manager & Members
        let financeMgrEmp: OrgEmployee | undefined = financePool.find(e => {
            const des = (e.jobInfo?.designation || '').toLowerCase();
            return des.includes('manager') || des.includes('head') || des.includes('lead');
        });
        if (!financeMgrEmp && financePool.length > 0) {
            financeMgrEmp = financePool[0];
        }

        const financeMgrNode: ChartNode | null = financeMgrEmp ? {
            ...makeNode(financeMgrEmp, 'bg-[#9333EA]'),
            title: (financeMgrEmp.jobInfo?.designation || 'ACCOUNTS MANAGER').toUpperCase()
        } : null;

        const financeRemaining = financePool.filter(e => e.employeeId !== financeMgrEmp?.employeeId);
        const financeMembers = financeRemaining.map((e, i) => makeNode(e, FINANCE_COLORS[i % FINANCE_COLORS.length]));

        // -------------------------------------------------------------
        // Pillar 3: HR & ADMIN
        // -------------------------------------------------------------
        let hrHeadEmp: OrgEmployee | undefined = hrPool.find(e => {
            const des = (e.jobInfo?.designation || '').toLowerCase();
            return des.includes('manager') || des.includes('head') || des.includes('ops');
        });
        if (!hrHeadEmp && hrPool.length > 0) {
            hrHeadEmp = hrPool[0];
        }

        const hrHeadNode: ChartNode | null = hrHeadEmp ? {
            ...makeNode(hrHeadEmp, 'bg-[#F59E0B]'),
            title: (hrHeadEmp.jobInfo?.designation || 'HR MANAGER').toUpperCase()
        } : null;

        const hrRemaining = hrPool.filter(e => e.employeeId !== hrHeadEmp?.employeeId);

        const hrStaffEmps: OrgEmployee[] = [];
        const hrAdminEmps: OrgEmployee[] = [];

        hrRemaining.forEach(e => {
            const des = (e.jobInfo?.designation || '').toLowerCase();
            if (des.includes('admin') || des.includes('officer') || des.includes('coordinator')) {
                hrAdminEmps.push(e);
            } else {
                hrStaffEmps.push(e);
            }
        });

        const hrStaff = hrStaffEmps.map((e, i) => makeNode(e, HR_STAFF_COLORS[i % HR_STAFF_COLORS.length]));
        const hrAdmins = hrAdminEmps.map((e, i) => makeNode(e, HR_ADMIN_COLORS[i % HR_ADMIN_COLORS.length]));

        // -------------------------------------------------------------
        // Pillar 4: MARKETING & INTERNS
        // -------------------------------------------------------------
        const marketingMembers = marketingPool.map((e, i) => makeNode(e, i === 0 ? 'bg-[#334155]' : 'bg-[#475569]'));
        const internMembers = internPool.map((e, i) => makeNode(e, INTERN_COLORS[i % INTERN_COLORS.length]));

        return {
            ceoNode,
            techMgrNode,
            techKhi,
            techIsb,
            techLhr,
            devMembers,
            salesHodNode,
            salesKhi,
            salesIsb,
            salesLhr,
            financeMgrNode,
            financeMembers,
            hrHeadNode,
            hrStaff,
            hrAdmins,
            marketingMembers,
            internMembers
        };
    }, [employees]);

    if (!isOpen) return null;

    // Reusable Pill Component matching the exact infographic style
    const PillCard: React.FC<{ node: ChartNode; className?: string }> = ({ node, className = '' }) => (
        <div
            className={`w-[152px] py-1.5 px-2 rounded-2xl text-center shadow-md select-none transition-transform hover:scale-105 shrink-0 ${node.colorClass} ${
                node.isVacancy ? 'border border-dashed border-slate-300' : ''
            } ${className}`}
        >
            <div className="text-[11px] font-black text-white tracking-wide truncate uppercase leading-tight">
                {node.name}
            </div>
            <div className="text-[8.5px] font-semibold text-white/90 tracking-wider truncate uppercase mt-0.5">
                {node.title}
            </div>
            {node.location && (
                <div className="text-[7.5px] font-bold text-white/70 tracking-widest truncate uppercase mt-0.5">
                    {node.location}
                </div>
            )}
        </div>
    );

    // Reusable Department Box Header
    const DeptHeader: React.FC<{ title: string }> = ({ title }) => (
        <div className="border-[2px] border-slate-800 bg-white px-6 py-1 rounded-2xl text-center shadow-sm">
            <span className="text-[11px] font-black tracking-widest text-slate-800 uppercase">
                {title}
            </span>
        </div>
    );

    return createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/85 backdrop-blur-md animate-fadeIn print:bg-white print:p-0">
            {/* Top Toolbar */}
            <div className="h-16 px-4 sm:px-6 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between gap-4 shrink-0 text-white select-none print:hidden">
                {/* Left: Title & Subtitle */}
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                        <Network size={20} />
                    </div>
                    <div>
                        <h2 className="text-sm sm:text-base font-black text-white tracking-tight flex items-center gap-2">
                            <span>Organization Hierarchy</span>
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                {employees.length} Active Members
                            </span>
                        </h2>
                        <p className="text-xs text-slate-400 hidden sm:block">
                            Corporate reporting lines, departments & team structure
                        </p>
                    </div>
                </div>

                {/* Center: View Switcher & Zoom Controls */}
                <div className="flex items-center gap-2 bg-slate-800/80 p-1 rounded-2xl border border-slate-700/60 shadow-inner">
                    {/* View Switcher */}
                    <button
                        type="button"
                        onClick={() => setViewMode('dynamic')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                            viewMode === 'dynamic'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-white'
                        }`}
                        title="Live Dynamic Corporate Infographic (All Active Employees)"
                    >
                        <Sparkles size={14} />
                        <span className="hidden md:inline">Live Chart</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode('original')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                            viewMode === 'original'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-white'
                        }`}
                        title="Original Reference Chart"
                    >
                        <ImageIcon size={14} />
                        <span className="hidden md:inline">Original Reference</span>
                    </button>

                    {/* Left / Right Scroll navigation buttons */}
                    <button
                        type="button"
                        onClick={() => setPan(p => ({ ...p, x: p.x + 350 }))}
                        className="px-2 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                        title="Scroll Left (or Arrow Left / Shift + Mouse Wheel)"
                    >
                        <ChevronLeft size={16} />
                        <span className="hidden xl:inline">Left</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setPan(p => ({ ...p, x: p.x - 350 }))}
                        className="px-2 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                        title="Scroll Right (or Arrow Right / Shift + Mouse Wheel)"
                    >
                        <span className="hidden xl:inline">Right</span>
                        <ChevronRight size={16} />
                    </button>

                    <div className="h-4 w-px bg-slate-700 mx-0.5" />

                    {/* Zoom In/Out & Reset */}
                    <button
                        type="button"
                        onClick={() => setZoom(z => Math.max(0.18, z - 0.1))}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors"
                        title="Zoom Out (-)"
                    >
                        <ZoomOut size={16} />
                    </button>
                    <span className="text-xs font-black text-slate-300 w-12 text-center">
                        {Math.round(zoom * 100)}%
                    </span>
                    <button
                        type="button"
                        onClick={() => setZoom(z => Math.min(2.5, z + 0.1))}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors"
                        title="Zoom In (+)"
                    >
                        <ZoomIn size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={handleFitView}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                        title="Fit entire chart to screen"
                    >
                        <Maximize2 size={13} />
                        <span>Fit</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors"
                        title="100% Zoom & Center"
                    >
                        <RotateCcw size={16} />
                    </button>
                </div>

                {/* Right: Print / Settings / Close */}
                <div className="flex items-center gap-2">
                    {canManageSettings && (
                        <button
                            type="button"
                            onClick={handleGoToSettings}
                            className="px-3.5 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                            title="Open Hierarchy Placement in Admin Settings"
                        >
                            <Settings size={15} />
                            <span className="hidden lg:inline">Edit in Settings</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handlePrint}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                        title="Print / Save as PDF"
                    >
                        <Printer size={18} />
                    </button>

                    <button
                        type="button"
                        onClick={handleOpenInTab}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors hidden sm:block"
                        title="Open image file in new tab"
                    >
                        <ExternalLink size={18} />
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-rose-500/20 hover:text-rose-400 rounded-xl transition-colors ml-1"
                        title="Close (Esc)"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Canvas Body Viewport */}
            <div
                ref={viewportRef}
                onMouseDown={handleMouseDown}
                onWheel={handleWheel}
                className="flex-1 relative overflow-hidden bg-slate-900 select-none cursor-grab active:cursor-grabbing flex items-center justify-center print:overflow-visible print:bg-white"
            >
                {viewMode === 'original' ? (
                    /* ------------------------------------------------ */
                    /* ORIGINAL REFERENCE VIEW (Original corporate pic) */
                    /* ------------------------------------------------ */
                    <div
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transformOrigin: 'center center',
                            transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                        }}
                        className="flex items-center justify-center p-8 select-none"
                    >
                        <img
                            src="/org-chart.png"
                            alt="Original ITCS Organization Chart"
                            className="max-w-none w-[1840px] rounded-2xl shadow-2xl pointer-events-none"
                        />
                    </div>
                ) : (
                    /* ------------------------------------------------ */
                    /* LIVE DYNAMIC CHART (Infographic with active DB)  */
                    /* ------------------------------------------------ */
                    <div
                        ref={chartContentRef}
                        style={{
                            width: 1880,
                            minWidth: 1880,
                            minHeight: 1000,
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transformOrigin: 'center center',
                            transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                        }}
                        className="bg-white rounded-3xl shadow-2xl relative p-8 flex flex-col justify-between border border-slate-200 select-none shrink-0 print:shadow-none print:border-none print:transform-none"
                    >
                        {/* Elegant Lavender Background Ribbon Waves (matching org-chart.png) */}
                        <svg
                            className="absolute inset-0 w-full h-full pointer-events-none opacity-45"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 1880 1000"
                            preserveAspectRatio="none"
                        >
                            <defs>
                                <linearGradient id="silkWave1" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#FAF5FF" stopOpacity="0.8" />
                                    <stop offset="35%" stopColor="#E9D5FF" stopOpacity="0.5" />
                                    <stop offset="70%" stopColor="#DDD6FE" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.9" />
                                </linearGradient>
                                <linearGradient id="silkWave2" x1="100%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.4" />
                                    <stop offset="50%" stopColor="#DDD6FE" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#FAF5FF" stopOpacity="0.6" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M-100,280 C350,180 550,380 950,290 C1350,200 1550,340 2000,240 L2000,1100 L-100,1100 Z"
                                fill="url(#silkWave1)"
                            />
                            <path
                                d="M-50,600 C300,510 650,660 1050,540 C1450,420 1650,620 2050,480 L2050,1100 L-50,1100 Z"
                                fill="url(#silkWave2)"
                            />
                        </svg>

                        {/* Top Header: COMPANY ORGANIZATION */}
                        <div className="relative z-10 text-center mb-5">
                            <h1 className="text-3xl font-black text-[#243356] tracking-[0.24em] uppercase font-sans">
                                COMPANY ORGANIZATION
                            </h1>
                        </div>

                        {/* CEO Node (Top Center) */}
                        <div className="relative z-10 flex flex-col items-center mb-3">
                            <div className="w-[180px] py-2 px-3 rounded-2xl text-center shadow-lg bg-[#EA4B5B] border border-rose-300/40">
                                <div className="text-[13px] font-black text-white tracking-wider uppercase leading-tight">
                                    {mappedStructure.ceoNode.name}
                                </div>
                                <div className="text-[9.5px] font-bold text-white/90 tracking-widest uppercase mt-0.5">
                                    {mappedStructure.ceoNode.title}
                                </div>
                            </div>
                        </div>

                        {/* Tree Connecting Orthogonal Lines (CEO down to Department Pillars) */}
                        <svg
                            className="absolute inset-0 w-full h-full pointer-events-none z-0"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            {/* Vertical drop from CEO bottom (center at x: 940, y: 135 -> y: 162) */}
                            <line x1="940" y1="135" x2="940" y2="162" stroke="#94A3B8" strokeWidth="1.5" />

                            {/* Horizontal distributor bus line across departments (x: 270 to x: 1720, y: 162) */}
                            <line x1="270" y1="162" x2="1720" y2="162" stroke="#94A3B8" strokeWidth="1.5" />

                            {/* Drop line into TECH (center at x: 270, y: 162 -> 195) */}
                            <line x1="270" y1="162" x2="270" y2="195" stroke="#94A3B8" strokeWidth="1.5" />

                            {/* Drop line into SALES (center at x: 940, y: 162 -> 195) */}
                            <line x1="940" y1="162" x2="940" y2="195" stroke="#94A3B8" strokeWidth="1.5" />

                            {/* Drop line into HR & ADMIN (center at x: 1410, y: 162 -> 195) */}
                            <line x1="1410" y1="162" x2="1410" y2="195" stroke="#94A3B8" strokeWidth="1.5" />

                            {/* Drop line into MARKETING (center at x: 1720, y: 162 -> 195) */}
                            <line x1="1720" y1="162" x2="1720" y2="195" stroke="#94A3B8" strokeWidth="1.5" />
                        </svg>

                        {/* Panoramic Executive Department Pillars (TECH & DEV, SALES & FINANCE, HR & ADMIN, MARKETING & INTERNS) */}
                        <div className="relative z-10 flex items-start justify-between gap-6 px-4 mt-1 w-full">
                            {/* ================================================= */}
                            {/* 1. TECH & DEV PILLAR (Width: 540px)               */}
                            {/* ================================================= */}
                            <div className="w-[540px] shrink-0 flex flex-col items-center">
                                <DeptHeader title="TECH" />
                                <div className="h-3.5 w-px bg-slate-400" />
                                {mappedStructure.techMgrNode && (
                                    <>
                                        <PillCard node={mappedStructure.techMgrNode} className="w-[170px]" />
                                        <div className="h-3.5 w-px bg-slate-400" />
                                    </>
                                )}

                                {/* 3 Sub-columns */}
                                <div className="grid grid-cols-3 gap-2.5 w-full">
                                    {/* Stack 1: Karachi */}
                                    <div className="flex flex-col items-center space-y-1.5">
                                        {mappedStructure.techKhi.map(node => (
                                            <PillCard key={node.id} node={node} />
                                        ))}
                                        <div className="text-[9px] font-black text-slate-500 tracking-widest uppercase pt-1.5">
                                            KARACHI
                                        </div>
                                    </div>

                                    {/* Stack 2: Islamabad */}
                                    <div className="flex flex-col items-center space-y-1.5">
                                        {mappedStructure.techIsb.map(node => (
                                            <PillCard key={node.id} node={node} />
                                        ))}
                                        <div className="text-[9px] font-black text-slate-500 tracking-widest uppercase pt-1.5">
                                            ISLAMABAD
                                        </div>
                                    </div>

                                    {/* Stack 3: Lahore + DEV nestled underneath (Exact match to org-chart.png) */}
                                    <div className="flex flex-col items-center">
                                        {/* Lahore Tech Stack */}
                                        <div className="flex flex-col items-center space-y-1.5 w-full">
                                            {mappedStructure.techLhr.map(node => (
                                                <PillCard key={node.id} node={node} />
                                            ))}
                                            <div className="text-[9px] font-black text-slate-500 tracking-widest uppercase pt-1.5">
                                                LAHORE
                                            </div>
                                        </div>

                                        {/* Vertical Connector down to DEV */}
                                        <div className="h-6 w-px bg-slate-400 my-2" />

                                        {/* DEV Department Box */}
                                        <div className="flex flex-col items-center w-full">
                                            <DeptHeader title="DEV" />
                                            <div className="h-3 w-px bg-slate-400" />
                                            <div className="flex flex-col items-center space-y-1.5 w-full">
                                                {mappedStructure.devMembers.map(node => (
                                                    <PillCard key={node.id} node={node} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ================================================= */}
                            {/* 2. SALES & FINANCE PILLAR (Width: 540px)          */}
                            {/* ================================================= */}
                            <div className="w-[540px] shrink-0 flex flex-col items-center">
                                <DeptHeader title="SALES" />
                                <div className="h-3.5 w-px bg-slate-400" />
                                {mappedStructure.salesHodNode && (
                                    <>
                                        <PillCard node={mappedStructure.salesHodNode} className="w-[170px]" />
                                        <div className="h-3.5 w-px bg-slate-400" />
                                    </>
                                )}

                                {/* 3 Sub-columns for Sales */}
                                <div className="grid grid-cols-3 gap-2.5 w-full">
                                    {/* Sales Karachi */}
                                    <div className="flex flex-col items-center space-y-1.5">
                                        {mappedStructure.salesKhi.map(node => (
                                            <PillCard key={node.id} node={node} />
                                        ))}
                                        <div className="text-[9px] font-black text-slate-500 tracking-widest uppercase pt-1.5">
                                            KARACHI
                                        </div>
                                    </div>

                                    {/* Sales Islamabad */}
                                    <div className="flex flex-col items-center space-y-1.5">
                                        {mappedStructure.salesIsb.map(node => (
                                            <PillCard key={node.id} node={node} />
                                        ))}
                                        <div className="text-[9px] font-black text-slate-500 tracking-widest uppercase pt-1.5">
                                            ISLAMABAD
                                        </div>
                                    </div>

                                    {/* Sales Lahore */}
                                    <div className="flex flex-col items-center space-y-1.5">
                                        {mappedStructure.salesLhr.map(node => (
                                            <PillCard key={node.id} node={node} />
                                        ))}
                                        <div className="text-[9px] font-black text-slate-500 tracking-widest uppercase pt-1.5">
                                            LAHORE
                                        </div>
                                    </div>
                                </div>

                                {/* Vertical Connector down to FINANCE */}
                                <div className="h-6 w-px bg-slate-400 my-2" />

                                {/* FINANCE Department Box (nestled under Sales) */}
                                <div className="flex flex-col items-center w-full">
                                    <DeptHeader title="FINANCE" />
                                    <div className="h-3 w-px bg-slate-400" />
                                    {mappedStructure.financeMgrNode && (
                                        <>
                                            <PillCard node={mappedStructure.financeMgrNode} className="w-[170px]" />
                                            <div className="h-3 w-px bg-slate-400" />
                                        </>
                                    )}
                                    <div className="grid grid-cols-2 gap-2 w-full max-w-[340px]">
                                        {mappedStructure.financeMembers.map(node => (
                                            <PillCard key={node.id} node={node} />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* ================================================= */}
                            {/* 3. HR & ADMIN (Width: 360px - Spacious 2 columns) */}
                            {/* ================================================= */}
                            <div className="w-[360px] shrink-0 flex flex-col items-center">
                                <DeptHeader title="HR & ADMIN" />
                                <div className="h-3.5 w-px bg-slate-400" />
                                {mappedStructure.hrHeadNode && (
                                    <>
                                        <PillCard node={mappedStructure.hrHeadNode} className="w-[170px]" />
                                        <div className="h-3.5 w-px bg-slate-400" />
                                    </>
                                )}

                                <div className="grid grid-cols-2 gap-3.5 w-full">
                                    {/* Staff / Drivers / Cooks */}
                                    <div className="flex flex-col items-center space-y-1.5">
                                        {mappedStructure.hrStaff.map(node => (
                                            <PillCard key={node.id} node={node} />
                                        ))}
                                    </div>

                                    {/* Regional Admins */}
                                    <div className="flex flex-col items-center space-y-1.5">
                                        {mappedStructure.hrAdmins.map(node => (
                                            <PillCard key={node.id} node={node} />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* ================================================= */}
                            {/* 4. MARKETING, INTERNS & BRAND LOGO (Width: 220px) */}
                            {/* ================================================= */}
                            <div className="w-[220px] shrink-0 flex flex-col items-center justify-between self-stretch">
                                <div className="flex flex-col items-center space-y-6 w-full">
                                    {/* Marketing */}
                                    <div className="flex flex-col items-center w-full">
                                        <DeptHeader title="MARKETING" />
                                        <div className="h-3 w-px bg-slate-400" />
                                        {mappedStructure.marketingMembers.length > 0 ? (
                                            <div className="flex flex-col items-center space-y-1.5 w-full">
                                                {mappedStructure.marketingMembers.map(node => (
                                                    <PillCard key={node.id} node={node} className="w-[170px]" />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-[10px] text-slate-400 font-semibold italic py-1">
                                                Corporate Marketing
                                            </div>
                                        )}
                                    </div>

                                    {/* Interns Pillar */}
                                    <div className="flex flex-col items-center w-full">
                                        <DeptHeader title="INTERNS" />
                                        <div className="h-3 w-px bg-slate-400" />
                                        <div className="flex flex-col items-center space-y-1.5 w-full">
                                            {mappedStructure.internMembers.map(node => (
                                                <PillCard key={node.id} node={node} className="w-[170px]" />
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* ITCS Brand Logo in lower right area */}
                                <div className="w-full flex justify-center items-end pt-10 pb-2">
                                    <img
                                        src="/logo.png"
                                        alt="ITCS Logo"
                                        className="h-28 object-contain pointer-events-none drop-shadow-sm select-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Bottom Canvas Interactive Navigation & Tooltip */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-700/70 text-slate-300 text-xs font-semibold shadow-2xl select-none flex items-center gap-3 print:hidden z-30">
                    <button
                        type="button"
                        onClick={() => setPan(p => ({ ...p, x: p.x + 300 }))}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-lg border border-slate-700 transition-colors flex items-center gap-1 font-bold"
                        title="Scroll Left"
                    >
                        <ChevronLeft size={14} />
                        <span>Left</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setPan(p => ({ ...p, x: p.x - 300 }))}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-lg border border-slate-700 transition-colors flex items-center gap-1 font-bold"
                        title="Scroll Right"
                    >
                        <span>Right</span>
                        <ChevronRight size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={handleFitView}
                        className="px-2.5 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg border border-indigo-500/50 transition-colors flex items-center gap-1 font-bold"
                        title="Fit All on Screen"
                    >
                        <Maximize2 size={13} />
                        <span>Fit All</span>
                    </button>

                    <div className="h-3.5 w-px bg-slate-700 mx-1" />

                    <span className="text-slate-400 hidden md:inline">
                        Shift + Wheel or Drag to pan &bull; Ctrl + Wheel to zoom &bull; Esc to close
                    </span>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default OrgHierarchyModal;
