// context/nav-overlay.tsx
import { createContext, useContext, useState } from "react";

const NavOverlayContext = createContext<{
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
} | null>(null);

export function NavOverlayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <NavOverlayContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        toggle: () => setIsOpen((v) => !v),
      }}
    >
      {children}
    </NavOverlayContext.Provider>
  );
}

export function useNavOverlay() {
  const ctx = useContext(NavOverlayContext);
  if (!ctx)
    throw new Error("useNavOverlay must be used within NavOverlayProvider");
  return ctx;
}
