import { useAdministratorSession } from "@sarmg/admin-web/react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  CURRENT_API_PREFIX,
  administratorApi,
  errorEnvelope,
  isHostListResponse,
  type Host,
} from "./api";

function errorMessage(cause: unknown): string {
  return (
    errorEnvelope(cause)?.message ??
    (cause instanceof Error ? cause.message : "request failed")
  );
}

export default function App() {
  const auth = useAdministratorSession(administratorApi);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (auth.phase !== "authenticated") {
      setHosts([]);
      return;
    }
    let cancelled = false;
    administratorApi
      .request(
        `${CURRENT_API_PREFIX}/monitoring/hosts`,
        isHostListResponse,
      )
      .then((response) => {
        if (!cancelled) setHosts(response.hosts);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [auth.phase]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await auth.login(username, password);
      setPassword("");
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const leave = async () => {
    try {
      await auth.logout();
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  if (auth.phase === "loading") return <main>正在加载会话…</main>;

  if (auth.phase === "error") {
    return (
      <main>
        <h1>Host Monitoring</h1>
        <p>{errorMessage(auth.error)}</p>
        <button onClick={() => void auth.restore()}>重试</button>
      </main>
    );
  }

  if (auth.phase === "anonymous") {
    return (
      <main>
        <h1>Host Monitoring</h1>
        <form onSubmit={submit}>
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
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
      <p>{auth.session.username}</p>
      <button onClick={leave}>退出</button>
      {error && <p>{error}</p>}
      <pre>{JSON.stringify(hosts, null, 2)}</pre>
    </main>
  );
}
