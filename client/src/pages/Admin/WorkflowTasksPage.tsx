import React from 'react';
import { CheckSquare } from 'lucide-react';
import WorkflowTasksTab from '../../components/Admin/WorkflowTasksTab';

const WorkflowTasksPage: React.FC = () => {
    return (
        <div className="space-y-6 animate-slide-up pb-12 pt-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <CheckSquare className="text-indigo-600" /> Workflow & Onboarding Tasks
                    </h2>
                    <p className="text-gray-500 mt-1">
                        Track and complete IT provisioning checklists, asset collections, and employee exit clearance items.
                    </p>
                </div>
            </div>

            <WorkflowTasksTab />
        </div>
    );
};

export default WorkflowTasksPage;
