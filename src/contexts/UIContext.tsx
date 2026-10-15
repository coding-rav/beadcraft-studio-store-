import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
type Panel = 'cart' | 'wishlist' | 'menu' | null;
type Ctx = { panel: Panel; open(p: Exclude<Panel, null>): void; close(): void };
const C = createContext<Ctx>(null as any);
export const useUI = () => useContext(C);
export function UIProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null);
  const close = useCallback(() => setPanel(null), []);   // stable identity: Drawer effects depend on it
  const value = useMemo<Ctx>(() => ({ panel, open: setPanel, close }), [panel, close]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
