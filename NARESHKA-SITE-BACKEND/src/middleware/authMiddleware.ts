import { Request, Response, NextFunction } from "express";

// Тип для userId должен быть доступен глобально из объявления в auth.ts

export const isAuthenticated = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.session && req.session.userId) {
    // Пользователь аутентифицирован, передаем управление дальше
    return next();
  }
  // Пользователь не аутентифицирован
  res.status(401).json({ message: "Unauthorized: Please log in." });
};
