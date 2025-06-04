import { PrismaClient } from "@prisma/client";
import { NextFunction, Request, Response } from "express";

const prisma = new PrismaClient();

export type UserRole = "GUEST" | "USER" | "ADMIN";

// Расширяем интерфейс Request для добавления информации о роли
declare global {
  namespace Express {
    interface Request {
      userRole?: UserRole;
    }
  }
}

// Middleware для проверки роли администратора
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ message: "Не авторизован" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || user.role !== "ADMIN") {
      return res.status(403).json({
        message: "Доступ запрещен. Требуются права администратора",
      });
    }

    req.userRole = user.role;
    next();
  } catch (error) {
    console.error("Role check error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
};

// Middleware для проверки минимальной роли
export const requireRole = (minRole: UserRole) => {
  const roleHierarchy: Record<UserRole, number> = {
    GUEST: 0,
    USER: 1,
    ADMIN: 2,
  };

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId;

      if (!userId) {
        // Если не авторизован, считаем гостем
        req.userRole = "GUEST";
        if (roleHierarchy["GUEST"] >= roleHierarchy[minRole]) {
          return next();
        }
        return res.status(401).json({
          message: "Требуется авторизация",
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      req.userRole = user.role;

      if (roleHierarchy[user.role] < roleHierarchy[minRole]) {
        return res.status(403).json({
          message: `Доступ запрещен. Требуется роль: ${minRole}`,
        });
      }

      next();
    } catch (error) {
      console.error("Role check error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  };
};

// Middleware для получения роли пользователя (не блокирующий)
export const attachUserRole = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      req.userRole = "GUEST";
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    req.userRole = user?.role || "GUEST";
    next();
  } catch (error) {
    console.error("Attach user role error:", error);
    req.userRole = "GUEST";
    next();
  }
};
