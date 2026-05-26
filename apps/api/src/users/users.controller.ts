import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() user: CurrentUserData) {
    const found = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        roles: true,
        kycStatus: true,
        createdAt: true,
      },
    });
    if (!found) throw new NotFoundException('User not found');
    return found;
  }
}
