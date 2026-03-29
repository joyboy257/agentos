"use client";

import { useState, FormEvent, useEffect, useRef } from "react";

// ============================================================================
// HOOKS
// ============================================================================

function useIntersectionObserver(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, ...options }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [options]);

  return { ref, isVisible };
}

// ============================================================================
// LOGO
// ============================================================================

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#a78bfa] opacity-80" />
        <div className="absolute inset-0.5 rounded-md bg-[#12121a]" />
        <div className="absolute top-1 left-1 w-2 h-2 rounded-sm bg-[#a78bfa]" />
        <div className="absolute bottom-1 right-1 w-2 h-2 rounded-sm bg-[#3b82f6]" />
      </div>
      <span className="text-lg font-semibold tracking-tight text-[#a78bfa]">
        AgentOS
      </span>
    </div>
  );
}

// ============================================================================
// HEADER
// ============================================================================

function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#1e1e2e] bg-[#0a0a0f]/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8">
          <a
            href="#how-it-works"
            className="text-sm text-[#6b6b7b] hover:text-[#e5e5e5] transition-colors"
          >
            How it works
          </a>
          <a
            href="#templates"
            className="text-sm text-[#6b6b7b] hover:text-[#e5e5e5] transition-colors"
          >
            Templates
          </a>
          <a
            href="#waitlist"
            className="text-sm text-[#6b6b7b] hover:text-[#e5e5e5] transition-colors"
          >
            Join waitlist
          </a>
        </nav>
      </div>
    </header>
  );
}

// ============================================================================
// HERO SECTION
// ============================================================================

function HeroSection() {
  const { ref, isVisible } = useIntersectionObserver();

  return (
    <section
      ref={ref}
      className="pt-32 pb-20 px-6"
    >
      <div className="max-w-4xl mx-auto text-center">
        {/* Badge */}
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#12121a] border border-[#1e1e2e] mb-8 ${
            isVisible ? "animate-fade-in-up" : "opacity-0"
          }`}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[#a78bfa] animate-pulse-dot" />
          <span className="text-xs text-[#6b6b7b]">
            AI agents for everyone
          </span>
        </div>

        {/* Headline */}
        <h1
          className={`text-4xl sm:text-5xl md:text-6xl font-semibold leading-tight tracking-tight mb-6 ${
            isVisible ? "animate-fade-in-up stagger-1" : "opacity-0"
          }`}
        >
          <span className="text-[#e5e5e5]">Describe what you want.</span>
          <br />
          <span className="bg-gradient-to-r from-[#3b82f6] via-[#a78bfa] to-[#ec4899] bg-clip-text text-transparent animate-gradient">
            Your AI agent team is built.
          </span>
        </h1>

        {/* Subheadline */}
        <p
          className={`text-lg sm:text-xl text-[#6b6b7b] max-w-2xl mx-auto mb-10 leading-relaxed ${
            isVisible ? "animate-fade-in-up stagger-2" : "opacity-0"
          }`}
        >
          No code. No configuration. Just describe your workflow in plain
          English and AgentOS assembles a team of AI agents to get it done.
        </p>

        {/* CTA */}
        <div
          className={`flex flex-col items-center gap-4 ${
            isVisible ? "animate-fade-in-up stagger-3" : "opacity-0"
          }`}
        >
          <WaitlistForm />
          <p className="text-xs text-[#52525b]">
            Join 2,000+ people on the waitlist
          </p>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// DEMO SECTION - AGENT WORKFLOW VISUALIZATION
// ============================================================================

function AgentCard({
  title,
  subtitle,
  color,
  delay,
  isVisible,
}: {
  title: string;
  subtitle: string;
  color: string;
  delay: number;
  isVisible: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col gap-2 p-4 rounded-xl bg-[#12121a] border transition-all duration-300 ${
        isVisible ? "animate-fade-in-up" : "opacity-0"
      }`}
      style={{
        animationDelay: `${delay}ms`,
        borderColor: color,
        borderLeftWidth: 3,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full animate-pulse-dot"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-medium text-[#e5e5e5]">{title}</span>
      </div>
      <span className="text-xs text-[#6b6b7b]">{subtitle}</span>
    </div>
  );
}

