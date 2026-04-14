import crypto from "node:crypto";
import { query, withTransaction } from "./db.mjs";

const parseJson = (value, fallback) => {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }
    if (typeof value === "string") {
        return JSON.parse(value);
    }
    return value;
};

const toUserInfo = (row) => ({
    id: `${row.id}`,
    name: row.display_name || row.username,
    avatar_url: row.avatar_url || "/icon.png",
});

const toBook = (row) => ({
    id: row.id,
    name: row.name,
});

const toEntry = (row) => ({
    id: row.id,
    type: row.type,
    categoryId: row.category_id,
    creatorId: `${row.creator_id}`,
    comment: row.comment ?? undefined,
    amount: Number(row.amount),
    time: Number(row.occurred_at),
    images: parseJson(row.images_json, undefined),
    location: parseJson(row.location_json, undefined),
    tagIds: parseJson(row.tag_ids_json, undefined),
    currency: parseJson(row.currency_json, undefined),
    extra: parseJson(row.extra_json, undefined),
    __create_at: Number(row.created_at),
    __update_at: Number(row.updated_at),
});

export const findUserByUsername = async (username) => {
    const { rows } = await query(
        `
        SELECT id, username, password_hash, display_name, avatar_url
        FROM users
        WHERE username = ?
        LIMIT 1
        `,
        [username],
    );
    return rows[0];
};

export const findUserById = async (id) => {
    const { rows } = await query(
        `
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [id],
    );
    return rows[0];
};

export const createUser = async ({ username, passwordHash, displayName }) => {
    const { rows } = await query(
        `
        INSERT INTO users (username, password_hash, display_name, avatar_url)
        VALUES (?, ?, ?, ?)
        RETURNING id
        `,
        [username, passwordHash, displayName, "/icon.png"],
    );
    return await findUserById(rows[0]?.id);
};

export const listBooksForUser = async (userId) => {
    const { rows } = await query(
        `
        SELECT b.id, b.name
        FROM books b
        INNER JOIN book_members bm ON bm.book_id = b.id
        WHERE bm.user_id = ?
        ORDER BY b.created_at DESC
        `,
        [userId],
    );
    return rows.map(toBook);
};

export const getBookForUser = async (bookId, userId) => {
    const { rows } = await query(
        `
        SELECT b.id, b.name, b.owner_id, bm.role
        FROM books b
        INNER JOIN book_members bm ON bm.book_id = b.id
        WHERE b.id = ? AND bm.user_id = ?
        LIMIT 1
        `,
        [bookId, userId],
    );
    return rows[0];
};

export const createBook = async ({ userId, name }) => {
    const bookId = crypto.randomUUID();
    await withTransaction(async (connection) => {
        await connection.query(
            `
            INSERT INTO books (id, name, owner_id, meta_json)
            VALUES (?, ?, ?, ?)
            `,
            [bookId, name, userId, JSON.stringify({})],
        );
        await connection.query(
            `
            INSERT INTO book_members (book_id, user_id, role)
            VALUES (?, ?, 'owner')
            `,
            [bookId, userId],
        );
    });
    return { id: bookId, name };
};

export const deleteBook = async ({ bookId, userId }) => {
    const book = await getBookForUser(bookId, userId);
    if (!book) {
        return false;
    }
    if (`${book.owner_id}` !== `${userId}`) {
        const error = new Error("Only the owner can delete this book.");
        error.statusCode = 403;
        throw error;
    }
    await query(`DELETE FROM books WHERE id = ?`, [bookId]);
    return true;
};

export const getBookSnapshot = async ({ bookId, userId }) => {
    const book = await getBookForUser(bookId, userId);
    if (!book) {
        const error = new Error("Book not found.");
        error.statusCode = 404;
        throw error;
    }
    const { rows: bookRows } = await query(
        `
        SELECT meta_json
        FROM books
        WHERE id = ?
        LIMIT 1
        `,
        [bookId],
    );
    const { rows: entryRows } = await query(
        `
        SELECT
            id,
            creator_id,
            type,
            category_id,
            comment,
            amount,
            occurred_at,
            images_json,
            location_json,
            tag_ids_json,
            currency_json,
            extra_json,
            created_at,
            updated_at
        FROM book_entries
        WHERE book_id = ?
        ORDER BY occurred_at DESC, updated_at DESC
        `,
        [bookId],
    );
    return {
        meta: parseJson(bookRows[0]?.meta_json, {}),
        items: entryRows.map(toEntry),
    };
};

export const listCollaborators = async ({ bookId, userId }) => {
    const book = await getBookForUser(bookId, userId);
    if (!book) {
        const error = new Error("Book not found.");
        error.statusCode = 404;
        throw error;
    }
    const { rows } = await query(
        `
        SELECT u.id, u.username, u.display_name, u.avatar_url, bm.role
        FROM book_members bm
        INNER JOIN users u ON u.id = bm.user_id
        WHERE bm.book_id = ?
        ORDER BY bm.role = 'owner' DESC, u.display_name ASC, u.username ASC
        `,
        [bookId],
    );
    return rows.map(toUserInfo);
};

export const addCollaborator = async ({ bookId, userId, username }) => {
    const book = await getBookForUser(bookId, userId);
    if (!book) {
        const error = new Error("Book not found.");
        error.statusCode = 404;
        throw error;
    }
    if (`${book.owner_id}` !== `${userId}`) {
        const error = new Error("Only the owner can invite collaborators.");
        error.statusCode = 403;
        throw error;
    }
    const target = await findUserByUsername(username);
    if (!target) {
        const error = new Error("Target user not found.");
        error.statusCode = 404;
        throw error;
    }
    await query(
        `
        INSERT INTO book_members (book_id, user_id, role)
        VALUES (?, ?, 'editor')
        ON CONFLICT (book_id, user_id)
        DO UPDATE SET role = EXCLUDED.role
        `,
        [bookId, target.id],
    );
    return toUserInfo(target);
};

export const createAsset = async ({
    bookId,
    userId,
    fileName,
    mimeType,
    buffer,
}) => {
    const book = await getBookForUser(bookId, userId);
    if (!book) {
        const error = new Error("Book not found.");
        error.statusCode = 404;
        throw error;
    }
    const assetId = crypto.randomUUID();
    await query(
        `
        INSERT INTO assets (id, book_id, uploader_id, file_name, mime_type, blob_data)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [assetId, bookId, userId, fileName, mimeType, buffer],
    );
    return { id: assetId };
};

