/* All model mutations use jArchi APIs and participate in its script Undo operation. */
var ODataArchi = (function () {
    "use strict";
    var C = ODataCore, P = C.PREFIX;
    var TYPE_FOLDERS = {"application-interface": {key: "type:interface", name: "API"}, "data-object": {key: "type:data", name: "Entities"}};
    function elements(m, selector) {
        var seen = Object.create(null), values = [];
        $(m).find(selector).each(function (item) { var e = item.concept || item, id = String(e.id); if (!seen[id]) { seen[id] = true; values.push(e); } }); return values;
    }
    function saved(m) {
        var raw = C.text(m.prop(P + "Selections")), result = raw ? JSON.parse(raw) : {};
        C.assert(result && !Array.isArray(result) && typeof result === "object", "Saved OData selections are malformed.");
        Object.keys(result).forEach(function (url) { C.assert(Array.isArray(result[url]) && result[url].every(function (n) { return typeof n === "string"; }), "Saved OData selection is malformed."); });
        return result;
    }
    function index(m) {
        var map = Object.create(null);
        elements(m, "element").concat(elements(m, "relationship")).forEach(function (e) {
            if (C.text(e.prop(P + "ManagedBy")) !== C.OWNER) return;
            var key = C.text(e.prop(P + "Key")); C.assert(key && !map[key], "Duplicate or missing managed OData identity. Resolve the duplicate before synchronizing."); map[key] = e;
        }); return map;
    }
    function children(parent) { var list = []; $(parent).children("folder").each(function (f) { list.push(f); }); return list; }
    function findFolder(parent, identity, name) {
        var owned = children(parent).filter(function (f) { return C.text(f.prop(P + "ManagedBy")) === C.OWNER && C.text(f.prop(P + "FolderKey")) === identity; });
        C.assert(owned.length <= 1, "Duplicate OData folder identity.");
        if (owned.length) return owned[0];
        C.assert(!children(parent).some(function (f) { return String(f.name) === name; }), "Folder name conflict: " + name + ". Rename the existing folder or change rootFolderName."); return null;
    }
    function prepare(m, root, rows, settings) {
        C.assert(rows.length && rows.every(function (r) { return r.available; }), "Select at least one entity with valid metadata.");
        var managed = index(m), selections = saved(m), now = new Date().toISOString(), operations = [], relations = [], keys = Object.create(null);
        var folderName = settings.rootFolderName || "OData"; C.assert(folderName.trim(), "Specify a nonempty rootFolderName.");
        children(m).forEach(function (category) {
            var f = findFolder(category, "root", folderName), service = f ? findFolder(f, root, root) : null;
            if (service) Object.keys(TYPE_FOLDERS).forEach(function (type) {
                var group = TYPE_FOLDERS[type]; findFolder(service, group.key, group.name);
            });
        });
        C.assert($.model.isAllowedRelationship("access-relationship", "application-interface", "data-object"), "This Archi version does not allow the requested Access relationship.");
        C.assert($.model.isAllowedRelationship("serving-relationship", "node", "application-interface"), "This Archi version does not allow a Node to serve an Application Interface.");
        function commonProps(name, role, existing) {
            var p = {}; p[P + "ManagedBy"] = C.OWNER; p[P + "Key"] = C.key(root, name, role); p[P + "ServiceUrl"] = root; p[P + "Role"] = role;
            p.LastSyncDate = now.slice(0, 10); p.LastSyncTime = now.slice(11, 19); p[P + "LastSyncAt"] = now;
            if (!existing) { p.CreatedDate = now.slice(0, 10); p.CreatedTime = now.slice(11, 19); }
            return p;
        }
        function props(entity, role, existing) {
            var p = commonProps(entity.name, role, existing);
            p[P + "EntitySet"] = entity.name; p[P + "EntityType"] = entity.type; p[P + "EntityUrl"] = entity.url; p[P + "FieldCount"] = String(entity.fields.length);
            return p;
        }
        var environmentKey = C.key(root, "", "environment"), environment = managed[environmentKey];
        C.assert(!environment || String(environment.type) === "node", "Managed OData environment has an unexpected Archi type. Restore it to Node before synchronizing.");
        var environmentDoc = ["<!-- archi-odata-sync:begin -->", "## OData environment", "", "Service URL: " + root, "",
            "This environment serves the Application Interfaces imported from this OData service.", "<!-- archi-odata-sync:end -->"].join("\n");
        operations.push({key: environmentKey, existing: environment, type: "node", name: environment ? String(environment.name) : "OData Environment - " + root,
            properties: commonProps("", "environment", environment), documentation: C.mergeDocumentation(environment ? environment.documentation : "", environmentDoc)});
        function relationship(entity, role, type, source, target) {
            var key = C.key(root, entity.name, role), rel = managed[key];
            C.assert(!rel || (String(rel.type) === type && C.text(rel.source.prop(P + "Key")) === source && C.text(rel.target.prop(P + "Key")) === target),
                "Managed " + (role === "access" ? "Access" : "Serving") + " relationship has changed endpoints or type: " + entity.name);
            relations.push({key: key, existing: rel, type: type, source: source, target: target, properties: props(entity, role, rel)});
        }
        rows.forEach(function (entity) {
            C.assert(!keys[entity.name], "Entity selected more than once."); keys[entity.name] = true;
            ["interface", "data"].forEach(function (role) {
                var key = C.key(root, entity.name, role), e = managed[key], type = role === "interface" ? "application-interface" : "data-object";
                C.assert(!e || String(e.type) === type, "Managed entity has an unexpected Archi type: " + entity.name + ". Restore its type before synchronizing.");
                operations.push({key: key, existing: e, type: type, name: entity.name, properties: props(entity, role, e),
                    documentation: C.mergeDocumentation(e ? e.documentation : "", C.documentation(entity, role))});
            });
            var source = C.key(root, entity.name, "interface"), target = C.key(root, entity.name, "data");
            relationship(entity, "access", "access-relationship", source, target);
            relationship(entity, "serving", "serving-relationship", environmentKey, source);
        });
        selections[root] = rows.map(function (r) { return r.id; });
        return {root: root, folderName: folderName, operations: operations, relations: relations, entityCount: rows.length, selections: selections, time: now};
    }
    function apply(m, plan) {
        var managed = index(m), created = 0, updated = 0;
        function folder(parent, identity, name) {
            var f = findFolder(parent, identity, name);
            if (!f) { f = parent.createFolder(name); f.prop(P + "ManagedBy", C.OWNER); f.prop(P + "FolderKey", identity); } return f;
        }
        function destination(e) {
            var f = $(e).parent().first(), parent = $(f).parent().first();
            while (parent && String(parent.type) === "folder") { f = parent; parent = $(f).parent().first(); }
            var service = folder(folder(f, "root", plan.folderName), plan.root, plan.root), group = TYPE_FOLDERS[String(e.type)];
            return group ? folder(service, group.key, group.name) : service;
        }
        function update(e, properties) { Object.keys(properties).forEach(function (k) { if (C.text(e.prop(k)) !== properties[k]) e.prop(k, properties[k]); }); }
        plan.operations.forEach(function (op) {
            var e = managed[op.key];
            C.assert((!op.existing && !e) || (e && String(e.id) === String(op.existing.id)), "Model changed during synchronization. Use Undo and retry.");
            if (!e) { e = m.createElement(op.type, op.name); managed[op.key] = e; created++; } else updated++;
            var targetFolder = destination(e);
            if (String($(e).parent().first().id) !== String(targetFolder.id)) targetFolder.add(e);
            e.name = op.name; update(e, op.properties); e.documentation = op.documentation;
        });
        plan.relations.forEach(function (op) {
            var r = managed[op.key];
            if (!r) { r = m.createRelationship(op.type, "", managed[op.source], managed[op.target]); managed[op.key] = r; destination(r).add(r); }
            if (op.type === "access-relationship") r.accessType = "readwrite";
            update(r, op.properties);
        });
        m.prop(P + "LastServiceUrl", plan.root); m.prop(P + "Selections", JSON.stringify(plan.selections)); m.prop(P + "LastSyncAt", plan.time);
        return {created: created, updated: updated, entities: plan.entityCount};
    }
    return {saved: saved, index: index, prepare: prepare, apply: apply};
}());
