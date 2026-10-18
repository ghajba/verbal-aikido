import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { CATEGORY_GUIDE_RANGES } from '../src/engine/constants';
import {
  LOCALES,
  type CardCategory,
  type Scenario,
  type Catalog,
  type LocalizedText,
} from '../src/content/types';

interface Finding {
  file: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

const args = process.argv.slice(2);
const noCatalog = args.includes('--no-catalog');
const targetDirArg = args.find((a) => !a.startsWith('--')) || 'public/scenarios';
const targetDir = resolve(process.cwd(), targetDirArg);

if (!existsSync(targetDir)) {
  console.error(`Error: target directory ${targetDir} does not exist.`);
  process.exit(1);
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const scenarioSchemaPath = resolve(process.cwd(), 'schemas/scenario.schema.json');
const catalogSchemaPath = resolve(process.cwd(), 'schemas/catalog.schema.json');

const scenarioSchema = JSON.parse(readFileSync(scenarioSchemaPath, 'utf-8'));
const catalogSchema = JSON.parse(readFileSync(catalogSchemaPath, 'utf-8'));

const validateScenarioSchema = ajv.compile(scenarioSchema);
const validateCatalogSchema = ajv.compile(catalogSchema);

const findings: Finding[] = [];

function addFinding(
  file: string,
  code: string,
  message: string,
  severity: 'error' | 'warning' = 'error'
) {
  findings.push({ file: basename(file), code, message, severity });
}

// 1. Check catalog
let catalog: Catalog | null = null;
const catalogPath = resolve(targetDir, 'catalog.json');
if (!noCatalog) {
  if (!existsSync(catalogPath)) {
    addFinding('catalog.json', 'E016', 'catalog.json missing in validated folder');
  } else {
    try {
      const catData = JSON.parse(readFileSync(catalogPath, 'utf-8'));
      if (!validateCatalogSchema(catData)) {
        addFinding(
          'catalog.json',
          'E001',
          `Schema error: ${ajv.errorsText(validateCatalogSchema.errors)}`
        );
      } else {
        catalog = catData as Catalog;
      }
    } catch (e: any) {
      addFinding('catalog.json', 'E001', `JSON parse error: ${e.message}`);
    }
  }
}

// 2. Discover scenario files
const scenarioFiles = readdirSync(targetDir).filter(
  (f) => f.endsWith('.json') && f !== 'catalog.json'
);

const loadedScenarios: Map<string, Scenario> = new Map();

for (const file of scenarioFiles) {
  const filePath = resolve(targetDir, file);
  let rawJson: any;
  try {
    rawJson = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (e: any) {
    addFinding(file, 'E001', `Invalid JSON: ${e.message}`);
    continue;
  }

  // Schema validation
  const valid = validateScenarioSchema(rawJson);
  if (!valid && validateScenarioSchema.errors) {
    for (const err of validateScenarioSchema.errors) {
      const instPath = err.instancePath || '';
      if (
        instPath.endsWith('/hu') ||
        instPath.endsWith('/en') ||
        instPath.endsWith('/de') ||
        err.schemaPath.includes('localizedText')
      ) {
        addFinding(file, 'E018', `LocalizedText invalid at ${instPath}: ${err.message}`);
      } else {
        addFinding(file, 'E001', `Schema error at ${instPath}: ${err.message}`);
      }
    }
  }

  const sc = rawJson as Scenario;
  const expectedId = file.replace(/\.json$/, '');

  // E002: Scenario ID does not match filename
  if (sc.id !== expectedId) {
    addFinding(file, 'E002', `Scenario id '${sc.id}' does not match filename '${expectedId}'`);
  }

  loadedScenarios.set(expectedId, sc);

  // E014: Initial state
  if (sc.initialState) {
    const { escalation, grounding, confusion } = sc.initialState;
    if (escalation < 40 || escalation > 70 || grounding !== 100 || confusion !== 0) {
      addFinding(
        file,
        'E014',
        `initialState invalid: E=${escalation} (must be 40..70), F=${grounding} (must be 100), K=${confusion} (must be 0)`
      );
    }
  }

  // Length checks (E020) and text validation (E018, E019, W103, W105)
  function checkLocalizedText(
    fieldName: string,
    lt: LocalizedText,
    min: number,
    max: number,
    allowIdentical = false
  ) {
    if (!lt) return;
    for (const loc of LOCALES) {
      const val = lt[loc];
      if (typeof val !== 'string' || val.trim().length === 0) {
        addFinding(file, 'E018', `${fieldName}.${loc} is empty or whitespace`);
      } else if (val.length < min || val.length > max) {
        addFinding(
          file,
          'E020',
          `${fieldName}.${loc} length ${val.length} outside [${min}, ${max}]`
        );
      }
    }

    // E019: Placeholder match across locales
    const getVars = (s: string) => {
      const matches = s.match(/\{([a-z0-9_]+)\}/g) || [];
      return Array.from(new Set(matches.map((m) => m.slice(1, -1)))).sort();
    };
    const huVars = getVars(lt.hu || '');
    const enVars = getVars(lt.en || '');
    const deVars = getVars(lt.de || '');
    if (
      JSON.stringify(huVars) !== JSON.stringify(enVars) ||
      JSON.stringify(huVars) !== JSON.stringify(deVars)
    ) {
      addFinding(file, 'E019', `Placeholder mismatch across locales in ${fieldName}`);
    }

    // W105: Identical text check
    if (!allowIdentical && lt.hu && lt.en && lt.de) {
      if (lt.hu === lt.en || lt.hu === lt.de || lt.en === lt.de) {
        addFinding(file, 'W105', `Identical text in locales for ${fieldName}`, 'warning');
      }
    }
  }

  checkLocalizedText('title', sc.title, 3, 80);
  checkLocalizedText('summary', sc.summary, 10, 200);
  checkLocalizedText('briefing', sc.briefing, 20, 600);
  if (sc.npc) {
    checkLocalizedText('npc.name', sc.npc.name, 1, 40, true);
    checkLocalizedText('npc.role', sc.npc.role, 1, 60);
  }

  // W104: decisionTimeLimitSec set on non-ADVANCED
  if (sc.decisionTimeLimitSec !== undefined && sc.difficulty !== 'ADVANCED') {
    addFinding(
      file,
      'W104',
      `decisionTimeLimitSec is set on non-ADVANCED scenario (${sc.difficulty})`,
      'warning'
    );
  }

  // E015: Variables verification helper
  const scenarioVars = new Set(Object.keys(sc.variables || {}));
  scenarioVars.add('npc_name');

  function checkVarsInText(textLt: LocalizedText, nodeVars?: Record<string, LocalizedText>) {
    if (!textLt) return;
    const allowed = new Set(scenarioVars);
    if (nodeVars) {
      for (const k of Object.keys(nodeVars)) allowed.add(k);
    }
    for (const loc of LOCALES) {
      const str = textLt[loc] || '';
      const matches = str.match(/\{([a-z0-9_]+)\}/g) || [];
      for (const m of matches) {
        const v = m.slice(1, -1);
        if (!allowed.has(v)) {
          addFinding(file, 'E015', `Undefined variable '${v}' used in text`);
        }
      }
    }
  }

  if (sc.variables) {
    for (const [vName, vVal] of Object.entries(sc.variables)) {
      checkLocalizedText(`variables.${vName}`, vVal, 1, 60, true);
    }
  }

  // Node graph checks
  const nodeMap = new Map<string, any>();
  const cardIds = new Set<string>();
  const crisisNodes: any[] = [];
  let crisisEntryNode: any = null;

  if (Array.isArray(sc.nodes)) {
    for (const node of sc.nodes) {
      if (!node.nodeId) continue;
      // E003: Duplicate nodeId
      if (nodeMap.has(node.nodeId)) {
        addFinding(file, 'E003', `Duplicate nodeId '${node.nodeId}'`);
      }
      nodeMap.set(node.nodeId, node);

      const isCrisis = node.branch === 'crisis';
      if (isCrisis) {
        crisisNodes.push(node);
        if (node.nodeId.endsWith('_escalated_crisis')) {
          if (crisisEntryNode) {
            addFinding(file, 'E008', `Multiple crisis entry nodes ending _escalated_crisis`);
          }
          crisisEntryNode = node;
        }
      }

      checkLocalizedText(`nodes.${node.nodeId}.npcStatement`, node.npcStatement, 3, 280);
      checkVarsInText(node.npcStatement, node.variables);

      // Card pool checks
      const cards = node.availableCards || [];
      let constructiveCount = 0;
      let hasGuaranteeConst = false;
      let hasGuaranteeReact = false;

      for (const card of cards) {
        if (!card.cardId) continue;
        if (cardIds.has(card.cardId)) {
          addFinding(file, 'E004', `Duplicate cardId '${card.cardId}'`);
        }
        cardIds.add(card.cardId);

        checkLocalizedText(`nodes.${node.nodeId}.cards.${card.cardId}.text`, card.text, 3, 220);
        checkVarsInText(card.text, node.variables);

        // W103: Card text > 160 chars
        for (const loc of LOCALES) {
          if (card.text?.[loc]?.length > 160) {
            addFinding(
              file,
              'W103',
              `Card '${card.cardId}' ${loc} text length (${card.text[loc].length}) > 160`,
              'warning'
            );
          }
        }

        checkLocalizedText(
          `nodes.${node.nodeId}.cards.${card.cardId}.npcReaction`,
          card.npcReaction,
          1,
          280
        );
        checkVarsInText(card.npcReaction, node.variables);

        if (card.debriefHint) {
          checkLocalizedText(
            `nodes.${node.nodeId}.cards.${card.cardId}.debriefHint`,
            card.debriefHint,
            1,
            240
          );
        }

        const cat = card.category as CardCategory;
        if (cat === 'PACING' || cat === 'META_MODEL' || cat === 'REFRAMING') {
          constructiveCount++;
        }
        if (cat === 'PACING' || cat === 'META_MODEL') hasGuaranteeConst = true;
        if (cat === 'DEFENSE' || cat === 'ATTACK') hasGuaranteeReact = true;

        // W101: Guideline ranges
        const guide = CATEGORY_GUIDE_RANGES[cat];
        if (guide && card.delta) {
          const { escalation, grounding, confusion } = card.delta;
          if (escalation < guide.escalation.min || escalation > guide.escalation.max) {
            addFinding(
              file,
              'W101',
              `Card '${card.cardId}' (${cat}) ΔE=${escalation} outside guide [${guide.escalation.min}, ${guide.escalation.max}]`,
              'warning'
            );
          }
          if (grounding < guide.grounding.min || grounding > guide.grounding.max) {
            addFinding(
              file,
              'W101',
              `Card '${card.cardId}' (${cat}) ΔF=${grounding} outside guide [${guide.grounding.min}, ${guide.grounding.max}]`,
              'warning'
            );
          }
          if (confusion < guide.confusion.min || confusion > guide.confusion.max) {
            addFinding(
              file,
              'W101',
              `Card '${card.cardId}' (${cat}) ΔK=${confusion} outside guide [${guide.confusion.min}, ${guide.confusion.max}]`,
              'warning'
            );
          }
        }
      }

      // E013: Draw guarantee
      if (!hasGuaranteeConst || !hasGuaranteeReact) {
        addFinding(
          file,
          'E013',
          `Node '${node.nodeId}' card pool cannot satisfy draw guarantee (needs ≥1 PACING/META_MODEL and ≥1 DEFENSE/ATTACK)`
        );
      }

      // W102: Fewer than 2 constructive
      if (constructiveCount < 2) {
        addFinding(
          file,
          'W102',
          `Node '${node.nodeId}' card pool has fewer than 2 constructive cards`,
          'warning'
        );
      }
    }
  }

  // E005: startNodeId exists and is not crisis
  const startNode = nodeMap.get(sc.startNodeId);
  if (!startNode) {
    addFinding(file, 'E005', `startNodeId '${sc.startNodeId}' not found in nodes`);
  } else if (startNode.branch === 'crisis') {
    addFinding(file, 'E005', `startNodeId '${sc.startNodeId}' cannot be a crisis branch node`);
  }

  // E008: Crisis entry node check
  if (!crisisEntryNode) {
    addFinding(
      file,
      'E008',
      `Scenario must contain exactly one crisis node with nodeId ending with '_escalated_crisis'`
    );
  }

  // Graph traversal checks (E006, E007, E009, E010, E011, E012, E017)
  for (const node of nodeMap.values()) {
    const isCrisis = node.branch === 'crisis';
    for (const card of node.availableCards || []) {
      const nextId = card.nextNodeId;
      if (nextId === null) continue;
      const target = nodeMap.get(nextId);
      if (!target) {
        addFinding(file, 'E006', `Card '${card.cardId}' references missing nextNodeId '${nextId}'`);
        continue;
      }
      const targetIsCrisis = target.branch === 'crisis';
      if (!isCrisis && targetIsCrisis) {
        addFinding(
          file,
          'E007',
          `Main node '${node.nodeId}' card points into crisis node '${nextId}'`
        );
      }
      if (isCrisis && !targetIsCrisis) {
        addFinding(
          file,
          'E007',
          `Crisis node '${node.nodeId}' card points into main node '${nextId}'`
        );
      }
    }
  }

  // E009: Cycle detection in main and crisis
  function detectCycle(startId: string): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    function dfs(currId: string): boolean {
      visited.add(currId);
      recStack.add(currId);
      const currNode = nodeMap.get(currId);
      if (currNode) {
        for (const card of currNode.availableCards || []) {
          const next = card.nextNodeId;
          if (next && nodeMap.has(next)) {
            if (!visited.has(next)) {
              if (dfs(next)) return true;
            } else if (recStack.has(next)) {
              return true;
            }
          }
        }
      }
      recStack.delete(currId);
      return false;
    }

    return dfs(startId);
  }

  if (sc.startNodeId && detectCycle(sc.startNodeId)) {
    addFinding(file, 'E009', 'Cycle detected in main graph from startNodeId');
  }
  if (crisisEntryNode && detectCycle(crisisEntryNode.nodeId)) {
    addFinding(file, 'E009', 'Cycle detected in crisis subgraph');
  }

  // Reachability and path lengths in main branch (E010, E011)
  const reachableMain = new Set<string>();
  const pathLengths: number[] = [];

  function traverseMain(currId: string, depth: number) {
    reachableMain.add(currId);
    const currNode = nodeMap.get(currId);
    if (!currNode) return;
    let hasNext = false;
    for (const card of currNode.availableCards || []) {
      const next = card.nextNodeId;
      if (next && nodeMap.has(next) && nodeMap.get(next)?.branch !== 'crisis') {
        hasNext = true;
        traverseMain(next, depth + 1);
      }
    }
    if (!hasNext) {
      pathLengths.push(depth);
    }
  }

  if (sc.startNodeId && nodeMap.has(sc.startNodeId)) {
    traverseMain(sc.startNodeId, 1);
  }

  for (const node of nodeMap.values()) {
    if (node.branch !== 'crisis' && !reachableMain.has(node.nodeId)) {
      addFinding(file, 'E010', `Unreachable main node '${node.nodeId}'`);
    }
  }

  for (const len of pathLengths) {
    if (len < 3 || len > 7) {
      addFinding(file, 'E011', `Main branch path length ${len} is outside [3, 7]`);
      break;
    }
  }

  // Crisis depth and reachability (E008, E012, E017)
  if (crisisEntryNode) {
    const reachableCrisis = new Set<string>();
    const crisisDepths: number[] = [];
    let hasTerminal = false;

    function traverseCrisis(currId: string, depth: number) {
      reachableCrisis.add(currId);
      const currNode = nodeMap.get(currId);
      if (!currNode) return;
      let hasNext = false;
      for (const card of currNode.availableCards || []) {
        const next = card.nextNodeId;
        if (next === null) hasTerminal = true;
        if (next && nodeMap.has(next) && nodeMap.get(next)?.branch === 'crisis') {
          hasNext = true;
          traverseCrisis(next, depth + 1);
        }
      }
      if (!hasNext) {
        crisisDepths.push(depth);
      }
    }

    traverseCrisis(crisisEntryNode.nodeId, 1);

    for (const cn of crisisNodes) {
      if (!reachableCrisis.has(cn.nodeId)) {
        addFinding(file, 'E008', `Crisis node '${cn.nodeId}' is not reachable from crisis entry`);
      }
    }

    for (const depth of crisisDepths) {
      if (depth < 1 || depth > 3) {
        addFinding(file, 'E012', `Crisis depth ${depth} outside [1, 3]`);
        break;
      }
    }

    if (!hasTerminal) {
      addFinding(file, 'E017', 'Crisis branch has no path to terminal (nextNodeId null)');
    }
  }
}

// 3. Catalog cross-checks (E016)
if (catalog && !noCatalog) {
  const catalogScenarios = new Map<string, any>();
  for (const entry of catalog.scenarios) {
    catalogScenarios.set(entry.id, entry);
    if (!loadedScenarios.has(entry.id)) {
      addFinding(
        'catalog.json',
        'E016',
        `Catalog references missing scenario file for '${entry.id}'`
      );
    } else {
      const sc = loadedScenarios.get(entry.id)!;
      if (entry.contentVersion !== sc.contentVersion) {
        addFinding(
          'catalog.json',
          'E016',
          `contentVersion mismatch for '${entry.id}': catalog has ${entry.contentVersion}, scenario has ${sc.contentVersion}`
        );
      }
      if (entry.difficulty !== sc.difficulty) {
        addFinding(
          'catalog.json',
          'E016',
          `difficulty mismatch for '${entry.id}': catalog has ${entry.difficulty}, scenario has ${sc.difficulty}`
        );
      }
      if (entry.file !== `${entry.id}.json`) {
        addFinding(
          'catalog.json',
          'E016',
          `file property mismatch: expected '${entry.id}.json', got '${entry.file}'`
        );
      }
    }
  }

  for (const scId of loadedScenarios.keys()) {
    if (!catalogScenarios.has(scId)) {
      addFinding('catalog.json', 'E016', `Scenario '${scId}' missing from catalog.json`);
    }
  }
}

// 4. Output findings
let errorCount = 0;
let warningCount = 0;

for (const f of findings) {
  if (f.severity === 'error') {
    errorCount++;
    console.error(`${f.file}: ${f.code} ${f.message}`);
  } else {
    warningCount++;
    console.warn(`${f.file}: ${f.code} ${f.message}`);
  }
}

console.log(
  `\nValidation summary: ${loadedScenarios.size} scenario files, ${errorCount} errors, ${warningCount} warnings.`
);

if (errorCount > 0) {
  process.exit(1);
}

process.exit(0);
