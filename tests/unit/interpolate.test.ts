import { describe, it, expect } from 'vitest';
import { interpolate, pick } from '@/engine/interpolate';

describe('Interpolation helper', () => {
  const scenario = {
    npc: {
      name: { hu: 'Dóra', en: 'Dora', de: 'Dora' },
      role: { hu: 'PM', en: 'PM', de: 'PM' },
    },
    variables: {
      trigger_word: { hu: 'határidő', en: 'deadline', de: 'Deadline' },
      team: { hu: 'csapat', en: 'team', de: 'Team' },
    },
  };

  it('pick selects the exact locale and falls back properly', () => {
    expect(pick(scenario.npc.name, 'hu')).toBe('Dóra');
    expect(pick(scenario.npc.name, 'en')).toBe('Dora');
    expect(pick(scenario.npc.name, 'de')).toBe('Dora');

    expect(pick(null as any, 'en')).toBe('');
    expect(pick({ hu: 'csak magyar' } as any, 'en')).toBe('csak magyar');
    expect(pick({} as any, 'en')).toBe('');
  });

  it('interpolate returns empty string for empty text', () => {
    expect(interpolate({ hu: '', en: '', de: '' }, 'en', scenario)).toBe('');
  });

  it('SBE-I18-004: interpolates {npc_name} and scenario variables per locale', () => {
    const text = {
      hu: '{npc_name} aggódik a {trigger_word} miatt.',
      en: '{npc_name} is worried about the {trigger_word}.',
      de: '{npc_name} sorgt sich wegen der {trigger_word}.',
    };

    expect(interpolate(text, 'hu', scenario)).toBe('Dóra aggódik a határidő miatt.');
    expect(interpolate(text, 'en', scenario)).toBe('Dora is worried about the deadline.');
    expect(interpolate(text, 'de', scenario)).toBe('Dora sorgt sich wegen der Deadline.');
  });

  it('SBE-I18-005: node variable overrides scenario variable', () => {
    const text = {
      hu: 'A {team} készen áll.',
      en: 'The {team} is ready.',
      de: 'Das {team} ist bereit.',
    };

    const node = {
      variables: {
        team: { hu: 'fejlesztői csapat', en: 'dev team', de: 'Entwicklerteam' },
      },
    };

    expect(interpolate(text, 'hu', scenario, node)).toBe('A fejlesztői csapat készen áll.');
    expect(interpolate(text, 'en', scenario, node)).toBe('The dev team is ready.');
  });

  it('leaves unknown placeholders literal without error', () => {
    const text = {
      hu: 'Ismeretlen {unknown_var} maradt.',
      en: 'Unknown {unknown_var} remained.',
      de: 'Unbekannte {unknown_var} blieb.',
    };

    expect(interpolate(text, 'en', scenario)).toBe('Unknown {unknown_var} remained.');
  });
});
