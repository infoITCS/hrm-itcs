
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
                    <div className="bg-white p-10 rounded-[2rem] shadow-2xl max-w-lg w-full text-center border border-gray-100">
                        <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-3">Oops! Something went wrong</h1>
                        <p className="text-gray-500 mb-8 leading-relaxed">
                            The application encountered an unexpected error. This might be due to a temporary storage issue or a technical glitch.
                        </p>
                        
                        <div className="bg-rose-50/50 p-4 rounded-2xl mb-8 border border-rose-100 text-left">
                            <p className="text-xs font-semibold text-rose-400 uppercase tracking-widest mb-2 px-1">Error Details</p>
                            <code className="text-xs font-mono text-rose-700 block bg-white/50 p-3 rounded-xl break-all">
                                {this.state.error?.toString()}
                            </code>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]"
                            >
                                Refresh & Try Again
                            </button>
                            <button
                                onClick={() => window.location.href = '/'}
                                className="w-full py-4 bg-white text-gray-700 border border-gray-200 rounded-2xl font-bold hover:bg-gray-50 transition-all active:scale-[0.98]"
                            >
                                Back to Dashboard
                            </button>
                        </div>
                        <p className="mt-8 text-xs text-gray-400">
                            If this persists, please try clearing your browser cache/storage.
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
