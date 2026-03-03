/**
 * Role-Based Access Control (RBAC)
 *
 * Defines permissions for each role and provides middleware-style
 * helper to check permissions in API routes.
 */

export type Role = 'admin' | 'analyst' | 'viewer';
export type Action = 'chat' | 'upload' | 'connect' | 'export' | 'manage_users' | 'view_audit';

const PERMISSIONS: Record<Role, Set<Action>> = {
  admin: new Set(['chat', 'upload', 'connect', 'export', 'manage_users', 'view_audit']),
  analyst: new Set(['chat', 'upload', 'connect', 'export']),
  viewer: new Set(['chat']),
};

/** All known roles */
export const ROLES = Object.keys(PERMISSIONS) as Role[];

/** Check whether a role has a given action permission */
export function hasPermission(role: Role | string | undefined, action: Action): boolean {
  if (!role || !(role in PERMISSIONS)) return false;
  return PERMISSIONS[role as Role].has(action);
}

/** Get all permissions for a role */
export function getPermissions(role: Role | string | undefined): Action[] {
  if (!role || !(role in PERMISSIONS)) return [];
  return Array.from(PERMISSIONS[role as Role]);
}

/** Validate that a string is a known role */
export function isValidRole(role: string): role is Role {
  return role in PERMISSIONS;
}
