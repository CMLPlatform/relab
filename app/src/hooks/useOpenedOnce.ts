import { useState } from 'react';

/**
 * True from the first render where `open` is true onward. Lets a lazy dialog mount (and
 * fetch its chunk) on first open, then stay mounted so closing keeps its exit animation.
 */
export function useOpenedOnce(open: boolean) {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened || open;
}
