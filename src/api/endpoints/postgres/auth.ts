import type { Modal } from "@/components/modal";
import { createPostgresClient } from "./client";

const POSTGRES_API_BASE_URL_KEY = "postgres_api_base_url";
const POSTGRES_ACCESS_TOKEN_KEY = "postgres_access_token";
const SYNC_ENDPOINT_KEY = "SYNC_ENDPOINT";
const POSTGRES_ENDPOINT_TYPE = "postgres";

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const getDefaultApiBaseUrl = () => {
    const stored = localStorage.getItem(POSTGRES_API_BASE_URL_KEY);
    if (stored) {
        return trimSlash(stored);
    }
    const envValue = import.meta.env.VITE_POSTGRES_API_HOST;
    if (envValue) {
        return trimSlash(envValue);
    }
    return `${window.location.origin}/api/postgres`;
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
        apiBaseUrl: trimSlash(apiBaseUrl),
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
        trimSlash(session.apiBaseUrl),
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
    const apiBaseUrl = await askInput(modal, "请输入 PostgreSQL API 地址", {
        type: "text",
        defaultValue: getDefaultApiBaseUrl(),
        placeholder: "http://localhost:8787/api/postgres",
    });
    if (!apiBaseUrl) {
        return;
    }
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
