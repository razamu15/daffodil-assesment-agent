/** The dev-only scenario switcher in the corner. Swaps the mock world in place; the login token is kept. */
import { useState } from "react";
import { useApp } from "../app/AppContext";
import { navigate } from "../app/routes";
import { MOCK_WRONG_PASSWORD } from "./handlers/types";
import type { MockApi } from "./index";
import { SCENARIO_QUERY_KEY, SCENARIOS } from "./scenarios";
import type { ScenarioId } from "./scenarios";

export function ScenarioSwitcher({ mock }: { mock: MockApi }) {
  const { refresh } = useApp();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(mock.current().id);

  const choose = (id: ScenarioId) => {
    const start = mock.switchTo(id);
    setCurrent(id);
    setOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set(SCENARIO_QUERY_KEY, id);
    window.history.replaceState(null, "", url);
    navigate(start);
    refresh();
  };

  if (!open) {
    return (
      <button type="button" className="switcher switcher-collapsed" onClick={() => setOpen(true)}>
        Mock scenario: {current} ▸
      </button>
    );
  }
  return (
    <aside className="switcher" aria-label="Mock scenario switcher">
      <div className="switcher-head">
        <strong>Mock scenario</strong>
        <button type="button" className="link-button" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      <ul>
        {Object.values(SCENARIOS).map((s) => (
          <li key={s.id}>
            <button type="button" className={s.id === current ? "switcher-item active" : "switcher-item"} onClick={() => choose(s.id)}>
              <span className="switcher-id">{s.id}</span>
              <span className="switcher-shows">{s.shows}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="switcher-note">Sample data, no backend. Any password works except “{MOCK_WRONG_PASSWORD}”.</p>
    </aside>
  );
}
