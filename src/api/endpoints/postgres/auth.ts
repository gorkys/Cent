import type { Modal } from "@/components/modal";
import { createPostgresClient } from "./client";

const POSTGRES_API_BASE_URL_KEY = "postgres_api_base_url";
const POSTGRES_ACCESS_TOKEN_KEY = "postgres_access_token";
const SYNC_ENDPOINT_KEY = "SYNC_ENDPOINT";
const POSTGRES_ENDPOINT_TYPE = "postgres";

const trimSlash = (value: string) => value.replace(/\/+$/, "");
const getDefaultPort = (protocol: string) =>
    protocol === "https:" ? "443" : "80";
const normalizeApiBaseUrl = (value: string) => {
    const trimmed = trimSlash(value);
    if (!trimmed) {
        return trimmed;
    }
    try {
        const url = new URL(trimmed, window.location.origin);
        if (
            url.hostname === window.location.hostname &&
            url.protocol === window.location.protocol &&
            !url.port &&
            window.location.port &&
            window.location.port !==
                getDefaultPort(window.location.protocol)
        ) {
            url.port = window.location.port;
        }
        return trimSlash(url.toString());
    } catch {
        return trimmed;
    }
};

export const getDefaultApiBaseUrl = () => {
    const stored = localStorage.getItem(POSTGRES_API_BASE_URL_KEY);
    if (stored) {
        return normalizeApiBaseUrl(stored);
    }
    const envValue = import.meta.env.VITE_POSTGRES_API_HOST;
    if (envValue) {
        return normalizeApiBaseUrl(envValue);
    }
    return normalizeApiBaseUrl(`${window.location.origin}/api/postgres`);
};

export type PostgresSession = {
    apiBaseUrl: string;
    accessToken: string;
};

export const getPostgresSession = (): PostgresSession | undefined => {
    const apiBaseUrl = localStorage.getItem(POSTGRES_API_BASE_URL_KEY);
    const accessToken = localStorage.getItem(POSTGRES_ACCESS_TOKEN_KEY);
    if (!apiBaseUrl || !accessToken) {
        return undefined;
    }
    return {
        apiBaseUrl: normalizeApiBaseUrl(apiBaseUrl),
        accessToken,
    };
};

export const clearPostgresSession = () => {
    localStorage.removeItem(POSTGRES_API_BASE_URL_KEY);
    localStorage.removeItem(POSTGRES_ACCESS_TOKEN_KEY);
};

export const savePostgresSession = (session: PostgresSession) => {
    localStorage.setItem(SYNC_ENDPOINT_KEY, POSTGRES_ENDPOINT_TYPE);
    localStorage.setItem(
        POSTGRES_API_BASE_URL_KEY,
        normalizeApiBaseUrl(session.apiBaseUrl),
    );
    localStorage.setItem(POSTGRES_ACCESS_TOKEN_KEY, session.accessToken);
};

export const createSessionPostgresClient = () => {
    return createPostgresClient({
        apiBaseUrl:
            getPostgresSession()?.apiBaseUrl ?? getDefaultApiBaseUrl(),
        getAccessToken: () => getPostgresSession()?.accessToken,
    });
};

export const createPublicPostgresClient = () => {
    return createPostgresClient({
        apiBaseUrl: getDefaultApiBaseUrl(),
        getAccessToken: () => undefined,
    });
};

const askInput = async (
    modal: Modal,
    title: string,
    input: NonNullable<Parameters<Modal["prompt"]>[0]["input"]>,
) => {
    const value = (await modal.prompt({
        title,
        input,
    })) as string | undefined;
    return value?.trim();
};

const authenticate = async (modal: Modal, mode: "login" | "register") => {
    const apiBaseUrl = getDefaultApiBaseUrl();
    const username = await askInput(modal, "请输入用户名", {
        type: "text",
        placeholder: "username",
    });
    if (!username) {
        return;
    }
    const password = await askInput(modal, "请输入密码", {
        type: "password",
        placeholder: "password",
    });
    if (!password) {
        return;
    }
    const displayName =
        mode === "register"
            ? await askInput(modal, "请输入显示名称", {
                  type: "text",
                  defaultValue: username,
                  placeholder: "display name",
              })
            : undefined;

    const client = createPostgresClient({
        apiBaseUrl,
        getAccessToken: () => undefined,
    });
    const [closeLoading] = modal.loading({
        label: mode === "register" ? "正在注册账号..." : "正在登录...",
    });
    try {
        const result =
            mode === "register"
                ? await client.register({
                      username,
                      password,
                      displayName: displayName || username,
                  })
                : await client.login({
                      username,
                      password,
                  });
        savePostgresSession({
            apiBaseUrl: result.apiBaseUrl || apiBaseUrl,
            accessToken: result.token,
        });
        location.reload();
    } catch (error) {
        modal.toast.error((error as Error).message || "操作失败");
    } finally {
        closeLoading();
    }
};

export const loginWithPostgres = async ({ modal }: { modal: Modal }) => {
    return await authenticate(modal, "login");
};

export const registerWithPostgres = async ({ modal }: { modal: Modal }) => {
    return await authenticate(modal, "register");
};
