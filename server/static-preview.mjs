import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { extname, join, normalize } from "node:path";

const host = process.env.STATIC_PREVIEW_HOST || "127.0.0.1";
const port = Number(process.env.STATIC_PREVIEW_PORT || 5173);
const root = join(process.cwd(), "dist");

const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") {
        pathname = "/index.html";
    }

    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    let filePath = join(root, safePath);

    if (
        !existsSync(filePath) ||
        (existsSync(filePath) && statSync(filePath).isDirectory())
    ) {
        filePath = join(root, "index.html");
    }

    if (!existsSync(filePath)) {
        response.writeHead(404, {
            "Content-Type": "text/plain; charset=utf-8",
        });
        response.end("Not Found");
        return;
    }

    const ext = extname(filePath);
    response.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
    });

    if (filePath.endsWith("index.html")) {
        response.end(await readFile(filePath));
        return;
    }

    createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
    console.log(`Static preview listening on http://${host}:${port}`);
});
