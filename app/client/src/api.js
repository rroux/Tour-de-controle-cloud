async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw new Error(data.message || `Erreur ${res.status}`);
  return data;
}

export const api = {
  projects: () => request("GET", "/api/projects"),
  config: () => request("GET", "/api/config"),
  saveSettings: (body) => request("PUT", "/api/config", body),
  addSource: (body) => request("POST", "/api/sources", body),
  updateSource: (id, body) => request("PUT", `/api/sources/${id}`, body),
  deleteSource: (id) => request("DELETE", `/api/sources/${id}`),
  testSource: (body) => request("POST", "/api/sources/test", body),
  scan: () => request("POST", "/api/scan"),
  scanStatus: () => request("GET", "/api/scan/status"),
  scans: () => request("GET", "/api/scans"),
  acceptBudgetRefs: (body) => request("POST", "/api/budget-refs/accept", body),
  acks: () => request("GET", "/api/acks"),
  ack: (id, level) => request("PUT", `/api/acks/${encodeURIComponent(id)}`, { level }),
  unack: (id) => request("DELETE", `/api/acks/${encodeURIComponent(id)}`),
};
