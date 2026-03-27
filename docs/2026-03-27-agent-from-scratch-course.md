# How to Build an AI Agent From Scratch
**Author:** hooeem (@hooeem) | **Date:** March 26, 2026
**Source:** https://x.com/hooeem/status/2037250422403113188

---

No one has made a full course so that anyone (yes, you) can create an AI agent from scratch.
If you wanted to, you could read this article and create an agent that is useful for you to utilise today, because creating an agent for agents sake means nothing, it needs to be for a reason.

So what did I do?
I took resources from Anthropic, OpenAI, and other experts on the internet who have given bits of information that is useful here and there. I took them all, put it together with my mate Claude, and created a full course for the layman (me) to understand so that we (me and you) can create an agent today.

This is a long article. At the end of it, you will be able to build your first agent. Just so to help you navigate this article, the text that is **CAPITALISED AND BOLD** are the subheadings, there's 8 in total:

1. How agents work
2. Five workflows
3. Building your agent
4. Utilising tools
5. Giving your agent memory
6. Making your agent work
7. Multiple agents
8. Wrapping it all up

---

## 1: HOW AGENTS WORK

It's important to know this stuff. If you don't then you'll have no idea why you'll need one or not.

This is the core loop shared by all agents:

```
User input → LLM thinks → LLM decides (respond or call a tool) → if tool: execute it, feed result back → repeat
```

The LLM is the "brain" that reasons. Tools are the "hands" that perform actions (calculator, web search, file I/O). Memory is the "notepad" that records what has happened so far. Whether you use LangGraph, CrewAI, Anthropic's SDK or OpenAI's Agents SDK, the frameworks wrap this loop with abstractions but do not change its essence.

### Augmented LLMs

A plain LLM accepts text and emits text. An augmented LLM adds three capabilities:

- **Tools:** functions the model can call (calculators, databases, APIs, file operations, etc.). Anthropic and OpenAI expose tools via JSON schemas; Anthropic passes an `input_schema` while OpenAI wraps functions in a `function` object with parameters
- **Retrieval:** ability to pull relevant information from external sources (search engines, documents, vector databases)
- **Memory:** ability to retain information across interactions via a message history or other persistent storage

### Workflows vs. true agents

The distinction matters when choosing an approach:

- **Workflows** are deterministic; your code controls execution and the same input always produces the same path. Ideal for well-defined tasks with fixed steps. Cheaper (fewer LLM calls).
- **Agents** are dynamic; the LLM decides the next step and may call tools repeatedly. Best for open-ended tasks. Cost more.

The process for finding if you need to create an agent: start with a simple workflow, then see whether you'll graduate it to become an autonomous agent.

---

## 2: THE FIVE CORE WORKFLOW PATTERNS

Most problems can be solved without needing full autonomy. These five patterns, documented by Anthropic and widely adopted, cover common cases. Each pattern relies on an augmented LLM.

### Pattern 1: Prompt chaining

Break a task into sequential steps. Each LLM call processes the output of the previous one. Add programmatic "gates" between steps to verify quality.

- **When to use:** Tasks that decompose cleanly into fixed subtasks. You trade speed for accuracy.
- **Examples:** Generate marketing copy then translate it. Write an outline, verify it covers key topics, then write the full document.

### Pattern 2: Routing

Classify incoming input, then route it to a specialised handler. Each handler gets its own optimised prompt.

- **When to use:** Different categories of input need fundamentally different treatment. Customer service triage is the classic example.

### Pattern 3: Parallelisation

Run multiple LLM calls simultaneously. Sectioning splits a task into independent subtasks processed in parallel. Voting runs the same task multiple times and aggregates results for higher confidence.

- **When to use:** When subtasks are independent (sectioning) or when you need consensus on a critical decision (voting).

### Pattern 4: Orchestrator-workers

A central LLM (the orchestrator) dynamically breaks down a task and delegates subtasks to worker LLMs. Unlike parallelisation, the subtasks are not predefined — the orchestrator decides them at runtime.

- **When to use:** Complex tasks where you cannot predict the structure in advance. Code generation across multiple files, research tasks, and report writing.

### Pattern 5: Evaluator-optimiser

One LLM generates output, another evaluates it and provides feedback. If evaluation fails, the feedback loops back. This repeats until quality criteria are met.

