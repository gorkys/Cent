import type { Modal } from "@/components/modal";
import { createMysqlClient } from "./client";

const MYSQL_API_BASE_URL_KEY = "mysql_api_base_url";
const MYSQL_ACCESS_TOKEN_KEY = "mysql_access_token";
const SYNC_ENDPOINT_KEY = "SYNC_ENDPOINT";
const MYSQL_ENDPOINT_TYPE = "mysql";

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const getDefaultApiBaseUrl = () => {
    const stored = localStorage.getItem(MYSQL_API_BASE_URL_KEY);
    if (stored) {
        return trimSlash(stored);
    }
    const envValue = import.meta.env.VITE_MYSQL_API_HOST;
    if (envValue) {
        return trimSlash(envValue);
    }
    return `${window.location.origin}/api/mysql`;
};

export type MysqlSession = {
    apiBaseUrl: string;
    accessToken: string;
};

export const getMysqlSession = (): MysqlSession | undefined => {
    const apiBaseUrl = localStorage.getItem(MYSQL_API_BASE_URL_KEY);
    const accessToken = localStorage.getItem(MYSQL_ACCESS_TOKEN_KEY);
    if (!apiBaseUrl || !accessToken) {
        return undefined;
    }
    return {
        apiBaseUrl: trimSlash(apiBaseUrl),
        accessToken,
    };
};

export const clearMysqlSession = () => {
    localStorage.removeItem(MYSQL_API_BASE_URL_KEY);
    localStorage.removeItem(MYSQL_ACCESS_TOKEN_KEY);
};

export const saveMysqlSession = (session: MysqlSession) => {
    localStorage.setItem(SYNC_ENDPOINT_KEY, MYSQL_ENDPOINT_TYPE);
    localStorage.setItem(MYSQL_API_BASE_URL_KEY, trimSlash(session.apiBaseUrl));
    localStorage.setItem(MYSQL_ACCESS_TOKEN_KEY, session.accessToken);
};

export const createSessionMysqlClient = () => {
    return createMysqlClient({
        apiBaseUrl: getMysqlSession()?.apiBaseUrl ?? getDefaultApiBaseUrl(),
        getAccessToken: () => getMysqlSession()?.accessToken,
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
    const apiBaseUrl = await askInput(modal, "请输入 MySQL API 地址", {
        type: "text",
        defaultValue: getDefaultApiBaseUrl(),
        placeholder: "http://localhost:8787/api/mysql",
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

    const client = createMysqlClient({
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
        saveMysqlSession({
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

export const loginWithMysql = async ({ modal }: { modal: Modal }) => {
    return await authenticate(modal, "login");
};

export const registerWithMysql = async ({ modal }: { modal: Modal }) => {
    return await authenticate(modal, "register");
};
