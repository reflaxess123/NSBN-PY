import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import express from "express";
import { requireAdmin } from "../middleware/roleMiddleware";

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Получить общую статистику системы
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Статистика системы
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     admins:
 *                       type: integer
 *                     regularUsers:
 *                       type: integer
 *                     guests:
 *                       type: integer
 *                 content:
 *                   type: object
 *                   properties:
 *                     totalFiles:
 *                       type: integer
 *                     totalBlocks:
 *                       type: integer
 *                     totalTheoryCards:
 *                       type: integer
 *                 progress:
 *                   type: object
 *                   properties:
 *                     totalContentProgress:
 *                       type: integer
 *                     totalTheoryProgress:
 *                       type: integer
 */
router.get("/stats", requireAdmin, async (req, res) => {
  try {
    // Статистика пользователей
    const usersStats = await prisma.user.groupBy({
      by: ["role"],
      _count: {
        role: true,
      },
    });

    const totalUsers = await prisma.user.count();

    const usersByRole = usersStats.reduce(
      (acc, stat) => {
        acc[stat.role.toLowerCase()] = stat._count.role;
        return acc;
      },
      { admin: 0, user: 0, guest: 0 } as Record<string, number>
    );

    // Статистика контента
    const [totalFiles, totalBlocks, totalTheoryCards] = await Promise.all([
      prisma.contentFile.count(),
      prisma.contentBlock.count(),
      prisma.theoryCard.count(),
    ]);

    // Статистика прогресса
    const [totalContentProgress, totalTheoryProgress] = await Promise.all([
      prisma.userContentProgress.count(),
      prisma.userTheoryProgress.count(),
    ]);

    res.json({
      users: {
        total: totalUsers,
        admins: usersByRole.admin,
        regularUsers: usersByRole.user,
        guests: usersByRole.guest,
      },
      content: {
        totalFiles,
        totalBlocks,
        totalTheoryCards,
      },
      progress: {
        totalContentProgress,
        totalTheoryProgress,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Получить список всех пользователей
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [GUEST, USER, ADMIN]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Список пользователей с пагинацией
 */
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const role = req.query.role as string;
    const search = req.query.search as string;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (role) {
      where.role = role;
    }

    if (search) {
      where.email = {
        contains: search,
        mode: "insensitive",
      };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              progress: true,
              theoryProgress: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Admin users list error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     summary: Создать нового пользователя
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               role:
 *                 type: string
 *                 enum: [GUEST, USER, ADMIN]
 *                 default: USER
 */
router.post("/users", requireAdmin, async (req, res) => {
  try {
    const { email, password, role = "USER" } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email и пароль обязательны",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Пароль должен содержать минимум 6 символов",
      });
    }

    // Проверяем, не существует ли уже пользователь с таким email
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Пользователь с таким email уже существует",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    res.status(201).json(user);
  } catch (error) {
    console.error("Admin create user error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/users/{userId}:
 *   put:
 *     summary: Обновить пользователя
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [GUEST, USER, ADMIN]
 *               password:
 *                 type: string
 *                 minLength: 6
 */
router.put("/users/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { email, role, password } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ message: "Неверный ID пользователя" });
    }

    const updateData: any = {};

    if (email) {
      // Проверяем, не занят ли email
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser && existingUser.id !== userId) {
        return res.status(409).json({
          message: "Email уже используется другим пользователем",
        });
      }

      updateData.email = email;
    }

    if (role) {
      updateData.role = role;
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          message: "Пароль должен содержать минимум 6 символов",
        });
      }
      updateData.password = await bcrypt.hash(password, 12);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        role: true,
        updatedAt: true,
      },
    });

    res.json(user);
  } catch (error: any) {
    console.error("Admin update user error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Пользователь не найден" });
    }
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/users/{userId}:
 *   delete:
 *     summary: Удалить пользователя
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 */
router.delete("/users/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const currentUserId = req.session.userId;

    if (isNaN(userId)) {
      return res.status(400).json({ message: "Неверный ID пользователя" });
    }

    // Запрещаем удалять самого себя
    if (userId === currentUserId) {
      return res.status(400).json({
        message: "Нельзя удалить самого себя",
      });
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    res.json({ message: "Пользователь успешно удален" });
  } catch (error: any) {
    console.error("Admin delete user error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Пользователь не найден" });
    }
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/content/stats:
 *   get:
 *     summary: Получить детальную статистику по контенту
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 */
router.get("/content/stats", requireAdmin, async (req, res) => {
  try {
    // Статистика по категориям контента
    const contentByCategory = await prisma.contentFile.groupBy({
      by: ["mainCategory"],
      _count: {
        mainCategory: true,
      },
    });

    // Статистика по теории
    const theoryByCategory = await prisma.theoryCard.groupBy({
      by: ["category"],
      _count: {
        category: true,
      },
    });

    // Последние добавленные файлы
    const recentFiles = await prisma.contentFile.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        webdavPath: true,
        mainCategory: true,
        subCategory: true,
        createdAt: true,
        _count: {
          select: {
            blocks: true,
          },
        },
      },
    });

    // Прогресс пользователей
    const progressStats = (await prisma.$queryRaw`
      SELECT 
        AVG(solved_count) as avg_content_progress,
        COUNT(DISTINCT user_id) as active_users_content
      FROM "UserContentProgress"
    `) as any[];

    const theoryProgressStats = (await prisma.$queryRaw`
      SELECT 
        AVG(solved_count) as avg_theory_progress,
        COUNT(DISTINCT user_id) as active_users_theory
      FROM "UserTheoryProgress"
    `) as any[];

    res.json({
      contentByCategory,
      theoryByCategory,
      recentFiles,
      progress: {
        content: progressStats[0],
        theory: theoryProgressStats[0],
      },
    });
  } catch (error) {
    console.error("Admin content stats error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/content/files:
 *   get:
 *     summary: Получить список файлов контента
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: mainCategory
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 */
router.get("/content/files", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const mainCategory = req.query.mainCategory as string;
    const search = req.query.search as string;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (mainCategory) {
      where.mainCategory = mainCategory;
    }

    if (search) {
      where.OR = [
        {
          webdavPath: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          subCategory: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    const [files, total] = await Promise.all([
      prisma.contentFile.findMany({
        where,
        include: {
          _count: {
            select: {
              blocks: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.contentFile.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      files,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Admin get content files error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/content/blocks:
 *   get:
 *     summary: Получить список блоков контента
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: fileId
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 */
router.get("/content/blocks", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const fileId = req.query.fileId as string;
    const search = req.query.search as string;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (fileId) {
      where.fileId = fileId;
    }

    if (search) {
      where.OR = [
        {
          blockTitle: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          textContent: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    const [blocks, total] = await Promise.all([
      prisma.contentBlock.findMany({
        where,
        include: {
          file: {
            select: {
              id: true,
              webdavPath: true,
              mainCategory: true,
              subCategory: true,
            },
          },
          _count: {
            select: {
              progressEntries: true,
            },
          },
        },
        orderBy: [
          { file: { mainCategory: "asc" } },
          { file: { subCategory: "asc" } },
          { orderInFile: "asc" },
        ],
        skip,
        take: limit,
      }),
      prisma.contentBlock.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      blocks,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Admin get content blocks error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/theory/cards:
 *   get:
 *     summary: Получить список карточек теории
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: deck
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 */
router.get("/theory/cards", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const category = req.query.category as string;
    const deck = req.query.deck as string;
    const search = req.query.search as string;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (category) {
      where.category = category;
    }

    if (deck) {
      where.deck = {
        contains: deck,
        mode: "insensitive",
      };
    }

    if (search) {
      where.OR = [
        {
          questionBlock: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          answerBlock: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          category: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          subCategory: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    const [cards, total] = await Promise.all([
      prisma.theoryCard.findMany({
        where,
        include: {
          _count: {
            select: {
              progressEntries: true,
            },
          },
        },
        orderBy: [
          { category: "asc" },
          { subCategory: "asc" },
          { orderIndex: "asc" },
        ],
        skip,
        take: limit,
      }),
      prisma.theoryCard.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      cards,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Admin get theory cards error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/content/files/{fileId}:
 *   delete:
 *     summary: Удалить файл контента
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 */
router.delete("/content/files/:fileId", requireAdmin, async (req, res) => {
  try {
    const { fileId } = req.params;

    await prisma.contentFile.delete({
      where: { id: fileId },
    });

    res.json({ message: "Файл успешно удален" });
  } catch (error: any) {
    console.error("Admin delete content file error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Файл не найден" });
    }
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/content/files:
 *   post:
 *     summary: Создать новый файл контента
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - webdavPath
 *               - mainCategory
 *               - subCategory
 *             properties:
 *               webdavPath:
 *                 type: string
 *                 example: "/obsval/FrontEnd/SBORNICK/JS/NewTopic.md"
 *               mainCategory:
 *                 type: string
 *                 example: "JS"
 *               subCategory:
 *                 type: string
 *                 example: "NewTopic"
 *               lastFileHash:
 *                 type: string
 *                 nullable: true
 */
router.post("/content/files", requireAdmin, async (req, res) => {
  try {
    const { webdavPath, mainCategory, subCategory, lastFileHash } = req.body;

    if (!webdavPath || !mainCategory || !subCategory) {
      return res.status(400).json({
        message: "webdavPath, mainCategory и subCategory обязательны",
      });
    }

    // Проверяем, не существует ли уже файл с таким путем
    const existingFile = await prisma.contentFile.findUnique({
      where: { webdavPath },
    });

    if (existingFile) {
      return res.status(409).json({
        message: "Файл с таким webdavPath уже существует",
      });
    }

    const contentFile = await prisma.contentFile.create({
      data: {
        webdavPath,
        mainCategory,
        subCategory,
        lastFileHash,
      },
      include: {
        _count: {
          select: {
            blocks: true,
          },
        },
      },
    });

    res.status(201).json(contentFile);
  } catch (error) {
    console.error("Admin create content file error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/content/files/{fileId}:
 *   put:
 *     summary: Обновить файл контента
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               webdavPath:
 *                 type: string
 *               mainCategory:
 *                 type: string
 *               subCategory:
 *                 type: string
 *               lastFileHash:
 *                 type: string
 *                 nullable: true
 */
router.put("/content/files/:fileId", requireAdmin, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { webdavPath, mainCategory, subCategory, lastFileHash } = req.body;

    const updateData: any = {};

    if (webdavPath) {
      // Проверяем, не занят ли webdavPath другим файлом
      const existingFile = await prisma.contentFile.findUnique({
        where: { webdavPath },
      });

      if (existingFile && existingFile.id !== fileId) {
        return res.status(409).json({
          message: "webdavPath уже используется другим файлом",
        });
      }

      updateData.webdavPath = webdavPath;
    }

    if (mainCategory) updateData.mainCategory = mainCategory;
    if (subCategory) updateData.subCategory = subCategory;
    if (lastFileHash !== undefined) updateData.lastFileHash = lastFileHash;

    const contentFile = await prisma.contentFile.update({
      where: { id: fileId },
      data: updateData,
      include: {
        _count: {
          select: {
            blocks: true,
          },
        },
      },
    });

    res.json(contentFile);
  } catch (error: any) {
    console.error("Admin update content file error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Файл не найден" });
    }
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/content/blocks:
 *   post:
 *     summary: Создать новый блок контента
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fileId
 *               - blockTitle
 *               - blockLevel
 *               - orderInFile
 *             properties:
 *               fileId:
 *                 type: string
 *               pathTitles:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Level 1", "Level 2", "Block Title"]
 *               blockTitle:
 *                 type: string
 *               blockLevel:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 6
 *               orderInFile:
 *                 type: integer
 *               textContent:
 *                 type: string
 *                 nullable: true
 *               codeContent:
 *                 type: string
 *                 nullable: true
 *               codeLanguage:
 *                 type: string
 *                 nullable: true
 *               isCodeFoldable:
 *                 type: boolean
 *                 default: false
 *               codeFoldTitle:
 *                 type: string
 *                 nullable: true
 *               extractedUrls:
 *                 type: array
 *                 items:
 *                   type: string
 *               rawBlockContentHash:
 *                 type: string
 *                 nullable: true
 */
router.post("/content/blocks", requireAdmin, async (req, res) => {
  try {
    const {
      fileId,
      pathTitles = [],
      blockTitle,
      blockLevel,
      orderInFile,
      textContent,
      codeContent,
      codeLanguage,
      isCodeFoldable = false,
      codeFoldTitle,
      extractedUrls = [],
      rawBlockContentHash,
    } = req.body;

    if (!fileId || !blockTitle || !blockLevel || orderInFile === undefined) {
      return res.status(400).json({
        message: "fileId, blockTitle, blockLevel и orderInFile обязательны",
      });
    }

    // Проверяем, существует ли файл
    const file = await prisma.contentFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return res.status(404).json({ message: "Файл не найден" });
    }

    const contentBlock = await prisma.contentBlock.create({
      data: {
        fileId,
        pathTitles,
        blockTitle,
        blockLevel,
        orderInFile,
        textContent,
        codeContent,
        codeLanguage,
        isCodeFoldable,
        codeFoldTitle,
        extractedUrls,
        rawBlockContentHash,
      },
      include: {
        file: {
          select: {
            id: true,
            webdavPath: true,
            mainCategory: true,
            subCategory: true,
          },
        },
      },
    });

    res.status(201).json(contentBlock);
  } catch (error) {
    console.error("Admin create content block error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/content/blocks/{blockId}:
 *   put:
 *     summary: Обновить блок контента
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: blockId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pathTitles:
 *                 type: array
 *                 items:
 *                   type: string
 *               blockTitle:
 *                 type: string
 *               blockLevel:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 6
 *               orderInFile:
 *                 type: integer
 *               textContent:
 *                 type: string
 *                 nullable: true
 *               codeContent:
 *                 type: string
 *                 nullable: true
 *               codeLanguage:
 *                 type: string
 *                 nullable: true
 *               isCodeFoldable:
 *                 type: boolean
 *               codeFoldTitle:
 *                 type: string
 *                 nullable: true
 *               extractedUrls:
 *                 type: array
 *                 items:
 *                   type: string
 *               rawBlockContentHash:
 *                 type: string
 *                 nullable: true
 */
router.put("/content/blocks/:blockId", requireAdmin, async (req, res) => {
  try {
    const { blockId } = req.params;
    const {
      pathTitles,
      blockTitle,
      blockLevel,
      orderInFile,
      textContent,
      codeContent,
      codeLanguage,
      isCodeFoldable,
      codeFoldTitle,
      extractedUrls,
      rawBlockContentHash,
    } = req.body;

    const updateData: any = {};

    if (pathTitles !== undefined) updateData.pathTitles = pathTitles;
    if (blockTitle) updateData.blockTitle = blockTitle;
    if (blockLevel) updateData.blockLevel = blockLevel;
    if (orderInFile !== undefined) updateData.orderInFile = orderInFile;
    if (textContent !== undefined) updateData.textContent = textContent;
    if (codeContent !== undefined) updateData.codeContent = codeContent;
    if (codeLanguage !== undefined) updateData.codeLanguage = codeLanguage;
    if (isCodeFoldable !== undefined)
      updateData.isCodeFoldable = isCodeFoldable;
    if (codeFoldTitle !== undefined) updateData.codeFoldTitle = codeFoldTitle;
    if (extractedUrls !== undefined) updateData.extractedUrls = extractedUrls;
    if (rawBlockContentHash !== undefined)
      updateData.rawBlockContentHash = rawBlockContentHash;

    const contentBlock = await prisma.contentBlock.update({
      where: { id: blockId },
      data: updateData,
      include: {
        file: {
          select: {
            id: true,
            webdavPath: true,
            mainCategory: true,
            subCategory: true,
          },
        },
      },
    });

    res.json(contentBlock);
  } catch (error: any) {
    console.error("Admin update content block error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Блок не найден" });
    }
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/content/blocks/{blockId}:
 *   delete:
 *     summary: Удалить блок контента
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: blockId
 *         required: true
 *         schema:
 *           type: string
 */
router.delete("/content/blocks/:blockId", requireAdmin, async (req, res) => {
  try {
    const { blockId } = req.params;

    await prisma.contentBlock.delete({
      where: { id: blockId },
    });

    res.json({ message: "Блок успешно удален" });
  } catch (error: any) {
    console.error("Admin delete content block error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Блок не найден" });
    }
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/theory/cards:
 *   post:
 *     summary: Создать новую карточку теории
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ankiGuid
 *               - cardType
 *               - deck
 *               - category
 *               - questionBlock
 *               - answerBlock
 *             properties:
 *               ankiGuid:
 *                 type: string
 *                 example: "1234567890"
 *               cardType:
 *                 type: string
 *                 example: "Простая"
 *               deck:
 *                 type: string
 *                 example: "СБОРНИК::JS ТЕОРИЯ"
 *               category:
 *                 type: string
 *                 example: "JS ТЕОРИЯ"
 *               subCategory:
 *                 type: string
 *                 nullable: true
 *                 example: "Операторы"
 *               questionBlock:
 *                 type: string
 *               answerBlock:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 default: []
 *               orderIndex:
 *                 type: integer
 *                 default: 0
 */
router.post("/theory/cards", requireAdmin, async (req, res) => {
  try {
    const {
      ankiGuid,
      cardType,
      deck,
      category,
      subCategory,
      questionBlock,
      answerBlock,
      tags = [],
      orderIndex = 0,
    } = req.body;

    if (
      !ankiGuid ||
      !cardType ||
      !deck ||
      !category ||
      !questionBlock ||
      !answerBlock
    ) {
      return res.status(400).json({
        message:
          "ankiGuid, cardType, deck, category, questionBlock и answerBlock обязательны",
      });
    }

    // Проверяем, не существует ли уже карточка с таким ankiGuid
    const existingCard = await prisma.theoryCard.findUnique({
      where: { ankiGuid },
    });

    if (existingCard) {
      return res.status(409).json({
        message: "Карточка с таким ankiGuid уже существует",
      });
    }

    const theoryCard = await prisma.theoryCard.create({
      data: {
        ankiGuid,
        cardType,
        deck,
        category,
        subCategory,
        questionBlock,
        answerBlock,
        tags,
        orderIndex,
      },
    });

    res.status(201).json(theoryCard);
  } catch (error) {
    console.error("Admin create theory card error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/theory/cards/{cardId}:
 *   put:
 *     summary: Обновить карточку теории
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ankiGuid:
 *                 type: string
 *               cardType:
 *                 type: string
 *               deck:
 *                 type: string
 *               category:
 *                 type: string
 *               subCategory:
 *                 type: string
 *                 nullable: true
 *               questionBlock:
 *                 type: string
 *               answerBlock:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               orderIndex:
 *                 type: integer
 */
router.put("/theory/cards/:cardId", requireAdmin, async (req, res) => {
  try {
    const { cardId } = req.params;
    const {
      ankiGuid,
      cardType,
      deck,
      category,
      subCategory,
      questionBlock,
      answerBlock,
      tags,
      orderIndex,
    } = req.body;

    const updateData: any = {};

    if (ankiGuid) {
      // Проверяем, не занят ли ankiGuid другой карточкой
      const existingCard = await prisma.theoryCard.findUnique({
        where: { ankiGuid },
      });

      if (existingCard && existingCard.id !== cardId) {
        return res.status(409).json({
          message: "ankiGuid уже используется другой карточкой",
        });
      }

      updateData.ankiGuid = ankiGuid;
    }

    if (cardType) updateData.cardType = cardType;
    if (deck) updateData.deck = deck;
    if (category) updateData.category = category;
    if (subCategory !== undefined) updateData.subCategory = subCategory;
    if (questionBlock) updateData.questionBlock = questionBlock;
    if (answerBlock) updateData.answerBlock = answerBlock;
    if (tags !== undefined) updateData.tags = tags;
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;

    const theoryCard = await prisma.theoryCard.update({
      where: { id: cardId },
      data: updateData,
    });

    res.json(theoryCard);
  } catch (error: any) {
    console.error("Admin update theory card error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Карточка не найдена" });
    }
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/theory/cards/{cardId}:
 *   delete:
 *     summary: Удалить карточку теории
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: string
 */
router.delete("/theory/cards/:cardId", requireAdmin, async (req, res) => {
  try {
    const { cardId } = req.params;

    await prisma.theoryCard.delete({
      where: { id: cardId },
    });

    res.json({ message: "Карточка успешно удалена" });
  } catch (error: any) {
    console.error("Admin delete theory card error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Карточка не найдена" });
    }
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/content/bulk-delete:
 *   delete:
 *     summary: Массовое удаление контента
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fileIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Массив ID файлов для удаления
 *               blockIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Массив ID блоков для удаления
 */
router.delete("/content/bulk-delete", requireAdmin, async (req, res) => {
  try {
    const { fileIds = [], blockIds = [] } = req.body;

    const results: any = {
      deletedFiles: 0,
      deletedBlocks: 0,
      errors: [],
    };

    // Удаляем файлы (блоки удалятся каскадно)
    if (fileIds.length > 0) {
      try {
        const result = await prisma.contentFile.deleteMany({
          where: {
            id: {
              in: fileIds,
            },
          },
        });
        results.deletedFiles = result.count;
      } catch (error: any) {
        results.errors.push(`Ошибка удаления файлов: ${error.message}`);
      }
    }

    // Удаляем отдельные блоки
    if (blockIds.length > 0) {
      try {
        const result = await prisma.contentBlock.deleteMany({
          where: {
            id: {
              in: blockIds,
            },
          },
        });
        results.deletedBlocks = result.count;
      } catch (error: any) {
        results.errors.push(`Ошибка удаления блоков: ${error.message}`);
      }
    }

    res.json({
      message: "Массовое удаление завершено",
      ...results,
    });
  } catch (error) {
    console.error("Admin bulk delete error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/theory/bulk-delete:
 *   delete:
 *     summary: Массовое удаление карточек теории
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cardIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Массив ID карточек для удаления
 */
router.delete("/theory/bulk-delete", requireAdmin, async (req, res) => {
  try {
    const { cardIds = [] } = req.body;

    if (cardIds.length === 0) {
      return res.status(400).json({
        message: "Не указаны карточки для удаления",
      });
    }

    const result = await prisma.theoryCard.deleteMany({
      where: {
        id: {
          in: cardIds,
        },
      },
    });

    res.json({
      message: "Массовое удаление карточек завершено",
      deletedCards: result.count,
    });
  } catch (error) {
    console.error("Admin bulk delete theory cards error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/content/bulk-update:
 *   patch:
 *     summary: Массовое обновление контента
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fileIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               updateData:
 *                 type: object
 *                 properties:
 *                   mainCategory:
 *                     type: string
 *                   subCategory:
 *                     type: string
 */
router.patch("/content/bulk-update", requireAdmin, async (req, res) => {
  try {
    const { fileIds = [], updateData = {} } = req.body;

    if (fileIds.length === 0) {
      return res.status(400).json({
        message: "Не указаны файлы для обновления",
      });
    }

    const validUpdateFields = ["mainCategory", "subCategory"];
    const filteredUpdateData: any = {};

    for (const [key, value] of Object.entries(updateData)) {
      if (validUpdateFields.includes(key) && value) {
        filteredUpdateData[key] = value;
      }
    }

    if (Object.keys(filteredUpdateData).length === 0) {
      return res.status(400).json({
        message: "Нет данных для обновления",
      });
    }

    const result = await prisma.contentFile.updateMany({
      where: {
        id: {
          in: fileIds,
        },
      },
      data: filteredUpdateData,
    });

    res.json({
      message: "Массовое обновление завершено",
      updatedFiles: result.count,
      updateData: filteredUpdateData,
    });
  } catch (error) {
    console.error("Admin bulk update error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

/**
 * @swagger
 * /api/admin/theory/bulk-update:
 *   patch:
 *     summary: Массовое обновление карточек теории
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cardIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               updateData:
 *                 type: object
 *                 properties:
 *                   category:
 *                     type: string
 *                   subCategory:
 *                     type: string
 *                   tags:
 *                     type: array
 *                     items:
 *                       type: string
 */
router.patch("/theory/bulk-update", requireAdmin, async (req, res) => {
  try {
    const { cardIds = [], updateData = {} } = req.body;

    if (cardIds.length === 0) {
      return res.status(400).json({
        message: "Не указаны карточки для обновления",
      });
    }

    const validUpdateFields = ["category", "subCategory", "tags"];
    const filteredUpdateData: any = {};

    for (const [key, value] of Object.entries(updateData)) {
      if (validUpdateFields.includes(key) && value !== undefined) {
        filteredUpdateData[key] = value;
      }
    }

    if (Object.keys(filteredUpdateData).length === 0) {
      return res.status(400).json({
        message: "Нет данных для обновления",
      });
    }

    const result = await prisma.theoryCard.updateMany({
      where: {
        id: {
          in: cardIds,
        },
      },
      data: filteredUpdateData,
    });

    res.json({
      message: "Массовое обновление карточек завершено",
      updatedCards: result.count,
      updateData: filteredUpdateData,
    });
  } catch (error) {
    console.error("Admin bulk update theory cards error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
});

export default router;
