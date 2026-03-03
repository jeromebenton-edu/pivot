'use client';

import { type ReactNode } from 'react';

// Better Auth uses nano-stores — no session provider needed.
// This component is kept as a pass-through for layout compatibility.
export default function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
