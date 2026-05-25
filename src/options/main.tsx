import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { BackgroundRequest, BackgroundResponse, LibraryState } from "../../shared/types";
import "./styles.css";

function OptionsApp() {
  const [library, setLibrary] = useState<LibraryState>();
  const [error, setError] = useState("");

  useEffect(() => {
    sendBackground<LibraryState>({ type: "JUSTSNAP_GET_LIBRARY" })
      .then(setLibrary)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load JustSnap data."));
  }, []);

  return (
    <main>
      <section>
        <h1>JustSnap</h1>
        <p>
          JustSnap stores screenshots and workflow activity locally in this Chrome profile. Research export data is
          metadata-only and does not include raw screenshot pixels.
        </p>
        {library && (
          <dl>
            <div>
              <dt>Captures</dt>
              <dd>{library.captures.length}</dd>
            </div>
            <div>
              <dt>Groups</dt>
              <dd>{library.groups.length}</dd>
            </div>
            <div>
              <dt>Activity events</dt>
              <dd>{library.events.length}</dd>
            </div>
          </dl>
        )}
        {error && <div className="error">{error}</div>}
      </section>
    </main>
  );
}

async function sendBackground<T = unknown>(request: BackgroundRequest): Promise<T> {
  const response = await chrome.runtime.sendMessage<BackgroundRequest, BackgroundResponse<T>>(request);
  if (!response?.ok) throw new Error(response?.error ?? "JustSnap request failed.");
  return response.data;
}

createRoot(document.getElementById("root")!).render(<OptionsApp />);
