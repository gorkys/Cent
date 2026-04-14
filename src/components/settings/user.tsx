import { useEffect, useState } from "react";
import type { PostgresAdminUser } from "@/api/endpoints/postgres/client";
import { createSessionPostgresClient } from "@/api/endpoints/postgres/auth";
import { StorageAPI } from "@/api/storage";
import { useCreators } from "@/hooks/use-creator";
import PopupLayout from "@/layouts/popup-layout";
import { useIntl } from "@/locale";
import { useBookStore } from "@/store/book";
import { useLedgerStore } from "@/store/ledger";
import { useUserStore } from "@/store/user";
import createConfirmProvider from "../confirm";
import Deletable from "../deletable";
import modal from "../modal";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";

const askValue = async ({
    title,
    defaultValue,
    placeholder,
    type = "text",
}: {
    title: string;
    defaultValue?: string;
    placeholder?: string;
    type?: "text" | "password";
}) => {
    const value = (await modal.prompt({
        title,
        input: {
            type,
            defaultValue,
            placeholder,
        },
    })) as string | undefined;
    return value?.trim();
};

function Form({ onCancel }: { onCancel?: () => void }) {
    const t = useIntl();
    const { id, avatar_url, name: myName, is_admin: isAdmin } = useUserStore();
    const { currentBookId } = useBookStore();
    const creators = useCreators();
    const [adminUsers, setAdminUsers] = useState<PostgresAdminUser[]>([]);
    const [registrationEnabled, setRegistrationEnabled] = useState(false);
    const [adminLoading, setAdminLoading] = useState(false);
    const isPostgresAdmin = StorageAPI.type === "postgres" && Boolean(isAdmin);
    const postgresClient = isPostgresAdmin
        ? createSessionPostgresClient()
        : undefined;
    const accessUrl =
        currentBookId && StorageAPI.type === "github"
            ? `https://github.com/${currentBookId}/settings/access`
            : currentBookId && StorageAPI.type === "gitee"
              ? `https://gitee.com/${currentBookId}/team`
              : undefined;

    const refreshAdminData = async () => {
        if (!postgresClient) {
            return;
        }
        setAdminLoading(true);
        try {
            const result = await postgresClient.getAdminBootstrap();
            setAdminUsers(result.users);
            setRegistrationEnabled(result.auth.registrationEnabled);
        } catch (error) {
            modal.toast.error(
                (error as Error).message || t("load-user-management-failed"),
            );
        } finally {
            setAdminLoading(false);
        }
    };

    useEffect(() => {
        refreshAdminData();
    }, []);

    const toEditName = async (user: { id: string }) => {
        const newName = (await modal.prompt({
            title: t("please-enter-nickname"),
            input: { type: "text" },
        })) as string;
        if (!newName) {
            return;
        }
        await useLedgerStore.getState().updatePersonalMeta((prev) => {
            if (!prev.names) {
                prev.names = {};
            }
            prev.names[user.id] = newName;
            return prev;
        });
    };

    const toRecoverName = async (user: { id: string }) => {
        await useLedgerStore.getState().updatePersonalMeta((prev) => {
            if (!prev.names) {
                prev.names = {};
            }
            delete prev.names[user.id];
            return prev;
        });
    };

    const createAdminUser = async () => {
        if (!postgresClient) {
            return;
        }
        const username = await askValue({
            title: t("enter-new-username"),
            placeholder: "username",
        });
        if (!username) {
            return;
        }
        const password = await askValue({
            title: t("enter-initial-password"),
            placeholder: "password",
            type: "password",
        });
        if (!password) {
            return;
        }
        const displayName =
            (await askValue({
                title: t("enter-display-name"),
                defaultValue: username,
                placeholder: "display name",
            })) || username;
        try {
            await postgresClient.createUser({
                username,
                password,
                displayName,
            });
            modal.toast.success(t("create-user-success"));
            await refreshAdminData();
        } catch (error) {
            modal.toast.error(
                (error as Error).message || t("create-user-failed"),
            );
        }
    };

    const editAdminUser = async (user: PostgresAdminUser) => {
        if (!postgresClient) {
            return;
        }
        const username = await askValue({
            title: t("enter-username"),
            defaultValue: user.username,
            placeholder: "username",
        });
        if (!username) {
            return;
        }
        const displayName = await askValue({
            title: t("enter-display-name"),
            defaultValue: user.name,
            placeholder: "display name",
        });
        if (!displayName) {
            return;
        }
        const password = await askValue({
            title: t("enter-new-password-optional"),
            placeholder: "new password",
            type: "password",
        });
        try {
            await postgresClient.updateUser(user.id, {
                username,
                displayName,
                password: password || undefined,
            });
            modal.toast.success(t("update-user-success"));
            await refreshAdminData();
        } catch (error) {
            modal.toast.error(
                (error as Error).message || t("update-user-failed"),
            );
        }
    };

    const toggleAdminRole = async (user: PostgresAdminUser) => {
        if (!postgresClient) {
            return;
        }
        try {
            await postgresClient.updateUser(user.id, {
                isAdmin: !user.is_admin,
            });
            modal.toast.success(
                user.is_admin
                    ? t("revoke-admin-success")
                    : t("grant-admin-success"),
            );
            await refreshAdminData();
        } catch (error) {
            modal.toast.error(
                (error as Error).message || t("update-admin-role-failed"),
            );
        }
    };

    const removeAdminUser = async (user: PostgresAdminUser) => {
        if (!postgresClient) {
            return;
        }
        try {
            await postgresClient.deleteUser(user.id);
            modal.toast.success(t("delete-user-success-postgres"));
            await refreshAdminData();
        } catch (error) {
            modal.toast.error(
                (error as Error).message || t("delete-user-failed"),
            );
        }
    };

    const toggleRegistration = async (checked: boolean) => {
        if (!postgresClient) {
            return;
        }
        setRegistrationEnabled(checked);
        try {
            const auth = await postgresClient.updateAuthSettings({
                registrationEnabled: checked,
            });
            setRegistrationEnabled(auth.registrationEnabled);
            modal.toast.success(
                auth.registrationEnabled
                    ? t("toggle-registration-enabled")
                    : t("toggle-registration-disabled"),
            );
        } catch (error) {
            setRegistrationEnabled((prev) => !prev);
            modal.toast.error(
                (error as Error).message || t("update-registration-failed"),
            );
        }
    };

    return (
        <PopupLayout
            title={t("user-management")}
            onBack={onCancel}
            className="h-full overflow-hidden"
        >
            <div className="h-full overflow-y-auto">
                <div className="px-4 opacity-60 text-sm">{t("me")}</div>
                <div className="flex items-center justify-between gap-2 px-4 py-2 border-b">
                    <div className="flex items-center gap-2">
                        <img
                            src={avatar_url}
                            alt={myName}
                            className="w-12 h-12 rounded-full border"
                        />

                        <div>
                            <div className="font-semibold flex items-center gap-2">
                                <span>{myName}</span>
                                {isPostgresAdmin && (
                                    <span className="text-[10px] rounded bg-stone-800 px-2 py-0.5 text-white">
                                        {t("admin-badge")}
                                    </span>
                                )}
                            </div>
                            <div className="text-sm opacity-60">{id}</div>
                        </div>
                    </div>
                </div>

                {isPostgresAdmin && (
                    <div className="border-b">
                        <div className="px-4 opacity-60 text-sm pt-2">
                            {t("system-users")}
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                            <div>
                                <div className="font-medium">
                                    {t("public-registration")}
                                </div>
                                <div className="text-xs opacity-60">
                                    {t("public-registration-description")}
                                </div>
                            </div>
                            <Switch
                                checked={registrationEnabled}
                                onCheckedChange={toggleRegistration}
                                disabled={adminLoading}
                            />
                        </div>
                        <div className="px-4 pb-3">
                            <Button
                                size="sm"
                                onClick={createAdminUser}
                                disabled={adminLoading}
                            >
                                <i className="icon-[mdi--account-plus-outline]" />
                                {t("add-system-user")}
                            </Button>
                        </div>
                        <div className="divide-y">
                            {adminUsers.map((user) => (
                                <div
                                    key={user.id}
                                    className="px-4 py-3 flex items-center justify-between gap-3"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold flex items-center gap-2">
                                            <span className="truncate">
                                                {user.name}
                                            </span>
                                            {user.is_admin && (
                                                <span className="text-[10px] rounded bg-stone-800 px-2 py-0.5 text-white">
                                                    {t("admin-badge")}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm opacity-60 truncate">
                                            {user.username}
                                        </div>
                                        <div className="text-xs opacity-40 truncate">
                                            ID: {user.id}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => {
                                                editAdminUser(user);
                                            }}
                                        >
                                            <i className="icon-[mdi--pencil]" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => {
                                                toggleAdminRole(user);
                                            }}
                                            title={
                                                user.is_admin
                                                    ? t("revoke-admin")
                                                    : t("grant-admin")
                                            }
                                        >
                                            <i className="icon-[mdi--shield-account]" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => {
                                                removeAdminUser(user);
                                            }}
                                            disabled={`${user.id}` === `${id}`}
                                        >
                                            <i className="icon-[mdi--delete-outline]" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {!adminLoading && adminUsers.length === 0 && (
                                <div className="px-4 py-3 text-sm opacity-60">
                                    {t("no-system-users")}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="px-4 opacity-60 text-sm pt-2">
                    {t("collaborators")}
                </div>
                <div className="divide-y divide-solid flex flex-col overflow-hidden gap-2">
                    {creators
                        .filter((u) => u.id !== id)
                        .map((user) => {
                            return (
                                <div
                                    key={user.id}
                                    className="flex items-center justify-between gap-2 px-4 py-2"
                                >
                                    <div className="flex items-center gap-2">
                                        <img
                                            src={user.avatar_url}
                                            alt={user.name}
                                            className="w-12 h-12 rounded-full border"
                                        />

                                        <div>
                                            {user.name !== user.originalName ? (
                                                <Deletable
                                                    className="[&_.delete-button]:bg-stone-800"
                                                    onDelete={() => {
                                                        toRecoverName(user);
                                                    }}
                                                    icon={
                                                        <i className="icon-[mdi--reload] text-white size-3"></i>
                                                    }
                                                >
                                                    <div className="font-semibold">
                                                        {user.name}
                                                    </div>
                                                </Deletable>
                                            ) : (
                                                <div className="font-semibold">
                                                    {user.name}
                                                </div>
                                            )}
                                            <div className="text-sm opacity-60">
                                                {user.id}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size={"sm"}
                                            variant={"secondary"}
                                            onClick={() => {
                                                toEditName(user);
                                            }}
                                        >
                                            <i className="icon-[mdi--pencil]" />
                                        </Button>
                                        {accessUrl && (
                                            <Button size={"sm"} asChild>
                                                <a
                                                    href={accessUrl}
                                                    target="_blank"
                                                >
                                                    <i className="icon-[mdi--settings]" />
                                                </a>
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                </div>
            </div>
        </PopupLayout>
    );
}

const [UserSettingsProvider, showUserSettings] = createConfirmProvider(Form, {
    dialogTitle: "user-management",
    dialogModalClose: true,
    contentClassName:
        "h-full w-full max-h-full max-w-full rounded-none sm:rounded-md sm:max-h-[75vh] sm:w-[90vw] sm:max-w-[680px]",
});

export default function UserSettingsItem() {
    const t = useIntl();
    return (
        <div className="lab">
            <Button
                onClick={() => {
                    showUserSettings();
                }}
                variant="ghost"
                className="w-full py-4 rounded-none h-auto"
            >
                <div className="w-full px-4 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <i className="icon-[mdi--account-supervisor-outline] size-5"></i>
                        {t("user-management")}
                    </div>
                    <i className="icon-[mdi--chevron-right] size-5"></i>
                </div>
            </Button>
            <UserSettingsProvider />
        </div>
    );
}
