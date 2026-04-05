/**
 * interpret-registry-integration.test.ts
 *
 * Integration test: verify interpret.ts queries the capability registry
 * and returns expected AgentGraph shapes for known test goals.
 *
 * Run: cd /Users/deon/agentos/app && npx tsx lib/nl/__tests__/interpret-registry-integration.test.ts
 */

import { interpret } from '../interpret';
import { registry } from '../../registry/capability-registry';
import { resolveCapabilities } from '../../registry/resolver';

// ---------------------------------------------------------------------------
// Test: resolveCapabilities returns expected capabilities for known goals
// ---------------------------------------------------------------------------

function testResolveCapabilities() {
  console.log('\n=== resolveCapabilities unit tests ===');

  const testCases: Array<{ goal: string; expectedRoles: string[] }> = [
    {
      goal: 'follow up with leads who haven\'t replied in 7 days',
      expectedRoles: ['email_reader', 'response_drafter'],
    },
    {
      goal: 'respond to customer emails',
      expectedRoles: ['email_reader', 'response_drafter', 'email_sender'],
    },
    {
      goal: 'read my emails and draft replies',
      expectedRoles: ['email_reader', 'response_drafter'],
    },
    {
      goal: 'handle support tickets',
      expectedRoles: ['ticket_reader', 'faq_responder'],
    },
    {
      goal: 'escalate complex customer issues to humans',
      expectedRoles: ['ticket_reader', 'escalation_triage'],
    },
    {
      goal: 'research leads for my B2B startup',
      expectedRoles: ['lead_researcher'],
    },
    {
      goal: 'check my email',
      expectedRoles: ['email_reader'],
    },
    {
      goal: 'escalate urgent tickets',
      expectedRoles: ['ticket_reader', 'escalation_triage'],
    },
    {
      goal: 'route support emails to the right team',
      expectedRoles: ['ticket_reader', 'escalation_triage'],
    },
    {
      goal: 'triage support tickets',
      expectedRoles: ['ticket_reader', 'escalation_triage'],
    },
    {
      goal: 'auto-respond to common support questions',
      expectedRoles: ['ticket_reader', 'faq_responder'],
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const { goal, expectedRoles } of testCases) {
    const matches = resolveCapabilities(registry.getAll(), { goal, limit: 5 });
    const matchedRoles = matches.map((m) => m.capability.agentRole);
    const hasAll = expectedRoles.every((r) => matchedRoles.includes(r));

    if (hasAll) {
      console.log(`  PASS: "${goal}"`);
      console.log(`    matched: [${matchedRoles.join(', ')}]`);
      passed++;
    } else {
      console.log(`  FAIL: "${goal}"`);
      console.log(`    expected: [${expectedRoles.join(', ')}]`);
      console.log(`    got:      [${matchedRoles.join(', ')}]`);
      failed++;
    }
  }

  console.log(`\nresolveCapabilities: ${passed}/${passed + failed} passed`);
  return { passed, failed };
}

// ---------------------------------------------------------------------------
// Test: inferInputs returns MissingField[] for capability with missing inputs
// ---------------------------------------------------------------------------

function testInferInputs() {
  console.log('\n=== inferInputs unit tests ===');

  const emailSendMissing = registry.inferInputs('email:send', {});
  const hasTo = emailSendMissing.some((f) => f.name === 'to');
  const hasSubject = emailSendMissing.some((f) => f.name === 'subject');
  const hasBody = emailSendMissing.some((f) => f.name === 'body');

  if (hasTo && hasSubject && hasBody) {
    console.log('  PASS: email:send with no context → [to, subject, body] missing');
    return { passed: 1, failed: 0 };
  } else {
    console.log(`  FAIL: email:send missing fields = [${emailSendMissing.map((f) => f.name).join(', ')}]`);
    return { passed: 0, failed: 1 };
  }
}

// ---------------------------------------------------------------------------
// Test: capability agentRole values are underscore-formatted (test-suite contract)
// ---------------------------------------------------------------------------

function testAgentRoleFormat() {
  console.log('\n=== agentRole format tests ===');

  const roles = registry.getAll().map((c) => c.agentRole);
  const underscorePattern = /^[a-z_]+$/;
  const allUnderscore = roles.every((r) => underscorePattern.test(r));

  if (allUnderscore) {
    console.log('  PASS: all agentRoles use underscore format');
    console.log(`    roles: [${roles.join(', ')}]`);
    return { passed: 1, failed: 0 };
  } else {
    const bad = roles.filter((r) => !underscorePattern.test(r));
    console.log(`  FAIL: non-underscore roles: [${bad.join(', ')}]`);
    return { passed: 0, failed: 1 };
  }
}

// ---------------------------------------------------------------------------
// Test: unknown goal returns empty array (no false positives)
// ---------------------------------------------------------------------------

function testUnknownGoal() {
  console.log('\n=== unknown goal → empty array ===');

  const matches = resolveCapabilities(registry.getAll(), {
    goal: 'book a flight to Tokyo next Tuesday',
    limit: 5,
  });

  if (matches.length === 0) {
    console.log('  PASS: unknown goal returns empty matches');
    return { passed: 1, failed: 0 };
  } else {
    console.log(`  FAIL: unknown goal returned ${matches.length} matches: [${matches.map((m) => m.capability.id).join(', ')}]`);
    return { passed: 0, failed: 1 };
  }
}

// ---------------------------------------------------------------------------
// Test: cosine similarity threshold ≥ 0.5 (verify no low-score matches)
// ---------------------------------------------------------------------------

function testThreshold() {
  console.log('\n=== cosine similarity threshold tests ===');

  const matches = resolveCapabilities(registry.getAll(), {
    goal: 'send an email to john@example.com',
    limit: 5,
  });

  const belowThreshold = matches.filter((m) => m.score < 0.5);
  const allAbove = belowThreshold.length === 0;

  if (allAbove) {
    console.log('  PASS: all match scores >= 0.5');
    console.log(`    scores: ${matches.map((m) => `${m.capability.id}=${m.score.toFixed(2)}`).join(', ')}`);
    return { passed: 1, failed: 0 };
  } else {
    console.log(`  FAIL: ${belowThreshold.length} matches below threshold`);
    return { passed: 0, failed: 1 };
  }
}

// ---------------------------------------------------------------------------
// Test: interpret() integration — verify it accepts a goal and returns a result
// (Uses OPENAI_API_KEY if set; will skip LLM call if not configured)
// ---------------------------------------------------------------------------

async function testInterpretIntegration() {
  console.log('\n=== interpret() integration test ===');

  if (!process.env.OPENAI_API_KEY) {
    console.log('  SKIP: OPENAI_API_KEY not set — skipping LLM-dependent test');
    return { passed: 0, failed: 0, skipped: 1 };
  }

  try {
    const result = await interpret('check my email', { timeoutMs: 10000 });
    if (result.ok && 'graph' in result) {
      console.log('  PASS: interpret("check my email") → AgentGraph');
      console.log(`    agents: ${result.graph.agents.map((a) => a.role).join(', ')}`);
      return { passed: 1, failed: 0, skipped: 0 };
    } else {
      console.log(`  FAIL: interpret returned non-ok result: ${JSON.stringify(result)}`);
      return { passed: 0, failed: 1, skipped: 0 };
    }
  } catch (err) {
    console.log(`  FAIL: interpret threw: ${err}`);
    return { passed: 0, failed: 1, skipped: 0 };
  }
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

async function runAllTests() {
  console.log('========================================');
  console.log('Capability Registry — Integration Tests');
  console.log('========================================');

  const results: Array<{ passed: number; failed: number; skipped?: number }> = [
    testResolveCapabilities(),
    testInferInputs(),
    testAgentRoleFormat(),
    testUnknownGoal(),
    testThreshold(),
    await testInterpretIntegration(),
  ];

  const total = results.reduce(
    (acc, r) => ({
      passed: acc.passed + r.passed,
      failed: acc.failed + r.failed,
      skipped: acc.skipped + (r.skipped ?? 0),
    }),
    { passed: 0, failed: 0, skipped: 0 }
  );

  console.log('\n========================================');
  console.log(`Results: ${total.passed} passed, ${total.failed} failed, ${total.skipped} skipped`);
  console.log('========================================');

  return total;
}

runAllTests().then(({ passed, failed }) => {
  process.exit(failed > 0 ? 1 : 0);
});
