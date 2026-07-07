import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { Resource, PortalTheme } from "./src/types";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createHttpServer(app);
  
  // Set up socket server with cors
  const io = new SocketServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Global in-memory state with categories and premium educational topics
  let resources: Resource[] = [
    {
      id: "init-1",
      type: "announcement",
      title: "مرحباً بكم في ملتقى القراءات القرآنية المبارك",
      description: "نرحب بجميع حفاظ كتاب الله والقرّاء الأفاضل وطلاب علم القراءات والتجويد في هذا الملتقى التفاعلي المباشر لمشاركة الأبحاث والمصاحف ومذكرات توجيه القراءات.",
      category: "general",
      url: "",
      timestamp: Date.now() - 600000
    },
    {
      id: "init-2",
      type: "file",
      title: "كتاب التيسير في القراءات السبع للداني",
      description: "مخطوطة كتاب التيسير في القراءات السبع للإمام أبي عمرو الداني تيسيراً لطلاب علم القراءات والروايات السبعة.",
      category: "grammar",
      url: "#",
      fileName: "التيسير_في_القراءات_السبع.pdf",
      fileSize: "3.2 ميجابايت",
      timestamp: Date.now() - 300000
    },
    {
      id: "init-3",
      type: "link",
      title: "منظومة حرز الأماني ووجه التهاني (الشاطبية) صوتياً",
      description: "رابط مباشر للاستماع وحفظ متن الشاطبية في القراءات السبع بصوت عذب وبجودة عالية.",
      category: "rhetoric",
      url: "https://example.com/shatibiyyah-audio",
      timestamp: Date.now() - 150000
    }
  ];
  let currentTheme: PortalTheme = "aldad";
  
  // Keep track of admin socket IDs
  const adminSockets = new Set<string>();

  // In-memory registry of dynamic shortened paths mapped to redirect targets
  const shortUrls = new Map<string, string>([
    ["welcome", "/"],
    ["files", "/?type=file"],
    ["links", "/?type=link"],
    ["notices", "/?type=announcement"],
    ["admin", "/?admin=true"],
    ["aldad", "/"],
    ["join", "/"],
    ["fusha", "/"],
    ["gate", "/"],
    ["arabic", "/"],
    ["github", "/"]
  ]);

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Initial sync
    socket.emit("init-state", {
      resources,
      theme: currentTheme,
      userCount: io.engine.clientsCount
    });

    // Send short link codes and their destinations
    const linksList = Array.from(shortUrls.entries()).map(([c, t]) => ({ code: c, target: t }));
    socket.emit("short-links-list", linksList);

    // Notify others of updated client count
    io.emit("user-count-update", io.engine.clientsCount);

    // Secure authentication
    socket.on("admin-auth", (password: string, callback: (success: boolean) => void) => {
      if (password === "alealm12345") {
        adminSockets.add(socket.id);
        console.log(`Socket ${socket.id} authenticated successfully as ADMIN.`);
        callback(true);
      } else {
        console.log(`Socket ${socket.id} failed admin authentication.`);
        callback(false);
      }
    });

    // Add new resource (Admin only)
    socket.on("add-resource", (newResource: Omit<Resource, "id" | "timestamp">) => {
      if (!adminSockets.has(socket.id)) {
        socket.emit("error-message", "غير مصرح لك بإجراء هذه العملية. يرجى تسجيل الدخول كمسؤول.");
        return;
      }

      const resource: Resource = {
        ...newResource,
        id: `res-${Math.random().toString(36).substring(2, 11)}`,
        timestamp: Date.now()
      };

      resources.unshift(resource); // Add to beginning
      io.emit("resource-added", resource);
    });

    // Delete resource (Admin only)
    socket.on("delete-resource", (id: string) => {
      if (!adminSockets.has(socket.id)) {
        socket.emit("error-message", "غير مصرح لك بإجراء هذه العملية.");
        return;
      }

      resources = resources.filter(r => r.id !== id);
      io.emit("resource-deleted", id);
    });

    // Change theme (Admin only)
    socket.on("change-theme", (theme: PortalTheme) => {
      if (!adminSockets.has(socket.id)) {
        socket.emit("error-message", "غير مصرح لك بإجراء هذه العملية.");
        return;
      }

      currentTheme = theme;
      io.emit("theme-changed", theme);
    });

    // Create a shortened link alias (Accessible to everyone)
    socket.on("create-short-link", (payload: any, callback: (res: { success: boolean; msg: string }) => void) => {
      let code = "";
      let targetUrl = "/";

      if (typeof payload === "string") {
        code = payload;
      } else if (payload && typeof payload === "object") {
        code = payload.code || "";
        targetUrl = payload.targetUrl || "/";
      }

      const cleanCode = code.trim().toLowerCase().replace(/[^a-z0-9_\u0600-\u06FF-]/g, "");
      if (!cleanCode) {
        callback({ success: false, msg: "الرمز غير صالح. يجب أن يحتوي على أحرف أو أرقام فقط." });
        return;
      }

      if (shortUrls.has(cleanCode)) {
        callback({ success: false, msg: "الرابط المختصر مستخدم بالفعل! الرجاء اختيار رمز آخر." });
        return;
      }

      let cleanTarget = targetUrl.trim();
      if (!cleanTarget) {
        cleanTarget = "/";
      }

      shortUrls.set(cleanCode, cleanTarget);
      
      const linksList = Array.from(shortUrls.entries()).map(([c, t]) => ({ code: c, target: t }));
      io.emit("short-links-list", linksList);
      callback({ success: true, msg: "تم إنشاء الرابط المختصر بنجاح!" });
    });

    // On disconnect
    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
      adminSockets.delete(socket.id);
      io.emit("user-count-update", io.engine.clientsCount);
    });
  });

  // Redirect endpoints for shortened links (dynamic and static GitHub style links)
  app.get("/s/:code", (req, res) => {
    const code = req.params.code.trim().toLowerCase();
    const target = shortUrls.get(code);
    if (target) {
      if (target.startsWith("http://") || target.startsWith("https://")) {
        res.redirect(target);
      } else if (target.startsWith("/")) {
        res.redirect(target);
      } else {
        res.redirect(`https://${target}`);
      }
    } else {
      res.redirect("/");
    }
  });

  app.get("/git/:code", (req, res) => {
    res.redirect("/");
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
