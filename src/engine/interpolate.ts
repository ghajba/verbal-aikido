import type { Locale, LocalizedText, Scenario, ScenarioNode } from '../content/types';

export function pick(text: LocalizedText, locale: Locale): string {
  if (!text) return '';
  return text[locale] || text.en || text.hu || '';
}

export function interpolate(
  text: LocalizedText,
  locale: Locale,
  scenario: Pick<Scenario, 'npc' | 'variables'>,
  node?: Pick<ScenarioNode, 'variables'>
): string {
  const template = pick(text, locale);
  if (!template) return '';

  return template.replace(/\{([a-z][a-z0-9_]*)\}/g, (match, varName: string) => {
    if (varName === 'npc_name') {
      return pick(scenario.npc.name, locale);
    }

    if (node?.variables?.[varName]) {
      return pick(node.variables[varName]!, locale);
    }

    if (scenario.variables?.[varName]) {
      return pick(scenario.variables[varName]!, locale);
    }

    return match; // Leave unknown variable literal as per Section 10.3
  });
}
