"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

/**
 * Shares the Panda assistant sheet between the site header mascot and the
 * floating assistant button, so tapping either opens the same chat sheet.
 */
type AssistantContextValue = {
  open: boolean;
  openAssistant: () => void;
  closeAssistant: () => void;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openAssistant = useCallback(() => setOpen(true), []);
  const closeAssistant = useCallback(() => setOpen(false), []);
  return (
    <AssistantContext.Provider value={{ open, openAssistant, closeAssistant }}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) {
    throw new Error("useAssistant must be used within AssistantProvider");
  }
  return ctx;
}