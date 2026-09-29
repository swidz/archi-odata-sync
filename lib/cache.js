/* Temporary, credential-free snapshots. A ZIP keeps the service document and XML atomic. */
var ODataCache = (function () {
    "use strict";
    var C = ODataCore, Files = Java.type("java.nio.file.Files"), Paths = Java.type("java.nio.file.Paths"),
        UTF8 = Java.type("java.nio.charset.StandardCharsets").UTF_8, JavaString = Java.type("java.lang.String"),
        ZipFile = Java.type("java.util.zip.ZipFile"), NOFOLLOW = Java.to([Java.type("java.nio.file.LinkOption").NOFOLLOW_LINKS], "java.nio.file.LinkOption[]");
    function location(root, settings) {
        var hash = Java.type("java.security.MessageDigest").getInstance("SHA-256").digest(new JavaString(root).getBytes(UTF8));
        var name = Java.from(hash).map(function (b) { return ("0" + (Number(b) & 255).toString(16)).slice(-2); }).join("") + ".zip";
        return Paths.get(settings && settings.cacheDirectory ? String(settings.cacheDirectory) : String(Java.type("java.lang.System").getProperty("java.io.tmpdir")) + "/archi-odata-sync").resolve(name);
    }
    function limit(settings) {
        var value = settings && settings.maxResponseBytes !== undefined ? Number(settings.maxResponseBytes) : 268435456;
        C.assert(isFinite(value) && value > 0 && Math.floor(value) === value, "maxResponseBytes must be a positive whole number of bytes."); return value;
    }
    function readEntry(zip, name, cap, progress) {
        var entry = zip.getEntry(name); C.assert(entry && !entry.isDirectory() && Number(entry.getSize()) <= cap, "Invalid or oversized cache entry.");
        var stream = zip.getInputStream(entry), out = new (Java.type("java.io.ByteArrayOutputStream"))(), buffer = new (Java.type("byte[]"))(8192), count, total = 0;
        try {
            while ((count = stream.read(buffer)) !== -1) { total += Number(count); C.assert(total <= cap, "Cached metadata exceeds maxResponseBytes.");
                progress("Loading cached metadata...", total, Number(entry.getSize()), "bytes"); out.write(buffer, 0, count); }
            return String(new JavaString(out.toByteArray(), UTF8));
        } finally { stream.close(); }
    }
    function manifest(zip, root) {
        var value = JSON.parse(readEntry(zip, "snapshot.json", 16384, function () {}));
        C.assert(value.version === 1 && value.root === root && typeof value.downloadedAt === "string" && isFinite(Date.parse(value.downloadedAt)), "Invalid cache identity.");
        C.assert(zip.getEntry("service.json") && zip.getEntry("metadata.xml"), "Incomplete metadata cache."); return value;
    }
    function info(root, settings) {
        var path = location(root, settings), zip = null;
        try {
            if (!Files.isRegularFile(path, NOFOLLOW)) return null;
            zip = new ZipFile(path.toFile()); var value = manifest(zip, root);
            return {downloadedAt: value.downloadedAt, metadataBytes: Number(zip.getEntry("metadata.xml").getSize())};
        } catch (e) { return null; } finally { if (zip) zip.close(); }
    }
    function read(root, settings, progress) {
        var zip = null; progress = progress || function () {};
        try {
            var path = location(root, settings); C.assert(Files.isRegularFile(path, NOFOLLOW), "Missing cache.");
            zip = new ZipFile(path.toFile()); manifest(zip, root); var cap = limit(settings);
            return {service: readEntry(zip, "service.json", cap, progress), metadata: readEntry(zip, "metadata.xml", cap, progress)};
        } catch (e) {
            if (e.cancelled) throw e;
            throw new Error("The cached metadata is missing, damaged or exceeds maxResponseBytes. Run synchronization again and choose Download fresh.");
        } finally { if (zip) zip.close(); }
    }
    function save(root, documents, settings, progress) {
        var path = location(root, settings), temporary = null, zip = null; progress = progress || function () {};
        try {
            progress("Saving metadata snapshot..."); Files.createDirectories(path.getParent());
            temporary = Files.createTempFile(path.getParent(), "snapshot-", ".partial");
            zip = new (Java.type("java.util.zip.ZipOutputStream"))(Files.newOutputStream(temporary)); zip.setLevel(1);
            var contents = {"snapshot.json": JSON.stringify({version: 1, root: root, downloadedAt: new Date().toISOString()}), "service.json": documents.service, "metadata.xml": documents.metadata};
            Object.keys(contents).forEach(function (name) {
                var bytes = new JavaString(contents[name]).getBytes(UTF8); C.assert(bytes.length <= (name === "snapshot.json" ? 16384 : limit(settings)), "Snapshot exceeds maxResponseBytes.");
                zip.putNextEntry(new (Java.type("java.util.zip.ZipEntry"))(name));
                for (var offset = 0; offset < bytes.length; offset += 65536) { progress("Saving metadata snapshot..."); zip.write(bytes, offset, Math.min(65536, bytes.length - offset)); }
                zip.closeEntry();
            });
            zip.close(); zip = null; progress("Saving metadata snapshot...");
            var Option = Java.type("java.nio.file.StandardCopyOption");
            Files.move(temporary, path, Java.to([Option.ATOMIC_MOVE, Option.REPLACE_EXISTING], "java.nio.file.CopyOption[]")); temporary = null;
        } finally { try { if (zip) zip.close(); } finally { if (temporary) Files.deleteIfExists(temporary); } }
    }
    return {location: location, info: info, read: read, save: save};
}());
