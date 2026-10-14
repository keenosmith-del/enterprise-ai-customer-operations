const base = import.meta.env.VITE_API_URL || "http://localhost:5050/api";
export function operatorToken() {
  return sessionStorage.getItem("operatorToken") || "";
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Operator-Token": operatorToken(),
      ...options.headers,
    },
  });
  const json = await response.json();
  if (!response.ok)
    throw new Error(
      json.error?.message || `Request failed (${response.status})`,
    );
  return json;
}
export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
