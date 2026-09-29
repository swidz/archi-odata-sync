/* Loaded only into the worker's private GraalJS context. Shared values are Java atomics. */
var ODataDiscoveryWorker = new (Java.type("java.lang.Runnable"))({run: function () {
    "use strict";
    var input = null, auth = null, JavaString = Java.type("java.lang.String"), last = 0, lastStage = "";
    function check() { if (workerCancel.get()) { var error = new Error("Canceled"); error.cancelled = true; throw error; } }
    function report(stage, completed, total, unit) {
        check(); var now = Date.now();
        if (stage !== lastStage || now - last >= 100 || (total > 0 && completed === total)) {
            workerProgress.set(new JavaString(JSON.stringify({stage: stage, completed: completed, total: total, unit: unit})));
            last = now; lastStage = stage;
        }
    }
    try {
        input = JSON.parse(String(workerInput.getAndSet(null)));
        var documents, rows, warning = "";
        if (input.cacheMode === "reuse") {
            report("Loading cached metadata..."); documents = ODataCache.read(input.root, input.settings, report);
            try { rows = ODataJava.discoverDocuments(input.root, documents, report); }
            catch (e) { if (e.cancelled) throw e; throw new Error("The cached metadata could not be analyzed. Run synchronization again and choose Download fresh."); }
        } else {
            report("Authenticating...");
            auth = input.credentials ? ODataJava.oauth(input.root, input.credentials, input.settings, report) : {header: input.header || ""};
            check(); documents = ODataJava.download(input.root, auth, input.settings, report);
            rows = ODataJava.discoverDocuments(input.root, documents, report); check();
            if (input.cacheMode === "fresh") {
                try { ODataCache.save(input.root, documents, input.settings, report); }
                catch (e) { if (e.cancelled || workerCancel.get()) throw e; warning = "The metadata was downloaded, but its temporary cache could not be saved. You can continue selecting entities; the previous snapshot, if any, is unchanged."; }
            }
        }
        report("Preparing entity list...");
        workerResult.set(new JavaString(JSON.stringify({rows: rows, warning: warning}))); check();
    } catch (error) {
        // Runtime errors already redact token responses; never transfer a stack or credentials.
        workerResult.set(new JavaString(JSON.stringify(workerCancel.get() || error.cancelled ? {cancelled: true} : {error: String(error.message || error).replace(/Bearer\s+\S+/gi, "Bearer [redacted]")})));
    } finally {
        if (auth) { if (auth.clear) auth.clear(); auth.header = ""; }
        if (input) { if (input.credentials) input.credentials.clientSecret = ""; input.header = ""; }
        workerInput.set(null);
    }
}});
