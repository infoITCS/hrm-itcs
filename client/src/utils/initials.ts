export const getInitials = (f?: string, l?: string, n?: string, e?: string): string =>
    (f && l) ? (f[0] + l[0]).toUpperCase() : ((f || l || n || e || '?')[0]).toUpperCase();
