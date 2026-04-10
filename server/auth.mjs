import crypto from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config.mjs";

const scrypt = promisify(crypto.scrypt);

const toBase64Url = (value) =>
    Buffer.from(value)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");

const fromBase64Url = (value) => {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding =
        normalized.length % 4 === 0
            ? ""
            : "=".repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, "base64");
};

const signPayload = (payload) =>
    crypto
        .createHmac("sha256", config.authSecret)
        .update(payload)
        .digest("base64url");

export const hashPassword = async (password) => {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = await scrypt(password, salt, 64);
    return `${salt}:${Buffer.from(derived).toString("hex")}`;
};

export const verifyPassword = async (password, storedHash) => {
    const [salt, hash] = `${storedHash}`.split(":");
    if (!salt || !hash) {
        return false;
    }
    const derived = await scrypt(password, salt, 64);
    return crypto.timingSafeEqual(
        Buffer.from(hash, "hex"),
        Buffer.from(derived),
    );
};

export const createAccessToken = (user) => {
    const payload = JSON.stringify({
        userId: `${user.id}`,
        username: user.username,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    const encodedPayload = toBase64Url(payload);
    const signature = signPayload(encodedPayload);
    return `${encodedPayload}.${signature}`;
};

export const verifyAccessToken = (token) => {
    if (!token) {
        return null;
    }
    const [encodedPayload, signature] = `${token}`.split(".");
    if (!encodedPayload || !signature) {
        return null;
    }
    const expected = signPayload(encodedPayload);
    if (
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
        return null;
    }
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8"));
    if (!payload?.userId || payload.exp < Date.now()) {
        return null;
    }
    return payload;
};

export const pickTokenFromHeader = (authorization) => {
    if (!authorization) {
        return "";
    }
    const [type, token] = authorization.split(" ");
    if (type?.toLowerCase() !== "bearer") {
        return "";
    }
    return token ?? "";
};
