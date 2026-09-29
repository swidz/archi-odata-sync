/* JDK-only runtime: XML CSDL and bounded HTTP reads, usable on Windows, macOS and Linux. */
var ODataJava = (function () {
    "use strict";
    var C = ODataCore, URI = Java.type("java.net.URI"), UTF8 = Java.type("java.nio.charset.StandardCharsets").UTF_8;
    var EDM = "http://docs.oasis-open.org/odata/ns/edm", EDMX = "http://docs.oasis-open.org/odata/ns/edmx";
    function normalizeUrl(value) {
        var root = C.normalizeUrl(value), uri = new URI(root);
        C.assert(uri.getHost() && (uri.getPort() === -1 || (uri.getPort() > 0 && uri.getPort() <= 65535)), "Invalid service host or port.");
        return root;
    }
    function endpoint(root, relative) {
        var uri = new URI(root).resolve(String(relative));
        C.assert((String(uri.getScheme()) === "https" || String(uri.getScheme()) === "http") && uri.getHost() && !uri.getUserInfo() && !uri.getRawQuery() && !uri.getRawFragment(),
            "Entity URL must be HTTP(S) without credentials, query parameters, or fragments.");
        return String(uri.toASCIIString());
    }
    function origin(value) {
        var u = new URI(value), scheme = String(u.getScheme()).toLowerCase(), port = u.getPort();
        return scheme + "://" + String(u.getHost()).toLowerCase() + ":" + (port < 0 ? scheme === "https" ? 443 : 80 : port);
    }
    function validateAuth(root, auth) {
        if (!auth || (!auth.header && !auth.getHeader)) return;
        var u = new URI(root), host = String(u.getHost()).toLowerCase();
        C.assert(String(u.getScheme()) === "https" || host === "localhost" || host === "127.0.0.1" || host === "[::1]", "Credentials require HTTPS (except localhost test services).");
        C.assert(!/[\r\n]/.test(auth.header || ""), "Credential contains a line break.");
    }
    function basic(username, password) {
        C.assert(username && username.indexOf(":") < 0 && !/[\r\n]/.test(username + password), "Enter a valid Basic username and password.");
        return "Basic " + String(Java.type("java.util.Base64").getEncoder().encodeToString(new (Java.type("java.lang.String"))(username + ":" + password).getBytes(UTF8)));
    }
    function postToken(request, settings, progress) {
        settings = settings || {};
        progress = progress || function () {}; progress("Authenticating...");
        var connection = null, stream = null, output = null;
        function fail(message) { var error = new Error(message); error.oauthSafe = true; throw error; }
        try {
            var uri = new URI(request.url);
            if (!uri.getHost()) fail("Invalid OAuth token endpoint host.");
            connection = uri.toURL().openConnection();
            connection.setInstanceFollowRedirects(false); connection.setRequestMethod("POST"); connection.setDoOutput(true);
            connection.setConnectTimeout((settings.connectTimeoutSeconds || 20) * 1000);
            connection.setReadTimeout((settings.requestTimeoutSeconds || 60) * 1000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            var bytes = new (Java.type("java.lang.String"))(request.body).getBytes(UTF8);
            connection.setFixedLengthStreamingMode(bytes.length);
            output = connection.getOutputStream(); output.write(bytes); output.close(); output = null;
            var status = Number(connection.getResponseCode());
            if (status >= 300 && status < 400) fail("OAuth token endpoint redirects are refused. Enter the final token URL.");
            var limit = 1048576;
            if (connection.getContentLengthLong() > limit) fail("OAuth token response exceeds the size limit.");
            stream = status === 200 ? connection.getInputStream() : connection.getErrorStream();
            var body = "";
            if (stream) {
                var buffer = new (Java.type("byte[]"))(8192), out = new (Java.type("java.io.ByteArrayOutputStream"))(), count, total = 0;
                var deadline = Date.now() + (settings.requestTimeoutSeconds || 60) * 1000;
                while ((count = stream.read(buffer)) !== -1) {
                    progress("Authenticating...");
                    total += Number(count); if (total > limit) fail("OAuth token response exceeds the size limit.");
                    if (Date.now() >= deadline) fail("OAuth token request timed out."); out.write(buffer, 0, count);
                }
                body = String(new (Java.type("java.lang.String"))(out.toByteArray(), UTF8)).replace(/^\uFEFF/, "");
            }
            var response = null; try { response = JSON.parse(body); } catch (parseError) { /* Never expose a raw response. */ }
            if (status !== 200) {
                var known = ["invalid_request", "invalid_client", "invalid_grant", "unauthorized_client", "unsupported_grant_type", "invalid_scope", "invalid_resource", "temporarily_unavailable"];
                var code = response && known.indexOf(response.error) >= 0 ? " (" + response.error + ")" : "";
                fail("OAuth token request failed: HTTP " + status + code + ". Check the token URL, resource, client ID, secret value and application permissions.");
            }
            if (!response || typeof response !== "object" || Array.isArray(response)) fail("OAuth token endpoint did not return a JSON object.");
            return response;
        } catch (e) {
            if (e.oauthSafe || e.cancelled) throw e;
            // Transport exceptions can reflect the URL or submitted body. Keep them out of logs/UI.
            throw new Error("OAuth token request could not be completed. Check connectivity, TLS certificates and the token URL.");
        } finally {
            try { if (output) output.close(); } catch (closeOutputError) { /* Request has already failed. */ }
            try { if (stream) stream.close(); } catch (closeInputError) { /* Avoid leaking transport details. */ }
            if (connection) connection.disconnect();
        }
    }
    function oauth(root, credentials, settings, progress) {
        validateAuth(root, {getHeader: true});
        var auth = ODataOAuth.session(credentials, function (request) { return postToken(request, settings, progress); });
        try { auth.getHeader(); return auth; } catch (e) { auth.clear(); throw e; }
    }
    function get(root, url, accept, auth, settings, progress) {
        validateAuth(root, auth);
        settings = settings || {};
        var next = url, limit = settings.maxResponseBytes === undefined ? 268435456 : Number(settings.maxResponseBytes), redirects = 0, renewed = false;
        C.assert(isFinite(limit) && limit > 0 && Math.floor(limit) === limit, "maxResponseBytes in config/settings.js must be a positive whole number of bytes.");
        var responseName = accept.indexOf("xml") >= 0 ? "OData $metadata document" : "OData service response";
        var stage = accept.indexOf("xml") >= 0 ? "Downloading metadata..." : "Downloading entity list...";
        progress = progress || function () {};
        function sizeLimitMessage(size, exact) {
            function mib(bytes) { return (bytes / 1048576).toFixed(2) + " MiB (" + bytes + " bytes)"; }
            return responseName + " exceeds the configured response size limit. " + (exact ? "Reported size: " : "Read at least: ") + mib(size) +
                "; limit: " + mib(limit) + ". Increase maxResponseBytes in the installed archi-odata-sync/config/settings.js and rerun. No model changes have been made.";
        }
        while (true) {
            progress(stage, 0, 0, "bytes");
            C.assert(origin(next) === origin(root), "Redirect to a different origin refused. Enter that service URL explicitly.");
            var connection = new URI(next).toURL().openConnection(), stream = null;
            try {
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout((settings.connectTimeoutSeconds || 20) * 1000);
                connection.setReadTimeout((settings.requestTimeoutSeconds || 60) * 1000);
                connection.setRequestProperty("Accept", accept);
                connection.setRequestProperty("OData-Version", "4.0");
                connection.setRequestProperty("OData-MaxVersion", "4.0");
                var authorization = auth && auth.getHeader ? auth.getHeader() : auth && auth.header;
                if (authorization) connection.setRequestProperty("Authorization", authorization);
                progress(stage, 0, 0, "bytes");
                var status = connection.getResponseCode();
                if ([301, 302, 303, 307, 308].indexOf(Number(status)) >= 0) {
                    C.assert(redirects < 5, "Too many HTTP redirects.");
                    redirects++;
                    var location = connection.getHeaderField("Location"); C.assert(location, "Redirect has no Location header.");
                    next = endpoint(next, String(location)); continue;
                }
                if (status === 401 && auth && auth.invalidate && !renewed) { auth.invalidate(); renewed = true; continue; }
                if (status === 401 || status === 403) throw new Error("HTTP " + status + ": service access denied. Check the resource and application permissions or credentials.");
                C.assert(status === 200, "OData discovery failed with HTTP " + status + ". Verify the service root URL.");
                var version = C.text(connection.getHeaderField("OData-Version"));
                C.assert(!version || /^4\.(0|01)(;|$)/.test(version), "The service is not OData 4.x.");
                var contentLength = Number(connection.getContentLengthLong());
                progress(stage, 0, contentLength, "bytes");
                if (contentLength > limit) throw new Error(sizeLimitMessage(contentLength, true));
                stream = connection.getInputStream();
                var out = new (Java.type("java.io.ByteArrayOutputStream"))(), buffer = new (Java.type("byte[]"))(8192), count, total = 0;
                var deadline = Date.now() + (settings.requestTimeoutSeconds || 60) * 1000;
                while ((count = stream.read(buffer)) !== -1) {
                    total += Number(count); if (total > limit) throw new Error(sizeLimitMessage(total, false));
                    C.assert(Date.now() <= deadline, "OData response timed out."); out.write(buffer, 0, count);
                    progress(stage, total, contentLength, "bytes");
                }
                progress(stage, total, contentLength, "bytes");
                return String(new (Java.type("java.lang.String"))(out.toByteArray(), UTF8)).replace(/^\uFEFF/, "");
            } finally { if (stream) stream.close(); connection.disconnect(); }
        }
    }
    function children(node, local, ns) {
        var out = [], list = node.getChildNodes();
        for (var i = 0; i < list.getLength(); i++) {
            var child = list.item(i);
            if (Number(child.getNodeType()) === 1 && String(child.getNamespaceURI()) === (ns || EDM) && (!local || String(child.getLocalName()) === local)) out.push(child);
        }
        return out;
    }
    function attr(node, name) { return String(node.getAttribute(name)); }
    function description(node) {
        return children(node, "Annotation").filter(function (a) { return /(?:^|\.)Description$/.test(attr(a, "Term")); }).map(function (a) {
            var str = children(a, "String")[0]; return attr(a, "String") || (str ? String(str.getTextContent()) : "");
        }).filter(Boolean).join(" ");
    }
    function parseMetadata(xml, progress) {
        progress = progress || function () {}; progress("Parsing metadata...");
        var factory = Java.type("javax.xml.parsers.DocumentBuilderFactory").newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setXIncludeAware(false); factory.setExpandEntityReferences(false);
        factory.setAttribute("http://javax.xml.XMLConstants/property/accessExternalDTD", "");
        factory.setAttribute("http://javax.xml.XMLConstants/property/accessExternalSchema", "");
        var builder = factory.newDocumentBuilder(), document;
        builder.setErrorHandler(new (Java.type("org.xml.sax.helpers.DefaultHandler"))());
        try { document = builder.parse(new (Java.type("org.xml.sax.InputSource"))(new (Java.type("java.io.StringReader"))(xml))); }
        catch (e) { throw new Error("Invalid XML $metadata document (DTDs and external entities are disabled)."); }
        progress("Parsing metadata...");
        var root = document.getDocumentElement();
        C.assert(String(root.getNamespaceURI()) === EDMX && String(root.getLocalName()) === "Edmx" && /^4\.(0|01)$/.test(attr(root, "Version")), "Expected an OData 4.0 EDMX metadata document.");
        var data = children(root, "DataServices", EDMX)[0]; C.assert(data, "Metadata contains no DataServices.");
        var result = {schemas: [], aliases: []};
        children(root, "Reference", EDMX).forEach(function (r) {
            children(r, "Include", EDMX).forEach(function (inc) { if (attr(inc, "Alias")) result.aliases.push({alias: attr(inc, "Alias"), namespace: attr(inc, "Namespace")}); });
        });
        children(data, "Schema").forEach(function (schema) {
            var s = {namespace: attr(schema, "Namespace"), alias: attr(schema, "Alias"), types: [], sets: []};
            C.assert(s.namespace, "CSDL schema has no namespace.");
            children(schema).forEach(function (node) {
                progress("Parsing metadata...");
                var kind = String(node.getLocalName());
                if (["EntityType", "ComplexType", "EnumType", "TypeDefinition"].indexOf(kind) >= 0) {
                    var t = {kind: kind, name: attr(node, "Name"), base: attr(node, "BaseType"), open: attr(node, "OpenType") === "true", fields: [], navigation: [], keys: [], members: [], underlyingType: attr(node, "UnderlyingType")};
                    children(node, "Key").forEach(function (k) { children(k, "PropertyRef").forEach(function (p) { t.keys.push(attr(p, "Name").replace(/\//g, ".")); }); });
                    children(node, "Member").forEach(function (m) { t.members.push(attr(m, "Name") + (attr(m, "Value") ? "=" + attr(m, "Value") : "")); });
                    children(node, "Property").forEach(function (p) {
                        t.fields.push({name: attr(p, "Name"), type: attr(p, "Type") || "Edm.String", nullable: attr(p, "Nullable") !== "false", description: description(p), maxLength: attr(p, "MaxLength"), precision: attr(p, "Precision"), scale: attr(p, "Scale")});
                    });
                    children(node, "NavigationProperty").forEach(function (p) { t.navigation.push({name: attr(p, "Name"), type: attr(p, "Type")}); });
                    s.types.push(t);
                } else if (kind === "EntityContainer") {
                    children(node, "EntitySet").forEach(function (set) { s.sets.push({name: attr(set, "Name"), type: attr(set, "EntityType"), container: attr(node, "Name")}); });
                }
            });
            result.schemas.push(s);
        });
        C.assert(result.schemas.length, "No CSDL schemas found."); return result;
    }
    function discover(root, auth, settings, log) {
        log = log || function () {};
        var service;
        try { service = JSON.parse(get(root, root, "application/json", auth, settings, log)); }
        catch (e) { if (e instanceof SyntaxError) throw new Error("The service root did not return JSON. Use an OData 4.0 service root, not an entity URL or sign-in page."); throw e; }
        var metadata = parseMetadata(get(root, root + "$metadata", "application/xml", auth, settings, log), log);
        log("Analyzing entities...");
        return C.discover(service, metadata, root, endpoint, log);
    }
    function write(path, value) {
        var Paths = Java.type("java.nio.file.Paths"), Files = Java.type("java.nio.file.Files"), p = Paths.get(path);
        Files.createDirectories(p.getParent()); Files.write(p, new (Java.type("java.lang.String"))(value).getBytes(UTF8));
    }
    return {normalizeUrl: normalizeUrl, endpoint: endpoint, basic: basic, validateAuth: validateAuth, oauth: oauth, get: get, parseMetadata: parseMetadata, discover: discover, write: write};
}());
