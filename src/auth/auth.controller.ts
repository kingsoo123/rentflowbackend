import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { resolveClientIp } from './client-ip';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { JwtAccessPayload } from './types/jwt-payload';
import { LoginDto } from './dto/login.dto';
import { ResendEmailOtpDto } from './dto/resend-email-otp.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';

type AuthedRequest = Request & { user: JwtAccessPayload };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailOtpDto) {
    return this.authService.verifyEmailOtp(dto);
  }

  @Post('resend-email-otp')
  @HttpCode(HttpStatus.OK)
  resendEmailOtp(@Body() dto: ResendEmailOtpDto) {
    return this.authService.resendEmailOtp(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, resolveClientIp(req));
  }

  @Get('subscription-status')
  @UseGuards(JwtAuthGuard)
  getSubscriptionStatus(@Req() req: AuthedRequest) {
    return this.authService.getSubscriptionStatus(req.user);
  }
}
