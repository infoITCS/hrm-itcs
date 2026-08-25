export type UserRole = 'super-admin' | 'admin' | 'hr' | 'finance' | 'manager' | 'employee' | string;

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    avatar: string;
    _id?: string; // To support _id as well
    firstName?: string;
    lastName?: string;
    microsoftId?: string;
    hasProfile?: boolean;
    needsPasswordSetup?: boolean;
    permissions?: Record<string, boolean>;
    scopes?: Record<string, 'none' | 'employee' | 'manager' | 'admin' | string>;
    customPermissions?: Record<string, boolean>;
    customScopes?: Record<string, string>;
}
