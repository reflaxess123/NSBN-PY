import { PrismaClient } from "@prisma/client";
import { parseAnkiFile } from "../utils/ankiParser";

const prisma = new PrismaClient();

interface ImportSummary {
  status: string;
  totalCards: number;
  createdCards: number;
  updatedCards: number;
  errors: { line?: number; cardGuid?: string; error: string }[];
}

function extractCategoryFromDeck(deck: string): {
  category: string;
  subCategory?: string;
} {
  const parts = deck.split("::");
  if (parts.length >= 2) {
    const category = parts[1].trim();
    const subCategory = parts.length >= 3 ? parts[2].trim() : undefined;
    return { category, subCategory };
  }
  return { category: "Unknown" };
}

export async function importAnkiCards(
  fileContent: string
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    status: "started",
    totalCards: 0,
    createdCards: 0,
    updatedCards: 0,
    errors: [],
  };

  try {
    const parsedData = parseAnkiFile(fileContent);
    summary.totalCards = parsedData.totalCards;
    summary.errors.push(
      ...parsedData.errors.map((e) => ({ line: e.line, error: e.error }))
    );

    console.log(`Начинаем импорт ${parsedData.cards.length} карточек...`);

    for (const [index, card] of parsedData.cards.entries()) {
      try {
        const { category, subCategory } = extractCategoryFromDeck(card.deck);

        const existingCard = await prisma.theoryCard.findUnique({
          where: { ankiGuid: card.guid },
        });

        if (existingCard) {
          // Обновляем существующую карточку
          await prisma.theoryCard.update({
            where: { ankiGuid: card.guid },
            data: {
              cardType: card.cardType,
              deck: card.deck,
              category,
              subCategory,
              questionBlock: card.questionBlock,
              answerBlock: card.answerBlock,
              tags: card.tags,
              orderIndex: index,
            },
          });
          summary.updatedCards++;
          console.log(`Обновлена карточка: ${card.guid}`);
        } else {
          // Создаем новую карточку
          await prisma.theoryCard.create({
            data: {
              ankiGuid: card.guid,
              cardType: card.cardType,
              deck: card.deck,
              category,
              subCategory,
              questionBlock: card.questionBlock,
              answerBlock: card.answerBlock,
              tags: card.tags,
              orderIndex: index,
            },
          });
          summary.createdCards++;
          console.log(`Создана карточка: ${card.guid}`);
        }
      } catch (cardError) {
        const errorMessage =
          cardError instanceof Error ? cardError.message : "Неизвестная ошибка";
        summary.errors.push({
          cardGuid: card.guid,
          error: `Ошибка обработки карточки: ${errorMessage}`,
        });
        console.error(`Ошибка обработки карточки ${card.guid}:`, errorMessage);
      }
    }

    summary.status = "Completed";
    console.log("Импорт завершен успешно");
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Неизвестная ошибка";
    summary.status = `Failed: ${errorMessage}`;
    summary.errors.push({ error: `Общая ошибка импорта: ${errorMessage}` });
    console.error("Ошибка импорта:", errorMessage);
  }

  return summary;
}
