import { interpret } from './interpret'

const TEST_PAIRS = [
  // VALID GOALS -> should return agents
  { goal: "respond to customer emails", expectedRoles: ['email_reader', 'response_drafter', 'email_sender'] },
  { goal: "I want to automatically respond to customer emails", expectedRoles: ['email_reader', 'response_drafter', 'email_sender'] },
  { goal: "read my emails and draft replies", expectedRoles: ['email_reader', 'response_drafter'] },
  { goal: "answer customer support emails", expectedRoles: ['ticket_reader', 'faq_responder'] },
  { goal: "handle support tickets", expectedRoles: ['ticket_reader', 'faq_responder'] },
  { goal: "research leads for my B2B startup", expectedRoles: ['lead_researcher'] },
  { goal: "find information about companies I should outreach to", expectedRoles: ['lead_researcher'] },
  { goal: "escalate complex customer issues to humans", expectedRoles: ['ticket_reader', 'escalation_triage'] },
  { goal: "read emails and escalate important ones", expectedRoles: ['email_reader', 'escalation_triage'] },
  { goal: "auto-respond to common support questions", expectedRoles: ['ticket_reader', 'faq_responder'] },
  { goal: "draft email responses for my inbox", expectedRoles: ['email_reader', 'response_drafter'] },
  { goal: "help me email my customers", expectedRoles: ['email_reader', 'response_drafter', 'email_sender'] },

  // CLARIFICATION NEEDED
  { goal: "I want to grow my business", shouldClarify: true },
  { goal: "help me with posting", shouldClarify: true },
  { goal: "handle my emails", shouldClarify: true },
  { goal: "automate my work", shouldClarify: true },
  { goal: "make my life easier", shouldClarify: true },

  // ERROR/INVALID
  { goal: "post to Instagram when I add a menu item", shouldError: true }, // Phase 2 tool
  { goal: "post on social media", shouldError: true }, // Phase 2 tool
  { goal: "post to Instagram automatically", shouldError: true }, // Phase 2 tool
  { goal: "automatically process 10 agent workflows simultaneously", shouldError: true }, // >5 agents
  { goal: "read emails and send them back to the same person", shouldClarify: true }, // ambiguous
  { goal: "check my email", expectedRoles: ['email_reader'] }, // simple 1-agent
  { goal: "escalate urgent tickets", expectedRoles: ['ticket_reader', 'escalation_triage'] },
  { goal: "route support emails to the right team", expectedRoles: ['ticket_reader', 'escalation_triage'] },
  { goal: "send my emails", expectedRoles: ['email_reader', 'response_drafter'] },
  { goal: "triage support tickets", expectedRoles: ['ticket_reader', 'escalation_triage'] },
]

async function runTests() {
  let passed = 0
  let failed = 0

  for (const test of TEST_PAIRS) {
    const result = await interpret(test.goal, 10000)

    if (test.shouldClarify && !result.ok && 'clarification' in result) {
      console.log(`✓ PASS: "${test.goal}" -> clarification`)
      passed++
    } else if (test.shouldError && !result.ok && 'error' in result) {
      console.log(`✓ PASS: "${test.goal}" -> error`)
      passed++
    } else if (test.expectedRoles && result.ok && 'graph' in result) {
      const graph = result.graph
      const roles = graph.agents.map(a => a.role)
      const hasAllRoles = test.expectedRoles.every(r => roles.includes(r as any))
      if (hasAllRoles) {
        console.log(`✓ PASS: "${test.goal}" -> [${roles.join(', ')}]`)
        passed++
      } else {
        console.log(`✗ FAIL: "${test.goal}" -> expected ${test.expectedRoles.join(', ')}, got [${roles.join(', ')}]`)
        failed++
      }
    } else {
      console.log(`✗ FAIL: "${test.goal}" -> unexpected result`, JSON.stringify(result))
      failed++
    }
  }

  console.log(`\nResults: ${passed}/${passed + failed} passed`)
  if (passed + failed < 20) {
    console.warn('Warning: fewer than 20 test pairs executed')
  }
  return { passed, failed }
}

runTests().then(({ passed, failed }) => {
  process.exit(failed > 0 ? 1 : 0)
}).catch(err => {
  console.error('Test suite error:', err)
  process.exit(1)
})
