import { PrismaClient } from "@prisma/client";
import RedisStore from "connect-redis";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import session from "express-session";
import multer from "multer";
import { createClient } from "redis";
import swaggerUi from "swagger-ui-express";
import { specs } from "./config/swagger";
import { isAuthenticated } from "./middleware/authMiddleware";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import contentRoutes from "./routes/content";
import statsRoutes from "./routes/stats";
import theoryRoutes from "./routes/theory";
import { importAnkiCards } from "./services/ankiImporter";

dotenv.config();

const prisma = new PrismaClient();
const redisClient = createClient({
  url: process.env.REDIS_URL,
});
redisClient.connect().catch(console.error);

const redisStore = new RedisStore({
  client: redisClient,
  prefix: "myapp:", // Префикс для ключей сессий в Redis
});

const app = express();

app.set("trust proxy", 1); // Доверяем первому прокси (Nginx)

const corsOptions = {
  origin: [
    "https://nareshka.site",
    "https://v2.nareshka.site",
    "http://localhost:5173",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
const port = process.env.PORT || 4000;

app.use(
  session({
    store: redisStore,
    secret: process.env.SESSION_SECRET || "default_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 1 day
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      domain:
        process.env.NODE_ENV === "production" ? ".nareshka.site" : undefined,
    },
  })
);

app.use(express.json());

// Swagger UI
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(specs, {
    explorer: true,
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Nareshka API Documentation",
  })
);

/**
 * @swagger
 * /:
 *   get:
 *     summary: Базовый endpoint
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Приветственное сообщение
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Hello World!"
 */
// Базовый роут
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Роуты для аутентификации
app.use("/auth", authRoutes);

// Роуты для контента
app.use("/api/content", contentRoutes);

// Роуты для теории
app.use("/api/theory", theoryRoutes);

// Роуты для статистики
app.use("/api/stats", statsRoutes);

// Роуты для администрирования
app.use("/api/admin", adminRoutes);

/**
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Получение профиля пользователя
 *     tags: [User]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Данные профиля пользователя
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Не авторизован
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Пользователь не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Внутренняя ошибка сервера
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Пример защищенного роута
app.get("/api/profile", isAuthenticated, async (req, res) => {
  // Если мы здесь, значит middleware isAuthenticated пропустил запрос (пользователь аутентифицирован)
  const userId = req.session.userId;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, id: true, role: true, createdAt: true }, // Добавляем role
    });

    if (!user) {
      // Это не должно произойти, если сессия валидна, но лучше проверить
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Настройка multer для загрузки файлов
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/**
 * @swagger
 * /api/admin/import-anki:
 *   post:
 *     summary: Импорт карточек из Anki файла
 *     description: Импортирует теоретические карточки из TSV файла экспорта Anki
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               ankiFile:
 *                 type: string
 *                 format: binary
 *                 description: Anki файл в формате TSV (.txt)
 *     responses:
 *       200:
 *         description: Импорт успешно завершен
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ImportSummary'
 *       400:
 *         description: Файл не предоставлен
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Не авторизован
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Ошибка импорта
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ImportSummary'
 */
// Endpoint для импорта Anki файла
app.post(
  "/api/admin/import-anki",
  isAuthenticated,
  upload.single("ankiFile"),
  async (req, res) => {
    console.log("Received request to import Anki cards.");

    try {
      if (!req.file) {
        return res.status(400).json({
          status: "Failed: No file provided",
          message: "Please upload an Anki export file (.txt)",
        });
      }

      const fileContent = req.file.buffer.toString("utf-8");
      const summary = await importAnkiCards(fileContent);

      if (summary.status.startsWith("Failed")) {
        console.error("Anki import failed:", summary);
        return res.status(500).json(summary);
      }

      console.log("Anki import successful:", summary);
      res.status(200).json(summary);
    } catch (error: any) {
      console.error("Critical error during Anki import:", error);
      res.status(500).json({
        status: "Failed: Critical error in endpoint",
        message: error.message,
        errors: [{ error: error.message }],
      });
    }
  }
);

/**
 * @swagger
 * /api/content/categories:
 *   get:
 *     summary: Получение иерархического списка категорий контента
 *     description: Возвращает список основных категорий и их подкатегорий
 *     tags: [Content]
 *     responses:
 *       200:
 *         description: Иерархический список категорий
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ContentCategory'
 *       500:
 *         description: Ошибка получения категорий
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// НОВЫЙ ЭНДПОИНТ для иерархического списка категорий
app.get("/api/content/categories", async (req, res) => {
  try {
    const files = await prisma.contentFile.findMany({
      select: {
        mainCategory: true,
        subCategory: true,
      },
      orderBy: [{ mainCategory: "asc" }, { subCategory: "asc" }],
    });

    const hierarchyMap = new Map<string, Set<string>>();

    for (const file of files) {
      if (!hierarchyMap.has(file.mainCategory)) {
        hierarchyMap.set(file.mainCategory, new Set<string>());
      }
      hierarchyMap.get(file.mainCategory)!.add(file.subCategory);
    }

    const result = Array.from(hierarchyMap.entries()).map(
      ([mainCat, subCatSet]) => ({
        name: mainCat,
        subCategories: Array.from(subCatSet).sort(), // Подкатегории уже отсортированы из-за orderBy в запросе и Set, но для уверенности
      })
    );

    // Основные категории уже отсортированы из-за orderBy в запросе и порядка обработки Map
    res.json(result);
  } catch (error) {
    console.error("Error fetching hierarchical categories:", error);
    res.status(500).json({ error: "Failed to fetch hierarchical categories" });
  }
});

// Создаем обычный Express сервер
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// Обработка завершения работы
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  await redisClient.quit();
  process.exit(0);
});
