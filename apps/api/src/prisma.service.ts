import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { prisma } from '@holicgem/db';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client = prisma;

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
