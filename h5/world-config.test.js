const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const appHtml = fs.readFileSync(
  path.join(__dirname, "public", "app.html"),
  "utf8",
);

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = appHtml.indexOf(marker);
  assert.notEqual(start, -1, `${name} should exist`);

  const bodyStart = appHtml.indexOf("{", start);
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = bodyStart; index < appHtml.length; index += 1) {
    const char = appHtml[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return appHtml.slice(start, index + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

test("world configuration saves for the default child whose id is zero", async () => {
  const calls = [];
  const context = {
    S_worldCfgChildId: 0,
    S_worldCfgOpen: {
      preschool: true,
      chores: true,
      learning: false,
      habits: false,
      sport: false,
      kindness: false,
    },
    S: { openWorlds: [], worldProgress: {} },
    api(url, options) {
      calls.push({ url, options });
      return Promise.resolve({ code: 0, data: { worldProgress: {} } });
    },
    closeWorldConfig() {},
    renderMap() {},
    sfxTap() {},
    sfxSuccess() {},
    toast() {},
  };

  vm.createContext(context);
  vm.runInContext(extractFunction("saveWorldConfig"), context);
  context.saveWorldConfig();
  await Promise.resolve();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/children/0/world-config");
  assert.deepEqual(
    JSON.parse(JSON.stringify(calls[0].options.body.openWorlds)),
    ["preschool", "chores"],
  );
});
