import { describe, it, expect, beforeEach } from 'vitest';
import { detectLocale, fmtNumber, setLocale, t } from '@/i18n/locale';
import { hu } from '@/i18n/hu';
import { en } from '@/i18n/en';
import { de } from '@/i18n/de';

describe('i18n (Translations & Localization)', () => {
  beforeEach(() => {
    setLocale('hu');
  });

  it('contains matching keys across hu, en, and de', () => {
    const huKeys = Object.keys(hu).sort();
    const enKeys = Object.keys(en).sort();
    const deKeys = Object.keys(de).sort();

    expect(enKeys).toEqual(huKeys);
    expect(deKeys).toEqual(huKeys);
  });

  it('translates simple strings and placeholders', () => {
    setLocale('hu');
    expect(t('app.name')).toBe('Verbális Aikidó');
    expect(t('home.best', { outcome: 'Áttörés' })).toBe('Legjobb: Áttörés');

    setLocale('en');
    expect(t('app.name')).toBe('Verbal Aikido');
    expect(t('home.best', { outcome: 'Breakthrough' })).toBe('Best: Breakthrough');

    setLocale('de');
    expect(t('app.name')).toBe('Verbales Aikido');
    expect(t('home.best', { outcome: 'Durchbruch' })).toBe('Bestes Ergebnis: Durchbruch');
  });

  it('leaves unknown placeholder literals unchanged and falls back to key if not found', () => {
    setLocale('en');
    expect(t('home.best')).toBe('Best: {outcome}');
    expect(t('nonexistent.key' as any)).toBe('nonexistent.key');
    expect(document.documentElement.lang).toBe('en');
  });

  it('detects locale from navigator.language', () => {
    const origNav = globalThis.navigator;

    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'hu-HU' },
      configurable: true,
      writable: true,
    });
    expect(detectLocale()).toBe('hu');

    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'de-DE' },
      configurable: true,
      writable: true,
    });
    expect(detectLocale()).toBe('de');

    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'fr-FR' },
      configurable: true,
      writable: true,
    });
    expect(detectLocale()).toBe('en');

    Object.defineProperty(globalThis, 'navigator', {
      value: origNav,
      configurable: true,
      writable: true,
    });
  });

  it('formats numbers by locale', () => {
    setLocale('hu');
    expect(fmtNumber(12.34, 1)).toBe('12,3');

    setLocale('en');
    expect(fmtNumber(12.34, 1)).toBe('12.3');

    setLocale('de');
    expect(fmtNumber(12.34, 1)).toBe('12,3');
  });
});
