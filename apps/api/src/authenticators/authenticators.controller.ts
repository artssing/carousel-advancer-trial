import { Controller, Get, Query } from '@nestjs/common';
import { AuthenticatorStatus, Category } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Controller('authenticators')
export class AuthenticatorsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('category') category?: Category) {
    return this.prisma.authenticator.findMany({
      where: {
        status: AuthenticatorStatus.ACTIVE,
        ...(category ? { categories: { has: category } } : {}),
      },
      orderBy: [{ starRating: 'desc' }, { completedCount: 'desc' }],
      select: {
        id: true,
        displayName: true,
        storeName: true,
        categories: true,
        starRating: true,
        completedCount: true,
        disputeRate: true,
      },
    });
  }
}
