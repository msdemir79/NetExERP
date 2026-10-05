import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** `text-label` ve `text-2xs` özel punto tokenları; kayıt edilmezse
    tailwind-merge bunları metin rengi sanıp `text-xs` ile çakıştırmıyor. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': ['text-label', 'text-2xs'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
