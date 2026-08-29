import { useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import type { ComponentType } from 'react';
import {
    buildEntryFileType,
    listEducationAttachments,
    listExperienceAttachments,
    educationPrefix,
    experiencePrefix,
    EDUCATION_LABELS,
    EXPERIENCE_LABELS,
} from '../../utils/pimAttachmentKeys';

type EntryAttachmentsEditorProps = {
    entryKind: 'education' | 'experience';
    entryIndex: number;
    entryMeta?: { level?: string; institute?: string; companyName?: string; jobTitle?: string };
    attachments?: any[];
    stagedFiles: Array<{ type: string; file: File }>;
    onStageFile: (typeKey: string, file: File) => void;
    onRemoveStaged: (typeKey: string) => void;
    onDeleteSaved?: (attachmentId: string, fileName: string) => void;
    DocumentPreview: ComponentType<{
        typeKey: string;
        existingFile?: any;
        localFile?: File;
        onRemove: () => void;
        onPreview: (url: string, name: string, type: string) => void;
        inputId?: string;
    }>;
    onPreview: (url: string, name: string, type: string) => void;
};

export default function EntryAttachmentsEditor({
    entryKind,
    entryIndex,
    entryMeta,
    attachments,
    stagedFiles,
    onStageFile,
    onRemoveStaged,
    onDeleteSaved,
    DocumentPreview,
    onPreview,
}: EntryAttachmentsEditorProps) {
    const labelOptions = entryKind === 'education' ? EDUCATION_LABELS : EXPERIENCE_LABELS;
    const prefix = entryKind === 'education' ? educationPrefix(entryIndex) : experiencePrefix(entryIndex);

    const items = entryKind === 'education'
        ? listEducationAttachments(attachments, stagedFiles, entryIndex, entryMeta?.level)
        : listExperienceAttachments(attachments, stagedFiles, entryIndex, entryMeta?.companyName);

    const takenTypes = [
        ...(attachments || []).map((a) => a.fileType),
        ...stagedFiles.map((f) => f.type),
    ];

    const [draftRows, setDraftRows] = useState<Array<{ id: string; label: string }>>([]);

    const addDraftRow = () => {
        setDraftRows((rows) => [...rows, { id: `draft-${Date.now()}-${rows.length}`, label: labelOptions[0] }]);
    };

    const removeDraftRow = (id: string) => {
        setDraftRows((rows) => rows.filter((r) => r.id !== id));
    };

    const handleDraftUpload = (draftId: string, label: string, file: File) => {
        const typeKey = buildEntryFileType(prefix, label, takenTypes);
        onStageFile(typeKey, file);
        removeDraftRow(draftId);
    };

    return (
        <div className="md:col-span-2 mt-2 pt-3 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attachments</span>
                <button
                    type="button"
                    onClick={addDraftRow}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                    <Plus size={12} /> Add Attachment
                </button>
            </div>

            {items.length === 0 && draftRows.length === 0 && (
                <p className="text-xs text-gray-400 italic">No attachments yet — optional.</p>
            )}

            <div className="space-y-3">
                {items.map((item) => {
                    const inputId = `entry-file-${entryKind}-${entryIndex}-${item.typeKey.replace(/[^a-zA-Z0-9-]/g, '-')}`;
                    return (
                        <div key={item.typeKey} className="rounded-xl border border-gray-100 bg-slate-50/40 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-indigo-700">{item.label}</span>
                            </div>
                            <DocumentPreview
                                typeKey={item.typeKey}
                                existingFile={item.existingFile}
                                localFile={item.localFile}
                                inputId={inputId}
                                onPreview={onPreview}
                                onRemove={() => {
                                    if (item.localFile) onRemoveStaged(item.typeKey);
                                    else if (item.existingFile && onDeleteSaved) {
                                        onDeleteSaved(item.existingFile._id, item.existingFile.fileName);
                                    }
                                }}
                            />
                        </div>
                    );
                })}

                {draftRows.map((draft) => {
                    const inputId = `draft-file-${draft.id}`;
                    return (
                        <div key={draft.id} className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <select
                                    value={draft.label}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setDraftRows((rows) => rows.map((r) => (r.id === draft.id ? { ...r, label: val } : r)));
                                    }}
                                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-200 outline-none"
                                >
                                    {labelOptions.map((lbl) => (
                                        <option key={lbl} value={lbl}>{lbl}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => removeDraftRow(draft.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50"
                                    title="Cancel"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            <input
                                type="file"
                                id={inputId}
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleDraftUpload(draft.id, draft.label, file);
                                    e.target.value = '';
                                }}
                            />
                            <label
                                htmlFor={inputId}
                                className="flex items-center justify-center gap-2 cursor-pointer px-3 py-2 border border-dashed border-indigo-300 rounded-lg bg-white text-indigo-600 hover:bg-indigo-50 transition-all text-xs font-semibold"
                            >
                                <Upload size={14} />
                                Choose file
                            </label>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
