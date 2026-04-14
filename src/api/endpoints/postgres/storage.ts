import type { ChangeListener } from "@/api/endpoints/type";
import {
    type Action,
    type Full,
    StashBucket,
    type StashStorage,
} from "@/database/stash";
import type { Bill, GlobalMeta } from "@/ledger/type";
import type { createPostgresClient } from "./client";

type PostgresClient = ReturnType<typeof createPostgresClient>;

type PostgresStorageConfig = {
    storage: (storeFullName: string) => StashStorage;
    client: PostgresClient;
};

const isAbortError = (error: unknown) =>
    error instanceof DOMException && error.name === "AbortError";

const ensureNotAborted = (signal?: AbortSignal) => {
    if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
    }
};

export class PostgresStorage {
    protected readonly config: PostgresStorageConfig;

    constructor(config: PostgresStorageConfig) {
        this.config = config;
    }

    private storeMap = new Map<
        string,
        { storage: StashStorage; itemBucket: StashBucket<Bill> }
    >();

    private listeners: ChangeListener[] = [];

    private getStore(storeFullName: string) {
        const storage =
            this.storeMap.get(storeFullName)?.storage ??
            this.config.storage(storeFullName);
        const itemBucket =
            this.storeMap.get(storeFullName)?.itemBucket ??
            new StashBucket(
                storage.createArrayableStorage,
                storage.createStorage,
            );
        this.storeMap.set(storeFullName, { storage, itemBucket });
        return { storage, itemBucket };
    }

    private notifyChange(storeFullName: string) {
        this.listeners.forEach((listener) => {
            listener({ bookId: storeFullName });
        });
    }

    private async hydrateValue(
        storeFullName: string,
        value: unknown,
        signal?: AbortSignal,
    ): Promise<unknown> {
        ensureNotAborted(signal);
        if (value instanceof File) {
            return await this.config.client.uploadAsset(
                storeFullName,
                value,
                signal,
            );
        }
        if (Array.isArray(value)) {
            return await Promise.all(
                value.map((item) =>
                    this.hydrateValue(storeFullName, item, signal),
                ),
            );
        }
        if (value && typeof value === "object") {
            const entries = await Promise.all(
                Object.entries(value).map(async ([key, innerValue]) => {
                    return [
                        key,
                        await this.hydrateValue(
                            storeFullName,
                            innerValue,
                            signal,
                        ),
                    ] as const;
                }),
            );
            return Object.fromEntries(entries);
        }
        return value;
    }

    private async prepareActions(
        storeFullName: string,
        itemBucket: StashBucket<Bill>,
        actions: Awaited<ReturnType<StashBucket<Bill>["getStashes"]>>,
        signal?: AbortSignal,
    ) {
        const fullMeta = (await itemBucket.getMeta()) ?? {};
        return await Promise.all(
            actions.map(async (action) => {
                if (action.type === "meta") {
                    return {
                        type: "meta" as const,
                        timestamp: action.timestamp,
                        metaValue: fullMeta,
                    };
                }
                if (action.type === "delete") {
                    return {
                        type: "delete" as const,
                        timestamp: action.timestamp,
                        value: action.value,
                    };
                }
                return {
                    type: "update" as const,
                    timestamp: action.timestamp,
                    value: (await this.hydrateValue(
                        storeFullName,
                        action.value,
                        signal,
                    )) as Bill,
                };
            }),
        );
    }

    async fetchAllStore() {
        return await this.config.client.getBooks();
    }

    async createStore(name: string) {
        return await this.config.client.createBook(name);
    }

    async initStore(storeFullName: string) {
        const { itemBucket } = this.getStore(storeFullName);
        const snapshot =
            await this.config.client.getBookSnapshot(storeFullName);
        const localStashes = await itemBucket.getStashes();

        await itemBucket.metaStorage.setValue(snapshot.meta ?? {});
        await itemBucket.itemStorage.clear();
        await itemBucket.itemStorage.put(
            ...(snapshot.items as Full<Bill>[]).map((item) => ({ ...item })),
        );

        if (localStashes.length > 0) {
            const updates = localStashes
                .filter((action) => action.type === "update")
                .map((action) => ({
                    __create_at: action.timestamp,
                    __update_at: action.timestamp,
                    ...action.value,
                }));
            const deletes = localStashes
                .filter((action) => action.type === "delete")
                .map((action) => action.value);
            if (updates.length > 0) {
                await itemBucket.itemStorage.put(...updates);
            }
            if (deletes.length > 0) {
                await itemBucket.itemStorage.delete(...deletes);
            }
        }

        this.notifyChange(storeFullName);
    }

    async deleteStore(storeFullName: string) {
        const { storage } = this.getStore(storeFullName);
        await this.config.client.deleteBook(storeFullName);
        await storage.clearStorages();
        this.storeMap.delete(storeFullName);
        this.notifyChange(storeFullName);
    }

    async inviteForStore(storeFullName: string, username: string) {
        return await this.config.client.addCollaborator(
            storeFullName,
            username,
        );
    }

    async batch(
        storeFullName: string,
        actions: Action<Bill>[],
        overlap = false,
    ) {
        const { itemBucket } = this.getStore(storeFullName);
        await itemBucket.batch(actions, overlap);
        this.notifyChange(storeFullName);
    }

    async getAllItems(storeFullName: string) {
        return await this.getStore(storeFullName).itemBucket.getItems();
    }

    async getMeta(storeFullName: string) {
        const meta = ((await this.getStore(
            storeFullName,
        ).itemBucket.getMeta()) ?? {}) as GlobalMeta;
        return meta;
    }

    async sync(signal?: AbortSignal) {
        for (const [storeFullName, { itemBucket }] of this.storeMap.entries()) {
            ensureNotAborted(signal);
            const stashes = await itemBucket.getStashes();
            if (stashes.length === 0) {
                continue;
            }
            const prepared = await this.prepareActions(
                storeFullName,
                itemBucket,
                stashes,
                signal,
            );
            try {
                await this.config.client.batch(storeFullName, prepared, signal);
            } catch (error) {
                if (isAbortError(error)) {
                    throw error;
                }
                throw error;
            }
            const latestMeta = await itemBucket.getMeta();
            if (latestMeta !== undefined) {
                await itemBucket.metaStorage.setValue(latestMeta);
            }
            await itemBucket.stashStorage.delete(
                ...stashes.map((item) => item.id),
            );
        }
    }

    async hasStashes() {
        const results = await Promise.all(
            Array.from(this.storeMap.values()).map(async ({ itemBucket }) => {
                const items = await itemBucket.getStashes();
                return items.length > 0;
            }),
        );
        return results.some(Boolean);
    }

    async detach(stores?: string[]) {
        const targetStores = stores ?? Array.from(this.storeMap.keys());
        await Promise.all(
            targetStores.map(async (storeName) => {
                const value = this.storeMap.get(storeName);
                await value?.storage.dangerousClearAll();
                this.storeMap.delete(storeName);
            }),
        );
    }

    async getUserInfo(id?: string) {
        if (!id) {
            return await this.config.client.getMe();
        }
        return await this.config.client.getUser(id);
    }

    async getCollaborators(id: string) {
        return await this.config.client.getCollaborators(id);
    }

    async getAsset(source: string, signal?: AbortSignal) {
        return await this.config.client.getAsset(source, signal);
    }

    onChange(listener: ChangeListener) {
        this.listeners.push(listener);
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index >= 0) {
                this.listeners.splice(index, 1);
            }
        };
    }
}
