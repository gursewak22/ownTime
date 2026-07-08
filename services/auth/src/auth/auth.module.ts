import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { JWT_KEYS, JwtKeys, JwtKeysModule } from './jwt-keys';

@Module({
  imports: [
    JwtKeysModule,
    // RS256: sign with the private key, verify with the public key (ADR 0005).
    JwtModule.registerAsync({
      global: true,
      imports: [JwtKeysModule],
      inject: [JWT_KEYS, ConfigService],
      useFactory: (keys: JwtKeys, config: ConfigService) => ({
        privateKey: keys.privatePem,
        publicKey: keys.publicPem,
        signOptions: {
          algorithm: 'RS256',
          keyid: keys.kid,
          expiresIn: (config.get<string>('AUTH_ACCESS_TOKEN_TTL') ??
            '5m') as JwtSignOptions['expiresIn'],
        },
        verifyOptions: { algorithms: ['RS256'] },
      }),
    }),
    // Bounds brute-force and the otherwise-unbounded Google verify work. NOTE:
    // the default store is per-instance memory — swap for the Redis storage when
    // running more than one replica.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // ThrottlerGuard first so floods are dropped before auth work runs.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
