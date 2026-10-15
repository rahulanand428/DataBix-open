import { useAskAssistant, useAssistantStatus, useAuth, useBranding } from "@databix/sdk";
import { Avatar, Badge, Button, Card, EmptyState, Page, PageHeader, Spinner, Textarea } from "@databix/ui";
import { Bot, Eraser, Send, Sparkles, Wrench } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  model?: string;
  failed?: boolean;
};

const SUGGESTIONS = [
  "Which symbols were shorted the most in the latest month?",
  "What was the busiest day for short selling, and how big was it?",
  "How has short selling in RELIANCE changed over the last three months?",
  "Find banks with the most short selling.",
];

const TOOL_LABELS: Record<string, string> = {
  get_coverage: "date coverage",
  get_summary: "range summary",
  get_daily_totals: "daily totals",
  get_top_symbols: "top symbols",
  search_symbols: "symbol search",
  get_symbol_stats: "symbol stats",
  get_symbol_series: "symbol history",
};

export function AssistantPage() {
  const status = useAssistantStatus();
  const ask = useAskAssistant();
  const { user } = useAuth();
  const { branding } = useBranding();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Block body: scrollIntoView returns a Promise in newer browsers, and an
    // effect must return only a cleanup function.
    void endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, ask.isPending]);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || ask.isPending) return;
    // Earlier turns go back as plain text; the API caps history at ten turns.
    const history = messages
      .filter((message) => !message.failed)
      .slice(-10)
      .map(({ role, content }) => ({ role, content }));
    while (history[0]?.role === "assistant") history.shift();
    setMessages((current) => [...current, { role: "user", content: text }]);
    setDraft("");
    try {
      const result = await ask.mutateAsync({ question: text, history });
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.answer, tools: result.tool_calls.map((call) => call.name), model: result.model },
      ]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: (error as Error).message, failed: true }]);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(draft);
    }
  };

  if (status.isSuccess && !status.data.enabled) {
    return (
      <Page>
        <PageHeader title="Ask AI" description="Answers questions about the short-selling data in plain English." />
        <Card>
          <EmptyState icon={Bot} title="The AI assistant is not enabled">
            An administrator can turn it on by setting <code className="dbx-mono">ASSISTANT_ENABLED=true</code> and an Anthropic API key on the backend.
          </EmptyState>
        </Card>
      </Page>
    );
  }

  return (
    <Page style={{ maxWidth: 1040 }}>
      <PageHeader
        title="Ask AI"
        description={`Ask about short-selling activity in plain English. Answers come from ${branding.product_name}'s data, never from guesses.`}
        actions={
          <>
            {status.data?.model && <Badge icon={Sparkles}>{status.data.model}</Badge>}
            {messages.length > 0 && (
              <Button icon={Eraser} onClick={() => setMessages([])} disabled={ask.isPending}>
                New conversation
              </Button>
            )}
          </>
        }
      />
      <Card flush>
        <div className="dbx-card__body" style={{ minHeight: 360 }}>
          {messages.length === 0 ? (
            <div className="dbx-stack" style={{ alignItems: "center", textAlign: "center", padding: "36px 12px", ["--dbx-gap" as string]: "16px" }}>
              <span className="dbx-mark" style={{ width: 44, height: 44, background: "var(--dbx-primary)", color: "var(--dbx-on-primary)" }}>
                <Sparkles aria-hidden />
              </span>
              <div className="dbx-stack" style={{ ["--dbx-gap" as string]: "4px" }}>
                <h2>What would you like to know?</h2>
                <p className="dbx-muted">The assistant looks numbers up with read-only tools and shows which ones it used.</p>
              </div>
              <div className="dbx-suggestions" style={{ justifyContent: "center", maxWidth: 680 }}>
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} type="button" className="dbx-suggestion" onClick={() => void send(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="dbx-chat" aria-live="polite">
              {messages.map((message, index) => (
                <div key={index} className={`dbx-chat__msg dbx-chat__msg--${message.role}`}>
                  {message.role === "user" ? (
                    <Avatar name={user?.username ?? "you"} />
                  ) : (
                    <span className="dbx-avatar" aria-hidden style={{ background: "var(--dbx-primary)", color: "var(--dbx-on-primary)" }}>
                      <Sparkles size={15} />
                    </span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="dbx-chat__bubble" style={message.failed ? { borderColor: "var(--dbx-critical)" } : undefined}>
                      {message.content}
                    </div>
                    {message.role === "assistant" && message.tools && message.tools.length > 0 && (
                      <div className="dbx-chat__meta">
                        <Wrench size={13} aria-hidden />
                        Looked up: {[...new Set(message.tools)].map((tool) => TOOL_LABELS[tool] ?? tool).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {ask.isPending && (
                <div className="dbx-chat__msg">
                  <span className="dbx-avatar" aria-hidden style={{ background: "var(--dbx-primary)", color: "var(--dbx-on-primary)" }}>
                    <Sparkles size={15} />
                  </span>
                  <div className="dbx-chat__bubble dbx-row" style={{ ["--dbx-gap" as string]: "8px" }}>
                    <Spinner label="Thinking" /> <span className="dbx-muted">Looking that up…</span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>
        <form className="dbx-chat__composer" onSubmit={submit}>
          <Textarea
            aria-label="Your question"
            placeholder="Ask about symbols, dates or trends…"
            value={draft}
            maxLength={500}
            rows={1}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <Button type="submit" variant="primary" icon={Send} loading={ask.isPending} disabled={!draft.trim()}>
            Ask
          </Button>
        </form>
      </Card>
      <p className="dbx-muted" style={{ fontSize: 12.5 }}>
        Answers can be wrong; check important figures in the Explorer. Questions are processed by the configured AI provider.
      </p>
    </Page>
  );
}
