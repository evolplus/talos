#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const RULES_SOURCE = path.join(PLUGIN_ROOT, 'rules', 'CLAUDE.md');
const SETTINGS_SOURCE = path.join(PLUGIN_ROOT, 'settings', 'original-settings.json');
const HOOKS_SOURCE = path.join(PLUGIN_ROOT, 'hooks');
const INIT_RECEIPT_REL = path.join('.claude', 'hooks', '.state', 'sdlc-init-receipt.json');

const INSTRUCTION_TARGETS = {
  codex: {
    fileName: 'AGENTS.md',
    begin: '<!-- BEGIN EVO-SDLC-DEVKIT AGENTS.md -->',
    end: '<!-- END EVO-SDLC-DEVKIT AGENTS.md -->',
  },
  claude: {
    fileName: 'CLAUDE.md',
    begin: '<!-- BEGIN EVO-SDLC-DEVKIT CLAUDE.md -->',
    end: '<!-- END EVO-SDLC-DEVKIT CLAUDE.md -->',
  },
};

function usage() {
  return [
    'Usage: node scripts/sdlc-init.cjs [options]',
    '',
    'Options:',
    '  --project <path>     Project root to initialize. Defaults to CODEX_PROJECT_DIR, CLAUDE_PROJECT_DIR, or cwd.',
    '  --target <name>      Override auto-detected runtime: codex, claude, or both.',
    '  --dry-run            Print planned changes without writing files.',
    '  --force-hooks        Replace conflicting project hook files with plugin hook files.',
    '  --skip-agents        Do not update AGENTS.md / CLAUDE.md instructions.',
    '  --skip-claude        Deprecated alias for --skip-agents.',
    '  --skip-settings      Do not update .claude/settings.json (Claude target only).',
    '  --skip-hooks         Do not copy hook scripts into .claude/hooks (Claude target only).',
    '  --help               Show this help.',
  ].join('\n');
}

function firstEnvValue(env, names) {
  for (const name of names) {
    if (env[name]) {
      return { name, value: env[name] };
    }
  }
  return null;
}

function defaultProjectRoot(env) {
  const codexProject = firstEnvValue(env, ['CODEX_PROJECT_DIR']);
  if (codexProject) {
    return { path: codexProject.value, source: codexProject.name };
  }

  const claudeProject = firstEnvValue(env, ['CLAUDE_PROJECT_DIR']);
  if (claudeProject) {
    return { path: claudeProject.value, source: claudeProject.name };
  }

  return { path: process.cwd(), source: 'cwd' };
}

function parseArgs(argv) {
  const defaultRoot = defaultProjectRoot(process.env);
  const options = {
    projectRoot: defaultRoot.path,
    projectRootSource: defaultRoot.source,
    target: null,
    targetExplicit: false,
    dryRun: false,
    forceHooks: false,
    skipAgents: false,
    skipSettings: false,
    skipHooks: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--project') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--project requires a path');
      }
      options.projectRoot = value;
      options.projectRootSource = 'argument';
      i += 1;
    } else if (arg === '--target') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--target requires codex, claude, or both');
      }
      if (!['codex', 'claude', 'both'].includes(value)) {
        throw new Error(`Unsupported --target value: ${value}. Expected codex, claude, or both.`);
      }
      options.target = value;
      options.targetExplicit = true;
      i += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force-hooks') {
      options.forceHooks = true;
    } else if (arg === '--skip-agents') {
      options.skipAgents = true;
    } else if (arg === '--skip-claude') {
      options.skipAgents = true;
    } else if (arg === '--skip-settings') {
      options.skipSettings = true;
    } else if (arg === '--skip-hooks') {
      options.skipHooks = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.projectRoot = path.resolve(options.projectRoot);
  options.receiptFiles = new Map();
  resolveTarget(options);
  return options;
}

function createResult(options) {
  return {
    dryRun: options.dryRun,
    target: options.target,
    targetDetection: options.targetDetection,
    changes: [],
    unchanged: [],
    warnings: [],
    errors: [],
  };
}

function hasEnvPrefix(env, prefix) {
  return Object.keys(env).some((name) => name.startsWith(prefix) && Boolean(env[name]));
}

function markerExists(projectRoot, rel) {
  try {
    return fs.existsSync(path.join(projectRoot, rel));
  } catch {
    return false;
  }
}

