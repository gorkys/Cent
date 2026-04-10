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

export const getRequestUrl = (request) => {
    const protocol =
        request.headers["x-forwarded-proto"] ??
        (request.socket.encrypted ? "https" : "http");
    const host = request.headers["x-forwarded-host"] ?? request.headers.host;
    return new URL(request.url, `${protocol}://${host}`);
};

export const getAssetUrl = (requestUrl, assetId) =>
    `${getPublicBaseUrl(requestUrl)}/api/mysql/assets/${assetId}`;
