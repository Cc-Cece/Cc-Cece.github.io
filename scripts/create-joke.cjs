const fs = require("fs");
const path = require("path");

const eventPath = process.env.GITHUB_EVENT_PATH;
const eventName = process.env.GITHUB_EVENT_NAME || "";
const secret = process.env.JOKE_SECRET || "";

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

function yamlBlock(value) {
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(line => `  ${line}`)
    .join("\n");
}

function uniqueJokePath(dir, timestamp) {
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

  const content = String(payload.content || payload.text || payload.joke || payload.setup || "").trim();
  const reveal = String(payload.reveal || payload.answer || payload.punchline || "").trim();
  if (!content) {
    console.log("No joke content supplied; skipping joke creation.");
    return;
  }

  const providedSecret = payload.secret || payload.joke_secret || "";
  if (secret && providedSecret !== secret) {
    throw new Error("Invalid JOKE_SECRET.");
  }

  const offset = parseOffset(payload.timezone || payload.tz || "+08:00");
  const now = new Date();
  const date = formatWithOffset(now, offset);
  const timestamp = filenameTimestamp(now, offset);

  const jokesDir = path.join(process.cwd(), "src", "jokes");
  fs.mkdirSync(jokesDir, { recursive: true });

  const lines = [
    "---",
    `date: "${date}"`,
    "published: true",
    "permalink: false",
    "joke: |-",
    yamlBlock(content)
  ];
  if (reveal) {
    lines.push("reveal: |-");
    lines.push(yamlBlock(reveal));
  }
  lines.push("---");
  lines.push("");

  const outputPath = uniqueJokePath(jokesDir, timestamp);
  fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
  console.log(`Created ${path.relative(process.cwd(), outputPath)}`);
}

main();
