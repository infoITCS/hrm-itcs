import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../utils/api';
import { CheckCircle, XCircle, ShieldCheck, Building, AlertTriangle } from 'lucide-react';

const DocumentVerification = () => {
    const { documentId } = useParams();
    const [loading, setLoading] = useState(true);
    const [docData, setDocData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const verifyDocument = async () => {
            try {
                const res = await fetch(`${api.baseURL}/api/documents/public/verify/${documentId}`);
                if (res.ok) {
                    const data = await res.json();
                    setDocData(data);
                } else {
                    const errData = await res.json();
                    setError(errData.message || 'Invalid Document ID');
                }
            } catch (err) {
                console.error(err);
                setError('Failed to connect to verification server.');
            } finally {
                setLoading(false);
            }
        };

        if (documentId) verifyDocument();
    }, [documentId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="mt-4 text-gray-600 font-medium animate-pulse">Verifying Document Authenticity...</p>
                </div>
            </div>
        );
    }

    if (error || !docData) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center border-t-4 border-rose-500">
                    <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <XCircle size={32} className="text-rose-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification Failed</h1>
                    <p className="text-gray-600 mb-6">{error || 'This document could not be verified in our records.'}</p>
                    <div className="bg-rose-50 text-rose-700 p-4 rounded-xl text-sm text-left flex gap-3">
                        <AlertTriangle className="shrink-0" />
                        <p>This document may be forged, tampered with, or explicitly revoked by the issuer. Please contact our HR department immediately.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="mb-6 flex items-center gap-2 text-indigo-600">
                <Building size={32} />
                <span className="text-2xl font-black tracking-tight">COMPANY NAME</span>
            </div>
            
            <div className={`bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border-t-4 ${docData.isValid ? 'border-emerald-500' : 'border-rose-500'}`}>
                <div className="p-8 text-center bg-gray-50/50 border-b border-gray-100">
                    {docData.isValid ? (
                        <>
                            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 relative">
                                <ShieldCheck size={40} className="text-emerald-500" />
                                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5">
                                    <CheckCircle size={20} className="text-emerald-600 bg-white rounded-full" />
                                </div>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900">Verified Authentic</h1>
                            <p className="text-emerald-600 font-medium mt-1 text-sm">This document was issued by our system.</p>
                        </>
                    ) : (
                        <>
                            <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <XCircle size={40} className="text-rose-500" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900">Document Revoked</h1>
                            <p className="text-rose-600 font-medium mt-1 text-sm">This document is no longer valid.</p>
                        </>
                    )}
                </div>

                <div className="p-8 space-y-5">
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Document Type</p>
                        <p className="font-semibold text-gray-900">{docData.documentType}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Issued To</p>
                        <p className="font-semibold text-gray-900 text-lg">{docData.employeeName}</p>
                        <p className="text-sm text-gray-600">{docData.designation} - {docData.department}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Issue Date</p>
                        <p className="font-semibold text-gray-900">{new Date(docData.issueDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Verification ID</p>
                        <p className="font-mono text-xs text-gray-600 bg-gray-100 p-2 rounded break-all">{documentId}</p>
                    </div>
                </div>
            </div>

            <div className="mt-8 text-center text-sm text-gray-500">
                <p>Protected by HR Document Verification System</p>
                <Link to="/login" className="text-indigo-600 hover:underline mt-2 inline-block">Employee Login</Link>
            </div>
        </div>
    );
};

export default DocumentVerification;
