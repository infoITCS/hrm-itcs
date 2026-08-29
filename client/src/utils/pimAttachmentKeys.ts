/** Attachment fileType keys for PIM education & experience entries */

export const EDUCATION_LABELS = ['Degree', 'Transcript', 'Certificate', 'Mark Sheet', 'Other'] as const;
export const EXPERIENCE_LABELS = ['Experience Letter', 'Relieving Letter', 'Payslip', 'Other'] as const;

export type EducationLabel = (typeof EDUCATION_LABELS)[number];
export type ExperienceLabel = (typeof EXPERIENCE_LABELS)[number];

export const educationPrefix = (idx: number) => `Education ${idx} - `;
export const experiencePrefix = (idx: number) => `Experience ${idx} - `;

export function buildEntryFileType(prefix: string, label: string, takenTypes: string[]): string {
    const base = `${prefix}${label}`;
    if (!takenTypes.includes(base)) return base;
    let n = 2;
    while (takenTypes.includes(`${base} ${n}`)) n++;
    return `${base} ${n}`;
}

export function parseEntryAttachmentLabel(fileType: string, prefix: string): string {
    if (!fileType.startsWith(prefix)) return fileType;
    return fileType.slice(prefix.length);
}

function legacyEducationKeys(idx: number, level?: string): string[] {
    return [
        `Degree - ${level || idx}`,
        `Degree - ${idx}`,
        `Transcript - ${level || idx}`,
        `Transcript - ${idx}`,
    ];
}

function legacyExperienceKeys(idx: number, companyName?: string): string[] {
    return [
        `Experience Letter - ${companyName || idx}`,
        `Experience Letter - ${idx}`,
    ];
}

export function belongsToEducationEntry(
    fileType: string,
    idx: number,
    level?: string
): boolean {
    if (fileType.startsWith(educationPrefix(idx))) return true;
    return legacyEducationKeys(idx, level).includes(fileType);
}

export function belongsToExperienceEntry(
    fileType: string,
    idx: number,
    companyName?: string
): boolean {
    if (fileType.startsWith(experiencePrefix(idx))) return true;
    return legacyExperienceKeys(idx, companyName).includes(fileType);
}

export interface EntryAttachmentItem {
    typeKey: string;
    label: string;
    existingFile?: any;
    localFile?: File;
}

export function listEducationAttachments(
    attachments: any[] | undefined,
    stagedFiles: Array<{ type: string; file: File }> | undefined,
    idx: number,
    level?: string
): EntryAttachmentItem[] {
    const prefix = educationPrefix(idx);
    const items: EntryAttachmentItem[] = [];
    const seen = new Set<string>();

    for (const att of attachments || []) {
        if (!belongsToEducationEntry(att.fileType, idx, level)) continue;
        if (seen.has(att.fileType)) continue;
        seen.add(att.fileType);
        items.push({
            typeKey: att.fileType,
            label: att.fileType.startsWith(prefix)
                ? parseEntryAttachmentLabel(att.fileType, prefix)
                : att.fileType.replace(/^Degree - /, 'Degree (legacy) — ').replace(/^Transcript - /, 'Transcript (legacy) — '),
            existingFile: att,
        });
    }

    for (const staged of stagedFiles || []) {
        if (!belongsToEducationEntry(staged.type, idx, level)) continue;
        if (seen.has(staged.type)) continue;
        seen.add(staged.type);
        items.push({
            typeKey: staged.type,
            label: staged.type.startsWith(prefix)
                ? parseEntryAttachmentLabel(staged.type, prefix)
                : staged.type,
            localFile: staged.file,
        });
    }

    return items;
}

export function listExperienceAttachments(
    attachments: any[] | undefined,
    stagedFiles: Array<{ type: string; file: File }> | undefined,
    idx: number,
    companyName?: string
): EntryAttachmentItem[] {
    const prefix = experiencePrefix(idx);
    const items: EntryAttachmentItem[] = [];
    const seen = new Set<string>();

    for (const att of attachments || []) {
        if (!belongsToExperienceEntry(att.fileType, idx, companyName)) continue;
        if (seen.has(att.fileType)) continue;
        seen.add(att.fileType);
        items.push({
            typeKey: att.fileType,
            label: att.fileType.startsWith(prefix)
                ? parseEntryAttachmentLabel(att.fileType, prefix)
                : 'Experience Letter (legacy)',
            existingFile: att,
        });
    }

    for (const staged of stagedFiles || []) {
        if (!belongsToExperienceEntry(staged.type, idx, companyName)) continue;
        if (seen.has(staged.type)) continue;
        seen.add(staged.type);
        items.push({
            typeKey: staged.type,
            label: staged.type.startsWith(prefix)
                ? parseEntryAttachmentLabel(staged.type, prefix)
                : staged.type,
            localFile: staged.file,
        });
    }

    return items;
}

export interface PimLinkOption {
    value: string;
    label: string;
}

export function buildPimLinkOptions(
    education: Array<{ level?: string; institute?: string }> = [],
    employmentHistory: Array<{ companyName?: string; jobTitle?: string }> = [],
    attachments: any[] = []
): PimLinkOption[] {
    const options: PimLinkOption[] = [
        { value: 'Other Documents', label: 'General / Other Document' },
        { value: 'Resume/CV', label: 'Resume / CV' },
    ];
    const seen = new Set<string>();

    const push = (value: string, label: string) => {
        if (seen.has(value)) return;
        seen.add(value);
        options.push({ value, label });
    };

    education.forEach((edu, idx) => {
        const title = [edu.level, edu.institute].filter(Boolean).join(' @ ') || `Education ${idx + 1}`;
        EDUCATION_LABELS.forEach((lbl) => push(`${educationPrefix(idx)}${lbl}`, `${title} — ${lbl}`));
        for (const att of attachments) {
            if (belongsToEducationEntry(att.fileType, idx, edu.level)) {
                const lbl = att.fileType.startsWith(educationPrefix(idx))
                    ? parseEntryAttachmentLabel(att.fileType, educationPrefix(idx))
                    : att.fileType;
                push(att.fileType, `${title} — ${lbl}`);
            }
        }
    });

    employmentHistory.forEach((eh, idx) => {
        const title = [eh.jobTitle, eh.companyName].filter(Boolean).join(' @ ') || `Experience ${idx + 1}`;
        EXPERIENCE_LABELS.forEach((lbl) => push(`${experiencePrefix(idx)}${lbl}`, `${title} — ${lbl}`));
        for (const att of attachments) {
            if (belongsToExperienceEntry(att.fileType, idx, eh.companyName)) {
                const lbl = att.fileType.startsWith(experiencePrefix(idx))
                    ? parseEntryAttachmentLabel(att.fileType, experiencePrefix(idx))
                    : att.fileType;
                push(att.fileType, `${title} — ${lbl}`);
            }
        }
    });

    return options;
}
