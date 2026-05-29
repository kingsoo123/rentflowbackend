import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtAccessPayload } from '../types/jwt-payload';
import { UserRole } from '../../users/user-role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    return true;
  }
}
