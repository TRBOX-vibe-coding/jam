export * from '@prisma/client';
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __holicgemPrisma: PrismaClient | undefined;
}

/** 개발 중 핫리로드로 커넥션이 늘어나는 것을 막기 위해 전역에 한 번만 만든다. */
export const prisma =
  global.__holicgemPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') global.__holicgemPrisma = prisma;
