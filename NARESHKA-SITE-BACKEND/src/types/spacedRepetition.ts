export type Rating = "again" | "hard" | "good" | "easy";

export type CardState = "NEW" | "LEARNING" | "REVIEW" | "RELEARNING";

export interface ReviewRequest {
  rating: Rating;
  responseTime?: number; // время ответа в миллисекундах (опционально)
}

export interface ReviewResponse {
  userId: number;
  cardId: string;
  newInterval: number;
  newDueDate: string;
  easeFactor: number;
  cardState: CardState;
  reviewCount: number;
  lapseCount: number;
  nextReviewIntervals: {
    again: number;
    hard: number;
    good: number;
    easy: number;
  };
}

export interface DueCard {
  id: string;
  ankiGuid: string;
  cardType: string;
  deck: string;
  category: string;
  subCategory: string | null;
  questionBlock: string;
  answerBlock: string;
  tags: string[];
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
  // Поля прогресса
  dueDate: string | null;
  cardState: CardState;
  interval: number;
  easeFactor: number;
  reviewCount: number;
  lapseCount: number;
  isOverdue: boolean;
  daysSinceLastReview: number | null;
  priority: number;
}

export interface CardStats {
  cardId: string;
  userId: number;
  totalReviews: number;
  lapseCount: number;
  easeFactor: number;
  currentInterval: number;
  cardState: CardState;
  dueDate: string | null;
  lastReviewDate: string | null;
  averageResponseTime: number | null;
  retentionRate: number; // процент правильных ответов
  nextReviewIntervals: {
    again: number;
    hard: number;
    good: number;
    easy: number;
  };
}

export interface NextReviewOptions {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export interface ReviewResult {
  newInterval: number;
  newDueDate: Date;
  newEaseFactor: number;
  newCardState: CardState;
  newLearningStep: number;
  lapseCountIncrement: number;
}

export interface SpacedRepetitionConfig {
  learningSteps: number[]; // в минутах
  graduatingInterval: number; // в днях
  easyInterval: number; // в днях
  minEaseFactor: number;
  maxEaseFactor: number;
  initialEaseFactor: number;
  lapseMultiplier: number;
  hardMultiplier: number;
  easyBonus: number;
}

export const DEFAULT_CONFIG: SpacedRepetitionConfig = {
  learningSteps: [1, 10], // 1 минута, 10 минут
  graduatingInterval: 1, // 1 день
  easyInterval: 4, // 4 дня
  minEaseFactor: 1.3,
  maxEaseFactor: 2.5,
  initialEaseFactor: 2.5,
  lapseMultiplier: 0.1, // при забывании интервал уменьшается в 10 раз
  hardMultiplier: 1.2, // при "сложно" интервал увеличивается в 1.2 раза
  easyBonus: 1.3, // при "легко" дополнительный бонус к интервалу
};
