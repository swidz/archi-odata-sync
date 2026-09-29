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
            var result = io.synchronize(root, selection, settings);
            io.info("Synchronized " + result.entities + " entities: " + result.created + " elements created, " + result.updated + " updated.\nThe environment Node serves each API interface. Each interface has Read/Write Access to its Data Object. Review the model and save it when ready.");
            return result;
        } finally { if (auth.clear) auth.clear(); auth.header = ""; }
    }
    function run(settings, libraryRoot) {
        try {
            ODataCore.assert(typeof model !== "undefined" && model, "Open and select an Archi model first.");
            var m = model, session = ODataSession.current();
            return execute({
                promptUrl: function () { return window.prompt("OData 4.0 service root URL (or $metadata URL)", session.lastUrl() || settings.defaultUrl || ""); },
                normalizeUrl: function (value) { var root = ODataJava.normalizeUrl(value); session.rememberUrl(root); return root; },
                authenticate: function (root, options) { return ODataUI.authentication(root, options, function (credentials) {
                    var copy = ODataOAuth.validate(credentials); return {credentials: copy, clear: function () { copy.clientSecret = ""; }};
                }); },
                discover: function (root, auth, options) { return ODataProgress.discovery(libraryRoot, root, auth, options); },
                select: ODataUI.entities, saved: function () { return ODataArchi.saved(m); },
                synchronize: function (root, rows, options) { return ODataProgress.synchronize(m, root, rows, options); },
                info: function (message) { window.alert(message); }
            }, settings);
        } catch (e) {
            if (e.cancelled) return {cancelled: true};
            // Network errors may contain response URLs. Do not log request headers or response bodies.
            var message = ODataCore.text(e.message || e).replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
            window.alert("OData synchronization stopped.\n\n" + message + "\n\nIf model changes had started, use Edit > Undo. The script never saves the model automatically.");
            return {error: true};
        }
    }
    return {execute: execute, run: run};
}());
if (typeof module !== "undefined") module.exports = ODataApp;
