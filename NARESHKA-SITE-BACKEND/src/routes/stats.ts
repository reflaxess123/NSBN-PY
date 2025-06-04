import express from "express";
import { PrismaClient } from "@prisma/client";
import { isAuthenticated } from "../middleware/authMiddleware";

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * components:
 *   schemas:
 *     UserStats:
 *       type: object
 *       properties:
 *         userId:
 *           type: integer
 *         totalContentBlocks:
 *           type: integer
 *         solvedContentBlocks:
 *           type: integer
 *         totalTheoryCards:
 *           type: integer
 *         reviewedTheoryCards:
 *           type: integer
 *         contentProgress:
 *           type: object
 *           additionalProperties:
 *             $ref: '#/components/schemas/CategoryProgress'
 *         theoryProgress:
 *           type: object
 *           additionalProperties:
 *             $ref: '#/components/schemas/CategoryProgress'
 *         overallProgress:
 *           $ref: '#/components/schemas/OverallProgress'
 *
 *     CategoryProgress:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *         completed:
 *           type: integer
 *         percentage:
 *           type: number
 *         subCategories:
 *           type: object
 *           additionalProperties:
 *             type: object
 *             properties:
 *               total:
 *                 type: integer
 *               completed:
 *                 type: integer
 *               percentage:
 *                 type: number
 *
 *     OverallProgress:
 *       type: object
 *       properties:
 *         totalItems:
 *           type: integer
 *         completedItems:
 *           type: integer
 *         percentage:
 *           type: number
 *         contentPercentage:
 *           type: number
 *         theoryPercentage:
 *           type: number
 *
 *     DetailedContentStats:
 *       type: object
 *       properties:
 *         categories:
 *           type: object
 *           additionalProperties:
 *             $ref: '#/components/schemas/DetailedCategoryStats'
 *         totalBlocks:
 *           type: integer
 *         solvedBlocks:
 *           type: integer
 *         averageSolveCount:
 *           type: number
 *
 *     DetailedCategoryStats:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *         solved:
 *           type: integer
 *         percentage:
 *           type: number
 *         averageSolveCount:
 *           type: number
 *         subCategories:
 *           type: object
 *           additionalProperties:
 *             type: object
 *             properties:
 *               total:
 *                 type: integer
 *               solved:
 *                 type: integer
 *               percentage:
 *                 type: number
 *               averageSolveCount:
 *                 type: number
 *               blocks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     solveCount:
 *                       type: integer
 *                     isSolved:
 *                       type: boolean
 */

