import {
  CardState,
  DEFAULT_CONFIG,
  NextReviewOptions,
  Rating,
  ReviewResult,
  SpacedRepetitionConfig,
} from "../types/spacedRepetition";

export class IntervalCalculator {
  private config: SpacedRepetitionConfig;

  constructor(config: SpacedRepetitionConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  /**
   * Рассчитывает результат повторения карточки
   */
  calculateReview(
    currentState: CardState,
    currentInterval: number,
    currentEaseFactor: number,
    currentLearningStep: number,
    rating: Rating,
    daysLate: number = 0
  ): ReviewResult {
    let newInterval: number;
    let newEaseFactor: number;
    let newCardState: CardState;
    let newLearningStep: number;
    let lapseCountIncrement = 0;

    switch (currentState) {
      case "NEW":
        return this.handleNewCard(rating);

      case "LEARNING":
        return this.handleLearningCard(rating, currentLearningStep);

      case "REVIEW":
        return this.handleReviewCard(
          rating,
          currentInterval,
          currentEaseFactor,
          daysLate
        );

      case "RELEARNING":
        return this.handleRelearningCard(
          rating,
          currentInterval,
          currentEaseFactor,
          currentLearningStep
        );

      default:
        throw new Error(`Unknown card state: ${currentState}`);
    }
  }

  /**
   * Обработка новой карточки
   */
  private handleNewCard(rating: Rating): ReviewResult {
    const now = new Date();

    switch (rating) {
      case "again":
        return {
          newInterval: this.config.learningSteps[0],
          newDueDate: this.addMinutes(now, this.config.learningSteps[0]),
          newEaseFactor: this.config.initialEaseFactor,
          newCardState: "LEARNING",
          newLearningStep: 0,
          lapseCountIncrement: 0,
        };

      case "hard":
        return {
          newInterval: this.config.learningSteps[0],
          newDueDate: this.addMinutes(now, this.config.learningSteps[0]),
          newEaseFactor: this.config.initialEaseFactor,
          newCardState: "LEARNING",
          newLearningStep: 0,
          lapseCountIncrement: 0,
        };

      case "good":
        const nextStep =
          this.config.learningSteps[1] || this.config.learningSteps[0];
        return {
          newInterval: nextStep,
          newDueDate: this.addMinutes(now, nextStep),
          newEaseFactor: this.config.initialEaseFactor,
          newCardState: "LEARNING",
          newLearningStep: 1,
          lapseCountIncrement: 0,
        };

      case "easy":
        return {
          newInterval: this.config.easyInterval,
          newDueDate: this.addDays(now, this.config.easyInterval),
          newEaseFactor: this.config.initialEaseFactor,
          newCardState: "REVIEW",
          newLearningStep: 0,
          lapseCountIncrement: 0,
        };
    }
  }

  /**
   * Обработка карточки в изучении
   */
  private handleLearningCard(
    rating: Rating,
    currentStep: number
  ): ReviewResult {
    const now = new Date();

    switch (rating) {
      case "again":
        return {
          newInterval: this.config.learningSteps[0],
          newDueDate: this.addMinutes(now, this.config.learningSteps[0]),
          newEaseFactor: this.config.initialEaseFactor,
          newCardState: "LEARNING",
          newLearningStep: 0,
          lapseCountIncrement: 0,
        };

      case "hard":
        // Повторить текущий шаг
        const currentStepInterval =
          this.config.learningSteps[currentStep] ||
          this.config.learningSteps[0];
        return {
          newInterval: currentStepInterval,
          newDueDate: this.addMinutes(now, currentStepInterval),
          newEaseFactor: this.config.initialEaseFactor,
          newCardState: "LEARNING",
          newLearningStep: currentStep,
          lapseCountIncrement: 0,
        };

      case "good":
        const nextStep = currentStep + 1;
        if (nextStep >= this.config.learningSteps.length) {
          // Выпускаем в повторение
          return {
            newInterval: this.config.graduatingInterval,
            newDueDate: this.addDays(now, this.config.graduatingInterval),
            newEaseFactor: this.config.initialEaseFactor,
            newCardState: "REVIEW",
            newLearningStep: 0,
            lapseCountIncrement: 0,
          };
        } else {
          // Переходим к следующему шагу
          const nextStepInterval = this.config.learningSteps[nextStep];
          return {
            newInterval: nextStepInterval,
            newDueDate: this.addMinutes(now, nextStepInterval),
            newEaseFactor: this.config.initialEaseFactor,
            newCardState: "LEARNING",
            newLearningStep: nextStep,
            lapseCountIncrement: 0,
          };
        }

      case "easy":
        return {
          newInterval: this.config.easyInterval,
          newDueDate: this.addDays(now, this.config.easyInterval),
          newEaseFactor: this.config.initialEaseFactor,
          newCardState: "REVIEW",
          newLearningStep: 0,
          lapseCountIncrement: 0,
        };
    }
  }

  /**
   * Обработка карточки в повторении
   */
  private handleReviewCard(
    rating: Rating,
    currentInterval: number,
    currentEaseFactor: number,
    daysLate: number
  ): ReviewResult {
    const now = new Date();
    let newEaseFactor = currentEaseFactor;
    let newInterval: number;
    let newCardState: CardState = "REVIEW";
    let lapseCountIncrement = 0;

    // Корректировка интервала с учетом опоздания
    const adjustedInterval = Math.max(
      1,
      currentInterval + Math.floor(daysLate * 0.25)
    );

    switch (rating) {
      case "again":
        newEaseFactor = Math.max(
          this.config.minEaseFactor,
          currentEaseFactor - 0.2
        );
        newInterval = Math.max(
          1,
          Math.floor(adjustedInterval * this.config.lapseMultiplier)
        );
        newCardState = "RELEARNING";
        lapseCountIncrement = 1;

        return {
          newInterval: this.config.learningSteps[0], // Начинаем с первого шага переизучения
          newDueDate: this.addMinutes(now, this.config.learningSteps[0]),
          newEaseFactor,
          newCardState,
          newLearningStep: 0,
          lapseCountIncrement,
        };

      case "hard":
        newEaseFactor = Math.max(
          this.config.minEaseFactor,
          currentEaseFactor - 0.15
        );
        newInterval = Math.max(
          1,
          Math.floor(adjustedInterval * this.config.hardMultiplier)
        );
        break;

      case "good":
        newInterval = Math.max(1, Math.floor(adjustedInterval * newEaseFactor));
        break;

      case "easy":
        newEaseFactor = Math.min(
          this.config.maxEaseFactor,
          currentEaseFactor + 0.15
        );
        newInterval = Math.max(
          1,
          Math.floor(adjustedInterval * newEaseFactor * this.config.easyBonus)
        );
        break;
    }

    return {
      newInterval,
      newDueDate: this.addDays(now, newInterval),
      newEaseFactor,
      newCardState,
      newLearningStep: 0,
      lapseCountIncrement,
    };
  }

  /**
   * Обработка карточки в переизучении
   */
  private handleRelearningCard(
    rating: Rating,
    currentInterval: number,
    currentEaseFactor: number,
    currentStep: number
  ): ReviewResult {
    const now = new Date();

    switch (rating) {
      case "again":
        return {
          newInterval: this.config.learningSteps[0],
          newDueDate: this.addMinutes(now, this.config.learningSteps[0]),
          newEaseFactor: currentEaseFactor,
          newCardState: "RELEARNING",
          newLearningStep: 0,
          lapseCountIncrement: 0,
        };

      case "hard":
        const currentStepInterval =
          this.config.learningSteps[currentStep] ||
          this.config.learningSteps[0];
        return {
          newInterval: currentStepInterval,
          newDueDate: this.addMinutes(now, currentStepInterval),
          newEaseFactor: currentEaseFactor,
          newCardState: "RELEARNING",
          newLearningStep: currentStep,
          lapseCountIncrement: 0,
        };

      case "good":
        const nextStep = currentStep + 1;
        if (nextStep >= this.config.learningSteps.length) {
          // Возвращаем в повторение с уменьшенным интервалом
          const newInterval = Math.max(
            1,
            Math.floor(currentInterval * this.config.lapseMultiplier)
          );
          return {
            newInterval,
            newDueDate: this.addDays(now, newInterval),
            newEaseFactor: currentEaseFactor,
            newCardState: "REVIEW",
            newLearningStep: 0,
            lapseCountIncrement: 0,
          };
        } else {
          const nextStepInterval = this.config.learningSteps[nextStep];
          return {
            newInterval: nextStepInterval,
            newDueDate: this.addMinutes(now, nextStepInterval),
            newEaseFactor: currentEaseFactor,
            newCardState: "RELEARNING",
            newLearningStep: nextStep,
            lapseCountIncrement: 0,
          };
        }

      case "easy":
        const newInterval = Math.max(
          1,
          Math.floor(currentInterval * this.config.lapseMultiplier)
        );
        return {
          newInterval,
          newDueDate: this.addDays(now, newInterval),
          newEaseFactor: currentEaseFactor,
          newCardState: "REVIEW",
          newLearningStep: 0,
          lapseCountIncrement: 0,
        };
    }
  }

  /**
   * Получает варианты следующих интервалов для всех кнопок
   */
  getNextReviewOptions(
    currentState: CardState,
    currentInterval: number,
    currentEaseFactor: number,
    currentLearningStep: number,
    daysLate: number = 0
  ): NextReviewOptions {
    const again = this.calculateReview(
      currentState,
      currentInterval,
      currentEaseFactor,
      currentLearningStep,
      "again",
      daysLate
    );
    const hard = this.calculateReview(
      currentState,
      currentInterval,
      currentEaseFactor,
      currentLearningStep,
      "hard",
      daysLate
    );
    const good = this.calculateReview(
      currentState,
      currentInterval,
      currentEaseFactor,
      currentLearningStep,
      "good",
      daysLate
    );
    const easy = this.calculateReview(
      currentState,
      currentInterval,
      currentEaseFactor,
      currentLearningStep,
      "easy",
      daysLate
    );

    return {
      again: this.isMinuteInterval(again.newInterval, again.newCardState)
        ? again.newInterval
        : this.daysToDays(again.newInterval),
      hard: this.isMinuteInterval(hard.newInterval, hard.newCardState)
        ? hard.newInterval
        : this.daysToDays(hard.newInterval),
      good: this.isMinuteInterval(good.newInterval, good.newCardState)
        ? good.newInterval
        : this.daysToDays(good.newInterval),
      easy: this.isMinuteInterval(easy.newInterval, easy.newCardState)
        ? easy.newInterval
        : this.daysToDays(easy.newInterval),
    };
  }

  /**
   * Рассчитывает приоритет карточки для сортировки
   */
  calculatePriority(
    dueDate: Date | null,
    easeFactor: number,
    lapseCount: number,
    cardState: CardState
  ): number {
    if (!dueDate) return 0;

    const now = new Date();
    const daysOverdue = Math.max(
      0,
      Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    // Базовый приоритет: чем больше просрочка, тем выше приоритет
    let priority = daysOverdue * 10;

    // Сложные карточки (низкий ease factor) имеют более высокий приоритет
    priority += (this.config.maxEaseFactor - easeFactor) * 5;

    // Карточки с большим количеством забываний имеют более высокий приоритет
    priority += lapseCount * 2;

    // Карточки в изучении имеют самый высокий приоритет
    if (cardState === "LEARNING" || cardState === "RELEARNING") {
      priority += 100;
    }

    return priority;
  }

  /**
   * Проверяет, является ли интервал в минутах (для карточек в изучении)
   */
  private isMinuteInterval(interval: number, cardState: CardState): boolean {
    return cardState === "LEARNING" || cardState === "RELEARNING";
  }

  /**
   * Конвертирует дни в дни (для единообразия API)
   */
  private daysToDays(days: number): number {
    return days;
  }

  /**
   * Добавляет минуты к дате
   */
  private addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
  }

  /**
   * Добавляет дни к дате
   */
  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }
}
