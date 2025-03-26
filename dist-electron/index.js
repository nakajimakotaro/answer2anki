import electron, { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import http from "http";
import url from "url";
if (typeof electron === "string") {
  throw new TypeError("Not running in an Electron environment!");
}
const { env } = process;
const isEnvSet = "ELECTRON_IS_DEV" in env;
const getFromEnv = Number.parseInt(env.ELECTRON_IS_DEV, 10) === 1;
const isDev = isEnvSet ? getFromEnv : !electron.app.isPackaged;
let mainWindow = null;
let mediaCache = {};
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  const startUrl = isDev ? "http://localhost:5173" : `file://${path.join(__dirname, "../dist/index.html")}`;
  mainWindow.loadURL(startUrl);
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
const getContentTypeFromFilename = (filename) => {
  var _a;
  const extension = ((_a = filename.split(".").pop()) == null ? void 0 : _a.toLowerCase()) || "";
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
};
const setupMediaServer = () => {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url || "", true);
    const pathname = parsedUrl.pathname || "";
    const filename = decodeURIComponent(pathname.replace(/^\/media\//, ""));
    if (!filename) {
      res.statusCode = 400;
      res.end("Bad Request: No filename specified");
      return;
    }
    console.log(`Media server request: ${pathname}, filename: ${filename}`);
    try {
      if (mediaCache[filename]) {
        const base64Data2 = mediaCache[filename];
        const buffer2 = Buffer.from(base64Data2, "base64");
        const contentType2 = getContentTypeFromFilename(filename);
        res.setHeader("Content-Type", contentType2);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.statusCode = 200;
        res.end(buffer2);
        return;
      }
      const response = await fetch("http://localhost:8765", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "retrieveMediaFile",
          version: 6,
          params: {
            filename
          }
        })
      });
      const data = await response.json();
      if (data.error) {
        console.error("AnkiConnect error:", data.error);
        res.statusCode = 404;
        res.end(`File not found: ${filename}`);
        return;
      }
      const base64Data = data.result;
      const buffer = Buffer.from(base64Data, "base64");
      mediaCache[filename] = base64Data;
      let contentType = getContentTypeFromFilename(filename);
      if (filename.endsWith(".avif")) {
        contentType = "image/avif";
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.statusCode = 200;
      res.end(buffer);
    } catch (error) {
      console.error("Error retrieving media file:", error);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });
  server.listen(8766, () => {
    console.log("Media server running at http://localhost:8766/");
  });
  server.on("error", (error) => {
    console.error("Media server error:", error);
  });
  return server;
};
const setupIpcHandlers = () => {
  ipcMain.handle("clear-media-cache", () => {
    mediaCache = {};
    return true;
  });
  ipcMain.handle("get-media-server-url", () => {
    return "http://localhost:8766";
  });
};
app.whenReady().then(() => {
  createWindow();
  setupMediaServer();
  setupIpcHandlers();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
