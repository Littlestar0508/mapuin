// 로컬 개발 전용 서버. Vercel 계정이나 CLI는 필요하지 않습니다.
// Node.js 20.6+에서 실행: node --env-file=.env.local dev-server.js
const http = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const configHandler = require("./api/config");
const directionsHandler = require("./api/directions");
const placesHandler = require("./api/places");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
  "/script.js": ["script.js", "text/javascript; charset=utf-8"],
  "/places.json": ["places.json", "application/json; charset=utf-8"],
};

// 로컬 테스트에서도 /assets/기업명.png, .jpg, .jpeg를 제공하도록 허용합니다.
// 파일명만 허용해 다른 폴더로 접근하지 못하도록 제한합니다.
function resolveAsset(pathname) {
  if (!pathname.startsWith("/assets/")) return null;

  let filename;
  try {
    filename = decodeURIComponent(pathname.slice("/assets/".length));
  } catch {
    return null;
  }
  if (!filename || filename === "." || filename === ".." ||
      filename.includes("/") || filename.includes("\\") || filename.includes("\0")) {
    return null;
  }

  const mime = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  }[path.extname(filename).toLowerCase()];

  return mime ? [path.join("assets", filename), mime] : null;
}

// 기존 api/*.js의 Vercel handler가 사용할 res.status().json() 기능을 제공합니다.
function setJsonHelpers(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    if (res.writableEnded) return res;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
    return res;
  };
  return res;
}

async function receiveJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk.toString("utf8");
    if (Buffer.byteLength(raw) > 16 * 1024) {
      const error = new Error("요청 데이터가 너무 큽니다.");
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("유효한 JSON 요청이 아닙니다.");
    error.statusCode = 400;
    throw error;
  }
}

const server = http.createServer(async (req, originalRes) => {
  const res = setJsonHelpers(originalRes);
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/api/config") {
      await configHandler(req, res);
      return;
    }
    if (pathname === "/api/places") {
      await placesHandler(req, res);
      return;
    }
    if (pathname === "/api/directions") {
      if (req.method === "POST") req.body = await receiveJson(req);
      await directionsHandler(req, res);
      return;
    }
    const file = PUBLIC_FILES[pathname] || resolveAsset(pathname);
    if (!file)
      return res.status(404).json({ error: "요청한 경로를 찾을 수 없습니다." });
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return res.status(405).json({ error: "허용되지 않은 요청입니다." });
    }
    let contents;
    try {
      contents = await readFile(path.join(__dirname, file[0]));
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        return res.status(404).json({ error: "파일이 없습니다." });
      }
      throw error;
    }
    res.setHeader("Content-Type", file[1]);
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 200;
    res.end(req.method === "HEAD" ? undefined : contents);
  } catch (error) {
    console.error("[local dev server]", error.message);
    if (!res.writableEnded)
      res
        .status(error.statusCode || 500)
        .json({
          error: error.statusCode ? error.message : "서버 오류가 발생했습니다.",
        });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`로컬 개발 서버: http://localhost:${PORT}`);
  console.log(`설정 확인: http://localhost:${PORT}/api/config`);
});
