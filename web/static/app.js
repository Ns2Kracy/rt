const config = window.DEMO_CONFIG || { buildID: "static-dev", localVersion: "v0.0.0" };
build.textContent = config.buildID;
localVersion.textContent = config.localVersion;

const params = new URLSearchParams(location.search);
const gateway = location.pathname.startsWith("/modules/") || location.pathname.startsWith("/zimaos-login-demo");
const api = gateway
  ? location.origin + "/v2/api/rt"
  : params.get("api") || location.protocol + "//" + location.hostname + ":49321/v2/api/rt";
const wsBase = gateway
  ? (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/v2/api/rt/ws"
  : "ws://" + location.hostname + ":49321/v2/api/rt/ws";

const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
const initialToken =
  params.get("token") ||
  params.get("access_token") ||
  hashParams.get("token") ||
  hashParams.get("access_token") ||
  "";
token.value = initialToken;

let ws;

function authHeaders() {
  const value = token.value.trim();
  return value ? { Authorization: "Bearer " + value, "X-Zima-Token": value } : {};
}

fetch(api + "/target-version", { credentials: "include", cache: "no-store" })
  .then((r) => r.json())
  .then((v) => {
    version.textContent = "target version: " + v.target_version + " / api build: " + v.build_id;
  })
  .catch(() => {
    version.textContent = "target version unavailable";
  });

form.onsubmit = async (e) => {
  e.preventDefault();
  msg.className = "out";
  msg.textContent = "";

  const data = Object.fromEntries(new FormData(form));
  const res = await fetch(api + "/login", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });

  msg.className = res.ok ? "out" : "out err";
  msg.textContent = res.ok ? JSON.stringify(await res.json(), null, 2) : await res.text();
};

probe.onclick = async () => {
  const res = await fetch(api + "/auth-probe", {
    credentials: "include",
    cache: "no-store",
    headers: authHeaders(),
  });
  probeOut.className = res.ok ? "out" : "out err";
  probeOut.textContent = JSON.stringify(await res.json(), null, 2);
};

connect.onclick = () => {
  const value = token.value.trim();
  const wsURL = value ? wsBase + "?token=" + encodeURIComponent(value) : wsBase;
  ws = new WebSocket(wsURL);
  ws.onopen = () => {
    wslog.className = "out";
    wslog.textContent = "websocket connected";
  };
  ws.onmessage = (e) => {
    wslog.textContent = e.data;
  };
  ws.onerror = () => {
    wslog.className = "out err";
    wslog.textContent = "websocket error";
  };
  ws.onclose = () => {
    wslog.textContent += "\nwebsocket closed";
  };
};

send.onclick = () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    wslog.className = "out err";
    wslog.textContent = "websocket is not connected";
    return;
  }
  wslog.className = "out";
  ws.send(wsText.value);
};
