/* Native SWT dialogs; selected IDs are independent of filtering and sort order. */
var ODataUI = (function () {
    "use strict";
    var C = ODataCore, SWT = Java.type("org.eclipse.swt.SWT"), Display = Java.type("org.eclipse.swt.widgets.Display"),
        Shell = Java.type("org.eclipse.swt.widgets.Shell"), Text = Java.type("org.eclipse.swt.widgets.Text"), Label = Java.type("org.eclipse.swt.widgets.Label"),
        Button = Java.type("org.eclipse.swt.widgets.Button"), Composite = Java.type("org.eclipse.swt.widgets.Composite"),
        GridLayout = Java.type("org.eclipse.swt.layout.GridLayout"), GridData = Java.type("org.eclipse.swt.layout.GridData");
    function fill(both) { return new GridData(SWT.FILL, both ? SWT.FILL : SWT.CENTER, true, !!both); }
    function dialog(title, columns) {
        var parent = typeof shell !== "undefined" && shell ? shell : Display.getDefault();
        var d = new Shell(parent, SWT.DIALOG_TRIM | SWT.APPLICATION_MODAL | SWT.RESIZE);
        d.setText(title); d.setLayout(new GridLayout(columns || 1, false)); return d;
    }
    function loop(d) { var display = d.getDisplay(); while (!d.isDisposed()) { if (!display.readAndDispatch()) display.sleep(); } }
    function credentials(remembered) {
        remembered = remembered || {};
        var d = dialog("OData credentials", 2), result = null, user = null;
        new Label(d, SWT.NONE).setText("Username"); user = new Text(d, SWT.BORDER); user.setLayoutData(fill(false));
        new Label(d, SWT.NONE).setText("Password");
        var secret = new Text(d, SWT.BORDER | SWT.PASSWORD); secret.setLayoutData(fill(false));
        user.setText(C.text(remembered.username)); secret.setText(C.text(remembered.secret));
        var ok = new Button(d, SWT.PUSH); ok.setText("Continue"); ok.setEnabled(false);
        var cancel = new Button(d, SWT.PUSH); cancel.setText("Cancel");
        function valid() { ok.setEnabled(String(secret.getText()).trim().length > 0 && (!user || String(user.getText()).trim().length > 0)); }
        secret.addListener(SWT.Modify, valid); if (user) user.addListener(SWT.Modify, valid);
        ok.addListener(SWT.Selection, function () { result = {username: user ? String(user.getText()) : "", secret: String(secret.getText())}; secret.setText(""); d.close(); });
        cancel.addListener(SWT.Selection, function () { d.close(); });
        d.setDefaultButton(ok); d.setSize(600, 190); valid(); d.open(); user.setFocus(); loop(d); return result;
    }
    function oauthCredentials(settings, remembered) {
        settings = settings || {}; remembered = remembered || {};
        var d = dialog("OData OAuth 2.0", 2), result = null, inputs = {};
        var definitions = [
            {key: "tokenUrl", label: "OAuth token URL", hint: "Replace {tenant-id} with your tenant ID", value: C.text(settings.oauthTokenUrl).trim() || "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token"},
            {key: "resource", label: "Resource", hint: "https://your-environment.example.com", value: settings.oauthResource},
            {key: "clientId", label: "Client ID", hint: "Application (client) ID", value: settings.oauthClientId},
            {key: "clientSecret", label: "Client secret", hint: "Secret value", secret: true}
        ];
        definitions.forEach(function (f) { new Label(d, SWT.NONE).setText(f.label); var input = new Text(d, SWT.BORDER | (f.secret ? SWT.PASSWORD : SWT.NONE));
            input.setLayoutData(fill(false)); input.setMessage(f.hint); input.setText(C.text(remembered[f.key] !== undefined ? remembered[f.key] : f.value)); inputs[f.key] = input; });
        var info = new Label(d, SWT.WRAP); info.setText("Replace {tenant-id} with your tenant ID. The resource identifies the API. These values, including the masked secret, are remembered for this OData URL until Archi closes. They are not saved to the model or settings.");
        var infoLayout = fill(false); infoLayout.horizontalSpan = 2; info.setLayoutData(infoLayout);
        var ok = new Button(d, SWT.PUSH); ok.setText("Connect"); var cancel = new Button(d, SWT.PUSH); cancel.setText("Cancel");
        function values() { var value = {}; definitions.forEach(function (f) { var v = String(inputs[f.key].getText()); value[f.key] = f.secret ? v : v.trim(); }); return value; }
        function valid() { ok.setEnabled(definitions.every(function (f) { return String(inputs[f.key].getText()).trim().length > 0; })); }
        definitions.forEach(function (f) { inputs[f.key].addListener(SWT.Modify, valid); });
        ok.addListener(SWT.Selection, function () { var value = values(); try { ODataOAuth.validate(value); } catch (e) { value.clientSecret = ""; window.alert(String(e.message)); return; }
            result = value; inputs.clientSecret.setText(""); d.close(); });
        cancel.addListener(SWT.Selection, function () { inputs.clientSecret.setText(""); d.close(); });
        d.setDefaultButton(ok); d.setSize(800, 320); valid(); d.open(); inputs.tokenUrl.setFocus(); loop(d); return result;
    }
    function authentication(root, settings, connect) {
        var session = ODataSession.current(), previous = session.mode(root), modes = ["OAuth 2.0 (client credentials)", "Anonymous", "Basic"];
        modes = [previous].concat(modes.filter(function (mode) { return mode !== previous; }));
        var mode = window.promptSelection("OData authentication", modes);
        if (mode === null) return null;
        mode = String(mode); if (mode === "Anonymous") { session.remember(root, mode, {}); return {header: ""}; }
        if (mode === "Basic") { var basic = credentials(session.credentials(root, mode)); if (!basic) return null;
            try { session.remember(root, mode, basic); return {header: ODataJava.basic(basic.username, basic.secret)}; } finally { basic.secret = ""; } }
        var c = oauthCredentials(settings, session.credentials(root, mode)); if (!c) return null;
        try { session.remember(root, mode, c); return connect ? connect(c) : ODataJava.oauth(root, c, settings); } finally { c.clientSecret = ""; }
    }
    function progress() {
        var d = dialog("OData synchronization"), display = d.getDisplay(), cancelled = false, cancellable = true;
        var stage = new Label(d, SWT.WRAP); stage.setLayoutData(fill(false)); stage.setText("Preparing...");
        var container = new Composite(d, SWT.NONE), stack = new (Java.type("org.eclipse.swt.custom.StackLayout"))();
        container.setLayout(stack); var layout = fill(false); layout.heightHint = 22; container.setLayoutData(layout);
        var Bar = Java.type("org.eclipse.swt.widgets.ProgressBar"), busy = new Bar(container, SWT.INDETERMINATE), bar = new Bar(container, SWT.NONE);
        bar.setMaximum(1000); stack.topControl = busy;
        var detail = new Label(d, SWT.WRAP); detail.setLayoutData(fill(false)); detail.setText("Please wait.");
        var note = new Label(d, SWT.WRAP); note.setLayoutData(fill(false)); note.setText("You can cancel before model updates begin.");
        var cancel = new Button(d, SWT.PUSH); cancel.setText("Cancel"); cancel.setLayoutData(new GridData(SWT.END, SWT.CENTER, false, false));
        function requestCancel() { if (!cancellable) return; cancelled = true; cancel.setEnabled(false); stage.setText("Canceling..."); detail.setText("Waiting for the current operation to stop safely."); d.layout(); }
        cancel.addListener(SWT.Selection, requestCancel);
        d.addListener(SWT.Close, function (event) { event.doit = false; requestCancel(); });
        function pump() { for (var i = 0; i < 50 && display.readAndDispatch(); i++) { /* Keep SWT responsive on the UI thread. */ } }
        function check() { pump(); if (cancelled) { var error = new Error("OData synchronization canceled."); error.cancelled = true; throw error; } }
        function update(message, completed, total, unit) {
            if (cancelled) return;
            stage.setText(message);
            var known = Number(total) > 0, value = Number(completed) || 0;
            stack.topControl = known ? bar : busy; if (known) bar.setSelection(Math.min(1000, Math.floor(value / total * 1000)));
            if (unit === "bytes") {
                detail.setText((value / 1000000).toFixed(2) + " MB" + (known ? " of " + (total / 1000000).toFixed(2) + " MB (" + Math.min(100, Math.floor(value / total * 100)) + "%)" : " downloaded"));
            } else detail.setText(known ? value + " of " + total + " " + (unit || "items") : "Please wait.");
            container.layout(); d.layout();
        }
        d.setSize(640, 235); d.open(); pump();
        return {
            update: update, pump: pump, check: check, cancelled: function () { return cancelled; },
            lock: function () { check(); cancellable = false; cancel.setEnabled(false); note.setText("Applying model changes. Use Edit > Undo after completion to revert them."); d.layout(); },
            close: function () { if (!d.isDisposed()) d.dispose(); }
        };
    }
    function entities(rows, selected) {
        var d = dialog("Select OData entities"), chosen = Object.create(null), result = null, field = "name", descending = false;
        selected.forEach(function (id) { chosen[id] = true; });
        var info = new Label(d, SWT.WRAP); info.setText("Choose entity sets to create or refresh as Application Interfaces and Data Objects. Unselected entities remain unchanged."); info.setLayoutData(fill(false));
        var search = new Text(d, SWT.BORDER | SWT.SEARCH | SWT.ICON_SEARCH | SWT.ICON_CANCEL); search.setMessage("Search entity name, title or type"); search.setLayoutData(fill(false));
        var bar = new Composite(d, SWT.NONE); bar.setLayout(new GridLayout(3, false)); bar.setLayoutData(fill(false));
        var all = new Button(bar, SWT.PUSH); all.setText("Select filtered"); var clear = new Button(bar, SWT.PUSH); clear.setText("Clear selection");
        var count = new Label(bar, SWT.NONE); count.setLayoutData(fill(false));
        var table = new (Java.type("org.eclipse.swt.widgets.Table"))(d, SWT.CHECK | SWT.BORDER | SWT.FULL_SELECTION | SWT.V_SCROLL | SWT.H_SCROLL | SWT.MULTI);
        table.setHeaderVisible(true); table.setLinesVisible(true); table.setLayoutData(fill(true));
        var columns = [{title: "Entity set", field: "name", width: 240}, {title: "Title", field: "title", width: 200}, {title: "Entity type", field: "type", width: 270}, {title: "Fields / availability", field: "status", width: 340}];
        columns.forEach(function (c) { var col = new (Java.type("org.eclipse.swt.widgets.TableColumn"))(table, SWT.NONE); col.setText(c.title); col.setWidth(c.width);
            col.addListener(SWT.Selection, function () { descending = field === c.field ? !descending : false; field = c.field; render(); }); });
        var buttons = new Composite(d, SWT.NONE); buttons.setLayout(new GridLayout(2, true)); buttons.setLayoutData(new GridData(SWT.END, SWT.CENTER, false, false));
        var ok = new Button(buttons, SWT.PUSH); ok.setText("Synchronize"); var cancel = new Button(buttons, SWT.PUSH); cancel.setText("Cancel");
        function visible() { var q = String(search.getText()).trim().toLowerCase(); return rows.filter(function (r) { return !q || columns.some(function (c) { return C.text(r[c.field]).toLowerCase().indexOf(q) >= 0; }); }).sort(function (a, b) { var n = C.text(a[field]).localeCompare(C.text(b[field])); return descending ? -n : n; }); }
        function update() { var n = rows.filter(function (r) { return r.available && chosen[r.id]; }).length; count.setText(n + " selected / " + rows.length + " listed"); ok.setEnabled(n > 0); bar.layout(); }
        function render() { table.setRedraw(false); try { table.removeAll(); visible().forEach(function (r) { var item = new (Java.type("org.eclipse.swt.widgets.TableItem"))(table, SWT.NONE);
            item.setData(r.id); item.setText(Java.to(columns.map(function (c) { return C.text(r[c.field]); }), "java.lang.String[]")); item.setChecked(!!chosen[r.id] && r.available);
            if (!r.available) item.setForeground(d.getDisplay().getSystemColor(SWT.COLOR_DARK_GRAY)); }); } finally { table.setRedraw(true); } update(); }
        table.addListener(SWT.Selection, function (e) { if (Number(e.detail) !== Number(SWT.CHECK)) return; var id = String(e.item.getData()), row = rows.filter(function (r) { return r.id === id; })[0];
            chosen[id] = row.available && !!e.item.getChecked(); e.item.setChecked(!!chosen[id]); update(); });
        search.addListener(SWT.Modify, render); all.addListener(SWT.Selection, function () { visible().forEach(function (r) { if (r.available) chosen[r.id] = true; }); render(); });
        clear.addListener(SWT.Selection, function () { chosen = Object.create(null); render(); });
        ok.addListener(SWT.Selection, function () { result = rows.filter(function (r) { return r.available && chosen[r.id]; }); d.close(); });
        cancel.addListener(SWT.Selection, function () { d.close(); });
        d.setDefaultButton(ok); d.setSize(1120, 650); render(); d.open(); search.setFocus(); loop(d); return result;
    }
    return {authentication: authentication, credentials: credentials, oauthCredentials: oauthCredentials, entities: entities, progress: progress};
}());
