/* Connection-form defaults live only on Archi's SWT Display, across script runs. */
var ODataSession = (function () {
    "use strict";
    var KEY = "archi-odata-sync.connection-form.v1";
    var FIELDS = {"OAuth 2.0 (client credentials)": ["tokenUrl", "resource", "clientId", "clientSecret"], "Basic": ["username", "secret"], "Anonymous": []};
    function create(storage) {
        function read() { var raw = storage.get(); return raw ? JSON.parse(String(raw)) : {lastUrl: "", connections: {}}; }
        function write(state) { storage.set(JSON.stringify(state)); }
        return {
            lastUrl: function () { return read().lastUrl; },
            rememberUrl: function (root) { var state = read(); state.lastUrl = root; write(state); },
            mode: function (root) { var connection = read().connections[root]; return connection ? connection.mode : "OAuth 2.0 (client credentials)"; },
            credentials: function (root, mode) { var connection = read().connections[root]; return connection && connection[mode] ? connection[mode] : {}; },
            remember: function (root, mode, values) {
                if (!Object.prototype.hasOwnProperty.call(FIELDS, mode)) throw new Error("Unknown OData authentication mode.");
                var state = read(), connection = state.connections[root] || {}, copy = {};
                FIELDS[mode].forEach(function (field) { copy[field] = String(values[field] || ""); });
                connection.mode = mode; connection[mode] = copy; state.connections[root] = connection; write(state);
            },
            clear: function () { storage.set(null); }
        };
    }
    function current() {
        var display = Java.type("org.eclipse.swt.widgets.Display").getDefault(), JavaString = Java.type("java.lang.String");
        return create({
            get: function () { return display.getData(KEY); },
            // Store a Java string, never a guest JS object tied to a closed script context.
            set: function (value) { display.setData(KEY, value === null ? null : new JavaString(value)); }
        });
    }
    return {create: create, current: current};
}());
if (typeof module !== "undefined") module.exports = ODataSession;
