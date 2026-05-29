const fs = require("fs");
const path = require("path");

const eventPath = process.env.GITHUB_EVENT_PATH;
const eventName = process.env.GITHUB_EVENT_NAME || "";
const secret = process.env.SPARK_SECRET || "";

function readEvent() {
  if (!eventPath || !fs.existsSync(eventPath)) return {};
  return JSON.parse(fs.readFileSync(eventPath, "utf8").replace(/^\uFEFF/, ""));
}

function getPayload(event) {
  if (eventName === "repository_dispatch") {
    return event.client_payload || {};
  }
  if (eventName === "workflow_dispatch") {
    return event.inputs || {};
  }
  return {};
}

function parseOffset(offset) {
  const match = String(offset || "+08:00").match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!match) return { label: "+08:00", minutes: 480 };
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  const total = sign * (hours * 60 + minutes);
  return {
    label: `${match[1]}${match[2]}:${match[3]}`,
    minutes: total
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatWithOffset(date, offset) {
  const shifted = new Date(date.getTime() + offset.minutes * 60 * 1000);
  return [
    shifted.getUTCFullYear(),
    "-",
    pad(shifted.getUTCMonth() + 1),
    "-",
    pad(shifted.getUTCDate()),
    "T",
    pad(shifted.getUTCHours()),
    ":",
    pad(shifted.getUTCMinutes()),
    ":",
    pad(shifted.getUTCSeconds()),
    offset.label
  ].join("");
}

function filenameTimestamp(date, offset) {
  const shifted = new Date(date.getTime() + offset.minutes * 60 * 1000);
  return [
    shifted.getUTCFullYear(),
    "-",
    pad(shifted.getUTCMonth() + 1),
    "-",
    pad(shifted.getUTCDate()),
    "-",
    pad(shifted.getUTCHours()),
    pad(shifted.getUTCMinutes()),
    pad(shifted.getUTCSeconds())
  ].join("");
}

function parseTtl(ttl) {
  const value = String(ttl || "30d").trim().toLowerCase();
  if (!value || ["never", "none", "forever", "permanent", "no", "false", "0"].includes(value)) {
    return null;
  }

  const match = value.match(/^(\d+)\s*(m|h|d|w|mo|y)?$/);
  if (!match) {
    throw new Error(`Unsupported ttl: ${ttl}`);
  }

  const amount = Number(match[1]);
  const unit = match[2] || "d";
  const multipliers = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    mo: 30 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000
  };
  return amount * multipliers[unit];
}

function yamlBlock(value) {
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(line => `  ${line}`)
    .join("\n");
}

function uniqueSparkPath(dir, timestamp) {
  let filePath = path.join(dir, `${timestamp}.md`);
  let counter = 2;
  while (fs.existsSync(filePath)) {
    filePath = path.join(dir, `${timestamp}-${counter}.md`);
    counter += 1;
  }
  return filePath;
}

function main() {
  const event = readEvent();
  const payload = getPayload(event);

  const content = String(payload.content || payload.text || payload.spark || "").trim();
  if (!content) {
    console.log("No spark content supplied; skipping spark creation.");
    return;
  }

  if (secret && payload.secret !== secret) {
    throw new Error("Invalid SPARK_SECRET.");
  }

  const offset = parseOffset(payload.timezone || payload.tz || "+08:00");
  const now = new Date();
  const date = formatWithOffset(now, offset);
  const timestamp = filenameTimestamp(now, offset);

  let expires = "";
  if (payload.expires) {
    const expiresAt = new Date(payload.expires);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error(`Unsupported expires value: ${payload.expires}`);
    }
    expires = formatWithOffset(expiresAt, offset);
  } else {
    const ttlMs = parseTtl(payload.ttl || payload.expiresIn || "30d");
    if (ttlMs) {
      expires = formatWithOffset(new Date(now.getTime() + ttlMs), offset);
    }
  }

  const sparksDir = path.join(process.cwd(), "src", "sparks");
  fs.mkdirSync(sparksDir, { recursive: true });

  const lines = [
    "---",
    `date: "${date}"`,
    "published: true",
    "permalink: false"
  ];
  if (expires) lines.push(`expires: "${expires}"`);
  lines.push("spark: |-");
  lines.push(yamlBlock(content));
  lines.push("---");
  lines.push("");

  const outputPath = uniqueSparkPath(sparksDir, timestamp);
  fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
  console.log(`Created ${path.relative(process.cwd(), outputPath)}`);
}

main();