function AnimatedAgentFlow() {
  const { ref, isVisible } = useIntersectionObserver();

  return (
    <div
      ref={ref}
      className="relative flex flex-col items-center gap-6 py-8"
    >
      {/* Animated connection lines */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#1e1e2e] to-transparent" />

      {/* Agent 1 */}
      <div
        className={`relative z-10 ${isVisible ? "animate-fade-in-up" : "opacity-0"}`}
        style={{ animationDelay: "0ms" }}
      >
        <div className="flex items-center gap-4">
          <AgentCard
            title="Email Reader"
            subtitle="Monitors inbox for new messages"
            color="#3b82f6"
            delay={0}
            isVisible={isVisible}
          />
          <div className="hidden sm:flex items-center">
            <svg width="48" height="24" className="overflow-visible">
              <line
                x1="0"
                y1="12"
                x2="48"
                y2="12"
                stroke="url(#gradient1)"
                strokeWidth="2"
                strokeDasharray="4 2"
                className={isVisible ? "animate-flow-line" : ""}
              />
              <defs>
                <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* Agent 2 */}
      <div
        className={`relative z-10 ${isVisible ? "animate-fade-in-up" : "opacity-0"}`}
        style={{ animationDelay: "200ms" }}
      >
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center">
            <svg width="48" height="24" className="overflow-visible">
              <line
                x1="0"
                y1="12"
                x2="48"
                y2="12"
                stroke="url(#gradient2)"
                strokeWidth="2"
                strokeDasharray="4 2"
                className={isVisible ? "animate-flow-line" : ""}
                style={{ animationDelay: "200ms" }}
              />
              <defs>
                <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <AgentCard
            title="Response Drafter"
            subtitle="Creates personalized replies"
            color="#f59e0b"
            delay={200}
            isVisible={isVisible}
          />
        </div>
      </div>

      {/* Agent 3 */}
      <div
        className={`relative z-10 ${isVisible ? "animate-fade-in-up" : "opacity-0"}`}
        style={{ animationDelay: "400ms" }}
      >
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center">
            <svg width="48" height="24" className="overflow-visible">
              <line
                x1="0"
                y1="12"
                x2="48"
                y2="12"
                stroke="#ec4899"
                strokeWidth="2"
                strokeDasharray="4 2"
                className={isVisible ? "animate-flow-line" : ""}
                style={{ animationDelay: "400ms" }}
              />
            </svg>
          </div>
          <AgentCard
            title="Email Sender"
            subtitle="Sends approved responses"
            color="#ec4899"
            delay={400}
            isVisible={isVisible}
          />
        </div>
      </div>
    </div>
  );
}

