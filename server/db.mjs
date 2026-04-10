import mysql from "mysql2/promise";
import { config } from "./config.mjs";

const schemaStatements = [
    `
    CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(64) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(128) NOT NULL,
        avatar_url VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
    `
    CREATE TABLE IF NOT EXISTS books (
        id CHAR(36) NOT NULL PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        owner_id BIGINT UNSIGNED NOT NULL,
        meta_json JSON NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_books_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_books_owner_id (owner_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
    `
    CREATE TABLE IF NOT EXISTS book_members (
        book_id CHAR(36) NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        role ENUM('owner', 'editor') NOT NULL DEFAULT 'editor',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (book_id, user_id),
        CONSTRAINT fk_book_members_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
        CONSTRAINT fk_book_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
    `
    CREATE TABLE IF NOT EXISTS book_entries (
        id CHAR(36) NOT NULL PRIMARY KEY,
        book_id CHAR(36) NOT NULL,
        creator_id BIGINT UNSIGNED NOT NULL,
        type ENUM('income', 'expense') NOT NULL,
        category_id VARCHAR(128) NOT NULL,
        comment TEXT NULL,
        amount BIGINT NOT NULL,
        occurred_at BIGINT NOT NULL,
        images_json JSON NULL,
        location_json JSON NULL,
        tag_ids_json JSON NULL,
        currency_json JSON NULL,
        extra_json JSON NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT fk_book_entries_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
        INDEX idx_book_entries_book_time (book_id, occurred_at),
        INDEX idx_book_entries_book_creator (book_id, creator_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
    `
    CREATE TABLE IF NOT EXISTS assets (
        id CHAR(36) NOT NULL PRIMARY KEY,
        book_id CHAR(36) NOT NULL,
        uploader_id BIGINT UNSIGNED NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(128) NOT NULL,
        blob_data LONGBLOB NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_assets_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
        INDEX idx_assets_book_id (book_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
];

const getConnectionOptions = () => ({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    namedPlaceholders: true,
    charset: "utf8mb4",
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 10000,
});

const createConnection = async () =>
    mysql.createConnection(getConnectionOptions());

export const query = async (statement, params) => {
    const connection = await createConnection();
    try {
        return await connection.query(statement, params);
    } finally {
        await connection.end();
    }
};

export const ensureSchema = async () => {
    const connection = await createConnection();
    try {
        for (const statement of schemaStatements) {
            await connection.query(statement);
        }
    } finally {
        await connection.end();
    }
};

export const withTransaction = async (callback) => {
    const connection = await createConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        try {
            await connection.rollback();
        } catch {
            // Ignore rollback errors caused by a broken connection.
        }
        throw error;
    } finally {
        await connection.end();
    }
};
