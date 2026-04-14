import type { Modal } from "@/components/modal";
import { Scheduler } from "@/database/scheduler";
import { BillIndexedDBStorage } from "@/database/storage";
import type { SyncEndpointFactory } from "../type";
import {
    clearPostgresSession,
    createSessionPostgresClient,
    loginWithPostgres,
    registerWithPostgres,
} from "./auth";
import { PostgresStorage } from "./storage";

const inviteCollaborator = async (modal: Modal) => {
    const username = (await modal.prompt({
        title: "请输入要邀请的用户名",
        input: {
            type: "text",
            placeholder: "username",
        },
    })) as string | undefined;
    return username?.trim();
};

export const PostgresEndpoint: SyncEndpointFactory & {
    register: (ctx: { modal: Modal }) => Promise<void>;
} = {
    type: "postgres",
    name: "PostgreSQL",
    login: loginWithPostgres,
    register: registerWithPostgres,
    init: ({ modal }) => {
        const client = createSessionPostgresClient();
        const repo = new PostgresStorage({
            storage: (name) => new BillIndexedDBStorage(`book-${name}`),
            client,
        });

        const scheduler = new Scheduler(async (signal) => {
            await repo.sync(signal);
        });

        return {
            logout: async () => {
                await repo.detach();
                clearPostgresSession();
            },
            getUserInfo: repo.getUserInfo.bind(repo),
            getCollaborators: repo.getCollaborators.bind(repo),
            getOnlineAsset: (src) => repo.getAsset(src),

            fetchAllBooks: repo.fetchAllStore.bind(repo),
            createBook: repo.createStore.bind(repo),
            initBook: repo.initStore.bind(repo),
            deleteBook: repo.deleteStore.bind(repo),
            inviteForBook: async (bookId) => {
                const username = await inviteCollaborator(modal);
                if (!username) {
                    return;
                }
                await repo.inviteForStore(bookId, username);
                modal.toast.success("邀请已发送");
            },

            batch: async (...args) => {
                await repo.batch(...args);
                scheduler.schedule();
            },
            getMeta: repo.getMeta.bind(repo),
            getAllItems: repo.getAllItems.bind(repo),
            onChange: repo.onChange.bind(repo),

            getIsNeedSync: repo.hasStashes.bind(repo),
            onSync: scheduler.onProcess.bind(scheduler),
            toSync: scheduler.schedule.bind(scheduler),
        };
    },
};
