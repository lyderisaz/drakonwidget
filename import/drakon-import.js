/*
 * DrakonImport — load a diagram from a file: .drakon / .json, or an .svg that
 * carries the diagram JSON inside (written by DrakonExport.exportSvg).
 *
 *   DrakonImport.pickFile().then(file => DrakonImport.readFile(file))
 *       .then(result => ...)          // { diagram, source: "json" | "svg" }
 *   DrakonImport.parseText(text, "name.svg")   // same, from a string
 *   DrakonImport.checkRender(diagram)  // Promise: rejects if the widget cannot draw it
 *
 * SVG: the importer reads the <metadata id="drakon-json"> element. An SVG with
 * no such element (a drawing from another tool, or an old export) cannot be
 * turned into a diagram reliably, so it is rejected with a clear message
 * instead of being guessed from shapes.
 *
 * Works in the browser and in Node (parseText, normalize, extractSvgJson).
 */
(function (root) {
    "use strict";

    var SVG_META_ID = "drakon-json";

    function baseName(filename) {
        var name = String(filename || "").replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
        return name.trim() || "Imported diagram";
    }

    function decodeXmlText(text) {
        var cdata = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/.exec(text);
        if (cdata) { return cdata[1]; }
        return text
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
            .replace(/&#(\d+);/g, function (m, n) { return String.fromCodePoint(parseInt(n, 10)); })
            .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCodePoint(parseInt(n, 16)); })
            .replace(/&amp;/g, "&");
    }

    // Returns the embedded JSON text, or null if the SVG has none.
    function extractSvgJson(svgText) {
        var re = /<metadata\b([^>]*)>([\s\S]*?)<\/metadata>/gi;
        var m;
        while ((m = re.exec(svgText)) !== null) {
            var attrs = m[1];
            var body = decodeXmlText(m[2]);
            var marked = new RegExp("id\\s*=\\s*[\"']" + SVG_META_ID + "[\"']").test(attrs);
            if (marked || /"items"\s*:/.test(body)) {
                return body.trim();
            }
        }
        return null;
    }

    function looksLikeSvg(text, filename) {
        return /\.svg$/i.test(filename || "") || /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg\b/i.test(text);
    }

    // Brings a parsed object to the shape setDiagram() expects.
    function normalize(obj, filename) {
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
            throw new Error("The file does not contain a diagram object");
        }
        if (!obj.items || typeof obj.items !== "object" || Array.isArray(obj.items)) {
            throw new Error("The diagram has no 'items' object");
        }
        var diagram = Object.assign({}, obj);
        delete diagram.id;
        delete diagram.access;
        if (typeof diagram.name !== "string" || !diagram.name.trim()) {
            diagram.name = baseName(filename);
        }
        Object.keys(diagram.items).forEach(function (id) {
            var it = diagram.items[id];
            if (!it || typeof it !== "object" || !it.type) {
                throw new Error("Item " + id + " has no type");
            }
        });
        return diagram;
    }

    function parseText(text, filename) {
        text = String(text || "").replace(/^\uFEFF/, "");
        var source = "json";
        var jsonText = text;
        if (looksLikeSvg(text, filename)) {
            source = "svg";
            jsonText = extractSvgJson(text);
            if (jsonText === null) {
                throw new Error("This SVG has no embedded DRAKON data. Only SVG files exported " +
                    "from this editor (Export → SVG) can be imported; for other drawings import the .drakon / JSON file.");
            }
        }
        var obj;
        try {
            obj = JSON.parse(jsonText);
        } catch (ex) {
            throw new Error((source === "svg" ? "Embedded JSON is broken: " : "Error in JSON: ") + ex.message);
        }
        return { diagram: normalize(obj, filename), source: source };
    }

    function readFile(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                try { resolve(parseText(reader.result, file.name)); } catch (ex) { reject(ex); }
            };
            reader.onerror = function () { reject(new Error("Cannot read file " + file.name)); };
            reader.readAsText(file, "utf-8");
        });
    }

    function pickFile(accept) {
        return new Promise(function (resolve) {
            var input = document.createElement("input");
            input.type = "file";
            input.accept = accept || ".drakon,.json,.svg,application/json,image/svg+xml";
            input.style.display = "none";
            input.addEventListener("change", function () {
                var file = input.files && input.files[0];
                if (input.parentNode) { input.parentNode.removeChild(input); }
                resolve(file || null);
            });
            document.body.appendChild(input);
            input.click();
        });
    }

    // Draws the diagram in a hidden read-only widget. Some structures pass
    // JSON checks but make the widget throw; this catches them before the
    // diagram is stored.
    function checkRender(diagram, createWidget) {
        var create = createWidget || root.createDrakonWidget;
        if (typeof create !== "function") { return Promise.resolve(); }
        var copy = JSON.parse(JSON.stringify(diagram));
        copy.access = "read";
        var host = document.createElement("div");
        host.style.cssText = "position:fixed;left:-20000px;top:0;width:300px;height:300px;overflow:hidden;";
        document.body.appendChild(host);
        var cleanup = function () { if (host.parentNode) { host.parentNode.removeChild(host); } };
        return Promise.resolve().then(function () {
            var w = create();
            host.appendChild(w.render(300, 300, {
                startEditContent: function () { }, showContextMenu: function () { }, canSelect: false
            }));
            return w.setDiagram("import-check-" + Date.now(), copy,
                { stop: function () { }, pushEdit: function () { } }, false);
        }).then(function () { cleanup(); }, function (err) {
            cleanup();
            throw new Error("The widget cannot draw this diagram: " + (err && err.message || err));
        });
    }

    var api = {
        SVG_META_ID: SVG_META_ID,
        parseText: parseText,
        normalize: normalize,
        extractSvgJson: extractSvgJson,
        readFile: readFile,
        pickFile: pickFile,
        checkRender: checkRender
    };
    root.DrakonImport = api;
    if (typeof module === "object" && module.exports) { module.exports = api; }
})(typeof self !== "undefined" ? self : this);
