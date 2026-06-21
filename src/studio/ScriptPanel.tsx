import "./ScriptPanel.css";

/**
 * Authoring panel for the teleprompter script. The text is a presenter aid —
 * it is never written to the export manifest or the recorded video.
 */
export function ScriptPanel({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="panel">
      <p className="hint" style={{ marginTop: 0 }}>
        Write what you want to say. It scrolls in the floating presenter window
        while you record — and isn’t captured (when you record a window or tab).
      </p>
      <textarea
        className="script__text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste or write your script here…"
        spellCheck
      />
    </div>
  );
}