- **When to use:** When clear evaluation criteria exist and iterative refinement adds measurable value. Translation, code generation, and writing tasks.

---

## 3: BUILDING YOUR AGENT

This is the part of the article you came for.

So how do you turn "I want an agent to do XYZ" into something real?

The easiest way to think about it is this:
1. Write down the job
2. Decide what tools it needs
3. Tell the model how to behave
4. Test it on 5 real examples
5. Only add more complexity if it fails

### Choosing your SDK

You do not need to master five frameworks. For beginners, the best starting points are:

- **Anthropic** if you want an agent that works like a capable operator with tools, files, shell commands, web actions, and strong coding workflows
- **OpenAI** if you want a clean developer SDK with hosted tools, handoffs, guardrails, and a simple path to production

### The simplest mental model

When building an agent, answer these four questions first:

1. **What is the outcome?** What should the agent actually produce?
2. **What information does it need?** Does it need web search, files, a database, a spreadsheet, a CRM, or just the user's message?
3. **What actions should it be allowed to take?** Can it only answer? Search? Edit files? Send emails? Write code? Call your own functions?
4. **What rules must it follow?** Tone, format, constraints, safety rules, what to do when uncertain, and what "good" looks like.

If you can answer those four questions clearly, you can usually build the first version of your agent in a day.

### Beginner formula for agent design

```
Agent = Role + Goal + Tools + Rules + Output format
```

Example:
- **Role:** Research assistant for crypto projects
- **Goal:** Find accurate information and summarise it clearly
- **Tools:** Web search, file search, calculator
- **Rules:** Cite sources, do not guess, flag uncertainty
- **Output format:** Summary, risks, opportunities, final verdict

### Five beginner agent types

Start with one of these before going multi-agent:

1. **Research agent** — Use when you want the agent to gather information and summarise it. Needs: web search, clear output format.
2. **Content agent** — Use when you want the agent to write, rewrite, summarise, or transform content. Needs: strong system prompt, optional file access.
3. **Workflow agent** — Use when you want the agent to follow a repeatable business process. Needs: clear categories, rules, sometimes custom tools.
4. **Personal knowledge agent** — Use when you want the agent to answer questions using your documents. Needs: file search or RAG, clear instruction to stay grounded.
5. **Operator agent** — Use when you want the agent to take actions in an environment. Needs: tools, permissions, strong safety boundaries.

### Anthropic: building your first agent

Anthropic's agent tooling is especially helpful when you want the model to use tools and operate in an environment. Claude Code launched February 2025. The Claude Code SDK was later renamed the Claude Agent SDK in September 2025. The current GitHub release listed in March 2026 is v0.1.50.

At a beginner level, you are doing three things:
1. Giving Claude a job
2. Giving Claude tools
3. Letting Claude loop until the task is done

### OpenAI: building your first agent

OpenAI launched its Agents SDK on 11 March 2025 alongside the Responses API and built-in tools for web search, file search, and computer use. The Python package `openai-agents` was at version 0.13.1 in March 2026.

At a beginner level, the build is:
1. Create an Agent
2. Give it instructions
3. Add tools if needed
4. Run it with a real user request

### Build path summary

1. Write one sentence describing the agent
2. Ask Claude or ChatGPT to turn that into: agent spec, system prompt, tool list, 10 test prompts
3. Build the smallest working version
4. Test it on 10 real examples
5. Improve one thing at a time

**Avoid this mistake:** The biggest mistake is trying to build an "all-purpose super agent". Do not start with web search, file search, database access, memory, multi-agent handoffs, complex guardrails, custom dashboards, and 20 tools. Start with: one job, one agent, one clear prompt, one or two tools maximum, five to ten real test cases.

---

## 4: UTILISING TOOLS

Most people get this wrong. They think "more tools = smarter agent." Wrong. Better tools = smarter agent. Fewer tools = more reliable agent.

### The simplest way to think about tools

A tool is just: "Something the AI can't do on its own."

Examples: calculate numbers, search the web, read your files, send an email, query a database.

### Step 1: Ask yourself "Does this need a tool?"

Before adding anything, ask: Can the model answer this using just reasoning? Or does it need real-world data or actions?

**No tool needed:** "Rewrite this email", "Summarise this text", "Explain this concept"
**Tool needed:** "What's the weather right now?", "Search the latest news", "Calculate compound interest", "Pull data from my spreadsheet"

