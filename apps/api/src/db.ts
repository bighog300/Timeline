import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | null = null;

export const createPrismaClient = (options?: ConstructorParameters<typeof PrismaClient>[0]) =>
  new PrismaClient(options);

export const getPrismaClient = () => {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
};

export const disconnectPrisma = async () => {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
};
