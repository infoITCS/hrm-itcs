/**
 * Generates initials from a name or names.
 */
export const getInitials = (firstName?: string, lastName?: string, name?: string, email?: string): string => {
    // If we have both names, use them
    const f = firstName?.trim();
    const l = lastName?.trim();
    if (f && l) {
        return (f.charAt(0) + l.charAt(0)).toUpperCase();
    }
    if (f) return f.charAt(0).toUpperCase();
    if (l) return l.charAt(0).toUpperCase();
    
    // Fallback to name or email
    const fallback = name || email || '';
    if (!fallback) return '?';
    
    // Split by common separators
    const parts = fallback.split(/[ @._-]/).filter(Boolean);
    
    if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    
    return (parts[0]?.charAt(0) || '?').toUpperCase();
};