### Step 2: Use AI to help you design tools

### Step 3: Keep it simple

Bad tool: `manage_files(action, file, destination, overwrite, format, permissions)`
Good tools: `read_file(path)`, `write_file(path, content)`, `delete_file(path)`

One tool = one clear job.

### Step 4: Tell the agent WHEN to use the tool

Bad: "Calculator tool"
Good: "Use this tool whenever maths is required. Never guess calculations."

### Step 5: Let the agent fail and fix it

Run real tests. If it doesn't use the tool, fix description. If it uses it incorrectly, fix inputs. If it hallucinates, make rules stricter.

---

## 5: GIVE YOUR AGENT MEMORY

People massively overcomplicate this.

There are TWO types of memory:
1. **Short-term memory (conversation):** "What has been said so far." You already get this by default.
2. **Long-term memory (external knowledge):** "Stuff the agent can look up later." Examples: your notes, PDFs, documents, databases.

### When do you ACTUALLY need memory?

- Does the agent need to remember things across messages? Yes → short-term
- Does it need to use external documents? Yes → long-term
- Otherwise → you probably don't need it

### Three options:

- **Option A: No memory (start here)** — Best for most beginners. Works for 70% of use cases.
- **Option B: Conversation memory** — Already handled in most SDKs. Just don't reset messages.
- **Option C: File-based memory (easy RAG)** — Upload documents, use file search tool.

**Don't go full retard:** Big mistake: adding vector DB, embeddings, complex pipelines before you even know if you need them. If your agent works without memory, don't add it.

---

## 6: MAKING YOUR AGENT WORK IRL

This is where agents end up either being shit, or goatee. A lot of them are shit because of bad prompts, no testing, unrealistic expectations.

### Step 1: Use AI to create test cases

Create 15 realistic user inputs that are messy, vague, real-world style. Include edge cases, confusing inputs, bad inputs.

### Step 2: Test like a real user

Don't test: "Please classify this billing request"
Test: "why tf did i get charged again"

### Step 3: Fix one thing at a time

When it fails, ask:
- Is the prompt unclear?
- Is the output format vague?
- Is a tool missing?
- Is a rule missing?

### Step 4: Use AI to debug your agent

### Step 5: Don't go crazy too early

Do NOT add multiple agents, complex workflows, automation pipelines until your simple version works consistently.

---

## 7: MULTIPLE AGENTS

You can go completely off track here easily. People think "more agents = more powerful." Wrong.

**Start with ONE agent. Always.**

Only add more when:
- The task is clearly split
- One agent is struggling
- Roles are very different

### The only 3 times you need multiple agents:

1. **Different skills** — Research agent, Writing agent
2. **Clear pipeline** — Input → Analyse → Write → Output
3. **Different permissions** — One agent can read data, one agent can execute actions

**The safest pattern:** Supervisor model: User → Main agent → (calls others if needed)

Do NOT start with: swarm, fully autonomous multi-agent systems. They break easily.

---

## 8: WRAPPING THIS ARTICLE UP

The most important insight: agents are conceptually simple but operationally demanding. The core loop (LLM thinks, calls tools, repeats) fits in 50 lines of Python. The real work is in tool design, error handling, evaluation, and knowing when simpler patterns will outperform autonomous agents.

### Three actionable takeaways:

1. **Build the from-scratch agent first.** Understanding the raw loop makes every framework transparent rather than magical. You will debug issues faster and choose tools more wisely.

2. **Start with the simplest pattern that works.** A prompt chain handles most multi-step tasks. A routing pattern handles most classification-then-action workflows. Graduate to autonomous agents only when you need the LLM to decide the execution path dynamically.

3. **Invest in tool design and evaluation early.** Well-designed tools with clear names, precise descriptions, and structured error messages will improve agent performance more than switching models or frameworks. And 20 good test cases will catch more bugs than any amount of manual testing.

The field is moving fast. MCP became a universal standard in under a year. Both major providers shipped Agent SDKs. New frameworks appear monthly. But the fundamentals in this guide are stable: the agentic loop, the five workflow patterns, the principles of good tool design, and the discipline of starting simple. Master these, and you can adapt to whatever comes next.

**YOU CAN NOW BUILD AN AGENT.**
