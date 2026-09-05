import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PropertyManagerSubscriptionService } from '../property-manager-subscription.service';
import type { JwtAccessPayload } from '../types/jwt-payload';
import { UserRole } from '../../users/user-role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly managerSubscription: PropertyManagerSubscriptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: JwtAccessPayload;
    }>();
    const user = request.user;
    if (!user?.role) {
      throw new ForbiddenException(
        'Missing role on access token. Sign out and sign in again.',
      );
    }

    if (!roles.includes(user.role as UserRole)) {
      throw new ForbiddenException(
        `This endpoint requires role: ${roles.join(', ')}. Your token role is: ${user.role}.`,
      );
    }

    if (
      user.role === UserRole.PROPERTY_MANAGER &&
      roles.includes(UserRole.PROPERTY_MANAGER)
    ) {
      await this.managerSubscription.assertPropertyManagerHasPaid(user.email);
    }

    return true;
  }
}
