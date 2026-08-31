import { FormEvent, useEffect, useState } from "react";
import { CURRENT_API_PREFIX, loadSession, login, logout, requestJson } from "./api";

type Host = Record<string, unknown>;

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadSession()
      .then(() => {
        if (!cancelled) setAuthenticated(true);
      })
      .catch(() => {
        if (!cancelled) setAuthenticated(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authenticated) {
      requestJson<Host[]>(`${CURRENT_API_PREFIX}/monitoring/hosts`)
        .then(setHosts)
        .catch(() => setAuthenticated(false));
    }
  }, [authenticated]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await login(email, password);
      setAuthenticated(true);
      setPassword("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "login failed");
    }
  };

  const leave = async () => {
    try {
      await logout();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "logout failed");
    } finally {
      setAuthenticated(false);
      setHosts([]);
    }
  };

  if (loading) return <main>正在加载会话…</main>;

  if (!authenticated) {
    return (
      <main>
        <h1>Host Monitoring</h1>
        <form onSubmit={submit}>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit">登录</button>
        </form>
        {error && <p>{error}</p>}
      </main>
    );
  }

  return (
    <main>
      <h1>Host Monitoring</h1>
      <button onClick={leave}>退出</button>
      <pre>{JSON.stringify(hosts, null, 2)}</pre>
    </main>
  );
}
