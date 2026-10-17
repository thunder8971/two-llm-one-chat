"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ProviderMetadata, Stage } from "@/domain/chat";
import { limits } from "@/domain/chat";
import { sendChat } from "@/lib/chat-client";
import {
  buildHistory,
  savedConversationSchema,
  STORAGE_KEY,
  type Turn,
} from "@/lib/conversations";
import { Brand, Icon } from "./icons";
import { DebugPanel } from "./debug-panel";

type Status =
  "idle" | "connecting" | Stage | "completed" | "review_failed" | "error";
const statusLabels: Record<Status, string> = {
  idle: "Ready when you are",
  connecting: "Connecting...",
  writer: "Generating response...",
  reviewer: "Reviewing and improving...",
  completed: "Completed",
  review_failed: "Completed without review",
  error: "Request interrupted",
};
const suggestions = [
  {
    icon: "pen" as const,
    title: "Find the right words",
    description: "Turn a rough idea into a clear message",
    prompt:
      "Help me write a concise, friendly email introducing a new project to my team.",
  },
  {
    icon: "code" as const,
    title: "Work through a problem",
    description: "Get a fresh perspective on your code",
    prompt:
      "Explain how async and await work in JavaScript, with a simple example.",
  },
  {
    icon: "spark" as const,
    title: "Make something click",
    description: "Break a big concept into simple steps",
    prompt:
      "Explain the difference between correlation and causation with an everyday example.",
  },
];
export function Chat({
  mode,
  providers,
  configurationError,
}: {
  mode: "mock" | "live" | "unavailable";
  providers?: { writer: ProviderMetadata; reviewer: ProviderMetadata };
  configurationError?: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const busy = pending !== null;

  useEffect(() => {
    let mounted = true;
    // Read after hydration; the server never accesses browser storage.
    Promise.resolve().then(() => {
      if (!mounted) return;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          if (raw.length > 5000000) throw new Error("Storage limit");
          const parsed = savedConversationSchema.safeParse(JSON.parse(raw));
          if (!parsed.success) throw new Error("Invalid saved conversation");
          setTurns(parsed.data.turns);
        }
      } catch {
        setStorageNotice(
          "Saved history could not be loaded. You can still chat in this tab.",
        );
      }
      setReady(true);
    });
    return () => {
      mounted = false;
      controller.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, turns }));
    } catch {
      queueMicrotask(() =>
        setStorageNotice(
          "Browser storage is unavailable or full. This conversation will only last for this session.",
        ),
      );
    }
  }, [turns, ready]);

  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "end",
    });
  }, [turns, pending, status]);

  async function submit(message = input.trim()) {
    if (!message || controller.current || !ready || mode === "unavailable")
      return;
    const abortController = new AbortController();
    controller.current = abortController;
    const timer = setTimeout(
      () =>
        abortController.abort(
          new DOMException("Request timed out", "TimeoutError"),
        ),
      130000,
    );
    setInput("");
    setPending(message);
    setError(null);
    setRetryMessage(null);
    setStatus("connecting");
    try {
      const result = await sendChat(
        { message, history: buildHistory(turns) },
        abortController.signal,
        setStatus,
      );
      setTurns((current) =>
        [...current, { id: result.id, message, result }].slice(-30),
      );
      setStatus(result.status === "failed" ? "error" : result.status);
      if (result.status === "failed") {
        setError(result.error?.message ?? "The request failed.");
        setRetryMessage(message);
      }
    } catch (cause) {
      const reason = abortController.signal.reason;
      setError(
        abortController.signal.aborted
          ? reason?.name === "TimeoutError"
            ? "The request timed out. Please try again."
            : "Generation stopped. You can edit your message and try again."
          : cause instanceof TypeError
            ? "Could not connect to the server. Check your connection and try again."
            : cause instanceof Error
              ? cause.message
              : "Something went wrong. Please try again.",
      );
      setStatus("error");
      setInput(message);
      setRetryMessage(message);
    } finally {
      clearTimeout(timer);
      controller.current = null;
      setPending(null);
      textarea.current?.focus();
    }
  }
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }
  function newConversation() {
    if (busy) return;
    setTurns([]);
    setInput("");
    setError(null);
    setRetryMessage(null);
    setStatus("idle");
    textarea.current?.focus();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace">
        <Link className="wordmark" href="/" aria-label="Duet home">
          <Brand />
          <span>
            duet<span className="wordmark-dot">.</span>
          </span>
        </Link>
        <button
          className="new-chat"
          onClick={newConversation}
          disabled={busy || !ready}
        >
          <Icon name="plus" size={18} />
          New conversation<kbd>↗</kbd>
        </button>
        <div className="sidebar-section">
          <span className="eyebrow">WORKSPACE</span>
          <div className="nav-active">
            <Icon name="chat" size={17} />
            <span>Conversation</span>
            <span className="nav-dot" />
          </div>
        </div>
        <div className="sidebar-section recent">
          <span className="eyebrow">IN THIS CONVERSATION</span>
          {turns.length ? (
            <nav aria-label="Conversation messages">
              {turns.slice(-5).map((turn) => (
                <a key={turn.id} href={`#turn-${turn.id}`}>
                  <span className="history-dot" />
                  {turn.message}
                </a>
              ))}
            </nav>
          ) : (
            <p>Your next idea starts here.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="pipeline-card">
            <span className="eyebrow">TWO PERSPECTIVES. ONE ANSWER.</span>
            <div className="mini-pipeline">
              <span>
                <Icon name="pen" size={14} />
                Writer
              </span>
              <span className="mini-line" />
              <span>
                <Icon name="check" size={14} />
                Reviewer
              </span>
            </div>
            <p>A first draft, then a thoughtful second look.</p>
          </div>
          <div className="local-profile">
            <span className="profile-avatar">Y</span>
            <div>
              <strong>Your workspace</strong>
              <span>Saved in this browser</span>
            </div>
            <span className="local-dot" />
          </div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="mobile-brand">
              <Brand small />
            </span>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {turns.length || busy ? "Conversation" : "New conversation"}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className={`mode-badge ${mode === "live" ? "live" : ""}`}>
              <span />
              {mode === "mock"
                ? "Mock mode"
                : mode === "live"
                  ? "Live mode"
                  : "Configuration needed"}
            </span>
            <button
              className="mobile-new"
              aria-label="New conversation"
              disabled={busy || !ready}
              onClick={newConversation}
            >
              <Icon name="plus" />
            </button>
          </div>
        </header>
        <div className="conversation-scroll">
          <div className="content-wrap">
            <div className="session-heading">
              <span className="eyebrow">THE DUET WORKSPACE</span>
              <span className="session-label">
                A second perspective changes things.
              </span>
            </div>
            {turns.length === 0 && !busy ? (
              <section className="welcome">
                <div className="hero-symbol">
                  <Brand />
                </div>
                <span className="welcome-kicker">
                  GOOD IDEAS GET BETTER TOGETHER
                </span>
                <h1>
                  One question.
                  <br />
                  <span>Two thoughtful perspectives.</span>
                </h1>
                <p>
                  Room for your ideas. A Writer to bring them to life.
                  <br className="desktop-break" /> A Reviewer to make every
                  answer clearer.
                </p>
                <div
                  className="hero-pipeline"
                  aria-label="Writer then Reviewer then your answer"
                >
                  <span>
                    <span className="stage-number">1</span>Write
                  </span>
                  <span className="pipeline-connector" />
                  <span>
                    <span className="stage-number">2</span>Refine
                  </span>
                  <span className="pipeline-connector" />
                  <span className="pipeline-final">
                    <Icon name="spark" size={15} />
                    Your answer
                  </span>
                </div>
                <div className="suggestions">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.title}
                      onClick={() => {
                        setInput(suggestion.prompt);
                        textarea.current?.focus();
                      }}
                      disabled={!ready || mode === "unavailable"}
                    >
                      <span className="suggestion-icon">
                        <Icon name={suggestion.icon} size={19} />
                      </span>
                      <strong>{suggestion.title}</strong>
                      <span>{suggestion.description}</span>
                      <Icon name="chevron" size={14} />
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <div className="messages" aria-label="Conversation">
                {turns.map((turn) => (
                  <article
                    key={turn.id}
                    id={`turn-${turn.id}`}
                    className="turn"
                  >
                    <div className="user-message">
                      <span className="message-label">You</span>
                      <p>{turn.message}</p>
                    </div>
                    <div className="assistant-message">
                      <div className="assistant-heading">
                        <Brand small />
                        <strong>Duet</strong>
                        <span
                          className={`answer-status ${turn.result.status !== "completed" ? "unreviewed" : ""}`}
                        >
                          {turn.result.status === "completed" ? (
                            <>
                              <Icon name="check" size={12} />
                              Reviewed
                            </>
                          ) : turn.result.status === "review_failed" ? (
                            "Unreviewed draft"
                          ) : (
                            "Generation failed"
                          )}
                        </span>
                        {turn.result.mode === "mock" && (
                          <span className="simulated-label">Simulated</span>
                        )}
                      </div>
                      {turn.result.status === "review_failed" && (
                        <p className="warning" role="alert">
                          {turn.result.error?.message}
                        </p>
                      )}
                      <p className="answer-text">
                        {turn.result.finalAnswer ?? turn.result.error?.message}
                      </p>
                      <DebugPanel result={turn.result} />
                    </div>
                  </article>
                ))}
                {pending && (
                  <article className="turn">
                    <div className="user-message">
                      <span className="message-label">You</span>
                      <p>{pending}</p>
                    </div>
                    <div className="assistant-heading">
                      <Brand small />
                      <strong>Duet</strong>
                      <span className="thinking">
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                  </article>
                )}
              </div>
            )}
            <div ref={bottom} />
          </div>
        </div>
        <div className="composer-area">
          <div className="composer-wrap">
            {(configurationError || error) && (
              <div className="error-banner" role="alert">
                <span>{configurationError || error}</span>
                {retryMessage && !busy && (
                  <button onClick={() => void submit(retryMessage)}>
                    Try again
                  </button>
                )}
              </div>
            )}
            {storageNotice && (
              <p className="storage-notice" role="status">
                {storageNotice}
              </p>
            )}
            <div className="progress-row" role="status" aria-live="polite">
              <span className={`status-dot ${busy ? "working" : ""}`} />
              <span>{statusLabels[status]}</span>
              <div className="progress-stages">
                <span className={status === "writer" ? "active" : ""}>
                  01 Writer
                </span>
                <span>→</span>
                <span className={status === "reviewer" ? "active" : ""}>
                  02 Reviewer
                </span>
              </div>
            </div>
            <form className="composer" onSubmit={onSubmit}>
              <label className="sr-only" htmlFor="message">
                Message Duet
              </label>
              <textarea
                ref={textarea}
                id="message"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder="What's on your mind?"
                rows={2}
                maxLength={limits.message}
                disabled={!ready || mode === "unavailable"}
              />
              <div className="composer-bottom">
                <span className="composer-pipeline">
                  <Icon name="spark" size={14} />
                  Writer <span>→</span> Reviewer
                </span>
                <div className="send-controls">
                  <span className="character-count">
                    {input.length.toLocaleString()} / 4,000
                  </span>
                  {busy ? (
                    <button
                      key="stop"
                      type="button"
                      className="send-button stop-button"
                      onClick={(event) => {
                        // Keep this click from submitting when cancellation restores the Send button.
                        event.preventDefault();
                        controller.current?.abort();
                      }}
                      aria-label="Stop generation"
                    >
                      <Icon name="stop" size={17} />
                    </button>
                  ) : (
                    <button
                      key="send"
                      type="submit"
                      className="send-button"
                      disabled={
                        !input.trim() || !ready || mode === "unavailable"
                      }
                      aria-label="Send message"
                    >
                      <Icon name="arrow" size={20} />
                    </button>
                  )}
                </div>
              </div>
            </form>
            <div className="composer-footnote">
              <span>
                {mode === "mock"
                  ? "Simulated responses. No live models or API keys used."
                  : mode === "live"
                    ? "AI responses may contain mistakes. Review important information."
                    : "Configure the server to start chatting."}
              </span>
              <span>Enter to send · Shift + Enter for a new line</span>
            </div>
          </div>
        </div>
      </main>
      <aside className="inspector" aria-label="Pipeline information">
        <div className="inspector-heading">
          <span className="eyebrow">YOUR PIPELINE</span>
          <span className="pipeline-count">02</span>
        </div>
        <h2>
          A little more
          <br />
          perspective.
        </h2>
        <p className="inspector-intro">
          Every answer gets a second look before it reaches you.
        </p>
        <div className="rail-stages">
          {(["writer", "reviewer"] as const).map((stage, index) => (
            <div
              className={`rail-stage ${status === stage ? "current" : ""}`}
              key={stage}
            >
              <div className="rail-stage-icon">
                <Icon name={stage === "writer" ? "pen" : "check"} size={18} />
              </div>
              <div>
                <span className="rail-step">STEP 0{index + 1}</span>
                <h3>{stage === "writer" ? "The Writer" : "The Reviewer"}</h3>
                <p>
                  {stage === "writer"
                    ? "Shapes your request into a complete first response."
                    : "Revisits the draft for clarity, coherence, and usefulness."}
                </p>
                <span className="provider-tag">
                  {providers?.[stage].id === "mock"
                    ? "Simulated provider"
                    : (providers?.[stage].id ?? "Not configured")}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="inspector-note">
          <Icon name="code" size={18} />
          <h3>Curious about the process?</h3>
          <p>
            Open <strong>Behind the response</strong> beneath any answer to
            compare the draft and the final result.
          </p>
        </div>
        <div className="inspector-footer">
          <span className="tiny-diamond">◇</span> A thoughtful second pass.
        </div>
      </aside>
    </div>
  );
}
