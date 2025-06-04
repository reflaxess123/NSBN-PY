import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Nareshka API",
      version: "1.0.0",
      description:
        "API для системы изучения материалов с поддержкой контента и теоретических карточек",
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "Development server",
      },
      {
        url: "https://api.nareshka.site",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "connect.sid",
          description: "Session cookie для аутентификации",
        },
      },
      schemas: {
        TheoryCard: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Уникальный ID карточки",
            },
            ankiGuid: {
              type: "string",
              description: "GUID из Anki (уникальный)",
            },
            cardType: {
              type: "string",
              description: "Тип карточки",
              example: "Простая",
            },
            deck: {
              type: "string",
              description: "Колода из Anki",
              example: "СБОРНИК::JS ТЕОРИЯ",
            },
            category: {
              type: "string",
              description: "Основная категория",
              example: "JS ТЕОРИЯ",
            },
            subCategory: {
              type: "string",
              nullable: true,
              description: "Подкатегория",
              example: "Операторы",
            },
            questionBlock: {
              type: "string",
              description: "HTML контент вопроса",
            },
            answerBlock: {
              type: "string",
              description: "HTML контент ответа",
            },
            tags: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Теги карточки",
            },
            orderIndex: {
              type: "number",
              description: "Порядок в файле импорта",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
            currentUserSolvedCount: {
              type: "number",
              description: "Количество решений текущего пользователя",
            },
          },
        },
        TheoryCardsList: {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: {
                $ref: "#/components/schemas/TheoryCard",
              },
            },
            pagination: {
              $ref: "#/components/schemas/Pagination",
            },
          },
        },
        Pagination: {
          type: "object",
          properties: {
            page: {
              type: "number",
              description: "Текущая страница",
            },
            limit: {
              type: "number",
              description: "Количество элементов на странице",
            },
            totalItems: {
              type: "number",
              description: "Общее количество элементов",
            },
            totalPages: {
              type: "number",
              description: "Общее количество страниц",
            },
          },
        },
        TheoryCategory: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Название категории",
            },
            subCategories: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Название подкатегории",
                  },
                  cardCount: {
                    type: "number",
                    description: "Количество карточек в подкатегории",
                  },
                },
              },
            },
            totalCards: {
              type: "number",
              description: "Общее количество карточек в категории",
            },
          },
        },
        ProgressUpdate: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["increment", "decrement"],
              description: "Действие с прогрессом",
            },
          },
          required: ["action"],
        },
        ProgressResponse: {
          type: "object",
          properties: {
            userId: {
              type: "number",
              description: "ID пользователя",
            },
            cardId: {
              type: "string",
              description: "ID карточки",
            },
            solvedCount: {
              type: "number",
              description: "Количество решений",
            },
          },
        },
        ImportSummary: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "Статус импорта",
            },
            totalCards: {
              type: "number",
              description: "Общее количество карточек",
            },
            createdCards: {
              type: "number",
              description: "Количество созданных карточек",
            },
            updatedCards: {
              type: "number",
              description: "Количество обновленных карточек",
            },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  line: {
                    type: "number",
                    description: "Номер строки с ошибкой",
                  },
                  cardGuid: {
                    type: "string",
                    description: "GUID карточки с ошибкой",
                  },
                  error: {
                    type: "string",
                    description: "Описание ошибки",
                  },
                },
              },
            },
          },
        },
        SpacedReviewRequest: {
          type: "object",
          required: ["rating"],
          properties: {
            rating: {
              type: "string",
              enum: ["again", "hard", "good", "easy"],
              description: "Оценка сложности ответа на карточку",
            },
            responseTime: {
              type: "number",
              description: "Время ответа в миллисекундах (опционально)",
              minimum: 0,
            },
          },
        },
        SpacedReviewResponse: {
          type: "object",
          properties: {
            userId: { type: "number" },
            cardId: { type: "string" },
            newInterval: {
              type: "number",
              description: "Новый интервал в днях или минутах",
            },
            newDueDate: {
              type: "string",
              format: "date-time",
              description: "Дата следующего повторения",
            },
            easeFactor: { type: "number", description: "Коэффициент легкости" },
            cardState: {
              type: "string",
              enum: ["NEW", "LEARNING", "REVIEW", "RELEARNING"],
              description: "Состояние карточки",
            },
            reviewCount: {
              type: "number",
              description: "Общее количество повторений",
            },
            lapseCount: { type: "number", description: "Количество забываний" },
            nextReviewIntervals: {
              type: "object",
              properties: {
                again: { type: "number" },
                hard: { type: "number" },
                good: { type: "number" },
                easy: { type: "number" },
              },
            },
          },
        },
        DueCard: {
          type: "object",
          allOf: [
            { $ref: "#/components/schemas/TheoryCard" },
            {
              type: "object",
              properties: {
                dueDate: {
                  type: "string",
                  format: "date-time",
                  nullable: true,
                },
                cardState: {
                  type: "string",
                  enum: ["NEW", "LEARNING", "REVIEW", "RELEARNING"],
                },
                interval: { type: "number" },
                easeFactor: { type: "number" },
                reviewCount: { type: "number" },
                lapseCount: { type: "number" },
                isOverdue: { type: "boolean" },
                daysSinceLastReview: { type: "number", nullable: true },
                priority: {
                  type: "number",
                  description: "Приоритет для сортировки",
                },
              },
            },
          ],
        },
        CardStats: {
          type: "object",
          properties: {
            cardId: { type: "string" },
            userId: { type: "number" },
            totalReviews: { type: "number" },
            lapseCount: { type: "number" },
            easeFactor: { type: "number" },
            currentInterval: { type: "number" },
            cardState: {
              type: "string",
              enum: ["NEW", "LEARNING", "REVIEW", "RELEARNING"],
            },
            dueDate: { type: "string", format: "date-time", nullable: true },
            lastReviewDate: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            averageResponseTime: { type: "number", nullable: true },
            retentionRate: {
              type: "number",
              description: "Процент правильных ответов",
            },
            nextReviewIntervals: {
              type: "object",
              properties: {
                again: { type: "number" },
                hard: { type: "number" },
                good: { type: "number" },
                easy: { type: "number" },
              },
            },
          },
        },
        NextReviewOptions: {
          type: "object",
          properties: {
            again: {
              type: "number",
              description: "Интервал при ответе 'Забыл'",
            },
            hard: {
              type: "number",
              description: "Интервал при ответе 'Сложно'",
            },
            good: {
              type: "number",
              description: "Интервал при ответе 'Хорошо'",
            },
            easy: {
              type: "number",
              description: "Интервал при ответе 'Легко'",
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Сообщение об ошибке",
            },
          },
        },
        User: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "ID пользователя",
            },
            email: {
              type: "string",
              format: "email",
              description: "Email пользователя",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        ContentFile: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Уникальный ID файла",
            },
            webdavPath: {
              type: "string",
              description: "Путь к файлу на WebDAV сервере",
              example: "/obsval/FrontEnd/SBORNICK/JS/Array.md",
            },
            mainCategory: {
              type: "string",
              description: "Основная категория",
              example: "JS",
            },
            subCategory: {
              type: "string",
              description: "Подкатегория",
              example: "Array",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        ContentBlock: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Уникальный ID блока контента",
            },
            fileId: {
              type: "string",
              description: "ID связанного файла",
            },
            pathTitles: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Массив родительских заголовков",
              example: ["Родительский Заголовок 1", "Родительский Заголовок 2"],
            },
            blockTitle: {
              type: "string",
              description: "Заголовок блока",
              example: "Заголовок этого блока",
            },
            blockLevel: {
              type: "number",
              description: "Уровень заголовка (1-6)",
              example: 3,
            },
            textContent: {
              type: "string",
              description: "Текстовый контент блока",
            },
            orderInFile: {
              type: "number",
              description: "Порядок блока в файле",
            },
            codeContent: {
              type: "string",
              nullable: true,
              description: "Код блока (если есть)",
            },
            codeLanguage: {
              type: "string",
              nullable: true,
              description: "Язык программирования кода",
              example: "javascript",
            },
            isCodeFoldable: {
              type: "boolean",
              description: "Можно ли свернуть код",
            },
            codeFoldTitle: {
              type: "string",
              nullable: true,
              description: "Заголовок для сворачиваемого кода",
            },
            extractedUrls: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Извлеченные URL из контента",
              example: [
                "http://example.com/page1",
                "https://another-site.org/resource",
              ],
            },
            currentUserSolvedCount: {
              type: "number",
              description: "Количество решений текущего пользователя",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
            },
            file: {
              $ref: "#/components/schemas/ContentFile",
            },
          },
        },
        ContentBlocksList: {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: {
                $ref: "#/components/schemas/ContentBlock",
              },
            },
            pagination: {
              $ref: "#/components/schemas/Pagination",
            },
          },
        },
        ContentCategory: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Название основной категории",
              example: "JS",
            },
            subCategories: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Список подкатегорий",
              example: ["Array", "Async", "Objects"],
            },
          },
        },
        WebDAVFile: {
          type: "object",
          properties: {
            filename: {
              type: "string",
              description: "Полный путь к файлу",
              example: "/path/to/your/directory/file1.txt",
            },
            basename: {
              type: "string",
              description: "Имя файла",
              example: "file1.txt",
            },
            lastmod: {
              type: "string",
              description: "Дата последнего изменения",
              example: "Wed, 19 Feb 2025 08:06:12 GMT",
            },
            size: {
              type: "number",
              description: "Размер файла в байтах",
              example: 12345,
            },
            type: {
              type: "string",
              description: "Тип элемента",
              example: "file",
            },
            etag: {
              type: "string",
              description: "ETag файла",
              example: "some-etag-value",
            },
            mime: {
              type: "string",
              description: "MIME тип файла",
              example: "text/plain",
            },
          },
        },
        UpdateContentResponse: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "Статус обновления",
              example: "Completed",
            },
            processedFiles: {
              type: "number",
              description: "Количество обработанных файлов",
            },
            totalBlocksCreated: {
              type: "number",
              description: "Общее количество созданных блоков",
            },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  filePath: {
                    type: "string",
                    description: "Путь к файлу с ошибкой",
                  },
                  error: {
                    type: "string",
                    description: "Описание ошибки",
                  },
                },
              },
            },
          },
        },
        ContentProgressUpdate: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["increment", "decrement"],
              description: "Действие с прогрессом",
            },
          },
          required: ["action"],
        },
        ContentProgressResponse: {
          type: "object",
          properties: {
            userId: {
              type: "number",
              description: "ID пользователя",
            },
            blockId: {
              type: "string",
              description: "ID блока контента",
            },
            solvedCount: {
              type: "number",
              description: "Количество решений",
            },
          },
        },
      },
    },
    security: [
      {
        cookieAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.ts", "./src/index.ts"], // Пути к файлам с аннотациями
};

export const specs = swaggerJsdoc(options);
