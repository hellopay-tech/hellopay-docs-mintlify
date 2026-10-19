// Animated diagrams used across the guides. Styles live in /style.css (hp-* classes).
// Wrap usages in <Visibility for="humans"> and keep a text version of the flow on the
// page: agents read the Markdown export, which does not render these components.

export const LifecycleFlow = ({ variant = "payin" }) => {
  // Kept inside the component: Mintlify only keeps exported declarations from snippets.
  const LIFECYCLES = {
    payin: {
      label: "Payin status lifecycle",
      progress: [
        { status: "PENDING", event: "no webhook", note: "Created. Rail data may still be null." },
        { status: "PROCESSING", event: "payin.processing", note: "Waiting for the payer." },
      ],
      final: [
        { status: "CONFIRMED", event: "payin.confirmed", note: "then payin.settled", tone: "ok" },
        { status: "DECLINED", event: "payin.declined", note: "Rejected or expired", tone: "bad" },
        { status: "CANCELED", event: "payin.canceled", note: "Canceled by payer or bank", tone: "warn" },
      ],
    },
    payout: {
      label: "Payout status lifecycle",
      progress: [
        { status: "PENDING", event: "no webhook", note: "Created and queued." },
        { status: "PROCESSING", event: "no webhook", note: "Sent to the rail." },
      ],
      final: [
        { status: "CONFIRMED", event: "payout.confirmed", note: "Funds delivered", tone: "ok" },
        { status: "DECLINED", event: "payout.declined", note: "Rejected by the rail", tone: "bad" },
        { status: "CANCELED", event: "payout.canceled", note: "Canceled", tone: "warn" },
      ],
    },
    paymentlink: {
      label: "Payment link status lifecycle",
      progress: [{ status: "PENDING", event: "link created", note: "Valid for 1 hour." }],
      final: [
        { status: "COMPLETED", event: "paymentlink.completed", note: "Payer paid", tone: "ok" },
        { status: "EXPIRED", event: "paymentlink.expired", note: "No payment in 1 hour", tone: "warn" },
      ],
    },
  };
  const [run, setRun] = useState(0);
  const flow = LIFECYCLES[variant] || LIFECYCLES.payin;
  const summary = `${flow.label}: ${flow.progress.map((n) => n.status).join(" → ")} → ${flow.final
    .map((n) => n.status)
    .join(" | ")}`;

  const items = [];
  flow.progress.forEach((node, i) => {
    items.push(
      <div key={`n${i}`} className="hp-lc-node hp-lc-progress" style={{ "--hp-i": i * 2 }}>
        <span className="hp-lc-status">
          <span className="hp-lc-dot" />
          {node.status}
        </span>
        <code className="hp-lc-event">{node.event}</code>
        <span className="hp-lc-note">{node.note}</span>
      </div>
    );
    items.push(<div key={`l${i}`} className="hp-lc-link" style={{ "--hp-i": i * 2 + 1 }} aria-hidden="true" />);
  });

  return (
    <div key={run} className="hp-flow hp-lifecycle not-prose" role="img" aria-label={summary}>
      <div className="hp-flow-head">
        <span className="hp-flow-title">{flow.label}</span>
        <button type="button" className="hp-flow-replay" onClick={() => setRun(run + 1)}>
          Replay
        </button>
      </div>
      <div className="hp-lc-row">
        {items}
        <div className="hp-lc-finals" style={{ "--hp-i": flow.progress.length * 2 }}>
          {flow.final.map((node) => (
            <div key={node.status} className={`hp-lc-node hp-lc-final hp-tone-${node.tone}`}>
              <span className="hp-lc-status">
                <span className="hp-lc-dot" />
                {node.status}
              </span>
              <code className="hp-lc-event">{node.event}</code>
              <span className="hp-lc-note">{node.note}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// steps: [{ actor: "Your server", title: "POST /payins", detail: "rail: PSE", icon: "server" }]
export const SequenceFlow = ({ title = "How it works", steps = [] }) => {
  const [run, setRun] = useState(0);
  const summary = `${title}: ${steps.map((s, i) => `${i + 1}. ${s.actor}: ${s.title}`).join("; ")}`;

  return (
    <div key={run} className="hp-flow hp-seq not-prose" role="img" aria-label={summary} style={{ "--hp-n": steps.length }}>
      <div className="hp-flow-head">
        <span className="hp-flow-title">{title}</span>
        <button type="button" className="hp-flow-replay" onClick={() => setRun(run + 1)}>
          Replay
        </button>
      </div>
      <ol className="hp-seq-list">
        {steps.map((step, i) => (
          <li key={i} className="hp-seq-step" style={{ "--hp-i": i }}>
            <span className="hp-seq-node">
              <Icon icon={step.icon || "circle"} size={16} />
            </span>
            <span className="hp-seq-body">
              <span className="hp-seq-actor">{step.actor}</span>
              <span className="hp-seq-title">{step.title}</span>
              {step.detail ? <code className="hp-seq-detail">{step.detail}</code> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};