export const getAsset = async ({ assetId, userId }) => {
    const { rows } = await query(
        `
        SELECT a.id, a.file_name, a.mime_type, a.blob_data
        FROM assets a
        INNER JOIN book_members bm ON bm.book_id = a.book_id
        WHERE a.id = ? AND bm.user_id = ?
        LIMIT 1
        `,
        [assetId, userId],
    );
    const asset = rows[0];
    if (!asset) {
        const error = new Error("Asset not found.");
        error.statusCode = 404;
        throw error;
    }
    return asset;
};

export const applyBookActions = async ({ bookId, userId, actions }) => {
    const book = await getBookForUser(bookId, userId);
    if (!book) {
        const error = new Error("Book not found.");
        error.statusCode = 404;
        throw error;
    }
    await withTransaction(async (connection) => {
        for (const action of actions) {
            if (action.type === "meta") {
                await connection.query(
                    `
                    UPDATE books
                    SET meta_json = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    `,
                    [JSON.stringify(action.metaValue ?? {}), bookId],
                );
                continue;
            }

            if (action.type === "delete") {
                await connection.query(
                    `
                    DELETE FROM book_entries
                    WHERE id = ? AND book_id = ?
                    `,
                    [action.value, bookId],
                );
                continue;
            }

            const value = action.value;
            const timestamp = Number(action.timestamp ?? Date.now());
            await connection.query(
                `
                INSERT INTO book_entries (
                    id,
                    book_id,
                    creator_id,
                    type,
                    category_id,
                    comment,
                    amount,
                    occurred_at,
                    images_json,
                    location_json,
                    tag_ids_json,
                    currency_json,
                    extra_json,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    creator_id = EXCLUDED.creator_id,
                    type = EXCLUDED.type,
                    category_id = EXCLUDED.category_id,
                    comment = EXCLUDED.comment,
                    amount = EXCLUDED.amount,
                    occurred_at = EXCLUDED.occurred_at,
                    images_json = EXCLUDED.images_json,
                    location_json = EXCLUDED.location_json,
                    tag_ids_json = EXCLUDED.tag_ids_json,
                    currency_json = EXCLUDED.currency_json,
                    extra_json = EXCLUDED.extra_json,
                    updated_at = EXCLUDED.updated_at
                `,
                [
                    value.id,
                    bookId,
                    Number(value.creatorId ?? userId),
                    value.type,
                    value.categoryId,
                    value.comment ?? null,
                    Number(value.amount ?? 0),
                    Number(value.time ?? Date.now()),
                    JSON.stringify(value.images ?? null),
                    JSON.stringify(value.location ?? null),
                    JSON.stringify(value.tagIds ?? null),
                    JSON.stringify(value.currency ?? null),
                    JSON.stringify(value.extra ?? null),
                    Number(value.__create_at ?? timestamp),
                    timestamp,
                ],
            );
        }
    });
};

export const toUserInfoPayload = toUserInfo;
