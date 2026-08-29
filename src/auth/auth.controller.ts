import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { resolveClientIp } from './client-ip';
import { LoginDto } from './dto/login.dto';
import { ResendEmailOtpDto } from './dto/resend-email-otp.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';

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
}
