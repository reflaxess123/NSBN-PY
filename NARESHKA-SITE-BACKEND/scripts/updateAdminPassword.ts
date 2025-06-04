import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function updateAdminPassword() {
  const email = process.argv[2] || "admin@test.com"; // По умолчанию admin@test.com
  const newPassword = process.argv[3];

  if (!newPassword) {
    console.error(
      "Использование: npm run update-admin-password [email] <новый_пароль>"
    );
    console.error(
      "Пример: npm run update-admin-password admin@test.com 123123123"
    );
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error("Пароль должен содержать минимум 6 символов");
    process.exit(1);
  }

  try {
    // Ищем пользователя
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.error(`❌ Пользователь с email ${email} не найден`);
      process.exit(1);
    }

    if (user.role !== "ADMIN") {
      console.error(`❌ Пользователь ${email} не является администратором`);
      process.exit(1);
    }

    // Хешируем новый пароль
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Обновляем пароль
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
      select: {
        id: true,
        email: true,
        role: true,
        updatedAt: true,
      },
    });

    console.log("✅ Пароль администратора успешно обновлен:");
    console.log(`   ID: ${updatedUser.id}`);
    console.log(`   Email: ${updatedUser.email}`);
    console.log(`   Роль: ${updatedUser.role}`);
    console.log(`   Обновлен: ${updatedUser.updatedAt}`);
    console.log(`   Новый пароль: ${newPassword}`);
  } catch (error) {
    console.error("❌ Ошибка при обновлении пароля:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateAdminPassword();
