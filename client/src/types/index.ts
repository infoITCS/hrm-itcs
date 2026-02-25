export type UserRole = 'super-admin' | 'admin' | 'manager' | 'employee' | string;

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
}
