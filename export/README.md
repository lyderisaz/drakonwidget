# Export: PNG, SVG, JSON

`export/drakon-export.js` saves the diagram shown in a DrakonWidget as an
image or as a file. It does not modify the widget or the diagram.

```html
<script src="libs/drakonwidget.js"></script>
<script src="libs/canvas2svg.js"></script>      <!-- needed for SVG only -->
<script src="export/drakon-export.js"></script>
```

```js
// One call: builds the file and starts the download, named after the diagram
DrakonExport.saveAs(drakon, "png", { config: themeConfig, scale: 2 })
DrakonExport.saveAs(drakon, "svg", { config: themeConfig })
DrakonExport.saveAs(drakon, "json")            // .drakon file, same JSON as exportJson()

// Or get the data and decide yourself
DrakonExport.exportPng(drakon, options).then(function (blob) { ... })
DrakonExport.exportSvg(drakon, options).then(function (svgText) { ... })
DrakonExport.exportCanvas(drakon, options).then(function (canvas) { ... })
```

Options:

| Option | Default | Meaning |
|---|---|---|
| `config` | `{}` | The widget config / theme you render with, so the export looks the same |
| `scale` | `2` | PNG pixel scale (2 = sharp on high-DPI screens). Large diagrams are scaled down to stay within 16000 px |
| `background` | none | Extra background color painted first (the theme background is drawn anyway) |
| `createWidget` | `createDrakonWidget` | Factory for the hidden export widget |
| `embedJson` | `true` | SVG only: put the diagram JSON into `<metadata id="drakon-json">`, so the SVG can be imported back (`import/drakon-import.js`) |

How it works: with the usual `canvasIcons: false` the widget draws text as
HTML, so its own canvas holds only shapes. The exporter loads the same diagram
into a hidden read-only widget with `canvasIcons: true` and paints it with the
widget's `exportToContext()`: into a canvas for PNG, or into a
[canvas2svg](https://github.com/gliffy/canvas2svg) context for SVG.

Notes:

- SVG text refers to fonts by name (no fonts embedded). Viewers without the
  theme font substitute a similar one.
- The End icon always shows the widget's own label ("End"), whatever content
  the item has.

In the demo (`index.html`): menu ☰ → **Export** → PNG / SVG / JSON (.drakon).

`libs/canvas2svg.js` is canvas2svg 1.0.16, MIT license, Copyright (c) 2014 Gliffy Inc.
