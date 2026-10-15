/** Login: one password (Doc 3 §9 option 1). The token is held in memory by the API client. */
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiErrorCode } from "@helper-assistant/domain";
import { asClientError, useApp } from "../app/AppContext";
import { ErrorNote } from "../ui/common";

export function LoginScreen() {
  const { api } = useApp();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
    } catch (e) {
      const failure = asClientError(e);
      setError(failure.code === ApiErrorCode.UNAUTHORIZED ? "That password didn't work. Try again." : failure.message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>Helper Assistant</h1>
        <p className="muted">Checks your helpers' bills against what you agreed. It never pays anyone or sends messages on its own.</p>
        <label className="field">
          <span>Password</span>
          <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error !== null && <ErrorNote error={error} />}
        <button type="submit" className="primary" disabled={busy || password === ""}>
          {busy ? "Checking…" : "Log in"}
        </button>
      </form>
    </div>
  );
}
