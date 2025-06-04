interface AnkiCard {
  guid: string;
  cardType: string;
  deck: string;
  questionBlock: string;
  answerBlock: string;
  tags: string[];
}

interface ParsedAnkiData {
  cards: AnkiCard[];
  totalCards: number;
  errors: { line: number; error: string }[];
}

const SUPABASE_BASE_URL =
  "https://dydifvbmwsuxxxnixbep.supabase.co/storage/v1/object/public/anreshka-storage/";

function processImageUrls(htmlContent: string): string {
  // Убираем лишние кавычки вокруг HTML контента
  let cleanContent = htmlContent.replace(/^"(.*)"$/, "$1");

  // Заменяем относительные пути на полные URL Supabase
  // Обрабатываем случаи с двойными кавычками в src
  cleanContent = cleanContent.replace(
    /<img\s+src="([^"]+\.(jpg|jpeg|png|gif|webp))"/gi,
    `<img src="${SUPABASE_BASE_URL}$1"`
  );

  // Исправляем двойные кавычки в src атрибуте
  cleanContent = cleanContent.replace(
    /<img\s+src=""([^"]+)"">/gi,
    `<img src="${SUPABASE_BASE_URL}$1">`
  );

  return cleanContent;
}

function extractCategoryFromDeck(deck: string): {
  category: string;
  subCategory?: string;
} {
  // Парсим "СБОРНИК::JS ТЕОРИЯ::Операторы" -> category: "JS ТЕОРИЯ", subCategory: "Операторы"
  const parts = deck.split("::");
  if (parts.length >= 2) {
    const category = parts[1].trim();
    const subCategory = parts.length >= 3 ? parts[2].trim() : undefined;
    return { category, subCategory };
  }
  return { category: "Unknown" };
}

export function parseAnkiFile(fileContent: string): ParsedAnkiData {
  const lines = fileContent.split("\n");
  const cards: AnkiCard[] = [];
  const errors: { line: number; error: string }[] = [];

  // Пропускаем заголовочные строки (начинающиеся с #)
  const dataLines = lines.filter((line, index) => {
    if (line.startsWith("#") || line.trim() === "") return false;
    return true;
  });

  dataLines.forEach((line, index) => {
    try {
      const columns = line.split("\t");

      if (columns.length < 5) {
        errors.push({
          line: index + 1,
          error: "Недостаточно колонок в строке",
        });
        return;
      }

      const [guid, cardType, deck, questionBlock, answerBlock, tagsStr = ""] =
        columns;

      cards.push({
        guid: guid.trim(),
        cardType: cardType.trim(),
        deck: deck.trim(),
        questionBlock: processImageUrls(questionBlock.trim()),
        answerBlock: processImageUrls(answerBlock.trim()),
        tags: tagsStr.trim() ? tagsStr.split(",").map((tag) => tag.trim()) : [],
      });
    } catch (error) {
      errors.push({
        line: index + 1,
        error:
          error instanceof Error
            ? error.message
            : "Неизвестная ошибка парсинга",
      });
    }
  });

  return {
    cards,
    totalCards: cards.length,
    errors,
  };
}
