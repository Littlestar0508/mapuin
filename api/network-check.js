const https = require("node:https");

const SHARE_ID = "637e971b701c47918bea73757249a421";

const TARGETS = [
  {
    name: "naver-home",
    url: "https://www.naver.com/",
  },
  {
    name: "naver-map-server",
    url: "https://pages.map.naver.com/",
  },
  {
    name: "naver-bookmarks-api",
    url:
      `https://pages.map.naver.com/save-pages/api/` +
      `maps-bookmark/v3/shares/${SHARE_ID}/bookmarks` +
      `?start=0&limit=1000&sort=lastUseTime`,
  },
];

function checkConnection(target) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const phases = {};
    let completed = false;
    let request;

    const mark = (name) => {
      phases[name] = Date.now() - startTime;
    };

    const finish = (result) => {
      if (completed) return;

      completed = true;
      clearTimeout(timer);

      resolve({
        name: target.name,
        elapsedMs: Date.now() - startTime,
        phases,
        ...result,
      });
    };

    const timer = setTimeout(() => {
      finish({
        success: false,
        error: "Timeout after 8000ms",
      });

      if (request) request.destroy();
    }, 8000);

    try {
      request = https.request(
        target.url,
        {
          method: "GET",
          agent: false,
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; PersonalMap/1.0)",
          },
        },
        (response) => {
          mark("httpResponse");

          const result = {
            success: true,
            status: response.statusCode,
            contentType: response.headers["content-type"] || null,
          };

          response.resume();
          finish(result);
        },
      );

      request.on("socket", (socket) => {
        mark("socketAssigned");

        socket.on("lookup", (error, address, family) => {
          mark("dnsLookup");

          phases.dnsFamily = family;

          if (error) {
            phases.dnsError = error.code;
          }
        });

        socket.on("connect", () => {
          mark("tcpConnected");
        });

        socket.on("secureConnect", () => {
          mark("tlsConnected");
        });
      });

      request.on("error", (error) => {
        finish({
          success: false,
          error: error.message,
          errorCode: error.code || null,
        });
      });

      request.end();
    } catch (error) {
      finish({
        success: false,
        error: error.message,
      });
    }
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "GET 요청만 허용합니다.",
    });
  }

  const results = await Promise.all(TARGETS.map(checkConnection));

  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    region: process.env.VERCEL_REGION || "local",
    results,
  });
};
