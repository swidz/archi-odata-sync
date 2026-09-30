/* Non-secret defaults. Never place passwords or tokens in this file. */
var ODATA_SETTINGS = {
    defaultUrl: "",
    oauthTokenUrl: "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token",
    oauthResource: "",
    oauthClientId: "",
    rootFolderName: "OData",
    connectTimeoutSeconds: 20,
    requestTimeoutSeconds: 60,
    // 256 MiB: large ERP services can publish metadata well above 32 MiB.
    maxResponseBytes: 268435456,
    // Bound complex-field expansion as well as raw downloads. Both include navigation fields.
    maxExpandedFieldsPerEntity: 10000,
    maxTotalExpandedFields: 500000
};
