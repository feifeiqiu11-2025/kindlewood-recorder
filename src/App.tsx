import { useState } from "react";
import { RecorderPanel } from "./record/RecorderPanel";
import { EditorPanel } from "./editor/EditorPanel";
import type { Recording } from "./record/useScreenRecorder";

function App() {
  const [editing, setEditing] = useState<Recording | null>(null);

  if (editing) {
    return <EditorPanel recording={editing} onBack={() => setEditing(null)} />;
  }
  return <RecorderPanel onEdit={setEditing} />;
}

export default App;
