import { PrismaClient } from "@prisma/client";
import express from "express";
import { attachUserRole } from "../middleware/roleMiddleware";
import { SpacedRepetitionService } from "../services/spacedRepetition";

const prisma = new PrismaClient();
const router = express.Router();
const spacedRepetitionService = new SpacedRepetitionService();

/**
 * @swagger
 * /api/theory/cards:
 *   get:
 *     summary: Получение списка теоретических карточек
 *     tags: [Theory Cards]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Номер страницы
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Количество карточек на странице
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Фильтр по категории
 *       - in: query
 *         name: subCategory
 *         schema:
 *           type: string
 *         description: Фильтр по подкатегории
 *       - in: query
 *         name: deck
 *         schema:
 *           type: string
 *         description: Поиск по названию колоды
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [orderIndex, createdAt, updatedAt]
 *           default: orderIndex
 *         description: Поле для сортировки
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Порядок сортировки
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Полнотекстовый поиск по вопросу и ответу
 *       - in: query
 *         name: onlyUnstudied
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Показывать только неизученные карточки (только для авторизованных)
 *     responses:
 *       200:
 *         description: Список карточек с пагинацией
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TheoryCardsList'
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
// GET /api/theory/cards - Получение списка карточек теории с пагинацией и фильтрацией
router.get("/cards", attachUserRole, async (req, res) => {
  const userId = req.session.userId;
  const isAuthenticated = req.userRole !== "GUEST";

  const {
    page = "1",
    limit = "10",
    category,
    subCategory,
    deck,
    sortBy = "orderIndex",
    sortOrder = "asc",
    q, // Полнотекстовый поиск
    onlyUnstudied, // Только неизученные карточки
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

  // Объект для фильтрации
  const where: any = {};

  if (category) {
    where.category = {
      equals: category as string,
      mode: "insensitive",
    };
  }
  if (subCategory) {
    where.subCategory = {
      equals: subCategory as string,
      mode: "insensitive",
    };
  }
  if (deck) {
    where.deck = {
      contains: deck as string,
      mode: "insensitive",
    };
  }

  // Полнотекстовый поиск
  if (q && typeof q === "string" && q.trim() !== "") {
    const searchQuery = q.trim();
    where.OR = [
      {
        questionBlock: {
          contains: searchQuery,
          mode: "insensitive",
        },
      },
      {
        answerBlock: {
          contains: searchQuery,
          mode: "insensitive",
        },
      },
      {
        category: {
          contains: searchQuery,
          mode: "insensitive",
        },
      },
      {
        subCategory: {
          contains: searchQuery,
          mode: "insensitive",
        },
      },
    ];
  }

  // Фильтрация только неизученных карточек (только для авторизованных)
  if (onlyUnstudied === "true" && isAuthenticated && userId) {
    where.progressEntries = {
      none: {
        userId: userId,
        solvedCount: { gt: 0 },
      },
    };
  }

  // Сортировка
  const orderBy: any = {};
  if (
    sortBy === "createdAt" ||
    sortBy === "updatedAt" ||
    sortBy === "orderIndex"
  ) {
    orderBy[sortBy as string] = sortOrder === "desc" ? "desc" : "asc";
  } else {
    orderBy.orderIndex = "asc"; // По умолчанию
  }

  try {
    // Основная структура включения для запроса
    const include: any = {};

    // Добавляем прогресс только для авторизованных пользователей
    if (isAuthenticated && userId) {
      include.progressEntries = {
        where: { userId: userId },
        select: {
          id: true,
          solvedCount: true,
          easeFactor: true,
          interval: true,
          dueDate: true,
          reviewCount: true,
          lapseCount: true,
          cardState: true,
          learningStep: true,
          lastReviewDate: true,
          createdAt: true,
          updatedAt: true,
        },
      };
    }

    const [cards, totalCount] = await Promise.all([
      prisma.theoryCard.findMany({
        where,
        include,
        orderBy,
        skip: offset,
        take: limitNum,
      }),
      prisma.theoryCard.count({ where }),
    ]);

    const result = cards.map((card) => {
      const baseCard = {
        id: card.id,
        ankiGuid: card.ankiGuid,
        cardType: card.cardType,
        deck: card.deck,
        category: card.category,
        subCategory: card.subCategory,
        questionBlock: card.questionBlock,
        answerBlock: card.answerBlock,
        tags: card.tags,
        orderIndex: card.orderIndex,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
      };

      // Добавляем прогресс только для авторизованных
      if (isAuthenticated && "progressEntries" in card) {
        return {
          ...baseCard,
          progressEntries: card.progressEntries,
        };
      }

      return baseCard;
    });

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      cards: result,
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
    console.error("Error fetching theory cards:", error);
    res.status(500).json({ error: "Failed to fetch theory cards" });
  }
});

/**
 * @swagger
 * /api/theory/cards/due:
 *   get:
 *     summary: Получение карточек к повторению
 *     description: Возвращает список карточек, которые нужно повторить, отсортированных по приоритету
 *     tags: [Theory Cards]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Максимальное количество карточек
 *       - in: query
 *         name: includeNew
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Включать новые карточки
 *       - in: query
 *         name: includeLearning
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Включать карточки в изучении
 *       - in: query
 *         name: includeReview
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Включать карточки в повторении
 *     responses:
 *       200:
 *         description: Список карточек к повторению
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/DueCard'
 *       401:
 *         description: Не авторизован
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
// GET /api/theory/cards/due - Получение карточек к повторению
router.get("/cards/due", attachUserRole, async (req, res) => {
  const userId = req.session.userId;
  const {
    limit = "20",
    includeNew = "true",
    includeLearning = "true",
    includeReview = "true",
  } = req.query;

  // Проверяем авторизацию для работы с прогрессом
  if (req.userRole === "GUEST" || !userId) {
    return res.status(401).json({
      message: "Требуется авторизация для получения карточек к повторению",
    });
  }

  const limitNum = parseInt(limit as string, 10);
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    return res.status(400).json({
      message: "Limit must be a number between 1 and 100",
    });
  }

  try {
    const dueCards = await spacedRepetitionService.getDueCards(
      userId,
      limitNum,
      includeNew === "true",
      includeLearning === "true",
      includeReview === "true"
    );

    res.status(200).json(dueCards);
  } catch (error: any) {
    console.error(`Error fetching due cards for user ${userId}:`, error);
    res.status(500).json({ message: "Failed to fetch due cards" });
  }
});

/**
 * @swagger
 * /api/theory/cards/{id}:
 *   get:
 *     summary: Получение конкретной теоретической карточки
 *     description: Возвращает детальную информацию о карточке теории по её ID. Для авторизованных пользователей включает прогресс.
 *     tags: [Theory Cards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID карточки
 *     responses:
 *       200:
 *         description: Данные карточки
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TheoryCard'
 *       404:
 *         description: Карточка не найдена
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
// GET /api/theory/cards/:id - Получение конкретной карточки по ID
router.get("/cards/:id", attachUserRole, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId;
  const isAuthenticated = req.userRole !== "GUEST";

  try {
    // Основная структура включения для запроса
    const include: any = {};

    // Добавляем прогресс только для авторизованных пользователей
    if (isAuthenticated && userId) {
      include.progressEntries = {
        where: { userId: userId },
        select: {
          id: true,
          solvedCount: true,
          easeFactor: true,
          interval: true,
          dueDate: true,
          reviewCount: true,
          lapseCount: true,
          cardState: true,
          learningStep: true,
          lastReviewDate: true,
          createdAt: true,
          updatedAt: true,
        },
      };
    }

    const cardData = await prisma.theoryCard.findUnique({
      where: { id },
      include,
    });

    if (!cardData) {
      return res.status(404).json({ message: "Theory card not found" });
    }

    const baseCard = {
      id: cardData.id,
      ankiGuid: cardData.ankiGuid,
      cardType: cardData.cardType,
      deck: cardData.deck,
      category: cardData.category,
      subCategory: cardData.subCategory,
      questionBlock: cardData.questionBlock,
      answerBlock: cardData.answerBlock,
      tags: cardData.tags,
      orderIndex: cardData.orderIndex,
      createdAt: cardData.createdAt,
      updatedAt: cardData.updatedAt,
    };

    // Добавляем прогресс только для авторизованных
    if (isAuthenticated && "progressEntries" in cardData) {
      res.status(200).json({
        ...baseCard,
        progressEntries: cardData.progressEntries,
      });
    } else {
      res.status(200).json(baseCard);
    }
  } catch (error) {
    console.error(`Error fetching theory card ${id}:`, error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/theory/cards/{cardId}/progress:
 *   patch:
 *     summary: Обновление прогресса пользователя по карточке
 *     description: Увеличивает или уменьшает счетчик решений для карточки теории
 *     tags: [Theory Cards]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID карточки
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TheoryProgressUpdate'
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
 *               $ref: '#/components/schemas/TheoryProgress'
 *       400:
 *         description: Некорректный запрос
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
 *       404:
 *         description: Карточка не найдена
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
// PATCH /api/theory/cards/:cardId/progress - Обновление прогресса пользователя по карточке
router.patch("/cards/:cardId/progress", attachUserRole, async (req, res) => {
  const userId = req.session.userId;
  const { cardId } = req.params;
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
    // Проверяем, существует ли карточка
    const card = await prisma.theoryCard.findUnique({
      where: { id: cardId },
    });

    if (!card) {
      return res.status(404).json({ message: "Theory card not found" });
    }

    let updatedProgress;

    if (action === "increment") {
      updatedProgress = await prisma.userTheoryProgress.upsert({
        where: { userId_cardId: { userId, cardId } },
        create: { userId, cardId, solvedCount: 1 },
        update: { solvedCount: { increment: 1 } },
        select: { userId: true, cardId: true, solvedCount: true },
      });
    } else {
      // action === "decrement"
      await prisma.userTheoryProgress.updateMany({
        where: {
          userId: userId,
          cardId: cardId,
          solvedCount: { gt: 0 },
        },
        data: {
          solvedCount: { decrement: 1 },
        },
      });

      updatedProgress = await prisma.userTheoryProgress.upsert({
        where: { userId_cardId: { userId, cardId } },
        create: { userId, cardId, solvedCount: 0 },
        update: {},
        select: { userId: true, cardId: true, solvedCount: true },
      });
    }

    res.status(200).json(updatedProgress);
  } catch (error: any) {
    console.error(
      `Error updating progress for card ${cardId} and user ${userId}:`,
      error
    );
    if (error && error.code === "P2025") {
      return res.status(404).json({
        message: "Theory card not found or user progress record inconsistency.",
      });
    }
    res.status(500).json({ message: "Failed to update theory progress" });
  }
});

/**
 * @swagger
 * /api/theory/categories:
 *   get:
 *     summary: Получение списка категорий и подкатегорий
 *     description: Возвращает список всех категорий и подкатегорий карточек теории
 *     tags: [Theory Cards]
 *     responses:
 *       200:
 *         description: Список категорий с подкатегориями
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TheoryCategory'
 *       500:
 *         description: Внутренняя ошибка сервера
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /api/theory/categories - Получение списка категорий и подкатегорий
router.get("/categories", attachUserRole, async (req, res) => {
  try {
    const categories = await prisma.theoryCard.groupBy({
      by: ["category", "subCategory"],
      _count: {
        id: true,
      },
      orderBy: [{ category: "asc" }, { subCategory: "asc" }],
    });

    // Группируем по основным категориям
    const groupedCategories = categories.reduce((acc: any, item) => {
      const { category, subCategory, _count } = item;

      if (!acc[category]) {
        acc[category] = {
          name: category,
          subCategories: [],
          totalCards: 0,
        };
      }

      if (subCategory) {
        acc[category].subCategories.push({
          name: subCategory,
          cardCount: _count.id,
        });
      }

      acc[category].totalCards += _count.id;

      return acc;
    }, {});

    const result = Object.values(groupedCategories).map((cat: any) => ({
      ...cat,
      subCategories: cat.subCategories.sort((a: any, b: any) =>
        a.name.localeCompare(b.name)
      ),
    }));

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching theory categories:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/theory/cards/{cardId}/review:
 *   post:
 *     summary: Повторение карточки с интервальным алгоритмом
 *     description: Обрабатывает повторение карточки по алгоритму интервального повторения Anki
 *     tags: [Theory Cards]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID карточки
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SpacedReviewRequest'
 *           examples:
 *             again:
 *               summary: Забыл ответ
 *               value:
 *                 rating: "again"
 *             hard:
 *               summary: Сложно вспомнил
 *               value:
 *                 rating: "hard"
 *             good:
 *               summary: Хорошо вспомнил
 *               value:
 *                 rating: "good"
 *             easy:
 *               summary: Легко вспомнил
 *               value:
 *                 rating: "easy"
 *     responses:
 *       200:
 *         description: Повторение успешно обработано
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SpacedReviewResponse'
 *       400:
 *         description: Неверные параметры запроса
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
 *       404:
 *         description: Карточка не найдена
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
// POST /api/theory/cards/:cardId/review - Повторение карточки с интервальным алгоритмом
router.post("/cards/:cardId/review", attachUserRole, async (req, res) => {
  const userId = req.session.userId;
  const { cardId } = req.params;
  const { rating } = req.body; // "again", "hard", "good", "easy"

  // Проверяем авторизацию для работы с прогрессом
  if (req.userRole === "GUEST" || !userId) {
    return res.status(401).json({
      message: "Требуется авторизация для повторения карточек",
    });
  }

  const validRatings = ["again", "hard", "good", "easy"];
  if (!rating || !validRatings.includes(rating)) {
    return res.status(400).json({
      message: "Invalid rating. Must be one of: again, hard, good, easy",
    });
  }

  try {
    const reviewResult = await spacedRepetitionService.reviewCard(
      userId,
      cardId,
      rating
    );

    res.status(200).json(reviewResult);
  } catch (error: any) {
    console.error(`Error reviewing card ${cardId} for user ${userId}:`, error);
    if (error.message.includes("not found")) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: "Failed to process card review" });
  }
});

/**
 * @swagger
 * /api/theory/cards/{cardId}/stats:
 *   get:
 *     summary: Получение статистики по карточке
 *     description: Возвращает детальную статистику по конкретной карточке
 *     tags: [Theory Cards]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID карточки
 *     responses:
 *       200:
 *         description: Статистика по карточке
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CardStats'
 *       401:
 *         description: Не авторизован
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Карточка не найдена или нет статистики
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
// GET /api/theory/cards/:cardId/stats - Получение статистики по карточке
router.get("/cards/:cardId/stats", attachUserRole, async (req, res) => {
  const userId = req.session.userId;
  const { cardId } = req.params;

  // Проверяем авторизацию для работы с прогрессом
  if (req.userRole === "GUEST" || !userId) {
    return res.status(401).json({
      message: "Требуется авторизация для просмотра статистики",
    });
  }

  try {
    // Проверяем, существует ли карточка
    const card = await prisma.theoryCard.findUnique({
      where: { id: cardId },
    });

    if (!card) {
      return res.status(404).json({ message: "Theory card not found" });
    }

    const progressEntry = await prisma.userTheoryProgress.findUnique({
      where: { userId_cardId: { userId, cardId } },
    });

    if (!progressEntry) {
      return res.status(200).json({
        cardId,
        userId,
        solvedCount: 0,
        easeFactor: 2.5,
        interval: 1,
        dueDate: null,
        reviewCount: 0,
        lapseCount: 0,
        cardState: "NEW",
        learningStep: 0,
        lastReviewDate: null,
      });
    }

    res.status(200).json({
      cardId: progressEntry.cardId,
      userId: progressEntry.userId,
      solvedCount: progressEntry.solvedCount,
      easeFactor: progressEntry.easeFactor,
      interval: progressEntry.interval,
      dueDate: progressEntry.dueDate,
      reviewCount: progressEntry.reviewCount,
      lapseCount: progressEntry.lapseCount,
      cardState: progressEntry.cardState,
      learningStep: progressEntry.learningStep,
      lastReviewDate: progressEntry.lastReviewDate,
    });
  } catch (error: any) {
    console.error(
      `Error fetching stats for card ${cardId} and user ${userId}:`,
      error
    );
    res.status(500).json({ message: "Failed to fetch card statistics" });
  }
});

/**
 * @swagger
 * /api/theory/cards/{cardId}/reset:
 *   post:
 *     summary: Сброс прогресса карточки
 *     description: Сбрасывает прогресс карточки к начальному состоянию
 *     tags: [Theory Cards]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID карточки
 *     responses:
 *       200:
 *         description: Прогресс карточки успешно сброшен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Card progress reset successfully"
 *       401:
 *         description: Не авторизован
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Карточка не найдена
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
// POST /api/theory/cards/:cardId/reset - Сброс прогресса карточки
router.post("/cards/:cardId/reset", attachUserRole, async (req, res) => {
  const userId = req.session.userId;
  const { cardId } = req.params;

  // Проверяем авторизацию для работы с прогрессом
  if (req.userRole === "GUEST" || !userId) {
    return res.status(401).json({
      message: "Требуется авторизация для сброса прогресса",
    });
  }

  try {
    // Проверяем, существует ли карточка
    const card = await prisma.theoryCard.findUnique({
      where: { id: cardId },
    });

    if (!card) {
      return res.status(404).json({ message: "Theory card not found" });
    }

    await spacedRepetitionService.resetCard(userId, cardId);

    res.status(200).json({ message: "Card progress reset successfully" });
  } catch (error: any) {
    console.error(`Error resetting card ${cardId} for user ${userId}:`, error);
    res.status(500).json({ message: "Failed to reset card progress" });
  }
});

/**
 * @swagger
 * /api/theory/cards/{cardId}/intervals:
 *   get:
 *     summary: Получение вариантов интервалов повторения
 *     description: Возвращает варианты интервалов для всех кнопок оценки
 *     tags: [Theory Cards]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID карточки
 *     responses:
 *       200:
 *         description: Варианты интервалов повторения
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NextReviewOptions'
 *       401:
 *         description: Не авторизован
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Карточка не найдена
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
// GET /api/theory/cards/:cardId/intervals - Получение вариантов интервалов повторения
router.get("/cards/:cardId/intervals", attachUserRole, async (req, res) => {
  const userId = req.session.userId;
  const { cardId } = req.params;

  // Проверяем авторизацию для работы с прогрессом
  if (req.userRole === "GUEST" || !userId) {
    return res.status(401).json({
      message: "Требуется авторизация для получения интервалов повторения",
    });
  }

  try {
    // Проверяем, существует ли карточка
    const card = await prisma.theoryCard.findUnique({
      where: { id: cardId },
    });

    if (!card) {
      return res.status(404).json({ message: "Theory card not found" });
    }

    const intervals = await spacedRepetitionService.getNextReviewOptions(
      userId,
      cardId
    );

    res.status(200).json(intervals);
  } catch (error: any) {
    console.error(
      `Error fetching intervals for card ${cardId} and user ${userId}:`,
      error
    );
    res.status(500).json({ message: "Failed to fetch review intervals" });
  }
});

/**
 * @swagger
 * /api/theory/stats:
 *   get:
 *     summary: Получение общей статистики по карточкам
 *     description: Возвращает количество карточек по состояниям
 *     tags: [Theory Cards]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Общая статистика по карточкам
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 new:
 *                   type: number
 *                   description: Количество новых карточек
 *                 learning:
 *                   type: number
 *                   description: Количество карточек в изучении
 *                 review:
 *                   type: number
 *                   description: Количество карточек в повторении
 *                 total:
 *                   type: number
 *                   description: Общее количество карточек
 *       401:
 *         description: Не авторизован
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
// GET /api/theory/stats - Получение общей статистики по карточкам
router.get("/stats", attachUserRole, async (req, res) => {
  const userId = req.session.userId;

  // Проверяем авторизацию для работы с прогрессом
  if (req.userRole === "GUEST" || !userId) {
    return res.status(401).json({
      message: "Требуется авторизация для просмотра статистики",
    });
  }

  try {
    const stats = await spacedRepetitionService.getCardCounts(userId);
    res.status(200).json(stats);
  } catch (error: any) {
    console.error(`Error fetching card stats for user ${userId}:`, error);
    res.status(500).json({ message: "Failed to fetch card statistics" });
  }
});

export default router;
