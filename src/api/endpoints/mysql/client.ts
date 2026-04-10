import { blobToBase64 } from "@/utils/file";

export type MysqlAuthResponse = {
    token: string;
    user: {
        id: string;
        name: string;
        avatar_url: string;
    };
    apiBaseUrl?: string;
};

type ClientConfig = {
    apiBaseUrl: string;
    getAccessToken: () => string | undefined;
};

type RequestOptions = {
    method?: "GET" | "POST" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
    auth?: boolean;
    responseType?: "json" | "blob" | "void";
};

const trimSlash = (value: string) => value.replace(/\/+$/, "");

export const createMysqlClient = ({
    apiBaseUrl,
    getAccessToken,
}: ClientConfig) => {
    const normalizedApiBaseUrl = trimSlash(apiBaseUrl);

    const request = async <T>(path: string, options: RequestOptions = {}) => {
        const headers = new Headers();
        const body =
            options.body === undefined
                ? undefined
                : JSON.stringify(options.body);
        if (body !== undefined) {
            headers.set("Content-Type", "application/json");
        }
        if (options.auth !== false) {
            const accessToken = getAccessToken();
            if (accessToken) {
                headers.set("Authorization", `Bearer ${accessToken}`);
            }
        }
        const requestUrl =
            path.startsWith("http://") || path.startsWith("https://")
                ? path
                : `${normalizedApiBaseUrl}${path}`;
        const response = await fetch(requestUrl, {
            method: options.method ?? "GET",
            headers,
            body,
            signal: options.signal,
        });
        if (!response.ok) {
            const data = await response
                .clone()
                .json()
                .catch(() => ({ error: response.statusText }));
            const message =
                response.status === 401
                    ? "Bad credentials"
                    : (data?.error as string) || response.statusText;
            const error = new Error(message);
            (error as Error & { status?: number }).status = response.status;
            throw error;
        }
        if (options.responseType === "void" || response.status === 204) {
            return undefined as T;
        }
        if (options.responseType === "blob") {
            return (await response.blob()) as T;
        }
        return (await response.json()) as T;
    };

    return {
        apiBaseUrl: normalizedApiBaseUrl,
        async login(payload: { username: string; password: string }) {
            return await request<MysqlAuthResponse>("/auth/login", {
                method: "POST",
                body: payload,
                auth: false,
            });
        },
        async register(payload: {
            username: string;
            password: string;
            displayName?: string;
        }) {
            return await request<MysqlAuthResponse>("/auth/register", {
                method: "POST",
                body: payload,
                auth: false,
            });
        },
        async getMe() {
            const result = await request<{ user: MysqlAuthResponse["user"] }>(
                "/me",
            );
            return result.user;
        },
        async getUser(id: string) {
            const result = await request<{ user: MysqlAuthResponse["user"] }>(
                `/users/${id}`,
            );
            return result.user;
        },
        async getBooks() {
            const result = await request<{
                books: { id: string; name: string }[];
            }>("/books");
            return result.books;
        },
        async createBook(name: string) {
            const result = await request<{
                book: { id: string; name: string };
            }>("/books", {
                method: "POST",
                body: { name },
            });
            return result.book;
        },
        async deleteBook(bookId: string) {
            await request(`/books/${bookId}`, {
                method: "DELETE",
                responseType: "void",
            });
        },
        async getBookSnapshot(bookId: string) {
            return await request<{
                meta: Record<string, any>;
                items: any[];
            }>(`/books/${bookId}/bootstrap`);
        },
        async batch(bookId: string, actions: unknown[], signal?: AbortSignal) {
            await request(`/books/${bookId}/batch`, {
                method: "POST",
                body: { actions },
                signal,
            });
        },
        async getCollaborators(bookId: string) {
            const result = await request<{
                collaborators: MysqlAuthResponse["user"][];
            }>(`/books/${bookId}/collaborators`);
            return result.collaborators;
        },
        async addCollaborator(bookId: string, username: string) {
            const result = await request<{
                collaborator: MysqlAuthResponse["user"];
            }>(`/books/${bookId}/collaborators`, {
                method: "POST",
                body: { username },
            });
            return result.collaborator;
        },
        async uploadAsset(bookId: string, file: File, signal?: AbortSignal) {
            const result = await request<{
                asset: { id: string; url: string };
            }>("/assets", {
                method: "POST",
                body: {
                    bookId,
                    fileName: file.name,
                    mimeType: file.type || "application/octet-stream",
                    base64: await blobToBase64(file),
                },
                signal,
            });
            return result.asset.url;
        },
        async getAsset(source: string, signal?: AbortSignal) {
            const assetUrl = new URL(
                source,
                `${normalizedApiBaseUrl}/`,
            ).toString();
            return await request<Blob>(assetUrl, {
                responseType: "blob",
                signal,
            });
        },
    };
};