function detectAgentTarget(options, env = process.env) {
  const claudeEnvSignals = [
    firstEnvValue(env, ['CLAUDE_PLUGIN_ROOT', 'CLAUDE_PROJECT_DIR', 'CLAUDE_CODE', 'CLAUDECODE']),
  ].filter(Boolean);

  if (claudeEnvSignals.length > 0) {
    const signal = claudeEnvSignals[0].name;
    return {
      target: 'claude',
      source: 'environment',
      reason: `${signal} detected`,
    };
  }

  const codexEnvSignals = [
    firstEnvValue(env, ['CODEX_PROJECT_DIR', 'CODEX_SHELL', 'CODEX_THREAD_ID', 'CODEX_HOME', 'CODEX_SANDBOX']),
  ].filter(Boolean);

  if (
    codexEnvSignals.length > 0 ||
    hasEnvPrefix(env, 'CODEX_') ||
    env.__CFBundleIdentifier === 'com.openai.codex' ||
    String(env.PATH || '').includes('/Codex.app/')
  ) {
    const signal = codexEnvSignals[0]
      ? codexEnvSignals[0].name
      : env.__CFBundleIdentifier === 'com.openai.codex'
        ? '__CFBundleIdentifier=com.openai.codex'
        : 'CODEX_*';
    return {
      target: 'codex',
      source: 'environment',
      reason: `${signal} detected`,
    };
  }

  const codexMarkers = ['AGENTS.md', '.codex', '.agents'].filter((rel) => markerExists(options.projectRoot, rel));
  const claudeMarkers = ['CLAUDE.md', '.claude'].filter((rel) => markerExists(options.projectRoot, rel));

  if (codexMarkers.length > 0 && claudeMarkers.length === 0) {
    return {
      target: 'codex',
      source: 'project-markers',
      reason: `${codexMarkers.join(', ')} detected`,
    };
  }

  if (claudeMarkers.length > 0 && codexMarkers.length === 0) {
    return {
      target: 'claude',
      source: 'project-markers',
      reason: `${claudeMarkers.join(', ')} detected`,
    };
  }

  if (codexMarkers.length > 0 && claudeMarkers.length > 0) {
    return {
      target: 'both',
      source: 'project-markers',
      reason: `${codexMarkers.join(', ')} and ${claudeMarkers.join(', ')} detected`,
      warning:
        'Could not detect an active agent environment, but both Codex and Claude project markers exist; updating both targets. Use --target codex or --target claude to override.',
    };
  }

  return {
    target: 'codex',
    source: 'fallback',
    reason: 'no agent environment or project marker detected',
    warning:
      'Could not detect the active agent tool from environment or project markers; defaulted to Codex. Use --target claude or --target both to override.',
  };
}

function resolveTarget(options) {
  if (options.targetExplicit) {
    options.targetDetection = {
      target: options.target,
      source: 'argument',
      reason: `--target ${options.target}`,
    };
    return;
  }

  options.targetDetection = detectAgentTarget(options);
  options.target = options.targetDetection.target;
}

function recordChange(result, message) {
  result.changes.push(message);
}

