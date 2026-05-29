import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtAccessPayload } from '../types/jwt-payload';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: JwtAccessPayload;
    }>();
    const token = this.extractBearer(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing or invalid authorization');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtAccessPayload>(
        token,
        {
          issuer: 'real_estate_backend',
          audience: 'rent_pilot',
        },
      );
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractBearer(authorization?: string): string | undefined {
    if (!authorization || typeof authorization !== 'string') {
      return undefined;
    }
    const [type, token] = authorization.trim().split(/\s+/, 2);
    if (type?.toLowerCase() !== 'bearer' || !token) {
      return undefined;
    }
    return token;
  }
}
