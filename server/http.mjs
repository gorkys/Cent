import { config, getPublicBaseUrl, isOriginAllowed } from "./config.mjs";

export const json = (response, statusCode, payload) => {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(payload));
};

export const noContent = (response) => {
    response.writeHead(204);
    response.end();
};

export const readJsonBody = async (request) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > config.bodyLimitBytes) {
            const error = new Error("Request body is too large.");
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    if (!body) {
        return {};
    }
    return JSON.parse(body);
};

export const applyCors = (request, response) => {
    const origin = request.headers.origin;
    if (origin && isOriginAllowed(origin)) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
    } else if (config.corsOrigins === "*") {
        response.setHeader("Access-Control-Allow-Origin", "*");
    }
    response.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
    );
    response.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS",
    );
    response.setHeader("Access-Control-Allow-Credentials", "true");
};

const getHeaderValue = (value) => {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
};

const withForwardedPort = (host, port, protocol) => {
    if (!host || !port) {
        return host;
    }
    if (host.startsWith("[")) {
        return host.includes("]:") ? host : `${host}:${port}`;
    }
    const lastColonIndex = host.lastIndexOf(":");
    if (lastColonIndex >= 0 && /^\d+$/.test(host.slice(lastColonIndex + 1))) {
        return host;
    }
    if (
        (protocol === "http" && port === "80") ||
        (protocol === "https" && port === "443")
    ) {
        return host;
    }
    return `${host}:${port}`;
};

export const getRequestUrl = (request) => {
    const protocol =
        getHeaderValue(request.headers["x-forwarded-proto"]) ??
        (request.socket.encrypted ? "https" : "http");
    const host = withForwardedPort(
        getHeaderValue(request.headers["x-forwarded-host"]) ??
            getHeaderValue(request.headers.host),
        getHeaderValue(request.headers["x-forwarded-port"]),
        protocol,
    );
    return new URL(request.url, `${protocol}://${host}`);
};

export const getAssetUrl = (requestUrl, assetId) =>
    `${getPublicBaseUrl(requestUrl)}/api/postgres/assets/${assetId}`;
