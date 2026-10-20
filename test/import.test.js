const test = require("node:test");
const assert = require("node:assert");
const I = require("../import/drakon-import.js");

const diagram = { name: "Šaka", items: { "1": { type: "end" }, "2": { type: "branch", branchId: 1, one: "1" } } };

test("parses .drakon JSON", () => {
    const r = I.parseText(JSON.stringify(diagram), "a.drakon");
    assert.strictEqual(r.source, "json");
    assert.strictEqual(r.diagram.name, "Šaka");
});

test("drops id and access, names unnamed diagram after the file", () => {
    const r = I.parseText(JSON.stringify({ id: "x", access: "read", items: diagram.items }), "C:\\tmp\\Mano schema.json");
    assert.strictEqual(r.diagram.id, undefined);
    assert.strictEqual(r.diagram.access, undefined);
    assert.strictEqual(r.diagram.name, "Mano schema");
});

test("reads JSON embedded in SVG metadata (escaped text)", () => {
    const json = JSON.stringify({ name: "A <b> & \"c\"", items: diagram.items });
    const esc = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><metadata id="drakon-json">' + esc + '</metadata><rect/></svg>';
    const r = I.parseText(svg, "x.svg");
    assert.strictEqual(r.source, "svg");
    assert.strictEqual(r.diagram.name, "A <b> & \"c\"");
});

test("reads JSON embedded in SVG metadata (CDATA)", () => {
    const svg = '<svg><metadata id="drakon-json"><![CDATA[' + JSON.stringify(diagram) + ']]></metadata></svg>';
    assert.strictEqual(I.parseText(svg, "x.svg").diagram.name, "Šaka");
});

test("rejects SVG without embedded data", () => {
    assert.throws(() => I.parseText('<svg><rect/></svg>', "x.svg"), /no embedded DRAKON data/);
});

test("rejects broken structures", () => {
    assert.throws(() => I.parseText("{bad", "x.json"), /Error in JSON/);
    assert.throws(() => I.parseText("[]", "x.json"), /diagram object/);
    assert.throws(() => I.parseText('{"name":"a"}', "x.json"), /no 'items'/);
    assert.throws(() => I.parseText('{"name":"a","items":{"1":{}}}', "x.json"), /no type/);
});
