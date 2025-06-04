import { PrismaClient } from "@prisma/client";
import {
  CardState,
  CardStats,
  DueCard,
  NextReviewOptions,
  Rating,
  ReviewResponse,
} from "../types/spacedRepetition";
import { IntervalCalculator } from "../utils/intervalCalculator";

const prisma = new PrismaClient();

export class SpacedRepetitionService {
  private intervalCalculator: IntervalCalculator;

  constructor() {
    this.intervalCalculator = new IntervalCalculator();
  }

  /**
   * Обрабатывает повторение карточки
   */
  async reviewCard(
    userId: number,
    cardId: string,
    rating: Rating,
    responseTime?: number
  ): Promise<ReviewResponse> {
    // Получаем текущий прогресс карточки
    let progress = await prisma.userTheoryProgress.findUnique({
      where: { userId_cardId: { userId, cardId } },
    });

    // Если прогресса нет, создаем новый
    if (!progress) {
      progress = await prisma.userTheoryProgress.create({
        data: {
          userId,
          cardId,
          solvedCount: 0,
          easeFactor: 2.5,
          interval: 1,
          dueDate: null,
          reviewCount: 0,
          lapseCount: 0,
          cardState: "NEW",
          learningStep: 0,
          lastReviewDate: null,
        },
      });
    }

    // Рассчитываем дни опоздания
    const now = new Date();
    const daysLate = progress.dueDate
      ? Math.max(
          0,
          Math.floor(
            (now.getTime() - progress.dueDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        )
      : 0;

    // Рассчитываем новые параметры
    const reviewResult = this.intervalCalculator.calculateReview(
      progress.cardState as CardState,
      progress.interval,
      Number(progress.easeFactor),
      progress.learningStep,
      rating,
      daysLate
    );

    // Обновляем прогресс в базе данных
    const updatedProgress = await prisma.userTheoryProgress.update({
      where: { userId_cardId: { userId, cardId } },
      data: {
        easeFactor: reviewResult.newEaseFactor,
        interval: reviewResult.newInterval,
        dueDate: reviewResult.newDueDate,
        reviewCount: { increment: 1 },
        lapseCount: { increment: reviewResult.lapseCountIncrement },
        cardState: reviewResult.newCardState,
        learningStep: reviewResult.newLearningStep,
        lastReviewDate: now,
        solvedCount: { increment: 1 }, // Сохраняем совместимость со старой системой
        updatedAt: now,
      },
    });

    // Получаем варианты следующих интервалов
    const nextReviewIntervals = this.intervalCalculator.getNextReviewOptions(
      reviewResult.newCardState,
      reviewResult.newInterval,
      reviewResult.newEaseFactor,
      reviewResult.newLearningStep,
      0 // Для будущих интервалов опоздания нет
    );

    return {
      userId,
      cardId,
      newInterval: reviewResult.newInterval,
      newDueDate: reviewResult.newDueDate.toISOString(),
      easeFactor: reviewResult.newEaseFactor,
      cardState: reviewResult.newCardState,
      reviewCount: updatedProgress.reviewCount,
      lapseCount: updatedProgress.lapseCount,
      nextReviewIntervals,
    };
  }

  /**
   * Получает карточки к повторению
   */
  async getDueCards(
    userId: number,
    limit: number = 50,
    includeNew: boolean = true,
    includeLearning: boolean = true,
    includeReview: boolean = true
  ): Promise<DueCard[]> {
    const now = new Date();

    // Строим условия фильтрации
    const stateFilter: CardState[] = [];
    if (includeNew) stateFilter.push("NEW");
    if (includeLearning) stateFilter.push("LEARNING", "RELEARNING");
    if (includeReview) stateFilter.push("REVIEW");

    const cardsData = await prisma.theoryCard.findMany({
      include: {
        progressEntries: {
          where: { userId },
          select: {
            easeFactor: true,
            interval: true,
            dueDate: true,
            reviewCount: true,
            lapseCount: true,
            cardState: true,
            learningStep: true,
            lastReviewDate: true,
          },
        },
      },
      take: limit * 2, // Берем больше, чтобы после фильтрации осталось достаточно
    });

    // Обрабатываем карточки и фильтруем
    const processedCards: DueCard[] = [];

    for (const card of cardsData) {
      const progress = card.progressEntries[0];

      // Если нет прогресса, это новая карточка
      if (!progress) {
        if (includeNew) {
          processedCards.push({
            ...card,
            dueDate: null,
            cardState: "NEW",
            interval: 1,
            easeFactor: 2.5,
            reviewCount: 0,
            lapseCount: 0,
            isOverdue: false,
            daysSinceLastReview: null,
            priority: this.intervalCalculator.calculatePriority(
              null,
              2.5,
              0,
              "NEW"
            ),
          });
        }
        continue;
      }

      // Проверяем, нужно ли показывать карточку
      const cardState = progress.cardState as CardState;
      if (!stateFilter.includes(cardState)) continue;

      // Для карточек в изучении проверяем время
      if (
        (cardState === "LEARNING" || cardState === "RELEARNING") &&
        progress.dueDate
      ) {
        if (now < progress.dueDate) continue; // Еще не время
      }

      // Для карточек в повторении проверяем дату
      if (cardState === "REVIEW" && progress.dueDate) {
        const daysDiff = Math.floor(
          (now.getTime() - progress.dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysDiff < 0) continue; // Еще не время
      }

      const isOverdue = progress.dueDate ? now > progress.dueDate : false;
      const daysSinceLastReview = progress.lastReviewDate
        ? Math.floor(
            (now.getTime() - progress.lastReviewDate.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : null;

      const priority = this.intervalCalculator.calculatePriority(
        progress.dueDate,
        Number(progress.easeFactor),
        progress.lapseCount,
        cardState
      );

      processedCards.push({
        ...card,
        dueDate: progress.dueDate?.toISOString() || null,
        cardState,
        interval: progress.interval,
        easeFactor: Number(progress.easeFactor),
        reviewCount: progress.reviewCount,
        lapseCount: progress.lapseCount,
        isOverdue,
        daysSinceLastReview,
        priority,
      });
    }

    // Сортируем по приоритету (убывание) и ограничиваем количество
    return processedCards
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);
  }

  /**
   * Получает статистику по карточке
   */
  async getCardStats(
    userId: number,
    cardId: string
  ): Promise<CardStats | null> {
    const progress = await prisma.userTheoryProgress.findUnique({
      where: { userId_cardId: { userId, cardId } },
    });

    if (!progress) {
      return null;
    }

    // Рассчитываем варианты следующих интервалов
    const nextReviewIntervals = this.intervalCalculator.getNextReviewOptions(
      progress.cardState as CardState,
      progress.interval,
      Number(progress.easeFactor),
      progress.learningStep,
      0
    );

    // Простой расчет retention rate (можно улучшить в будущем)
    const retentionRate =
      progress.reviewCount > 0
        ? Math.max(
            0,
            ((progress.reviewCount - progress.lapseCount) /
              progress.reviewCount) *
              100
          )
        : 0;

    return {
      cardId,
      userId,
      totalReviews: progress.reviewCount,
      lapseCount: progress.lapseCount,
      easeFactor: Number(progress.easeFactor),
      currentInterval: progress.interval,
      cardState: progress.cardState as CardState,
      dueDate: progress.dueDate?.toISOString() || null,
      lastReviewDate: progress.lastReviewDate?.toISOString() || null,
      averageResponseTime: null, // TODO: реализовать в будущем
      retentionRate,
      nextReviewIntervals,
    };
  }

  /**
   * Сбрасывает прогресс карточки
   */
  async resetCard(userId: number, cardId: string): Promise<void> {
    await prisma.userTheoryProgress.upsert({
      where: { userId_cardId: { userId, cardId } },
      create: {
        userId,
        cardId,
        solvedCount: 0,
        easeFactor: 2.5,
        interval: 1,
        dueDate: null,
        reviewCount: 0,
        lapseCount: 0,
        cardState: "NEW",
        learningStep: 0,
        lastReviewDate: null,
      },
      update: {
        solvedCount: 0,
        easeFactor: 2.5,
        interval: 1,
        dueDate: null,
        reviewCount: 0,
        lapseCount: 0,
        cardState: "NEW",
        learningStep: 0,
        lastReviewDate: null,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Получает варианты следующих интервалов для карточки
   */
  async getNextReviewOptions(
    userId: number,
    cardId: string
  ): Promise<NextReviewOptions | null> {
    const progress = await prisma.userTheoryProgress.findUnique({
      where: { userId_cardId: { userId, cardId } },
    });

    if (!progress) {
      // Для новой карточки возвращаем стандартные варианты
      return this.intervalCalculator.getNextReviewOptions("NEW", 1, 2.5, 0, 0);
    }

    const now = new Date();
    const daysLate = progress.dueDate
      ? Math.max(
          0,
          Math.floor(
            (now.getTime() - progress.dueDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        )
      : 0;

    return this.intervalCalculator.getNextReviewOptions(
      progress.cardState as CardState,
      progress.interval,
      Number(progress.easeFactor),
      progress.learningStep,
      daysLate
    );
  }

  /**
   * Получает количество карточек по состояниям
   */
  async getCardCounts(userId: number): Promise<{
    new: number;
    learning: number;
    review: number;
    total: number;
  }> {
    const now = new Date();

    // Получаем все карточки пользователя
    const allCards = await prisma.theoryCard.count();

    const progressCounts = await prisma.userTheoryProgress.groupBy({
      by: ["cardState"],
      where: { userId },
      _count: { cardState: true },
    });

    const counts = {
      new: 0,
      learning: 0,
      review: 0,
      total: allCards,
    };

    // Подсчитываем карточки с прогрессом
    let cardsWithProgress = 0;
    for (const group of progressCounts) {
      cardsWithProgress += group._count.cardState;

      if (group.cardState === "NEW") {
        counts.new += group._count.cardState;
      } else if (
        group.cardState === "LEARNING" ||
        group.cardState === "RELEARNING"
      ) {
        counts.learning += group._count.cardState;
      } else if (group.cardState === "REVIEW") {
        counts.review += group._count.cardState;
      }
    }

    // Карточки без прогресса считаются новыми
    counts.new += allCards - cardsWithProgress;

    return counts;
  }
}
