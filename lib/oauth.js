/* OAuth 2.0 client credentials. Tokens and secrets exist only for the current run. */
var ODataOAuth = (function () {
    "use strict";
    var C = typeof ODataCore !== "undefined" ? ODataCore : require("./core.js");
    function validate(options) {
        var o = options || {}, url = C.text(o.tokenUrl).trim(), resource = C.text(o.resource).trim(), clientId = C.text(o.clientId).trim(), secret = C.text(o.clientSecret);
        var match = /^(https?):\/\/(\[[0-9a-f:]+\]|[a-z0-9._-]+)(?::([0-9]+))?(\/[^?#]*)?$/i.exec(url);
        C.assert(match && !/[\s\\<>"\x00-\x1f\x7f]/.test(url), "Enter a full OAuth token URL without credentials, query parameters or fragments.");
        C.assert(!match[3] || (Number(match[3]) > 0 && Number(match[3]) <= 65535), "Invalid OAuth token URL port.");
        var host = match[2].toLowerCase();
        C.assert(match[1].toLowerCase() === "https" || ["localhost", "127.0.0.1", "[::1]"].indexOf(host) >= 0, "The OAuth token URL requires HTTPS (except localhost tests).");
        C.assert(resource && !/\s/.test(resource), "Enter the target resource identifier.");
        C.assert(clientId && !/[\r\n]/.test(clientId), "Enter the OAuth client ID.");
        C.assert(secret.trim().length > 0, "Enter the client secret value, not its identifier.");
        // The resource is an audience identifier: preserve its case and trailing slash.
        return {tokenUrl: url, resource: resource, clientId: clientId, clientSecret: secret};
    }
    function encode(value) { return encodeURIComponent(value).replace(/[!'()*]/g, function (ch) { return "%" + ch.charCodeAt(0).toString(16).toUpperCase(); }).replace(/%20/g, "+"); }
    function request(options) {
        var o = validate(options), values = {grant_type: "client_credentials", client_id: o.clientId, client_secret: o.clientSecret};
        if (/\/oauth2\/v2\.0\/token\/?$/i.test(o.tokenUrl)) values.scope = /\/\.default$/.test(o.resource) ? o.resource : o.resource + "/.default";
        else values.resource = o.resource;
        return {url: o.tokenUrl, body: Object.keys(values).map(function (k) { return encode(k) + "=" + encode(values[k]); }).join("&")};
    }
    function session(options, transport, now) {
        var credentials = validate(options), token = "", expiresAt = 0, cleared = false;
        now = now || Date.now;
        function acquire() {
            C.assert(!cleared, "The OAuth session has ended. Run synchronization again.");
            var req = request(credentials), response;
            try { response = transport(req); }
            finally { req.body = ""; }
            C.assert(response && typeof response.access_token === "string" && /^[A-Za-z0-9\-._~+/]+=*$/.test(response.access_token), "OAuth response does not contain a valid access token.");
            C.assert(typeof response.token_type === "string" && response.token_type.toLowerCase() === "bearer", "OAuth server returned an unsupported or missing token type (expected Bearer).");
            var lifetime = response.expires_in === undefined ? null : Number(response.expires_in);
            C.assert(lifetime === null || (isFinite(lifetime) && lifetime > 0), "OAuth server returned an invalid token lifetime.");
            token = response.access_token;
            // A small skew handles network latency; short-lived tokens retain 90% of their lifetime.
            expiresAt = lifetime === null ? Infinity : now() + (lifetime - Math.min(30, lifetime * 0.1)) * 1000;
            response.access_token = ""; if (response.refresh_token) response.refresh_token = "";
        }
        return {
            getHeader: function () { C.assert(!cleared, "The OAuth session has ended. Run synchronization again."); if (!token || now() >= expiresAt) acquire(); return "Bearer " + token; },
            invalidate: function () { token = ""; expiresAt = 0; },
            clear: function () { cleared = true; token = ""; expiresAt = 0; credentials.clientSecret = ""; }
        };
    }
    return {validate: validate, request: request, session: session};
}());
if (typeof module !== "undefined") module.exports = ODataOAuth;
