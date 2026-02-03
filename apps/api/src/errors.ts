import type { Response } from "express";

export const sendError = (
  res: Response,
  status: number,
  code: string,
  message: string
) => {
  res.status(status).json({ error: { code, message } });
};
