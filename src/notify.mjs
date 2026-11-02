// ntfy publisher (JSON publish API) + dry-run printer.

const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_SERVER = "https://ntfy.sh";

export function validateTopic(topic) {
  if (!TOPIC_RE.test(topic)) {
    throw new Error("NTFY_TOPIC must be 1-64 chars of [A-Za-z0-9_-]");
  }
  return topic;
}

/** Only https servers, so the topic never travels in clear text. */
export function resolveServer(raw) {
  const value = raw && raw.trim() ? raw.trim() : DEFAULT_SERVER;
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("NTFY_SERVER must be an https:// URL");
  return url.origin;
}

/**
 * @param {{server: string, topic: string}} target
 * @param {{title: string, message: string, click: string, tags: string[]}} alert
 */
export async function sendNtfy(target, alert) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${target.server}/`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: target.topic,
        title: alert.title,
        message: alert.message,
        click: alert.click,
        tags: alert.tags,
        priority: 4,
      }),
    });
    if (!res.ok) throw new Error(`ntfy responded HTTP ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

export function printDryRun(alert, { seeded }) {
  const prefix = seeded ? "[DRY-RUN seed – live first run would NOT send]" : "[DRY-RUN]";
  process.stdout.write(`${prefix} ${alert.title}\n  ${alert.message.replace("\n", "\n  ")}\n`);
}
