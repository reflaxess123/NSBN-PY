import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function createAdmin() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error("Использование: npm run create-admin <email> <password>");
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("Пароль должен содержать минимум 6 символов");
    process.exit(1);
  }

  try {
    // Проверяем, существует ли уже пользователь с таким email
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.error(`Пользователь с email ${email} уже существует`);
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: "ADMIN",
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    console.log("✅ Администратор успешно создан:");
    console.log(`   ID: ${admin.id}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Роль: ${admin.role}`);
    console.log(`   Создан: ${admin.createdAt}`);
  } catch (error) {
    console.error("❌ Ошибка при создании администратора:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
