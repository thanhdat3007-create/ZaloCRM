#!/usr/bin/env node
/**
 * Regression tests for scan_skills.py catalog generation.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(__dirname, 'scan_skills.py');
const SKILLS_DATA_PATH = path.join(__dirname, 'skills_data.yaml');
const GUIDE_YAML_PATH = path.join(REPO_ROOT, 'guide', 'SKILLS.yaml');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertMatch(content, pattern, message) {
  assert(pattern.test(content), message);
}

console.log('\n📚 scan_skills.py Regression Tests');

// scan_skills.py regenerates catalogs from the installed repo layout
// (<repo>/claude/skills + <repo>/guide). In the AgentKit source tree that
// layout does not exist and running the generator would rewrite the curated
// registry, so skip cleanly instead of failing.
if (!fs.existsSync(path.join(REPO_ROOT, 'claude', 'skills'))) {
  console.log('  - skipped: installed repo layout (claude/skills) not found; run inside an installed repo');
  process.exit(0);
}

execSync(`python3 "${SCRIPT_PATH}"`, {
  cwd: REPO_ROOT,
  stdio: 'pipe',
  encoding: 'utf-8',
});

const skillsData = fs.readFileSync(SKILLS_DATA_PATH, 'utf-8');
const guideYaml = fs.readFileSync(GUIDE_YAML_PATH, 'utf-8');

test('mcp-builder stays in dev-tools', () => {
  assertMatch(
    skillsData,
    /- name: "mcp-builder"[\s\S]*?category: "dev-tools"/,
    'mcp-builder should be categorized as dev-tools',
  );
});

test('document skills stay under multimedia', () => {
  assertMatch(
    guideYaml,
    /- name: "docx"[\s\S]*?category: "multimedia"/,
    'docx should be categorized as multimedia',
  );
});

test('block frontmatter descriptions are flattened', () => {
  assert(!guideYaml.includes('description: ">-"'), 'guide catalog should not emit raw block markers');
  assertMatch(
    guideYaml,
    /name: "context-engineering"[\s\S]*?description: "Check context usage limits,/,
    'context-engineering description should be flattened',
  );
  assertMatch(
    guideYaml,
    /name: "excalidraw"[\s\S]*?description: "Create Excalidraw diagrams/,
    'excalidraw description should be flattened',
  );
});

if (failed > 0) {
  console.log(`\n❌ Test Results: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

console.log(`\n✅ Test Results: ${passed} passed, ${failed} failed`);
