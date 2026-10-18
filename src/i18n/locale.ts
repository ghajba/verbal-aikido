import { signal, type Signal } from '@preact/signals';
import type { Locale } from '../content/types';
import { de } from './de';
import { en } from './en';
import { hu } from './hu';

export type TranslationKey = keyof typeof hu;
export { pick } from '../engine/interpolate';

const tables: Record<Locale, Record<TranslationKey, string>> = {
  hu,
  en,
  de,
};

export function detectLocale(): Locale {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('hu')) return 'hu';
    if (lang.startsWith('de')) return 'de';
  }
  return 'en';
}

export const currentLocale: Signal<Locale> = signal<Locale>(detectLocale());

export function setLocale(locale: Locale): void {
  currentLocale.value = locale;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const table = tables[currentLocale.value] ?? tables.en;
  let text = table[key] ?? (key as string);

  if (vars) {
    text = text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, varName) => {
      if (vars[varName] !== undefined) {
        return String(vars[varName]);
      }
      return match;
    });
  }

  return text;
}

export function fmtNumber(n: number, decimals: number = 0): string {
  const loc =
    currentLocale.value === 'hu' ? 'hu-HU' : currentLocale.value === 'de' ? 'de-DE' : 'en-US';
  return n.toLocaleString(loc, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
