import { createContext, useContext } from "react";

/**
 * What a thread's title bar hands the host's controls in it (its actions): the way to open the
 * title as a field, as a click on the title does, or undefined when the title cannot be renamed.
 */
export const ThreadRenameContext = createContext<(() => void) | undefined>(undefined);

/**
 * Opens the title of the thread whose title bar holds the caller as a field, as a click on it
 * does; undefined outside a title bar, or where the host gave no way to rename.
 */
export function useThreadRename(): (() => void) | undefined {
  return useContext(ThreadRenameContext);
}
