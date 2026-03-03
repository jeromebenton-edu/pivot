import { describe, it, expect } from 'vitest';
import { hasPermission, getPermissions, isValidRole, ROLES, type Role, type Action } from '../rbac';

describe('RBAC', () => {
  describe('ROLES', () => {
    it('includes admin, analyst, and viewer', () => {
      expect(ROLES).toContain('admin');
      expect(ROLES).toContain('analyst');
      expect(ROLES).toContain('viewer');
      expect(ROLES).toHaveLength(3);
    });
  });

  describe('hasPermission', () => {
    // Admin has all permissions
    it.each<Action>(['chat', 'upload', 'connect', 'export', 'manage_users', 'view_audit'])(
      'admin has %s permission',
      (action) => {
        expect(hasPermission('admin', action)).toBe(true);
      }
    );

    // Analyst permissions
    it.each<Action>(['chat', 'upload', 'connect', 'export'])(
      'analyst has %s permission',
      (action) => {
        expect(hasPermission('analyst', action)).toBe(true);
      }
    );

    it.each<Action>(['manage_users', 'view_audit'])(
      'analyst does NOT have %s permission',
      (action) => {
        expect(hasPermission('analyst', action)).toBe(false);
      }
    );

    // Viewer permissions
    it('viewer has chat permission', () => {
      expect(hasPermission('viewer', 'chat')).toBe(true);
    });

    it.each<Action>(['upload', 'connect', 'export', 'manage_users', 'view_audit'])(
      'viewer does NOT have %s permission',
      (action) => {
        expect(hasPermission('viewer', action)).toBe(false);
      }
    );

    // Edge cases
    it('returns false for undefined role', () => {
      expect(hasPermission(undefined, 'chat')).toBe(false);
    });

    it('returns false for unknown role', () => {
      expect(hasPermission('superuser', 'chat')).toBe(false);
    });

    it('returns false for empty string role', () => {
      expect(hasPermission('', 'chat')).toBe(false);
    });
  });

  describe('getPermissions', () => {
    it('returns all actions for admin', () => {
      const perms = getPermissions('admin');
      expect(perms).toContain('chat');
      expect(perms).toContain('upload');
      expect(perms).toContain('connect');
      expect(perms).toContain('export');
      expect(perms).toContain('manage_users');
      expect(perms).toContain('view_audit');
      expect(perms).toHaveLength(6);
    });

    it('returns limited actions for analyst', () => {
      const perms = getPermissions('analyst');
      expect(perms).toHaveLength(4);
      expect(perms).not.toContain('manage_users');
    });

    it('returns only chat for viewer', () => {
      expect(getPermissions('viewer')).toEqual(['chat']);
    });

    it('returns empty array for unknown role', () => {
      expect(getPermissions('unknown')).toEqual([]);
    });

    it('returns empty array for undefined', () => {
      expect(getPermissions(undefined)).toEqual([]);
    });
  });

  describe('isValidRole', () => {
    it.each<Role>(['admin', 'analyst', 'viewer'])(
      'recognizes %s as valid',
      (role) => {
        expect(isValidRole(role)).toBe(true);
      }
    );

    it('rejects unknown roles', () => {
      expect(isValidRole('superuser')).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole('ADMIN')).toBe(false);
    });
  });
});
