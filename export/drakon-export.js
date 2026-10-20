/*
 * DrakonExport — export a DrakonWidget diagram as PNG, SVG or JSON.
 *
 *   DrakonExport.exportPng(drakon, { config: themeConfig, scale: 2 }).then(blob => ...)
 *   DrakonExport.exportSvg(drakon, { config: themeConfig }).then(svgText => ...)
 *   DrakonExport.download(blobOrText, "name.png", "image/png")
 *   DrakonExport.saveAs(drakon, "png" | "svg" | "json", { config, scale })
 *
 * Why a second widget: the widget draws text as HTML when config.canvasIcons
 * is false (the usual setting), so its own canvas contains only shapes. The
 * exporter loads the same diagram into a hidden, read-only widget with
 * canvasIcons: true and paints it with the widget's exportToContext().
 *
 * SVG needs libs/canvas2svg.js (MIT, Gliffy Inc.), loaded before this file.
 * PNG needs nothing extra. Nothing in the diagram is changed.
 */
(function (root) {
    "use strict";

    var MAX_CANVAS_SIDE = 16000;

    function noopSender() {
        return { stop: function () { }, pushEdit: function () { } };
    }

    function exportConfig(config) {
        var result = Object.assign({}, config || {});
        result.canvasIcons = true;
        result.canSelect = false;
        result.drawZones = false;
        return result;
    }

    // Loads the widget's current diagram into a hidden canvas-icons widget,
    // calls paint(widget, box) and cleans up afterwards.
    function withExportWidget(widget, options, paint) {
        options = options || {};
        var create = options.createWidget || root.createDrakonWidget;
        if (typeof create !== "function") {
            return Promise.reject(new Error("createDrakonWidget is not available"));
        }
        var diagram = JSON.parse(widget.exportJson());
        diagram.access = "read";
        var host = document.createElement("div");
        host.style.cssText = "position:fixed;left:-20000px;top:0;width:200px;height:200px;overflow:hidden;";
        document.body.appendChild(host);
        var copy = create();
        host.appendChild(copy.render(200, 200, exportConfig(options.config)));
        var cleanup = function () {
            if (host.parentNode) { host.parentNode.removeChild(host); }
        };
        return Promise.resolve(copy.setDiagram("export-" + Date.now(), diagram, noopSender(), false))
            .then(function () { return document.fonts ? document.fonts.ready : null; })
            .then(function () {
                var box = copy.getDiagramBox();
                var result = paint(copy, box);
                cleanup();
                return result;
            }, function (err) {
                cleanup();
                throw err;
            });
    }

    function sizeOf(box, scale) {
        return {
            width: Math.ceil((box.right - box.left) * scale),
            height: Math.ceil((box.bottom - box.top) * scale)
        };
    }

    function exportCanvas(widget, options) {
        options = options || {};
        var scale = options.scale || 2;
        return withExportWidget(widget, options, function (copy, box) {
            var size = sizeOf(box, scale);
            if (size.width > MAX_CANVAS_SIDE || size.height > MAX_CANVAS_SIDE) {
                var fit = Math.min(MAX_CANVAS_SIDE / size.width, MAX_CANVAS_SIDE / size.height);
                scale = scale * fit;
                size = sizeOf(box, scale);
            }
            var canvas = document.createElement("canvas");
            canvas.width = size.width;
            canvas.height = size.height;
            var ctx = canvas.getContext("2d");
            if (options.background) {
                ctx.fillStyle = options.background;
                ctx.fillRect(0, 0, size.width, size.height);
            }
            copy.exportToContext(box, Math.round(scale * 10000), ctx);
            return canvas;
        });
    }

    function exportPng(widget, options) {
        return exportCanvas(widget, options).then(function (canvas) {
            return new Promise(function (resolve, reject) {
                canvas.toBlob(function (blob) {
                    if (blob) { resolve(blob); } else { reject(new Error("PNG encoding failed")); }
                }, "image/png");
            });
        });
    }

    function patchC2S(C2S) {
        // The widget calls setLineDash; canvas2svg 1.0.16 lacks it.
        if (!C2S.prototype.setLineDash) {
            C2S.prototype.setLineDash = function (segments) { this.__lineDash = segments || []; };
            C2S.prototype.getLineDash = function () { return this.__lineDash || []; };
        }
    }

    function exportSvg(widget, options) {
        options = options || {};
        var C2S = root.C2S;
        if (typeof C2S !== "function") {
            return Promise.reject(new Error("SVG export needs libs/canvas2svg.js"));
        }
        patchC2S(C2S);
        return withExportWidget(widget, options, function (copy, box) {
            var size = sizeOf(box, 1);
            var ctx = new C2S(size.width, size.height);
            if (options.background) {
                ctx.fillStyle = options.background;
                ctx.fillRect(0, 0, size.width, size.height);
            }
            copy.exportToContext(box, 10000, ctx);
            var svg = ctx.getSvg();
            svg.setAttribute("viewBox", "0 0 " + size.width + " " + size.height);
            svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            var text = new XMLSerializer().serializeToString(svg);
            return '<?xml version="1.0" encoding="UTF-8"?>\n' + text;
        });
    }

    function exportJsonText(widget) {
        var diagram = JSON.parse(widget.exportJson());
        return JSON.stringify(diagram, null, 2);
    }

    function fileBaseName(widget) {
        var name = "";
        try { name = (widget.getDiagramProperties() || {}).name || ""; } catch (ex) { name = ""; }
        name = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\.{2,}/g, ".").replace(/\s+/g, " ").trim();
        return (name || "diagram").slice(0, 80);
    }

    function download(content, filename, mime) {
        var blob = content instanceof Blob ? content : new Blob([content], { type: mime || "text/plain" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function saveAs(widget, format, options) {
        var base = fileBaseName(widget);
        switch (format) {
            case "png":
                return exportPng(widget, options).then(function (blob) {
                    download(blob, base + ".png", "image/png");
                });
            case "svg":
                return exportSvg(widget, options).then(function (text) {
                    download(text, base + ".svg", "image/svg+xml");
                });
            case "json":
                download(exportJsonText(widget), base + ".drakon", "application/json");
                return Promise.resolve();
            default:
                return Promise.reject(new Error("Unknown export format: " + format));
        }
    }

    root.DrakonExport = {
        exportCanvas: exportCanvas,
        exportPng: exportPng,
        exportSvg: exportSvg,
        exportJsonText: exportJsonText,
        download: download,
        saveAs: saveAs,
        fileBaseName: fileBaseName
    };
})(typeof self !== "undefined" ? self : this);
