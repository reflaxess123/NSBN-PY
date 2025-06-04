import { PrismaClient } from "@prisma/client";
import express from "express";
import { attachUserRole } from "../middleware/roleMiddleware";

const prisma = new PrismaClient();
const router = express.Router();

/**
 * @swagger
 * /api/content/blocks:
 *   get:
 *     summary: Получение списка блоков контента
 *     description: Возвращает список блоков контента с пагинацией, фильтрацией и поиском. Для авторизованных пользователей включает прогресс.
 *     tags: [Content]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Номер страницы
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Количество элементов на странице
 *       - in: query
 *         name: webdavPath
 *         schema:
 *           type: string
 *         description: Часть пути к файлу WebDAV для поиска
 *         example: "SBORNICK/JS/Array"
 *       - in: query
 *         name: mainCategory
 *         schema:
 *           type: string
 *         description: Основная категория контента
 *         example: "JS"
 *       - in: query
 *         name: subCategory
 *         schema:
 *           type: string
 *         description: Подкатегория контента
 *         example: "Array"
 *       - in: query
 *         name: filePathId
 *         schema:
 *           type: string
 *         description: ID файла для фильтрации блоков
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Строка для полнотекстового поиска
 *         example: "useEffect hook"
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [orderInFile, blockLevel, createdAt, updatedAt, file.webdavPath]
 *           default: orderInFile
 *         description: Поле для сортировки
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Направление сортировки
 *     responses:
 *       200:
 *         description: Список блоков контента
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContentBlocksList'
 *       400:
 *         description: Неверные параметры запроса
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
// GET /api/content/blocks - Получение списка блоков контента с пагинацией и фильтрацией
router.get("/blocks", attachUserRole, async (req, res) => {
  const userId = req.session.userId; // Получаем ID текущего пользователя (может быть undefined)
  const isAuthenticated = req.userRole !== "GUEST";

  const {
    page = "1",
    limit = "10",
    webdavPath,
    mainCategory,
    subCategory,
    filePathId, // Фильтр по ID конкретного файла ContentFile
    sortBy = "orderInFile", // По умолчанию сортируем по порядку в файле
    sortOrder = "asc", // По умолчанию по возрастанию
    q, // Новый параметр для полнотекстового поиска
  } = req.query;

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  if (isNaN(pageNum) || pageNum < 1) {
    return res
      .status(400)
      .json({ message: "Page number must be a positive integer." });
  }
  if (isNaN(limitNum) || limitNum < 1) {
    return res
      .status(400)
      .json({ message: "Limit must be a positive integer." });
  }

  const offset = (pageNum - 1) * limitNum;

  // Объект для фильтрации Prisma
  const where: any = {};
  const fileFilter: any = {};

  if (webdavPath) {
    fileFilter.webdavPath = {
      contains: webdavPath as string,
      mode: "insensitive",
    };
  }
  if (mainCategory) {
    fileFilter.mainCategory = {
      equals: mainCategory as string,
      mode: "insensitive",
    };
  }
  if (subCategory) {
    fileFilter.subCategory = {
      equals: subCategory as string,
      mode: "insensitive",
    };
  }
  if (filePathId) {
    fileFilter.id = filePathId as string;
  }

  // Если есть хотя бы один фильтр по ContentFile, добавляем его в 'where'
  if (Object.keys(fileFilter).length > 0) {
    where.file = fileFilter;
  }

  // Добавляем условия для полнотекстового поиска, если параметр q предоставлен
  if (q && typeof q === "string" && q.trim() !== "") {
    const searchQuery = q.trim();
    where.OR = [
      {
        blockTitle: {
          contains: searchQuery,
          mode: "insensitive",
        },
      },
      {
        textContent: {
          contains: searchQuery,
          mode: "insensitive",
        },
      },
      {
        codeFoldTitle: {
          contains: searchQuery,
          mode: "insensitive",
        },
      },
      // Можно добавить поиск по codeContent, если это необходимо
      // {
      //   codeContent: {
      //     contains: searchQuery,
      //     mode: 'insensitive',
      //   },
      // },
    ];
  }

  // Сортировка
  const orderBy: any = {};
  if (
    sortBy === "createdAt" ||
    sortBy === "updatedAt" ||
    sortBy === "orderInFile" ||
    sortBy === "blockLevel"
  ) {
    orderBy[sortBy as string] = sortOrder === "desc" ? "desc" : "asc";
  } else if (sortBy === "file.webdavPath") {
    orderBy.file = { webdavPath: sortOrder === "desc" ? "desc" : "asc" };
  } else {
    orderBy.orderInFile = "asc"; // Значение по умолчанию
  }

  try {
    // Основная структура включения для запроса
    const include: any = {
      file: {
        select: {
          id: true,
          webdavPath: true,
          mainCategory: true,
          subCategory: true,
        },
      },
    };

    // Добавляем прогресс только для авторизованных пользователей
    if (isAuthenticated && userId) {
      include.progressEntries = {
        where: { userId: userId },
        select: {
          id: true,
          solvedCount: true,
          createdAt: true,
          updatedAt: true,
        },
      };
    }

    const [blocks, totalCount] = await Promise.all([
      prisma.contentBlock.findMany({
        where,
        include,
        orderBy,
        skip: offset,
        take: limitNum,
      }),
      prisma.contentBlock.count({ where }),
    ]);

    const result = blocks.map((block) => {
      const baseBlock = {
        id: block.id,
        fileId: block.fileId,
        file: block.file,
        pathTitles: block.pathTitles,
        blockTitle: block.blockTitle,
        blockLevel: block.blockLevel,
        orderInFile: block.orderInFile,
        textContent: block.textContent,
        codeContent: block.codeContent,
        codeLanguage: block.codeLanguage,
        isCodeFoldable: block.isCodeFoldable,
        codeFoldTitle: block.codeFoldTitle,
        extractedUrls: block.extractedUrls,
        rawBlockContentHash: block.rawBlockContentHash,
        createdAt: block.createdAt,
        updatedAt: block.updatedAt,
      };

      // Добавляем прогресс только для авторизованных
      if (isAuthenticated && "progressEntries" in block) {
        return {
          ...baseBlock,
          progressEntries: block.progressEntries,
        };
      }

      return baseBlock;
    });

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      blocks: result,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching content blocks:", error);
    res.status(500).json({ error: "Failed to fetch content blocks" });
  }
});

/**
 * @swagger
 * /api/content/blocks/{id}:
 *   get:
 *     summary: Получение конкретного блока контента
 *     description: Возвращает детальную информацию о блоке контента по его ID. Для авторизованных пользователей включает прогресс.
 *     tags: [Content]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID блока контента
 *     responses:
 *       200:
 *         description: Блок контента найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContentBlock'
 *       404:
 *         description: Блок контента не найден
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
// GET /api/content/blocks/:id - Получение конкретного блока контента по ID
router.get("/blocks/:id", attachUserRole, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId; // Получаем ID текущего пользователя (может быть undefined)
  const isAuthenticated = req.userRole !== "GUEST";

  try {
    // Основная структура включения для запроса
    const include: any = {
      file: {
        select: {
          id: true,
          webdavPath: true,
          mainCategory: true,
          subCategory: true,
        },
      },
    };

    // Добавляем прогресс только для авторизованных пользователей
    if (isAuthenticated && userId) {
      include.progressEntries = {
        where: { userId: userId },
        select: {
          id: true,
          solvedCount: true,
          createdAt: true,
          updatedAt: true,
        },
      };
    }

    const blockData = await prisma.contentBlock.findUnique({
      where: { id },
      include,
    });

    if (!blockData) {
      return res.status(404).json({ message: "Content block not found" });
    }

    const baseBlock = {
      id: blockData.id,
      fileId: blockData.fileId,
      file: blockData.file,
      pathTitles: blockData.pathTitles,
      blockTitle: blockData.blockTitle,
      blockLevel: blockData.blockLevel,
      orderInFile: blockData.orderInFile,
      textContent: blockData.textContent,
      codeContent: blockData.codeContent,
      codeLanguage: blockData.codeLanguage,
      isCodeFoldable: blockData.isCodeFoldable,
      codeFoldTitle: blockData.codeFoldTitle,
      extractedUrls: blockData.extractedUrls,
      rawBlockContentHash: blockData.rawBlockContentHash,
      createdAt: blockData.createdAt,
      updatedAt: blockData.updatedAt,
    };

    // Добавляем прогресс только для авторизованных
    if (isAuthenticated && "progressEntries" in blockData) {
      res.status(200).json({
        ...baseBlock,
        progressEntries: blockData.progressEntries,
      });
    } else {
      res.status(200).json(baseBlock);
    }
  } catch (error) {
    console.error(`Error fetching content block ${id}:`, error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/content/blocks/{blockId}/progress:
 *   patch:
 *     summary: Обновление прогресса пользователя по блоку
 *     description: Увеличивает или уменьшает счетчик решений для блока контента
 *     tags: [Content]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: blockId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID блока контента
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContentProgressUpdate'
 *           examples:
 *             increment:
 *               summary: Увеличить счетчик
 *               value:
 *                 action: "increment"
 *             decrement:
 *               summary: Уменьшить счетчик
 *               value:
 *                 action: "decrement"
 *     responses:
 *       200:
 *         description: Прогресс успешно обновлен
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContentProgress'
 *       400:
 *         description: Некорректный запрос
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Пользователь не аутентифицирован
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Блок контента не найден
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
// PATCH /api/content/blocks/:blockId/progress - Обновление прогресса пользователя по блоку
router.patch("/blocks/:blockId/progress", attachUserRole, async (req, res) => {
  const userId = req.session.userId;
  const { blockId } = req.params;
  const { action } = req.body; // "increment" или "decrement"

  // Проверяем авторизацию для операций с прогрессом
  if (req.userRole === "GUEST" || !userId) {
    return res.status(401).json({
      message: "Требуется авторизация для сохранения прогресса",
    });
  }

  if (!action || (action !== "increment" && action !== "decrement")) {
    return res.status(400).json({
      message: "Invalid action. Must be 'increment' or 'decrement'",
    });
  }

  try {
    // Проверяем, существует ли блок
    const block = await prisma.contentBlock.findUnique({
      where: { id: blockId },
    });

    if (!block) {
      return res.status(404).json({ message: "Content block not found" });
    }

    // Ищем существующую запись прогресса или создаем новую
    const existingProgress = await prisma.userContentProgress.findUnique({
      where: {
        userId_blockId: { userId, blockId },
      },
    });

    let newSolvedCount = 0;
    if (existingProgress) {
      if (action === "increment") {
        newSolvedCount = existingProgress.solvedCount + 1;
      } else if (action === "decrement") {
        newSolvedCount = Math.max(0, existingProgress.solvedCount - 1);
      }
    } else {
      newSolvedCount = action === "increment" ? 1 : 0;
    }

    // Используем upsert для создания или обновления записи
    const updatedProgress = await prisma.userContentProgress.upsert({
      where: {
        userId_blockId: { userId, blockId },
      },
      update: {
        solvedCount: newSolvedCount,
      },
      create: {
        userId,
        blockId,
        solvedCount: newSolvedCount,
      },
    });

    res.status(200).json({
      userId: updatedProgress.userId,
      blockId: updatedProgress.blockId,
      solvedCount: updatedProgress.solvedCount,
      updatedAt: updatedProgress.updatedAt,
    });
  } catch (error) {
    console.error(`Error updating progress for block ${blockId}:`, error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