/**
 * @swagger
 * /api/stats/overview:
 *   get:
 *     summary: Получение общей статистики пользователя
 *     description: Возвращает общую статистику прогресса пользователя по контенту и теории
 *     tags: [Statistics]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Общая статистика пользователя
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserStats'
 *       401:
 *         description: Пользователь не аутентифицирован
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
router.get("/overview", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;

    // Получаем статистику по контенту
    const contentStats = await prisma.contentBlock.findMany({
      select: {
        id: true,
        file: {
          select: {
            mainCategory: true,
            subCategory: true,
          },
        },
        progressEntries: {
          where: { userId },
          select: { solvedCount: true },
        },
      },
    });

    // Получаем статистику по теории
    const theoryStats = await prisma.theoryCard.findMany({
      select: {
        id: true,
        category: true,
        subCategory: true,
        progressEntries: {
          where: { userId },
          select: { reviewCount: true, cardState: true },
        },
      },
    });

    // Обрабатываем статистику контента
    const contentProgress: Record<string, any> = {};
    let totalContentBlocks = 0;
    let solvedContentBlocks = 0;

    contentStats.forEach((block) => {
      const category = block.file.mainCategory;
      const subCategory = block.file.subCategory;
      const isSolved =
        block.progressEntries.length > 0 &&
        block.progressEntries[0].solvedCount > 0;

      totalContentBlocks++;
      if (isSolved) solvedContentBlocks++;

      if (!contentProgress[category]) {
        contentProgress[category] = {
          total: 0,
          completed: 0,
          percentage: 0,
          subCategories: {},
        };
      }

      if (!contentProgress[category].subCategories[subCategory]) {
        contentProgress[category].subCategories[subCategory] = {
          total: 0,
          completed: 0,
          percentage: 0,
        };
      }

      contentProgress[category].total++;
      contentProgress[category].subCategories[subCategory].total++;

      if (isSolved) {
        contentProgress[category].completed++;
        contentProgress[category].subCategories[subCategory].completed++;
      }
    });

    // Вычисляем проценты для контента
    Object.keys(contentProgress).forEach((category) => {
      const cat = contentProgress[category];
      cat.percentage =
        cat.total > 0 ? Math.round((cat.completed / cat.total) * 100) : 0;

      Object.keys(cat.subCategories).forEach((subCategory) => {
        const subCat = cat.subCategories[subCategory];
        subCat.percentage =
          subCat.total > 0
            ? Math.round((subCat.completed / subCat.total) * 100)
            : 0;
      });
    });

    // Обрабатываем статистику теории
    const theoryProgress: Record<string, any> = {};
    let totalTheoryCards = 0;
    let reviewedTheoryCards = 0;

    theoryStats.forEach((card) => {
      const category = card.category;
      const subCategory = card.subCategory || "Общее";
      const isReviewed =
        card.progressEntries.length > 0 &&
        card.progressEntries[0].reviewCount > 0;

      totalTheoryCards++;
      if (isReviewed) reviewedTheoryCards++;

      if (!theoryProgress[category]) {
        theoryProgress[category] = {
          total: 0,
          completed: 0,
          percentage: 0,
          subCategories: {},
        };
      }

      if (!theoryProgress[category].subCategories[subCategory]) {
        theoryProgress[category].subCategories[subCategory] = {
          total: 0,
          completed: 0,
          percentage: 0,
        };
      }

      theoryProgress[category].total++;
      theoryProgress[category].subCategories[subCategory].total++;

      if (isReviewed) {
        theoryProgress[category].completed++;
        theoryProgress[category].subCategories[subCategory].completed++;
      }
    });

    // Вычисляем проценты для теории
    Object.keys(theoryProgress).forEach((category) => {
      const cat = theoryProgress[category];
      cat.percentage =
        cat.total > 0 ? Math.round((cat.completed / cat.total) * 100) : 0;

      Object.keys(cat.subCategories).forEach((subCategory) => {
        const subCat = cat.subCategories[subCategory];
        subCat.percentage =
          subCat.total > 0
            ? Math.round((subCat.completed / subCat.total) * 100)
            : 0;
      });
    });

    // Общий прогресс
    const totalItems = totalContentBlocks + totalTheoryCards;
    const completedItems = solvedContentBlocks + reviewedTheoryCards;
    const overallProgress = {
      totalItems,
      completedItems,
      percentage:
        totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
      contentPercentage:
        totalContentBlocks > 0
          ? Math.round((solvedContentBlocks / totalContentBlocks) * 100)
          : 0,
      theoryPercentage:
        totalTheoryCards > 0
          ? Math.round((reviewedTheoryCards / totalTheoryCards) * 100)
          : 0,
    };

    res.json({
      userId,
      totalContentBlocks,
      solvedContentBlocks,
      totalTheoryCards,
      reviewedTheoryCards,
      contentProgress,
      theoryProgress,
      overallProgress,
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/stats/content:
 *   get:
 *     summary: Детальная статистика по контенту
 *     description: Возвращает подробную статистику прогресса пользователя по контент-блокам
 *     tags: [Statistics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Фильтр по основной категории
 *       - in: query
 *         name: includeBlocks
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Включить детальную информацию о блоках
 *     responses:
 *       200:
 *         description: Детальная статистика по контенту
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DetailedContentStats'
 */
