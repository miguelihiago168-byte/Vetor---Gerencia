import { useEffect } from 'react';

const isModalBackdrop = (target) => {
  if (!(target instanceof Element)) return false;

  return Array.from(target.classList).some((className) => (
    (/(modal|dialog)/i.test(className) && /(overlay|backdrop)$/i.test(className))
    || /(^|-)lightbox$/i.test(className)
  ));
};

/**
 * Prevents accidental dismissal when the user clicks a modal backdrop.
 * Explicit close, cancel, and confirmation controls continue to work normally.
 */
export default function ModalBackdropGuard() {
  useEffect(() => {
    const preventBackdropDismiss = (event) => {
      if (isModalBackdrop(event.target)) event.stopPropagation();
    };

    document.addEventListener('click', preventBackdropDismiss, true);
    return () => document.removeEventListener('click', preventBackdropDismiss, true);
  }, []);

  return null;
}
