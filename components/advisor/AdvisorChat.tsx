"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { Bot, X, Send, Minimize2 } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { currentTaxYear } from "@/lib/currentTaxYear";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export function AdvisorChat() {
  const { state, saveAdvisorMessage, advisorMessages } = useApp();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(advisorMessages);

  // Sync messages when advisorMessages hydrates from IndexedDB
  useEffect(() => {
    setMessages(advisorMessages);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorMessages.length === 0 ? 0 : advisorMessages[0]?.id]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || isLoading) return;

      const userMsg: ChatMessage = {
        id: generateId(),
        role: "user",
        content: text,
      };

      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      saveAdvisorMessage({ ...userMsg, timestamp: new Date().toISOString() });
      setInput("");
      setIsLoading(true);

      const assistantId = generateId();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      abortRef.current = new AbortController();

      try {
        const res = await fetch("/api/advisor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortRef.current.signal,
          body: JSON.stringify({
            messages: nextMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            taxpayer: state.taxpayer,
            financials: state.financials,
            taxYear: state.financials.taxYears[0] ?? currentTaxYear(),
          }),
        });

        // The server returns JSON `{error}` on 5xx — surface that text in
        // the bubble instead of a generic stub. A streaming success has a
        // text/plain body, so a Content-Type sniff is enough to distinguish.
        if (!res.ok) {
          let errMsg = `שגיאה ${res.status} מהשרת.`;
          if (res.headers.get("content-type")?.includes("application/json")) {
            try {
              const json = (await res.json()) as { error?: string };
              if (json?.error) errMsg = json.error;
            } catch {
              /* fall through to stub */
            }
          }
          throw new Error(errMsg);
        }
        if (!res.body) throw new Error("שגיאה בתקשורת עם היועץ.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + chunk }
                : m
            )
          );
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const text =
            err instanceof Error && err.message
              ? err.message
              : "אירעה שגיאה. נסה שוב.";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: text } : m
            )
          );
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
        // Persist completed assistant message
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.content) {
            saveAdvisorMessage({ ...last, timestamp: new Date().toISOString() });
          }
          return prev;
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, isLoading, messages, state.taxpayer, state.financials, saveAdvisorMessage]
  );

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50" dir="rtl">
      {/* Chat panel */}
      {open && (
        <div className="absolute bottom-14 right-0 w-[360px] h-[480px] bg-card border border-border rounded-2xl shadow-[var(--shadow-card-hover)] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-brand-900">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-accent-500" />
              <span className="text-sm font-semibold text-white">
                יועץ המס שלך
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearMessages}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                title="נקה שיחה"
              >
                <Minimize2 className="w-3.5 h-3.5 text-white/70" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <Bot className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-foreground font-medium mb-1">
                  שלום! אני יועץ המס שלך
                </p>
                <p className="text-xs text-muted-foreground">
                  שאל אותי על זכאויות, ניכויים, או כל שאלה בנושא מס.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-start" : "justify-end"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted text-foreground rounded-tl-sm"
                  )}
                >
                  {m.content || (
                    <span className="opacity-50 text-xs">מקליד...</span>
                  )}
                </div>
              </div>
            ))}
            {isLoading &&
              messages[messages.length - 1]?.role === "assistant" &&
              messages[messages.length - 1]?.content === "" && (
                <div className="flex justify-end">
                  <div className="bg-muted px-3 py-2 rounded-xl rounded-tl-sm">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                      <div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                      <div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
            <div ref={messagesEndRef} />
          </div>

          {/* Disclaimer */}
          <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-900/50">
            <p className="text-[10px] text-amber-700 dark:text-amber-400">
              אינני רואה חשבון מורשה. לייעוץ מחייב — פנה לרו&quot;ח.
            </p>
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex gap-2 p-3 border-t border-border"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="שאל שאלה..."
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="w-9 h-9 bg-primary text-primary-foreground rounded-xl flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              <Send className="w-4 h-4 rotate-180" />
            </button>
          </form>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all",
          open
            ? "bg-card border border-border"
            : "bg-brand-900 hover:bg-brand-700"
        )}
        aria-label="פתח יועץ מס"
      >
        {open ? (
          <X className="w-5 h-5 text-foreground" />
        ) : (
          <Bot className="w-5 h-5 text-white" />
        )}
      </button>
    </div>
  );
}
