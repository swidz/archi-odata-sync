/* Portable discovery, CSDL resolution and documentation. No network or model writes. */
var ODataCore = (function () {
    "use strict";
    var OWNER = "archi-odata-sync", PREFIX = "OData-";
    var START = "<!-- archi-odata-sync:begin -->", END = "<!-- archi-odata-sync:end -->";
    function assert(value, message) { if (!value) throw new Error(message); }
    function text(value) { return value === null || value === undefined ? "" : String(value); }
    function normalizeUrl(value) {
        var url = text(value).trim();
        assert(url && !/[\s\\<>"\x00-\x1f\x7f]/.test(url), "Enter an absolute HTTP(S) OData service URL.");
        var m = /^(https?):\/\/([^/?#]+)([^?#]*)(.*)$/i.exec(url);
        assert(m && !m[4] && m[2].indexOf("@") < 0, "Use a service root or $metadata URL without credentials, query parameters, or fragments.");
        var scheme = m[1].toLowerCase(), host = m[2].toLowerCase(), path = m[3] || "/";
        assert(/^(\[[0-9a-f:]+\]|[a-z0-9._-]+)(:[0-9]+)?$/.test(host), "Invalid service host.");
        host = host.replace(scheme === "https" ? /:443$/ : /:80$/, "");
        assert(!/(^|\/)\.{1,2}(\/|$)/.test(path) && !/%(?:2e|2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(path), "Use a canonical service path without encoded separators or dot segments.");
        path = path.replace(/\/\$metadata\/?$/, "/");
        return scheme + "://" + host + path.replace(/\/+$/, "") + "/";
    }
    function key(root, name, role) { return JSON.stringify([root, name, role]); }
    function qualified(name, namespace, aliases) {
        var n = text(name), dot = n.indexOf(".");
        if (dot < 0) return namespace + "." + n;
        return aliases[n.slice(0, dot)] ? aliases[n.slice(0, dot)] + n.slice(dot) : n;
    }
    function discoveryLimit(message) {
        var error = new Error(message);
        error.discoveryLimit = true;
        return error;
    }
    function fieldLimit(settings, name, fallback) {
        var value = settings[name] === undefined ? fallback : Number(settings[name]);
        if (!isFinite(value) || value <= 0 || Math.floor(value) !== value || value > 9007199254740991) {
            throw discoveryLimit(name + " in config/settings.js must be a positive whole number.");
        }
        return value;
    }
    function catalog(metadata, checkpoint, settings) {
        settings = settings || {};
        checkpoint = checkpoint || function () {};
        var perEntityLimit = fieldLimit(settings, "maxExpandedFieldsPerEntity", 10000);
        var totalLimit = fieldLimit(settings, "maxTotalExpandedFields", 500000);
        var types = Object.create(null), sets = Object.create(null), aliases = Object.create(null);
        var resolved = Object.create(null), cachedSize = 0, expandedCount = 0, work = 0;
        // Check cancellation within a single large type/entity, independently of UI update throttling.
        function step() { if (++work % 256 === 0) checkpoint(); }
        function entityLimit(count) {
            assert(count <= perEntityLimit, "Entity exceeds maxExpandedFieldsPerEntity (" + perEntityLimit +
                "). No partial fields will be imported. Adjust the installed config/settings.js if needed.");
        }
        metadata.schemas.forEach(function (s) {
            step();
            if (s.alias) { assert(!aliases[s.alias] || aliases[s.alias] === s.namespace, "Duplicate CSDL alias."); aliases[s.alias] = s.namespace; }
        });
        (metadata.aliases || []).forEach(function (a) { step(); aliases[a.alias] = a.namespace; });
        metadata.schemas.forEach(function (s) {
            (s.types || []).forEach(function (t) {
                step();
                var id = s.namespace + "." + t.name;
                assert(!types[id], "Duplicate CSDL type: " + id);
                types[id] = Object.assign({}, t, {id: id, namespace: s.namespace});
            });
            (s.sets || []).forEach(function (e) {
                step();
                assert(!sets[e.name], "Ambiguous entity set in metadata: " + e.name);
                sets[e.name] = {name: e.name, type: qualified(e.type, s.namespace, aliases), container: e.container};
            });
        });
        function resolve(name) {
            var chain = [], visiting = Object.create(null), current = name;
            // Walk inheritance iteratively so deep metadata cannot overflow the JS call stack.
            while (current && !resolved[current]) {
                step();
                assert(!visiting[current], "Cyclic CSDL inheritance: " + current);
                var type = types[current];
                assert(type, "Type not defined in this $metadata document: " + current);
                visiting[current] = true;
                chain.push(type);
                current = type.base ? qualified(type.base, type.namespace, aliases) : "";
            }
            var result = current ? resolved[current] : {fields: [], navigation: [], keys: [], open: false};
            while (chain.length) {
                step();
                var t = chain.pop(), names = Object.create(null);
                entityLimit(result.fields.length + (t.fields || []).length + result.navigation.length + (t.navigation || []).length);
                result = {fields: result.fields.slice(), navigation: result.navigation.slice(), keys: result.keys.slice(), open: result.open || !!t.open};
                result.fields.forEach(function (f) { step(); names[f.name] = true; });
                (t.fields || []).forEach(function (f) {
                    step();
                    assert(!names[f.name], "Duplicate inherited field: " + f.name);
                    names[f.name] = true;
                    var fieldType = f.type || "Edm.String", collection = /^Collection\((.+)\)$/.exec(fieldType);
                    result.fields.push(Object.assign({}, f, {declaredOn: t.id,
                        type: qualified(collection ? collection[1] : fieldType, t.namespace, aliases), collection: !!collection}));
                });
                (t.navigation || []).forEach(function (f) { step(); result.navigation.push(Object.assign({}, f)); });
                if (t.keys && t.keys.length) result.keys = t.keys.slice();
                // Reuse resolved types, but bound the cache too: inherited arrays can otherwise multiply memory.
                var size = result.fields.length + result.navigation.length + result.keys.length + 1;
                if (cachedSize + size <= totalLimit) { resolved[t.id] = result; cachedSize += size; }
            }
            return result;
        }
        function fields(name) {
            var base = resolve(name), all = [], keys = Object.create(null), entityCount = 0;
            base.keys.forEach(function (key) { step(); keys[key] = true; });
            function takeField() {
                step();
                entityLimit(entityCount + 1);
                if (expandedCount >= totalLimit) {
                    throw discoveryLimit("Metadata analysis exceeds maxTotalExpandedFields (" + totalLimit +
                        "). No model changes have been made. Adjust the installed config/settings.js if needed; higher limits use more memory.");
                }
                entityCount++;
                // Count attempted rows even if this entity is later unavailable; repeated failures still cost work.
                expandedCount++;
            }
            function expand(list, prefix, trail) {
                list.forEach(function (f) {
                    takeField();
                    var path = prefix + f.name, target = types[f.type];
                    var row = Object.assign({}, f, {path: path, key: !!keys[path],
                        displayType: f.collection ? "Collection(" + f.type + ")" : f.type});
                    if (target && target.kind === "EnumType") row.enumMembers = (target.members || []).join(", ");
                    if (target && target.kind === "TypeDefinition") row.underlyingType = target.underlyingType;
                    all.push(row);
                    if (target && target.kind === "ComplexType") {
                        if (trail.indexOf(f.type) >= 0 || trail.length >= 12) row.recursive = true;
                        else expand(resolve(f.type).fields, path + (f.collection ? "[]" : "") + ".", trail.concat(f.type));
                    } else if (!target && f.type.indexOf("Edm.") !== 0) {
                        throw new Error("Field type not defined in this $metadata document: " + f.type);
                    }
                });
            }
            expand(base.fields, "", [name]);
            // Callers receive their own rows; cached type definitions remain internal and unmodified.
            var navigation = base.navigation.map(function (f) { takeField(); return Object.assign({}, f); });
            return {fields: all, navigation: navigation, open: base.open};
        }
        return {sets: sets, types: types, fields: fields};
    }
    function discover(service, metadata, root, resolveUrl, progress, settings) {
        progress = progress || function () {};
        assert(service && Array.isArray(service.value), "The URL did not return an OData JSON service document (expected a value array).");
        assert(!service["@odata.nextLink"], "Paged service documents are unsupported. No changes were applied.");
        var entries = service.value.filter(function (entry) { return !entry.kind || entry.kind === "EntitySet"; });
        var entityIndex = 0;
        function checkpoint() { progress("Analyzing entities...", entityIndex, entries.length, "entities"); }
        var c = catalog(metadata, checkpoint, settings), seen = Object.create(null), rows = [];
        entries.forEach(function (entry, i) {
            entityIndex = i;
            checkpoint();
            assert(typeof entry.name === "string" && entry.name && typeof entry.url === "string" && entry.url, "Invalid entity-set entry in service document.");
            assert(!seen[entry.name], "Duplicate entity set in service document: " + entry.name); seen[entry.name] = true;
            var set = c.sets[entry.name], row = {id: entry.name, name: entry.name, title: text(entry.title), url: "", type: set ? set.type : "", available: false, fields: [], navigation: [], status: ""};
            try {
                row.url = resolveUrl(root, entry.url);
                assert(set, "Entity set missing from $metadata");
                assert(c.types[set.type] && c.types[set.type].kind === "EntityType", "Entity type missing from $metadata");
                var f = c.fields(set.type); row.fields = f.fields; row.navigation = f.navigation; row.open = f.open;
                row.available = true; row.status = row.fields.length + " fields";
            } catch (e) {
                // Cancellation and a whole-discovery budget failure must never become an unavailable row.
                if (e.cancelled || e.discoveryLimit) throw e;
                row.status = text(e.message || e);
            }
            rows.push(row);
        });
        rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
        progress("Analyzing entities...", entries.length, entries.length, "entities");
        return rows;
    }
    function markdown(value) {
        return text(value).replace(/[\r\n\t]+/g, " ").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/([\\`*_{}\[\]()#+.!|~-])/g, "\\$1");
    }
    function documentation(entity, role) {
        var lines = [START, "## OData " + (role === "interface" ? "application interface" : "data entity"), "",
            "Entity set: " + markdown(entity.name), "", "Entity type: " + markdown(entity.type), "", "Endpoint: " + markdown(entity.url), "", "### Fields", ""];
        entity.fields.forEach(function (f, i) {
            var details = [f.displayType, f.nullable === false ? "required" : "nullable"];
            if (f.key) details.push("key");
            ["maxLength", "precision", "scale"].forEach(function (facet) { if (f[facet] !== undefined && f[facet] !== "") details.push(facet + "=" + f[facet]); });
            if (f.enumMembers) details.push("values: " + f.enumMembers);
            if (f.underlyingType) details.push("underlying type: " + f.underlyingType);
            if (f.recursive) details.push("recursive complex type; expansion stopped");
            if (f.description) details.push(f.description);
            lines.push((i + 1) + ". **" + markdown(f.path) + "** — " + markdown(details.join("; ")));
        });
        if (!entity.fields.length) lines.push("No declared structural fields.");
        if (entity.open) lines.push("", "Open entity type: runtime-defined fields may also exist.");
        if (entity.navigation.length) {
            lines.push("", "### Navigation properties", "");
            entity.navigation.forEach(function (n, i) { lines.push((i + 1) + ". **" + markdown(n.name) + "** — " + markdown(n.type)); });
        }
        lines.push("", "Read/Write Access is the architecture mapping requested for this entity; it does not assert server write permissions.", END);
        return lines.join("\n");
    }
    function mergeDocumentation(existing, generated) {
        var value = text(existing), start = value.indexOf(START), end = value.indexOf(END);
        if (start < 0 && end < 0) return value + (value ? "\n\n" : "") + generated;
        assert(start >= 0 && end > start && value.indexOf(START, start + START.length) < 0 && value.indexOf(END, end + END.length) < 0,
            "OData documentation markers are damaged or duplicated. Repair the generated block before synchronizing.");
        return value.slice(0, start) + generated + value.slice(end + END.length);
    }
    return {OWNER: OWNER, PREFIX: PREFIX, assert: assert, text: text, key: key, normalizeUrl: normalizeUrl,
        catalog: catalog, discover: discover, documentation: documentation, mergeDocumentation: mergeDocumentation};
}());
if (typeof module !== "undefined") module.exports = ODataCore;
