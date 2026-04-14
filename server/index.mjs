import http from "node:http";
import {
    createAccessToken,
    hashPassword,
    pickTokenFromHeader,
    verifyAccessToken,
    verifyPassword,
} from "./auth.mjs";
import { config, getPublicBaseUrl } from "./config.mjs";
import { ensureSchema } from "./db.mjs";
import {
    applyCors,
    getAssetUrl,
    getRequestUrl,
    json,
    noContent,
    readJsonBody,
} from "./http.mjs";
import {
    addCollaborator,
    applyBookActions,
    createAsset,
    createBook,
    createUser,
    deleteBook,
    findUserById,
    findUserByUsername,
    getAsset,
    getBookSnapshot,
    listBooksForUser,
    listCollaborators,
    toUserInfoPayload,
} from "./repository.mjs";

const API_BASE_PATH = "/api/postgres";
const matchRoute = (pathname, expression) => pathname.match(expression)?.groups;

const withStatus = (message, statusCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const requireString = (value, label, { min = 1, max = 255 } = {}) => {
    const text = `${value ?? ""}`.trim();
    if (text.length < min || text.length > max) {
        throw withStatus(`${label} is invalid.`, 400);
    }
    return text;
};

const requireUser = async (request) => {
    const token = pickTokenFromHeader(request.headers.authorization);
    const payload = verifyAccessToken(token);
    if (!payload) {
        throw withStatus("Unauthorized.", 401);
    }
    const user = await findUserById(payload.userId);
    if (!user) {
        throw withStatus("User not found.", 401);
    }
    return user;
};

const buildAuthResponse = (requestUrl, user) => ({
    token: createAccessToken(user),
    user: toUserInfoPayload(user),
    apiBaseUrl: `${getPublicBaseUrl(requestUrl)}${API_BASE_PATH}`,
});

const handleRegister = async (request, response, requestUrl) => {
    const body = await readJsonBody(request);
    const username = requireString(body.username, "username", {
        min: 3,
        max: 64,
    }).toLowerCase();
    const password = requireString(body.password, "password", {
        min: 6,
        max: 128,
    });
    const displayName = requireString(
        body.displayName || body.username,
        "displayName",
        {
            min: 1,
            max: 128,
        },
    );
    const existed = await findUserByUsername(username);
    if (existed) {
        throw withStatus("Username already exists.", 400);
    }
    const passwordHash = await hashPassword(password);
    const user = await createUser({ username, passwordHash, displayName });
    json(response, 200, buildAuthResponse(requestUrl, user));
};

const handleLogin = async (request, response, requestUrl) => {
    const body = await readJsonBody(request);
    const username = requireString(body.username, "username", {
        min: 3,
        max: 64,
    }).toLowerCase();
    const password = requireString(body.password, "password", {
        min: 6,
        max: 128,
    });
    const user = await findUserByUsername(username);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
        throw withStatus("Username or password is incorrect.", 401);
    }
    json(response, 200, buildAuthResponse(requestUrl, user));
};

