/*
 * DrakonValidationUI — attaches a DrakonValidator to a DrakonWidget instance.
 *
 *   var ui = DrakonValidationUI.create({
 *       validator: DrakonValidator.createValidator(config),
 *       getWidget: function () { return drakon },   // the DrakonWidget
 *       mount: document.getElementById("main"),     // where the panel goes
 *       mode: "report",                             // or "strict"
 *       onEditRules: function (evt) { ... },        // optional "Rules..." button
 *       isBlocking: function (issue) { ... }        // optional, see below
 *   })
 *   sender = ui.wrapEditSender(sender)             // before drakon.setDiagram(...)
 *   ui.validateNow()                                // after drakon.setDiagram(...)
 *
 * Modes:
 *   report — every edit is re-validated and the panel is updated.
 *   strict — an edit that introduces new blocking issues is undone.
 *            A rule is blocking if its config says "blocking": true; otherwise
 *            blocking = severity "error" from the "structure" pack.
 *
 * The UI never writes styles into the diagram: highlighting would otherwise
 * become part of the saved document.
 */
(function (root) {
    "use strict";

    function create(options) {
        var validator = options.validator;
        var getWidget = options.getWidget;
        var mode = options.mode || "report";
        var isBlocking = options.isBlocking || function (issue) {
            if (issue.blocking !== undefined) { return issue.blocking; }
            return issue.severity === "error" && issue.pack === "structure";
        };
        var last = null;
        var acceptedBlocking = 0;
        var undoing = false;
        var scheduled = false;
        var collapsed = false;

        var panel = el("div", "dv-panel");
        var header = el("div", "dv-header");
        var summary = el("span", "dv-summary");
        var modeButton = el("button", "dv-button");
        var rulesButton = el("button", "dv-button");
        var toggleButton = el("button", "dv-button dv-toggle");
        var notice = el("div", "dv-notice");
        var list = el("ul", "dv-list");

        rulesButton.textContent = "Rules…";
        rulesButton.title = "Edit validation rules";
        toggleButton.title = "Collapse / expand";
        header.appendChild(summary);
        header.appendChild(modeButton);
        if (options.onEditRules) { header.appendChild(rulesButton); }
        header.appendChild(toggleButton);
        panel.appendChild(header);
        panel.appendChild(notice);
        panel.appendChild(list);
        (options.mount || document.body).appendChild(panel);

        modeButton.addEventListener("click", function () {
            setMode(mode === "strict" ? "report" : "strict");
        });
        rulesButton.addEventListener("click", function (evt) { options.onEditRules(evt); });
        toggleButton.addEventListener("click", function () {
            collapsed = !collapsed;
            render();
        });

        function el(tag, className) {
            var e = document.createElement(tag);
            if (className) { e.className = className; }
            return e;
        }

        function currentDiagram() {
            var widget = getWidget();
            if (!widget || !widget.exportJson) { return null; }
            try {
                return JSON.parse(widget.exportJson());
            } catch (ex) {
                return null;
            }
        }

        function countBlocking(result) {
            return result.issues.filter(isBlocking).length;
        }

        function validateNow() {
            var diagram = currentDiagram();
            if (!diagram) { return null; }
            last = validator.validate(diagram);
            acceptedBlocking = countBlocking(last);
            render();
            if (options.onResult) { options.onResult(last); }
            return last;
        }

        function afterEdit() {
            scheduled = false;
            var diagram = currentDiagram();
            if (!diagram) { return; }
            var result = validator.validate(diagram);
            var blocking = countBlocking(result);
            if (mode === "strict" && !undoing && blocking > acceptedBlocking) {
                var reasons = result.issues.filter(isBlocking).map(function (i) { return i.message; });
                undoing = true;
                getWidget().undo();
                setTimeout(function () {
                    undoing = false;
                    validateNow();
                    showNotice("Edit rejected: " + reasons.slice(0, 3).join("; "));
                }, 0);
                return;
            }
            last = result;
            acceptedBlocking = blocking;
            render();
            if (options.onResult) { options.onResult(last); }
        }

        function wrapEditSender(sender) {
            return {
                stop: function () { if (sender.stop) { sender.stop(); } },
                pushEdit: function (edit) {
                    sender.pushEdit(edit);
                    // The widget applies the edit to its model after pushEdit
                    // returns, so validate on the next tick.
                    if (!scheduled) {
                        scheduled = true;
                        setTimeout(afterEdit, 0);
                    }
                }
            };
        }

        function setMode(newMode) {
            mode = newMode === "strict" ? "strict" : "report";
            render();
            if (options.onModeChanged) { options.onModeChanged(mode); }
        }

        var noticeTimer = null;
        function showNotice(text) {
            notice.textContent = text;
            notice.style.display = "block";
            clearTimeout(noticeTimer);
            noticeTimer = setTimeout(function () { notice.style.display = "none"; }, 5000);
        }

        function plural(n, word) {
            return n + " " + word + (n === 1 ? "" : "s");
        }

        function render() {
            modeButton.textContent = mode === "strict" ? "Strict" : "Report";
            modeButton.title = mode === "strict"
                ? "Strict: edits that add structural errors are undone. Click for Report mode."
                : "Report: problems are only listed. Click for Strict mode.";
            toggleButton.textContent = collapsed ? "▴" : "▾";
            panel.classList.toggle("dv-collapsed", collapsed);
            list.innerHTML = "";
            if (!last) {
                summary.textContent = "Validation";
                return;
            }
            var c = last.counts;
            summary.textContent = last.issues.length === 0
                ? "✓ No issues"
                : [plural(c.error, "error"), plural(c.warning, "warning"), c.info + " info"].join(" · ");
            panel.classList.toggle("dv-has-errors", c.error > 0);
            last.issues.forEach(function (issue) {
                var li = el("li", "dv-issue dv-" + issue.severity);
                var badge = el("span", "dv-badge");
                badge.textContent = issue.severity;
                var msg = el("span", "dv-message");
                msg.textContent = issue.message;
                var rule = el("span", "dv-rule");
                rule.textContent = issue.ruleId + (issue.itemId ? " · item " + issue.itemId : "");
                li.appendChild(badge);
                li.appendChild(msg);
                li.appendChild(rule);
                if (issue.itemId) {
                    li.classList.add("dv-clickable");
                    li.title = "Show item " + issue.itemId;
                    li.addEventListener("click", function () { showItem(issue.itemId); });
                }
                list.appendChild(li);
            });
        }

        function showItem(itemId) {
            try {
                getWidget().showItem(itemId);
            } catch (ex) {
                // Items that are not drawn (e.g. broken links) cannot be shown.
                showNotice("Item " + itemId + " is not visible on the canvas");
            }
        }

        render();

        return {
            wrapEditSender: wrapEditSender,
            validateNow: validateNow,
            setMode: setMode,
            getMode: function () { return mode; },
            getLastResult: function () { return last; },
            setValidator: function (v) { validator = v; return validateNow(); },
            destroy: function () { panel.parentNode && panel.parentNode.removeChild(panel); }
        };
    }

    root.DrakonValidationUI = { create: create };
})(typeof self !== "undefined" ? self : this);
