import type { ChatResponse } from "@/domain/chat";
import { Icon } from "./icons";
export function DebugPanel({ result }: { result: ChatResponse }) {
  return (
    <details className="debug-panel">
      <summary>
        <Icon name="code" size={16} />
        <span>Behind the response</span>
        <span className="debug-time">
          {(result.totalMs / 1000).toFixed(2)}s
        </span>
        <Icon name="chevron" size={14} />
      </summary>
      <div className="debug-content">
        <div className="debug-request">
          <span className="eyebrow">ORIGINAL REQUEST</span>
          <p>{result.originalMessage}</p>
        </div>
        <div className="comparison">
          {(["writer", "reviewer"] as const).map((stage) => (
            <section key={stage}>
              <h4>
                {stage === "writer"
                  ? "01 · Writer draft"
                  : "02 · Reviewer output"}
              </h4>
              <p className="debug-meta">
                {result.stages[stage].provider.id} /{" "}
                {result.stages[stage].provider.model}
                <br />
                {result.stages[stage].status} · {result.stages[stage].latencyMs}{" "}
                ms
              </p>
              <pre>
                {(stage === "writer"
                  ? result.writerDraft
                  : result.reviewerOutput) ?? "No output available."}
              </pre>
            </section>
          ))}
        </div>
        {result.error && (
          <p className="warning">
            {result.error.code}: {result.error.message}
          </p>
        )}
        <p className="debug-meta">
          Overall: {result.totalMs} ms · {result.status} · {result.mode} mode
        </p>
      </div>
    </details>
  );
}
