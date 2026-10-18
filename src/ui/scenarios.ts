import type { Scenario, Catalog } from '../content/types';
import catalogJson from '../../public/scenarios/catalog.json';
import pmScenario from '../../public/scenarios/scen_angry_pm_deadline_001.json';
import scopeScenario from '../../public/scenarios/scen_stakeholder_scope_002.json';
import refundScenario from '../../public/scenarios/scen_customer_refund_003.json';
import gaslightScenario from '../../public/scenarios/scen_customer_gaslight_004.json';

export const catalog: Catalog = catalogJson as unknown as Catalog;

const STATIC_SCENARIOS: Record<string, Scenario> = {
  scen_angry_pm_deadline_001: pmScenario as unknown as Scenario,
  scen_stakeholder_scope_002: scopeScenario as unknown as Scenario,
  scen_customer_refund_003: refundScenario as unknown as Scenario,
  scen_customer_gaslight_004: gaslightScenario as unknown as Scenario,
};

export async function loadScenario(scenarioId: string): Promise<Scenario> {
  const staticMatch = STATIC_SCENARIOS[scenarioId];
  if (staticMatch) {
    return staticMatch;
  }

  // Dynamic fallback for test scenarios or external additions
  const res = await fetch(`./scenarios/${scenarioId}.json`);
  if (!res.ok) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }
  return (await res.json()) as Scenario;
}
