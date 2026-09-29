/* UI-thread coordinator. Background discovery never receives an Archi model or SWT object. */
var ODataProgress = (function () {
    "use strict";
    function discovery(libraryRoot, root, auth, settings) {
        var window = ODataUI.progress(), context = null, thread = null;
        var Reference = Java.type("java.util.concurrent.atomic.AtomicReference"), JavaString = Java.type("java.lang.String");
        var input = new Reference(), progress = new Reference(), result = new Reference(), cancel = new (Java.type("java.util.concurrent.atomic.AtomicBoolean"))(false);
        try {
            window.update("Preparing discovery..."); window.check();
            var Context = Java.type("org.graalvm.polyglot.Context"), Files = Java.type("java.nio.file.Files"), Paths = Java.type("java.nio.file.Paths");
            context = Context.newBuilder(Java.to(["js"], "java.lang.String[]")).allowAllAccess(true).build();
            var bindings = context.getBindings("js");
            bindings.workerInput = input; bindings.workerProgress = progress; bindings.workerResult = result; bindings.workerCancel = cancel;
            input.set(new JavaString(JSON.stringify({root: root, credentials: auth.credentials, header: auth.header, settings: settings})));
            ["core", "oauth", "java-runtime", "discovery-worker"].forEach(function (name) {
                context.eval("js", String(Files.readString(Paths.get(libraryRoot + "/lib/" + name + ".js"))));
            });
            thread = new (Java.type("java.lang.Thread"))(context.eval("js", "ODataDiscoveryWorker"), "OData discovery");
            thread.setDaemon(true); thread.start();
            var previous = "";
            while (thread.isAlive()) {
                window.pump(); if (window.cancelled()) cancel.set(true);
                var state = progress.get();
                if (state !== null && String(state) !== previous) { previous = String(state); var value = JSON.parse(previous); window.update(value.stage, value.completed, value.total, value.unit); }
                Java.type("java.lang.Thread").sleep(25);
            }
            window.check();
            var outcome = result.get(); ODataCore.assert(outcome !== null, "OData discovery did not return a result."); outcome = JSON.parse(String(outcome));
            if (outcome.cancelled) { var error = new Error("OData synchronization canceled."); error.cancelled = true; throw error; }
            if (outcome.error) throw new Error(outcome.error);
            return outcome.rows;
        } finally {
            // Never close a context while its worker is still inside a blocking JDK call.
            if (thread && thread.isAlive()) { cancel.set(true); while (thread.isAlive()) { window.pump(); Java.type("java.lang.Thread").sleep(25); } }
            try { if (context) context.close(); }
            finally { input.set(null); progress.set(null); result.set(null); window.close(); if (auth.clear) auth.clear(); auth.header = ""; }
        }
    }
    function synchronize(model, root, rows, settings) {
        var window = ODataUI.progress();
        function report(stage, completed, total, unit) { window.update(stage, completed, total, unit); window.check(); }
        try {
            report("Preparing model updates...");
            var plan = ODataArchi.prepare(model, root, rows, settings, report);
            window.lock();
            return ODataArchi.apply(model, plan, report);
        } finally { window.close(); }
    }
    return {discovery: discovery, synchronize: synchronize};
}());