function recordUnchanged(result, message) {
  result.unchanged.push(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stable(value) {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = stable(value[key]);
    }
    return out;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stable(value));
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeText(file, content, options) {
  if (options.dryRun) {
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  recordInstallReceiptFile(options, file);
}

function relativeToProject(file, projectRoot) {
  const rel = path.relative(projectRoot, file);
  return rel || '.';
}

function relativeToProjectPosix(file, projectRoot) {
  return relativeToProject(file, projectRoot).split(path.sep).join('/');
}

function sha256File(file) {
  const buf = fs.readFileSync(file);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isSecurityAuditSensitivePath(relPosix) {
  if (relPosix === 'CLAUDE.md') {
    return true;
  }
  if (relPosix === '.claude/settings.json' || relPosix === '.claude/settings.local.json') {
    return true;
  }
  if (relPosix.startsWith('.claude/hooks/') && !relPosix.startsWith('.claude/hooks/.state/')) {
    return true;
  }
  if (relPosix.startsWith('.claude/agents/') || relPosix.startsWith('.claude/rules/')) {
    return true;
  }
  return false;
}

function recordInstallReceiptFile(options, file) {
  if (options.dryRun || !options.receiptFiles) {
    return;
  }
  const resolved = path.resolve(file);
  const rel = relativeToProjectPosix(resolved, options.projectRoot);
  if (rel.startsWith('..') || path.isAbsolute(rel) || !isSecurityAuditSensitivePath(rel)) {
    return;
  }
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return;
    }
    options.receiptFiles.set(rel, {
      path: rel,
      sha256: sha256File(resolved),
      size: stat.size,
    });
  } catch {
    // The receipt is a best-effort audit hint; install correctness is handled elsewhere.
  }
}

function writeInstallReceipt(options) {
  if (options.dryRun || !options.receiptFiles || options.receiptFiles.size === 0) {
    return;
  }

  const receiptPath = path.join(options.projectRoot, INIT_RECEIPT_REL);
  const receipt = {
    tool: 'evo-talos-sdlc-init',
    version: 1,
    createdAt: new Date().toISOString(),
    projectRoot: options.projectRoot,
    files: Array.from(options.receiptFiles.values()).sort((a, b) => a.path.localeCompare(b.path)),
  };

  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function normalizeHeading(text) {
  return text
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/[`*_{}[\]()#+.!:|>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractHeadings(content) {
  const headings = new Map();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) {
      continue;
    }
    const label = match[2].trim();
    const normalized = normalizeHeading(label);
    if (!normalized) {
      continue;
    }
    if (!headings.has(normalized)) {
      headings.set(normalized, label);
    }
  }
  return headings;
}

function findManagedBlock(content, markers) {
  const begin = content.indexOf(markers.begin);
  const end = content.indexOf(markers.end);

  if (begin === -1 && end === -1) {
    return { state: 'absent' };
  }
  if (begin === -1 || end === -1 || end < begin) {
    return { state: 'malformed' };
  }

  const blockEnd = end + markers.end.length;
  const secondBegin = content.indexOf(markers.begin, begin + markers.begin.length);
  const secondEnd = content.indexOf(markers.end, blockEnd);
  if (secondBegin !== -1 || secondEnd !== -1) {
    return { state: 'multiple' };
  }

  return { state: 'present', begin, end: blockEnd };
}

function makeManagedInstructionsBlock(source, markers) {
  return `${markers.begin}\n${source.trim()}\n${markers.end}\n`;
}

function warnForHeadingConflicts(result, targetContent, sourceContent, targetFileName, markers) {
  const block = findManagedBlock(targetContent, markers);
  let unmanaged = targetContent;
  if (block.state === 'present') {
    unmanaged = `${targetContent.slice(0, block.begin)}\n${targetContent.slice(block.end)}`;
  }

  const targetHeadings = extractHeadings(unmanaged);
  const sourceHeadings = extractHeadings(sourceContent);
  const duplicates = [];

  for (const [key, label] of sourceHeadings.entries()) {
    if (targetHeadings.has(key)) {
      duplicates.push(label);
    }
  }

  if (duplicates.length > 0) {
    const preview = duplicates.slice(0, 8).join(', ');
    const suffix = duplicates.length > 8 ? `, and ${duplicates.length - 8} more` : '';
    result.warnings.push(
      `${targetFileName} may contain overlapping sections also supplied by the plugin: ${preview}${suffix}. Review the managed block against existing project rules.`
    );
  }
}

function instructionTargets(options) {
  if (options.target === 'both') {
    return ['codex', 'claude'];
  }
  return [options.target];
}

function injectInstructionTarget(options, result, targetName) {
  const targetConfig = INSTRUCTION_TARGETS[targetName];
  if (!targetConfig) {
    result.errors.push(`Unsupported instruction target: ${targetName}`);
    return;
  }

  if (options.skipAgents) {
    recordUnchanged(result, `Skipped ${targetConfig.fileName} injection.`);
    return;
  }

  if (!fs.existsSync(RULES_SOURCE)) {
    result.errors.push(`Plugin rules source not found: ${RULES_SOURCE}`);
    return;
  }

  const source = readText(RULES_SOURCE);
  const target = path.join(options.projectRoot, targetConfig.fileName);
  const managedBlock = makeManagedInstructionsBlock(source, targetConfig);

  if (!fs.existsSync(target)) {
    writeText(target, managedBlock, options);
    recordChange(result, `${options.dryRun ? 'Would create' : 'Created'} ${relativeToProject(target, options.projectRoot)}.`);
    return;
  }

  const current = readText(target);
  warnForHeadingConflicts(result, current, source, targetConfig.fileName, targetConfig);

  const block = findManagedBlock(current, targetConfig);
  if (block.state === 'malformed' || block.state === 'multiple') {
    result.errors.push(
      `Could not safely update ${relativeToProject(target, options.projectRoot)} because managed markers are ${block.state}.`
    );
    return;
  }

  let next;
  let appliedAction;
  let plannedAction;
  if (block.state === 'present') {
    next = `${current.slice(0, block.begin)}${managedBlock}${current.slice(block.end).replace(/^\n+/, '')}`;
    appliedAction = 'Updated managed devkit block in';
    plannedAction = 'Would update managed devkit block in';
  } else {
    const sourceTrimmed = source.trim();
    const existingSourceIndex = current.indexOf(sourceTrimmed);
    if (existingSourceIndex !== -1) {
      next = `${current.slice(0, existingSourceIndex)}${managedBlock}${current.slice(existingSourceIndex + sourceTrimmed.length).replace(/^\n+/, '')}`;
      appliedAction = 'Wrapped existing devkit content with managed markers in';
      plannedAction = 'Would wrap existing devkit content with managed markers in';
      result.warnings.push(
        `${targetConfig.fileName} already contained the plugin rules without managed markers; converted that copy into a managed block.`
      );
    } else {
      next = `${current.replace(/\s*$/, '')}\n\n${managedBlock}`;
      appliedAction = 'Appended managed devkit block to';
      plannedAction = 'Would append managed devkit block to';
    }
  }

  if (next === current) {
    recordUnchanged(result, `${relativeToProject(target, options.projectRoot)} already contains the current managed devkit block.`);
    return;
  }

  writeText(target, next, options);
  recordChange(result, `${options.dryRun ? plannedAction : appliedAction} ${relativeToProject(target, options.projectRoot)}.`);
}

function injectProjectInstructions(options, result) {
  for (const targetName of instructionTargets(options)) {
    injectInstructionTarget(options, result, targetName);
  }
}

function parseJsonFile(file, label) {
  try {
    return { value: JSON.parse(readText(file)) };
  } catch (error) {
    return { error: `${label} is not valid JSON: ${error.message}` };
  }
}

function hookGroupKey(group) {
  const copy = {};
  for (const key of Object.keys(group).sort()) {
    if (key !== 'hooks') {
      copy[key] = group[key];
    }
  }
  return stableStringify(copy);
}

function mergeHooks(target, source, result) {
  let changed = false;

  if (!isPlainObject(target)) {
    result.warnings.push('settings conflict at hooks; project value is not an object, so plugin hooks were not applied.');
    return false;
  }
  if (!isPlainObject(source)) {
    result.warnings.push('plugin original settings hooks are not an object; hooks were not applied.');
    return false;
  }

  for (const eventName of Object.keys(source)) {
    const sourceGroups = source[eventName];
    if (!Array.isArray(sourceGroups)) {
      result.warnings.push(`plugin original settings hooks.${eventName} is not an array; skipped.`);
      continue;
    }

    if (!(eventName in target)) {
      target[eventName] = clone(sourceGroups);
      changed = true;
      continue;
    }

    const targetGroups = target[eventName];
    if (!Array.isArray(targetGroups)) {
      result.warnings.push(
        `settings conflict at hooks.${eventName}; project value is not an array, so plugin hooks for this event were not applied.`
      );
      continue;
    }

    for (const sourceGroup of sourceGroups) {
      if (!isPlainObject(sourceGroup)) {
        result.warnings.push(`plugin original settings hooks.${eventName} contains a non-object group; skipped.`);
        continue;
      }

      const sourceKey = hookGroupKey(sourceGroup);
      const sourceGroupString = stableStringify(sourceGroup);
      const exactGroup = targetGroups.find((candidate) => stableStringify(candidate) === sourceGroupString);
      if (exactGroup) {
        continue;
      }

      const compatibleGroups = targetGroups.filter(
        (candidate) => isPlainObject(candidate) && hookGroupKey(candidate) === sourceKey
      );

      const sourceHookKeys = new Set((sourceGroup.hooks || []).map(stableStringify));
      const coveringGroup = compatibleGroups.find((candidate) => {
        if (!Array.isArray(candidate.hooks)) {
          return false;
        }
        const candidateHookKeys = new Set(candidate.hooks.map(stableStringify));
        return Array.from(sourceHookKeys).every((hookKey) => candidateHookKeys.has(hookKey));
      });
      if (coveringGroup) {
        continue;
      }

      if (compatibleGroups.length === 0) {
        targetGroups.push(clone(sourceGroup));
        changed = true;
        continue;
      }

      if (compatibleGroups.length > 1) {
        targetGroups.push(clone(sourceGroup));
        changed = true;
        continue;
      }

      const targetGroup = compatibleGroups[0];
      if (!Array.isArray(targetGroup.hooks)) {
        result.warnings.push(
          `settings conflict at hooks.${eventName}; an existing matching hook group has non-array hooks, so plugin hooks for that group were not applied.`
        );
        continue;
      }

      const existingHookKeys = new Set(targetGroup.hooks.map(stableStringify));
      for (const hook of sourceGroup.hooks || []) {
        const key = stableStringify(hook);
        if (!existingHookKeys.has(key)) {
          targetGroup.hooks.push(clone(hook));
          existingHookKeys.add(key);
          changed = true;
        }
      }
    }
  }

  return changed;
}

function settingPath(parts) {
  return parts.join('.');
}

function mergeSettingsObject(target, source, pathParts, result) {
  let changed = false;

  for (const key of Object.keys(source)) {
    const nextPath = pathParts.concat(key);
    const targetHasKey = Object.prototype.hasOwnProperty.call(target, key);

    if (!targetHasKey) {
      target[key] = clone(source[key]);
      changed = true;
      continue;
    }

    const targetValue = target[key];
    const sourceValue = source[key];

    if (stableStringify(targetValue) === stableStringify(sourceValue)) {
      continue;
    }

    if (pathParts.length === 0 && key === 'hooks') {
      if (mergeHooks(targetValue, sourceValue, result)) {
        changed = true;
      }
      continue;
    }

    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      if (mergeSettingsObject(targetValue, sourceValue, nextPath, result)) {
        changed = true;
      }
      continue;
    }

    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      const existing = new Set(targetValue.map(stableStringify));
      for (const item of sourceValue) {
        const keyString = stableStringify(item);
        if (!existing.has(keyString)) {
          targetValue.push(clone(item));
          existing.add(keyString);
          changed = true;
        }
      }
      continue;
    }

    result.warnings.push(
      `settings conflict at ${settingPath(nextPath)}; kept the project value and did not overwrite it with the plugin original setting.`
    );
  }

  return changed;
}

function injectSettings(options, result) {
  if (options.skipSettings) {
    recordUnchanged(result, 'Skipped .claude/settings.json injection.');
    return;
  }

  if (!fs.existsSync(SETTINGS_SOURCE)) {
    result.errors.push(`Plugin original settings source not found: ${SETTINGS_SOURCE}`);
    return;
  }

  const sourceParsed = parseJsonFile(SETTINGS_SOURCE, 'Plugin original settings');
  if (sourceParsed.error) {
    result.errors.push(sourceParsed.error);
    return;
  }

  const target = path.join(options.projectRoot, '.claude', 'settings.json');
  let targetSettings = {};

  if (fs.existsSync(target)) {
    const targetParsed = parseJsonFile(target, relativeToProject(target, options.projectRoot));
    if (targetParsed.error) {
      result.errors.push(`${targetParsed.error}. Settings were not changed.`);
      return;
    }
    if (!isPlainObject(targetParsed.value)) {
      result.errors.push(`${relativeToProject(target, options.projectRoot)} must contain a JSON object. Settings were not changed.`);
      return;
    }
    targetSettings = targetParsed.value;
  }

  if (!isPlainObject(sourceParsed.value)) {
    result.errors.push('Plugin original settings must contain a JSON object. Settings were not changed.');
    return;
  }

  const nextSettings = clone(targetSettings);
  const changed = mergeSettingsObject(nextSettings, sourceParsed.value, [], result);

  if (!changed && fs.existsSync(target)) {
    recordUnchanged(result, `${relativeToProject(target, options.projectRoot)} already contains the plugin original settings.`);
    return;
  }

  const nextText = `${JSON.stringify(nextSettings, null, 2)}\n`;
  writeText(target, nextText, options);
  recordChange(result, `${options.dryRun ? 'Would update' : 'Updated'} ${relativeToProject(target, options.projectRoot)}.`);
}

function listHookFiles(root) {
  const files = [];
  const ignoredDirs = new Set(['tests', '.state']);
  const ignoredFiles = new Set(['hooks.json', '.DS_Store']);

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
        continue;
      }

      if (!entry.isFile() || ignoredFiles.has(entry.name)) {
        continue;
      }

      files.push(path.join(dir, entry.name));
    }
  }

  walk(root);
  return files.sort();
}

function buffersEqual(left, right) {
  return left.length === right.length && left.equals(right);
}

function copyHookFile(source, target, options) {
  if (options.dryRun) {
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  recordInstallReceiptFile(options, target);
}

function injectHooks(options, result) {
  if (options.skipHooks) {
    recordUnchanged(result, 'Skipped hook script copy.');
    return;
  }

  if (!fs.existsSync(HOOKS_SOURCE)) {
    result.errors.push(`Plugin hooks source not found: ${HOOKS_SOURCE}`);
    return;
  }

  const targetRoot = path.join(options.projectRoot, '.claude', 'hooks');
  let copied = 0;
  let replaced = 0;
  let identical = 0;

  for (const sourceFile of listHookFiles(HOOKS_SOURCE)) {
    const rel = path.relative(HOOKS_SOURCE, sourceFile);
    const targetFile = path.join(targetRoot, rel);

    if (!fs.existsSync(targetFile)) {
      copyHookFile(sourceFile, targetFile, options);
      copied += 1;
      continue;
    }

    const sourceBuffer = fs.readFileSync(sourceFile);
    const targetBuffer = fs.readFileSync(targetFile);
    if (buffersEqual(sourceBuffer, targetBuffer)) {
      identical += 1;
      continue;
    }

    if (options.forceHooks) {
      copyHookFile(sourceFile, targetFile, options);
      replaced += 1;
      result.warnings.push(`Replaced conflicting hook file ${relativeToProject(targetFile, options.projectRoot)}.`);
    } else {
      result.warnings.push(
        `Hook file conflict at ${relativeToProject(targetFile, options.projectRoot)}; kept the project file. Re-run with --force-hooks to replace it.`
      );
    }
  }

  if (copied > 0 || replaced > 0) {
    const parts = [];
    if (copied > 0) {
      parts.push(`${copied} copied`);
    }
    if (replaced > 0) {
      parts.push(`${replaced} replaced`);
    }
    recordChange(result, `${options.dryRun ? 'Would sync' : 'Synced'} hook scripts to .claude/hooks (${parts.join(', ')}).`);
  } else {
    recordUnchanged(result, `Hook scripts already present (${identical} unchanged).`);
  }
}

function printResult(projectRoot, result) {
  const mode = result.dryRun ? 'DRY-RUN' : 'OK';
  console.log(`sdlc-init project: ${projectRoot}`);
  if (result.targetDetection) {
    console.log(`sdlc-init target: ${result.target} (${result.targetDetection.source}: ${result.targetDetection.reason})`);
  }

  for (const message of result.changes) {
    console.log(`${mode} ${message}`);
  }

  if (result.changes.length === 0) {
    console.log(`${mode} No file changes needed.`);
  }

  for (const message of result.unchanged) {
    console.log(`SKIP ${message}`);
  }

  for (const warning of result.warnings) {
    console.warn(`WARN ${warning}`);
  }

  for (const error of result.errors) {
    console.error(`ERROR ${error}`);
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR ${error.message}`);
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const result = createResult(options);
  if (options.targetDetection && options.targetDetection.warning) {
    result.warnings.push(options.targetDetection.warning);
  }

  if (!fs.existsSync(options.projectRoot) || !fs.statSync(options.projectRoot).isDirectory()) {
    result.errors.push(`Project root is not a directory: ${options.projectRoot}`);
    printResult(options.projectRoot, result);
    process.exitCode = 1;
    return;
  }

  injectProjectInstructions(options, result);
  if (options.target === 'claude' || options.target === 'both') {
    injectSettings(options, result);
    injectHooks(options, result);
  } else {
    recordUnchanged(result, 'Skipped .claude/settings.json injection for Codex target.');
    recordUnchanged(result, 'Skipped .claude/hooks sync for Codex target.');
  }
  writeInstallReceipt(options);

  printResult(options.projectRoot, result);
  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main();
