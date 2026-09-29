var ODataApp = (function () {
    "use strict";
    function execute(io, settings) {
        var root = io.promptUrl(); if (root === null) return {cancelled: true};
        root = io.normalizeUrl(root);
        var auth = io.authenticate(root, settings); if (auth === null) return {cancelled: true};
        try {
            var rows = io.discover(root, auth, settings);
            if (!rows.length) { io.info("The service document advertises no entity sets."); return {empty: true}; }
            var selection = io.select(rows, io.saved()[root] || []);
            if (!selection || !selection.length) return {cancelled: true};
            var plan = io.prepare(root, selection, settings), result = io.apply(plan);
            io.info("Synchronized " + result.entities + " entities: " + result.created + " elements created, " + result.updated + " updated.\nThe environment Node serves each API interface. Each interface has Read/Write Access to its Data Object. Review the model and save it when ready.");
            return result;
        } finally { if (auth.clear) auth.clear(); auth.header = ""; }
    }
    function run(settings) {
        try {
            ODataCore.assert(typeof model !== "undefined" && model, "Open and select an Archi model first.");
            var m = model;
            return execute({
                promptUrl: function () { return window.prompt("OData 4.0 service root URL (or $metadata URL)", ODataCore.text(m.prop("OData-LastServiceUrl")) || settings.defaultUrl || ""); },
                normalizeUrl: ODataJava.normalizeUrl, authenticate: ODataUI.authentication,
                discover: function (root, auth, options) { return ODataJava.discover(root, auth, options, function (message) { console.log(message); }); },
                select: ODataUI.entities, saved: function () { return ODataArchi.saved(m); },
                prepare: function (root, rows, options) { return ODataArchi.prepare(m, root, rows, options); },
                apply: function (plan) { return ODataArchi.apply(m, plan); }, info: function (message) { window.alert(message); }
            }, settings);
        } catch (e) {
            // Network errors may contain response URLs. Do not log request headers or response bodies.
            var message = ODataCore.text(e.message || e).replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
            window.alert("OData synchronization stopped.\n\n" + message + "\n\nIf model changes had started, use Edit > Undo. The script never saves the model automatically.");
            return {error: true};
        }
    }
    return {execute: execute, run: run};
}());
if (typeof module !== "undefined") module.exports = ODataApp;
