const trimSlash = (value) => value.replace(/\/+$/, "");

const parseNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const parseOrigins = (value) => {
    if (!value || value === "*") {
        return "*";
    }
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
};

const publicBaseUrl = process.env.POSTGRES_API_PUBLIC_BASE_URL;

export const config = {
    host: process.env.POSTGRES_API_HOST ?? "0.0.0.0",
    port: parseNumber(process.env.POSTGRES_API_PORT ?? process.env.PORT, 8787),
    authSecret:
        process.env.POSTGRES_API_AUTH_SECRET ??
        "change-me-before-production-deploy",
    corsOrigins: parseOrigins(process.env.POSTGRES_API_CORS_ORIGIN ?? "*"),
    publicBaseUrl: publicBaseUrl ? trimSlash(publicBaseUrl) : "",
    bodyLimitBytes:
        parseNumber(process.env.POSTGRES_API_BODY_LIMIT_MB, 15) *
        1024 *
        1024,
    db: {
        host: process.env.POSTGRES_HOST ?? "127.0.0.1",
        port: parseNumber(process.env.POSTGRES_PORT, 5432),
        user: process.env.POSTGRES_USER ?? "postgres",
        password: process.env.POSTGRES_PASSWORD ?? "",
        database: process.env.POSTGRES_DATABASE ?? "cent",
        connectionLimit: parseNumber(process.env.POSTGRES_CONNECTION_LIMIT, 10),
    },
};

export const getPublicBaseUrl = (requestUrl) => {
    if (config.publicBaseUrl) {
        return config.publicBaseUrl;
    }
    return trimSlash(requestUrl.origin);
};

export const isOriginAllowed = (origin) => {
    if (!origin) {
        return true;
    }
    if (config.corsOrigins === "*") {
        return true;
    }
    return config.corsOrigins.includes(origin);
};
