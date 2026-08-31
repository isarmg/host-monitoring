export type BrowserSession = {
  authenticated: true;
  user_id: string;
  email: string;
  csrf_token: string;
};

export const CURRENT_API_PREFIX = "/api/v2";

let csrfToken: string | null = null;
let reloadPromise: Promise<BrowserSession> | null = null;

function rememberSession(session: BrowserSession): BrowserSession {
  csrfToken = session.csrf_token;
  return session;
}

export async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  includeCsrf = true,
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && includeCsrf) {
    if (!csrfToken) throw new Error("session CSRF token is unavailable");
    headers.set("x-csrf-token", csrfToken);
  }
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers,
  });
  if (response.status === 401) csrfToken = null;
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || response.statusText);
  return body as T;
}

export async function login(email: string, password: string) {
  return rememberSession(
    await requestJson<BrowserSession>(
      `${CURRENT_API_PREFIX}/auth/login`,
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
      false,
    ),
  );
}

export function loadSession(): Promise<BrowserSession> {
  if (!reloadPromise) {
    reloadPromise = requestJson<BrowserSession>(`${CURRENT_API_PREFIX}/auth/session`)
      .then(rememberSession)
      .finally(() => {
        reloadPromise = null;
      });
  }
  return reloadPromise;
}

export async function logout() {
  try {
    await requestJson(`${CURRENT_API_PREFIX}/auth/logout`, { method: "POST" });
  } finally {
    csrfToken = null;
    reloadPromise = null;
  }
}