router.get("/content", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { category, includeBlocks } = req.query;

    const whereClause: any = {};
    if (category) {
      whereClause.file = { mainCategory: category as string };
    }

    const contentBlocks = await prisma.contentBlock.findMany({
      where: whereClause,
      select: {
        id: true,
        blockTitle: true,
        file: {
          select: {
            mainCategory: true,
            subCategory: true,
          },
        },
        progressEntries: {
          where: { userId },
          select: { solvedCount: true },
        },
      },
      orderBy: [
        { file: { mainCategory: "asc" } },
        { file: { subCategory: "asc" } },
        { orderInFile: "asc" },
      ],
    });

    const categories: Record<string, any> = {};
    let totalBlocks = 0;
    let solvedBlocks = 0;
    let totalSolveCount = 0;

    contentBlocks.forEach((block) => {
      const mainCat = block.file.mainCategory;
      const subCat = block.file.subCategory;
      const solveCount =
        block.progressEntries.length > 0
          ? block.progressEntries[0].solvedCount
          : 0;
      const isSolved = solveCount > 0;

      totalBlocks++;
      totalSolveCount += solveCount;
      if (isSolved) solvedBlocks++;

      if (!categories[mainCat]) {
        categories[mainCat] = {
          total: 0,
          solved: 0,
          percentage: 0,
          averageSolveCount: 0,
          subCategories: {},
        };
      }

      if (!categories[mainCat].subCategories[subCat]) {
        categories[mainCat].subCategories[subCat] = {
          total: 0,
          solved: 0,
          percentage: 0,
          averageSolveCount: 0,
          blocks: [],
        };
      }

      categories[mainCat].total++;
      categories[mainCat].subCategories[subCat].total++;

      if (isSolved) {
        categories[mainCat].solved++;
        categories[mainCat].subCategories[subCat].solved++;
      }

      if (includeBlocks === "true") {
        categories[mainCat].subCategories[subCat].blocks.push({
          id: block.id,
          title: block.blockTitle,
          solveCount,
          isSolved,
        });
      }
    });

    // Вычисляем проценты и средние значения
    Object.keys(categories).forEach((mainCat) => {
      const cat = categories[mainCat];
      cat.percentage =
        cat.total > 0 ? Math.round((cat.solved / cat.total) * 100) : 0;

      let catTotalSolveCount = 0;
      Object.keys(cat.subCategories).forEach((subCat) => {
        const subCatData = cat.subCategories[subCat];
        subCatData.percentage =
          subCatData.total > 0
            ? Math.round((subCatData.solved / subCatData.total) * 100)
            : 0;

        const subCatSolveCount =
          subCatData.blocks?.reduce(
            (sum: number, block: any) => sum + block.solveCount,
            0
          ) || 0;
        subCatData.averageSolveCount =
          subCatData.total > 0
            ? Math.round((subCatSolveCount / subCatData.total) * 100) / 100
            : 0;
        catTotalSolveCount += subCatSolveCount;
      });

      cat.averageSolveCount =
        cat.total > 0
          ? Math.round((catTotalSolveCount / cat.total) * 100) / 100
          : 0;
    });

    res.json({
      categories,
      totalBlocks,
      solvedBlocks,
      averageSolveCount:
        totalBlocks > 0
          ? Math.round((totalSolveCount / totalBlocks) * 100) / 100
          : 0,
    });
  } catch (error) {
    console.error("Error fetching content stats:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/stats/theory:
 *   get:
 *     summary: Детальная статистика по теории
 *     description: Возвращает подробную статистику прогресса пользователя по теоретическим карточкам
 *     tags: [Statistics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Фильтр по категории
 *       - in: query
 *         name: includeCards
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Включить детальную информацию о карточках
 *     responses:
 *       200:
 *         description: Детальная статистика по теории
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       total:
 *                         type: integer
 *                       reviewed:
 *                         type: integer
 *                       percentage:
 *                         type: number
 *                       averageReviewCount:
 *                         type: number
 *                       cardStates:
 *                         type: object
 *                         properties:
 *                           NEW:
 *                             type: integer
 *                           LEARNING:
 *                             type: integer
 *                           REVIEW:
 *                             type: integer
 *                           RELEARNING:
 *                             type: integer
 *                       subCategories:
 *                         type: object
 *                 totalCards:
 *                   type: integer
 *                 reviewedCards:
 *                   type: integer
 *                 averageReviewCount:
 *                   type: number
 */
router.get("/theory", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { category, includeCards } = req.query;

    const whereClause: any = {};
    if (category) {
      whereClause.category = category as string;
    }

    const theoryCards = await prisma.theoryCard.findMany({
      where: whereClause,
      select: {
        id: true,
        category: true,
        subCategory: true,
        progressEntries: {
          where: { userId },
          select: {
            reviewCount: true,
            cardState: true,
            easeFactor: true,
            interval: true,
            dueDate: true,
          },
        },
      },
      orderBy: [
        { category: "asc" },
        { subCategory: "asc" },
        { orderIndex: "asc" },
      ],
    });

    const categories: Record<string, any> = {};
    let totalCards = 0;
    let reviewedCards = 0;
    let totalReviewCount = 0;

    theoryCards.forEach((card) => {
      const mainCat = card.category;
      const subCat = card.subCategory || "Общее";
      const progress = card.progressEntries[0];
      const reviewCount = progress?.reviewCount || 0;
      const cardState = progress?.cardState || "NEW";
      const isReviewed = reviewCount > 0;

      totalCards++;
      totalReviewCount += reviewCount;
      if (isReviewed) reviewedCards++;

      if (!categories[mainCat]) {
        categories[mainCat] = {
          total: 0,
          reviewed: 0,
          percentage: 0,
          averageReviewCount: 0,
          cardStates: {
            NEW: 0,
            LEARNING: 0,
            REVIEW: 0,
            RELEARNING: 0,
          },
          subCategories: {},
        };
      }

      if (!categories[mainCat].subCategories[subCat]) {
        categories[mainCat].subCategories[subCat] = {
          total: 0,
          reviewed: 0,
          percentage: 0,
          averageReviewCount: 0,
          cardStates: {
            NEW: 0,
            LEARNING: 0,
            REVIEW: 0,
            RELEARNING: 0,
          },
          cards: [],
        };
      }

      categories[mainCat].total++;
      categories[mainCat].subCategories[subCat].total++;
      categories[mainCat].cardStates[cardState]++;
      categories[mainCat].subCategories[subCat].cardStates[cardState]++;

      if (isReviewed) {
        categories[mainCat].reviewed++;
        categories[mainCat].subCategories[subCat].reviewed++;
      }

      if (includeCards === "true") {
        categories[mainCat].subCategories[subCat].cards.push({
          id: card.id,
          reviewCount,
          cardState,
          isReviewed,
          easeFactor: progress?.easeFactor || 2.5,
          interval: progress?.interval || 1,
          dueDate: progress?.dueDate,
        });
      }
    });

    // Вычисляем проценты и средние значения
    Object.keys(categories).forEach((mainCat) => {
      const cat = categories[mainCat];
      cat.percentage =
        cat.total > 0 ? Math.round((cat.reviewed / cat.total) * 100) : 0;

      let catTotalReviewCount = 0;
      Object.keys(cat.subCategories).forEach((subCat) => {
        const subCatData = cat.subCategories[subCat];
        subCatData.percentage =
          subCatData.total > 0
            ? Math.round((subCatData.reviewed / subCatData.total) * 100)
            : 0;

        const subCatReviewCount =
          subCatData.cards?.reduce(
            (sum: number, card: any) => sum + card.reviewCount,
            0
          ) || 0;
        subCatData.averageReviewCount =
          subCatData.total > 0
            ? Math.round((subCatReviewCount / subCatData.total) * 100) / 100
            : 0;
        catTotalReviewCount += subCatReviewCount;
      });

      cat.averageReviewCount =
        cat.total > 0
          ? Math.round((catTotalReviewCount / cat.total) * 100) / 100
          : 0;
    });

    res.json({
      categories,
      totalCards,
      reviewedCards,
      averageReviewCount:
        totalCards > 0
          ? Math.round((totalReviewCount / totalCards) * 100) / 100
          : 0,
    });
  } catch (error) {
    console.error("Error fetching theory stats:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/stats/roadmap:
 *   get:
 *     summary: Статистика для роадмапа
 *     description: Возвращает агрегированную статистику для отображения в роадмапе
 *     tags: [Statistics]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Статистика для роадмапа
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       contentProgress:
 *                         type: number
 *                       theoryProgress:
 *                         type: number
 *                       overallProgress:
 *                         type: number
 *                       contentStats:
 *                         type: object
 *                         properties:
 *                           total:
 *                             type: integer
 *                           completed:
 *                             type: integer
 *                       theoryStats:
 *                         type: object
 *                         properties:
 *                           total:
 *                             type: integer
 *                           completed:
 *                             type: integer
 *                       subCategories:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             name:
 *                               type: string
 *                             contentProgress:
 *                               type: number
 *                             theoryProgress:
 *                               type: number
 *                             overallProgress:
 *                               type: number
 */
router.get("/roadmap", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId!;

    // Получаем все категории из контента и теории
    const [contentCategories, theoryCategories] = await Promise.all([
      prisma.contentFile.findMany({
        select: { mainCategory: true, subCategory: true },
        distinct: ["mainCategory", "subCategory"],
        orderBy: [{ mainCategory: "asc" }, { subCategory: "asc" }],
      }),
      prisma.theoryCard.findMany({
        select: { category: true, subCategory: true },
        distinct: ["category", "subCategory"],
        orderBy: [{ category: "asc" }, { subCategory: "asc" }],
      }),
    ]);

    // Создаем множество всех уникальных категорий
    const allCategories = new Set<string>();
    contentCategories.forEach((item) => allCategories.add(item.mainCategory));
    theoryCategories.forEach((item) => allCategories.add(item.category));

    const roadmapData = [];

    for (const categoryName of Array.from(allCategories).sort()) {
      // Получаем статистику по контенту для этой категории
      const contentBlocks = await prisma.contentBlock.findMany({
        where: { file: { mainCategory: categoryName } },
        select: {
          id: true,
          file: { select: { subCategory: true } },
          progressEntries: {
            where: { userId },
            select: { solvedCount: true },
          },
        },
      });

      // Получаем статистику по теории для этой категории
      const theoryCards = await prisma.theoryCard.findMany({
        where: { category: categoryName },
        select: {
          id: true,
          subCategory: true,
          progressEntries: {
            where: { userId },
            select: { reviewCount: true },
          },
        },
      });

      // Обрабатываем подкатегории
      const subCategoriesMap = new Map<string, any>();

      // Добавляем подкатегории из контента
      contentBlocks.forEach((block) => {
        const subCat = block.file.subCategory;
        if (!subCategoriesMap.has(subCat)) {
          subCategoriesMap.set(subCat, {
            name: subCat,
            contentTotal: 0,
            contentCompleted: 0,
            theoryTotal: 0,
            theoryCompleted: 0,
          });
        }
        const subCatData = subCategoriesMap.get(subCat)!;
        subCatData.contentTotal++;
        if (
          block.progressEntries.length > 0 &&
          block.progressEntries[0].solvedCount > 0
        ) {
          subCatData.contentCompleted++;
        }
      });

      // Добавляем подкатегории из теории
      theoryCards.forEach((card) => {
        const subCat = card.subCategory || "Общее";
        if (!subCategoriesMap.has(subCat)) {
          subCategoriesMap.set(subCat, {
            name: subCat,
            contentTotal: 0,
            contentCompleted: 0,
            theoryTotal: 0,
            theoryCompleted: 0,
          });
        }
        const subCatData = subCategoriesMap.get(subCat)!;
        subCatData.theoryTotal++;
        if (
          card.progressEntries.length > 0 &&
          card.progressEntries[0].reviewCount > 0
        ) {
          subCatData.theoryCompleted++;
        }
      });

      // Вычисляем прогресс для подкатегорий
      const subCategories = Array.from(subCategoriesMap.values()).map(
        (subCat) => ({
          name: subCat.name,
          contentProgress:
            subCat.contentTotal > 0
              ? Math.round(
                  (subCat.contentCompleted / subCat.contentTotal) * 100
                )
              : 0,
          theoryProgress:
            subCat.theoryTotal > 0
              ? Math.round((subCat.theoryCompleted / subCat.theoryTotal) * 100)
              : 0,
          overallProgress:
            subCat.contentTotal + subCat.theoryTotal > 0
              ? Math.round(
                  ((subCat.contentCompleted + subCat.theoryCompleted) /
                    (subCat.contentTotal + subCat.theoryTotal)) *
                    100
                )
              : 0,
        })
      );

      // Вычисляем общую статистику для категории
      const contentTotal = contentBlocks.length;
      const contentCompleted = contentBlocks.filter(
        (block) =>
          block.progressEntries.length > 0 &&
          block.progressEntries[0].solvedCount > 0
      ).length;
      const theoryTotal = theoryCards.length;
      const theoryCompleted = theoryCards.filter(
        (card) =>
          card.progressEntries.length > 0 &&
          card.progressEntries[0].reviewCount > 0
      ).length;

      const categoryData = {
        name: categoryName,
        contentProgress:
          contentTotal > 0
            ? Math.round((contentCompleted / contentTotal) * 100)
            : 0,
        theoryProgress:
          theoryTotal > 0
            ? Math.round((theoryCompleted / theoryTotal) * 100)
            : 0,
        overallProgress:
          contentTotal + theoryTotal > 0
            ? Math.round(
                ((contentCompleted + theoryCompleted) /
                  (contentTotal + theoryTotal)) *
                  100
              )
            : 0,
        contentStats: {
          total: contentTotal,
          completed: contentCompleted,
        },
        theoryStats: {
          total: theoryTotal,
          completed: theoryCompleted,
        },
        subCategories: subCategories.sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
      };

      roadmapData.push(categoryData);
    }

    res.json({
      categories: roadmapData,
    });
  } catch (error) {
    console.error("Error fetching roadmap stats:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