function ChatPanel() {
  return (
    <div className="flex flex-col h-full rounded-xl bg-[#12121a] border border-[#1e1e2e] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e1e2e]">
        <div className="w-3 h-3 rounded-full bg-[#ec4899]" />
        <span className="text-sm font-medium text-[#e5e5e5]">Chat</span>
      </div>
      <div className="flex-1 p-4 space-y-4">
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#a78bfa] flex-shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[#6b6b7b]">You</span>
            <div className="px-3 py-2 rounded-lg rounded-tl-none bg-[#1a1a24] text-sm text-[#e5e5e5]">
              I need to respond to customer emails about shipping delays.
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#7c5cd4] flex-shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[#6b6b7b]">AgentOS</span>
            <div className="px-3 py-2 rounded-lg rounded-tl-none bg-[#1a1a24] text-sm text-[#e5e5e5]">
              I will set up an email workflow with three agents: one to read
              incoming emails, one to draft responses, and one to send them.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CanvasPanel() {
  return (
    <div className="flex flex-col h-full rounded-xl bg-[#12121a] border border-[#1e1e2e] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e1e2e]">
        <div className="w-3 h-3 rounded-full bg-[#3b82f6]" />
        <span className="text-sm font-medium text-[#e5e5e5]">Canvas</span>
      </div>
      <div className="flex-1 p-4 relative overflow-hidden">
        {/* Canvas grid background */}
        <div className="absolute inset-0 canvas-grid opacity-50" />
        <div className="relative h-full flex items-center justify-center">
          <AnimatedAgentFlow />
        </div>
      </div>
    </div>
  );
}

function FeaturesSection() {
  const { ref, isVisible } = useIntersectionObserver();

  return (
    <section
      ref={ref}
      id="features"
      className="py-20 px-6"
    >
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <div
          className={`text-center mb-12 ${isVisible ? "animate-fade-in-up" : "opacity-0"}`}
        >
          <h2 className="text-2xl sm:text-3xl font-semibold text-[#e5e5e5] mb-4">
            Two modes to manage your agents
          </h2>
          <p className="text-[#6b6b7b] max-w-lg mx-auto">
            Chat to describe what you want. Canvas to see your agent team in
            action.
          </p>
        </div>

        {/* Panels */}
        <div className="grid md:grid-cols-2 gap-6">
          <div
            className={`h-[400px] ${isVisible ? "animate-fade-in-up stagger-1" : "opacity-0"}`}
          >
            <ChatPanel />
          </div>
          <div
            className={`h-[400px] ${isVisible ? "animate-fade-in-up stagger-2" : "opacity-0"}`}
          >
            <CanvasPanel />
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// HOW IT WORKS SECTION
// ============================================================================

function StepIcon({ number, isVisible, delay }: { number: number; isVisible: boolean; delay: number }) {
  return (
    <div
      className={`relative w-12 h-12 ${isVisible ? "animate-fade-in-up" : "opacity-0"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute inset-0 rounded-xl bg-[#12121a] border border-[#1e1e2e]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-semibold text-[#a78bfa]">{number}</span>
      </div>
    </div>
  );
}

function HowItWorksSection() {
  const { ref, isVisible } = useIntersectionObserver();

  const steps = [
    {
      title: "Describe",
      description:
        "Tell AgentOS what you want to accomplish in plain English. No technical knowledge required.",
    },
    {
      title: "Review",
      description:
        "See your agent team assembled on the canvas. Approve or adjust the setup with natural language.",
    },
    {
      title: "Run",
      description:
        "Launch your agents and watch them work. Monitor progress and intervene when needed.",
    },
  ];

  return (
    <section
      ref={ref}
      id="how-it-works"
      className="py-20 px-6 border-t border-[#1e1e2e]"
    >
      <div className="max-w-4xl mx-auto">
        {/* Section header */}
        <div
          className={`text-center mb-16 ${isVisible ? "animate-fade-in-up" : "opacity-0"}`}
        >
          <h2 className="text-2xl sm:text-3xl font-semibold text-[#e5e5e5] mb-4">
            Three steps to your agent team
          </h2>
          <p className="text-[#6b6b7b]">
            From idea to execution in seconds
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className={`flex flex-col items-center text-center gap-4 ${
                isVisible ? "animate-fade-in-up" : "opacity-0"
              }`}
              style={{ animationDelay: `${(index + 1) * 100}ms` }}
            >
              <StepIcon number={index + 1} isVisible={isVisible} delay={(index + 1) * 100} />
              <h3 className="text-lg font-semibold text-[#e5e5e5]">{step.title}</h3>
              <p className="text-sm text-[#6b6b7b] leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// TEMPLATES SECTION
// ============================================================================

function TemplateCardAnimated({
  title,
  description,
  agentCount,
  color,
  delay,
  isVisible,
}: {
  title: string;
  description: string;
  agentCount: number;
  color: string;
  delay: number;
  isVisible: boolean;
}) {
  return (
    <div
      className={`group relative flex flex-col gap-4 p-6 rounded-2xl bg-[#12121a] border border-[#1e1e2e] hover:border-[#a78bfa]/30 transition-all duration-300 ${
        isVisible ? "animate-fade-in-up" : "opacity-0"
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full animate-pulse-dot"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm text-[#6b6b7b]">
            {agentCount} agents
          </span>
        </div>
        <div className="w-8 h-8 rounded-lg bg-[#1a1a24] border border-[#1e1e2e] group-hover:border-[#a78bfa]/30 transition-colors" />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-[#e5e5e5]">{title}</h3>
        <p className="text-sm text-[#6b6b7b] leading-relaxed">
          {description}
        </p>
      </div>

      {/* Animated agent flow visualization */}
      <div className="flex items-center gap-1 pt-2">
        {agentCount >= 1 && (
          <div
            className="w-6 h-6 rounded-md bg-[#3b82f6]/20 border border-[#3b82f6]/30 flex items-center justify-center"
            title="Email Reader"
          >
            <div className="w-2 h-2 rounded-full bg-[#3b82f6] animate-pulse-dot" />
          </div>
        )}
        {agentCount >= 2 && (
          <>
            <div className="w-4 h-px bg-gradient-to-r from-[#3b82f6] to-[#f59e0b]" />
            <div
              className="w-6 h-6 rounded-md bg-[#f59e0b]/20 border border-[#f59e0b]/30 flex items-center justify-center"
              title="Research Agent"
            >
              <div className="w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse-dot" />
            </div>
          </>
        )}
        {agentCount === 3 && (
          <>
            <div className="w-4 h-px bg-gradient-to-r from-[#f59e0b] to-[#ec4899]" />
            <div
              className="w-6 h-6 rounded-md bg-[#ec4899]/20 border border-[#ec4899]/30 flex items-center justify-center"
              title="Sender Agent"
            >
              <div className="w-2 h-2 rounded-full bg-[#ec4899] animate-pulse-dot" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TemplatesSection() {
  const { ref, isVisible } = useIntersectionObserver();

  const templates = [
    {
      title: "Customer Email",
      description:
        "Automatically read, categorize, and respond to customer emails with personalized replies.",
      agentCount: 3,
      color: "#3b82f6",
    },
    {
      title: "Lead Research",
      description:
        "Research potential leads by gathering company info, social profiles, and contact details.",
      agentCount: 2,
      color: "#f59e0b",
    },
    {
      title: "Customer Support",
      description:
        "Handle support tickets by understanding issues and either resolving or escalating.",
      agentCount: 3,
      color: "#ec4899",
    },
  ];

  return (
    <section
      ref={ref}
      id="templates"
      className="py-20 px-6 border-t border-[#1e1e2e]"
    >
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <div
          className={`text-center mb-16 ${isVisible ? "animate-fade-in-up" : "opacity-0"}`}
        >
          <h2 className="text-2xl sm:text-3xl font-semibold text-[#e5e5e5] mb-4">
            Start with proven templates
          </h2>
          <p className="text-[#6b6b7b] max-w-lg mx-auto">
            Pre-built agent workflows for common business tasks. Customize them
            or use them as-is.
          </p>
        </div>

        {/* Template cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {templates.map((template, index) => (
            <TemplateCardAnimated
              key={template.title}
              title={template.title}
              description={template.description}
              agentCount={template.agentCount}
              color={template.color}
              delay={index * 150}
              isVisible={isVisible}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// WAITLIST SECTION
// ============================================================================

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row w-full max-w-md"
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email"
        required
        className="flex-1 px-4 py-3 rounded-xl bg-[#12121a] border border-[#1e1e2e] text-[#e5e5e5] placeholder-[#52525b] focus:outline-none focus:border-[#a78bfa]/50 focus:ring-1 focus:ring-[#a78bfa]/20 transition-all"
      />
      <button
        type="submit"
        disabled={status === "loading" || status === "success"}
        className="px-6 py-3 rounded-xl bg-[#a78bfa] text-[#0a0a0f] font-semibold hover:bg-[#b794fc] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
      >
        {status === "loading"
          ? "Joining..."
          : status === "success"
          ? "You are in!"
          : "Join Waitlist"}
      </button>
    </form>
  );
}

function WaitlistSection() {
  const { ref, isVisible } = useIntersectionObserver();

  return (
    <section
      ref={ref}
      id="waitlist"
      className="py-20 px-6 border-t border-[#1e1e2e]"
    >
      <div className="max-w-2xl mx-auto text-center">
        <h2
          className={`text-2xl sm:text-3xl font-semibold text-[#e5e5e5] mb-4 ${
            isVisible ? "animate-fade-in-up" : "opacity-0"
          }`}
        >
          Get early access
        </h2>
        <p
          className={`text-[#6b6b7b] mb-8 ${
            isVisible ? "animate-fade-in-up stagger-1" : "opacity-0"
          }`}
        >
          Be among the first to build with AgentOS. We are opening access to
          small batches of users each week.
        </p>
        <div
          className={`flex flex-col items-center gap-4 ${
            isVisible ? "animate-fade-in-up stagger-2" : "opacity-0"
          }`}
        >
          <WaitlistForm />
          <p className="text-xs text-[#52525b]">
            No spam. Unsubscribe anytime.
          </p>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// FOOTER
// ============================================================================

function Footer() {
  return (
    <footer className="py-8 px-6 border-t border-[#1e1e2e]">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <Logo />
        <p className="text-xs text-[#52525b]">
          2026 AgentOS. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e5e5e5]">
      <Header />
      <main>
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <TemplatesSection />
        <WaitlistSection />
      </main>
      <Footer />
    </div>
  );
}
