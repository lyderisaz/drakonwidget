# Import: .drakon, JSON, SVG

`import/drakon-import.js` loads a diagram from a file. It does not modify the widget.

```html
<script src="libs/drakonwidget.js"></script>
<script src="import/drakon-import.js"></script>
```

```js
DrakonImport.pickFile()                      // file picker; resolves to a File or null
    .then(file => DrakonImport.readFile(file)) // { diagram, source: "json" | "svg" }
    .then(r => DrakonImport.checkRender(r.diagram).then(() => r.diagram))
    .then(diagram => drakon.setDiagram(id, diagram, sender, false))

DrakonImport.parseText(text, "name.drakon")  // same as readFile, from a string
```

Accepted files:

| File | What is read |
|---|---|
| `.drakon`, `.json` | the diagram JSON (`{ name, items, ... }`, same as `exportJson()`) |
| `.svg` | the JSON inside `<metadata id="drakon-json">`, written by `DrakonExport.exportSvg` |

An SVG without that element (a drawing from another tool, or an SVG exported
before this version) is rejected with a message. Rebuilding a diagram from
shapes and lines would be a guess, so the importer does not try.

`checkRender(diagram)` draws the diagram in a hidden widget first. Some
diagrams pass JSON checks (and the rules validator) but make the widget throw
while laying them out; they are rejected before anything is stored.

A diagram without a `name` gets the file name. `id` and `access` from the file
are ignored.

In the demo (`index.html`): menu ☰ → **Import** → Open file, or drop the file
anywhere on the page. The diagram is added as a new diagram; a name that is
already taken gets a suffix ` (2)`, ` (3)`, …
