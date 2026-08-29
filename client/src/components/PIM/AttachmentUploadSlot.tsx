import { Upload } from 'lucide-react';
import type { ComponentType } from 'react';

type AttachmentUploadSlotProps = {
    label: string;
    typeKey: string;
    optional?: boolean;
    inputId: string;
    existingFile?: any;
    localFile?: File;
    DocumentPreview: ComponentType<{
        typeKey: string;
        existingFile?: any;
        localFile?: File;
        onRemove: () => void;
        onPreview: (url: string, name: string, type: string) => void;
        inputId?: string;
    }>;
    onSelectFile: (file: File) => void;
    onRemove: () => void;
    onPreview: (url: string, name: string, type: string) => void;
};

export default function AttachmentUploadSlot({
    label,
    typeKey,
    optional = true,
    inputId,
    existingFile,
    localFile,
    DocumentPreview,
    onSelectFile,
    onRemove,
    onPreview,
}: AttachmentUploadSlotProps) {
    const hasFile = !!existingFile || !!localFile;

    return (
        <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">
                {label}
                {!optional && <span className="text-red-500 font-bold ml-0.5">*</span>}
                {optional && <span className="text-gray-400 font-normal ml-1">(optional)</span>}
            </label>
            <input
                type="file"
                id={inputId}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => {
                    if (e.target.files?.[0]) onSelectFile(e.target.files[0]);
                }}
            />
            {hasFile ? (
                <DocumentPreview
                    typeKey={typeKey}
                    existingFile={existingFile}
                    localFile={localFile}
                    inputId={inputId}
                    onPreview={onPreview}
                    onRemove={onRemove}
                />
            ) : (
                <label
                    htmlFor={inputId}
                    className="flex items-center gap-2 cursor-pointer px-3 py-1.5 border border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-white text-gray-500 hover:text-indigo-600 hover:border-indigo-300 transition-all text-xs w-full justify-center"
                >
                    <Upload size={14} className="pointer-events-none shrink-0" />
                    <span className="truncate pointer-events-none">{label}</span>
                </label>
            )}
        </div>
    );
}