const server = http.createServer(async (request, response) => {
    applyCors(request, response);
    if (request.method === "OPTIONS") {
        noContent(response);
        return;
    }

    const requestUrl = getRequestUrl(request);
    const pathname = requestUrl.pathname;

    try {
        if (request.method === "GET" && pathname === `${API_BASE_PATH}/health`) {
            json(response, 200, { ok: true });
            return;
        }

        if (
            request.method === "POST" &&
            pathname === `${API_BASE_PATH}/auth/register`
        ) {
            await handleRegister(request, response, requestUrl);
            return;
        }

        if (
            request.method === "POST" &&
            pathname === `${API_BASE_PATH}/auth/login`
        ) {
            await handleLogin(request, response, requestUrl);
            return;
        }

        const user = await requireUser(request);

        if (request.method === "GET" && pathname === `${API_BASE_PATH}/me`) {
            json(response, 200, { user: toUserInfoPayload(user) });
            return;
        }

        const userMatch = matchRoute(
            pathname,
            /^\/api\/postgres\/users\/(?<userId>[^/]+)$/,
        );
        if (request.method === "GET" && userMatch) {
            const target = await findUserById(userMatch.userId);
            if (!target) {
                throw withStatus("Target user not found.", 404);
            }
            json(response, 200, { user: toUserInfoPayload(target) });
            return;
        }

        if (request.method === "GET" && pathname === `${API_BASE_PATH}/books`) {
            const books = await listBooksForUser(user.id);
            json(response, 200, { books });
            return;
        }

        if (request.method === "POST" && pathname === `${API_BASE_PATH}/books`) {
            const body = await readJsonBody(request);
            const name = requireString(body.name, "name", { min: 1, max: 128 });
            const book = await createBook({ userId: user.id, name });
            json(response, 200, { book });
            return;
        }

        if (request.method === "POST" && pathname === `${API_BASE_PATH}/assets`) {
            const body = await readJsonBody(request);
            const bookId = requireString(body.bookId, "bookId", {
                min: 1,
                max: 64,
            });
            const fileName = requireString(body.fileName, "fileName", {
                min: 1,
                max: 255,
            });
            const mimeType = requireString(body.mimeType, "mimeType", {
                min: 1,
                max: 128,
            });
            const base64 = requireString(body.base64, "base64", {
                min: 1,
                max: config.bodyLimitBytes * 2,
            });
            const asset = await createAsset({
                bookId,
                userId: user.id,
                fileName,
                mimeType,
                buffer: Buffer.from(base64, "base64"),
            });
            json(response, 200, {
                asset: {
                    id: asset.id,
                    url: getAssetUrl(requestUrl, asset.id),
                },
            });
            return;
        }

        const assetMatch = matchRoute(
            pathname,
            /^\/api\/postgres\/assets\/(?<assetId>[^/]+)$/,
        );
        if (request.method === "GET" && assetMatch) {
            const asset = await getAsset({
                assetId: assetMatch.assetId,
                userId: user.id,
            });
            response.writeHead(200, {
                "Content-Type": asset.mime_type,
                "Content-Disposition": `inline; filename="${encodeURIComponent(asset.file_name)}"`,
                "Cache-Control": "private, max-age=31536000, immutable",
            });
            response.end(asset.blob_data);
            return;
        }

        const bootstrapMatch = matchRoute(
            pathname,
            /^\/api\/postgres\/books\/(?<bookId>[^/]+)\/bootstrap$/,
        );
        if (request.method === "GET" && bootstrapMatch) {
            const snapshot = await getBookSnapshot({
                bookId: bootstrapMatch.bookId,
                userId: user.id,
            });
            json(response, 200, snapshot);
            return;
        }

        const collaboratorsMatch = matchRoute(
            pathname,
            /^\/api\/postgres\/books\/(?<bookId>[^/]+)\/collaborators$/,
        );
        if (request.method === "GET" && collaboratorsMatch) {
            const collaborators = await listCollaborators({
                bookId: collaboratorsMatch.bookId,
                userId: user.id,
            });
            json(response, 200, { collaborators });
            return;
        }
        if (request.method === "POST" && collaboratorsMatch) {
            const body = await readJsonBody(request);
            const username = requireString(body.username, "username", {
                min: 3,
                max: 64,
            }).toLowerCase();
            const collaborator = await addCollaborator({
                bookId: collaboratorsMatch.bookId,
                userId: user.id,
                username,
            });
            json(response, 200, { collaborator });
            return;
        }

        const batchMatch = matchRoute(
            pathname,
            /^\/api\/postgres\/books\/(?<bookId>[^/]+)\/batch$/,
        );
        if (request.method === "POST" && batchMatch) {
            const body = await readJsonBody(request);
            if (!Array.isArray(body.actions)) {
                throw withStatus("actions must be an array.", 400);
            }
            await applyBookActions({
                bookId: batchMatch.bookId,
                userId: user.id,
                actions: body.actions,
            });
            json(response, 200, { ok: true });
            return;
        }

        const deleteMatch = matchRoute(
            pathname,
            /^\/api\/postgres\/books\/(?<bookId>[^/]+)$/,
        );
        if (request.method === "DELETE" && deleteMatch) {
            const deleted = await deleteBook({
                bookId: deleteMatch.bookId,
                userId: user.id,
            });
            if (!deleted) {
                throw withStatus("Book not found.", 404);
            }
            noContent(response);
            return;
        }

        json(response, 404, { error: "Not found." });
    } catch (error) {
        const statusCode = Number(error.statusCode) || 500;
        json(response, statusCode, {
            error: error.message || "Internal server error.",
        });
    }
});

await ensureSchema();

server.listen(config.port, config.host, () => {
    console.log(
        `Cent PostgreSQL API listening on http://${config.host}:${config.port}${API_BASE_PATH}`,
    );
});
