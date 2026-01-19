import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) { }

    async login(dto: LoginDto) {
        const user = await this.prisma.user.findUnique({
            where: { externalId: dto.username },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
        if (!passwordOk) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const authUser: AuthUser = {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
            department: user.department,
        };

        return this.issueTokens(authUser);
    }

    async refresh(refreshToken: string) {
        try {
            const payload = await this.jwtService.verifyAsync<JwtPayload>(
                refreshToken,
                {
                    secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
                },
            );

            if (payload.type !== 'refresh') {
                throw new UnauthorizedException('Invalid token type');
            }

            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
            });

            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            return this.issueTokens({
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name,
                department: user.department,
            });
        } catch {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    private async issueTokens(user: AuthUser) {
        const accessPayload: JwtPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
            department: user.department,
            type: 'access',
        };

        const refreshPayload: JwtPayload = {
            ...accessPayload,
            type: 'refresh',
        };

        const accessToken = await this.jwtService.signAsync(accessPayload, {
            secret: process.env.JWT_SECRET ?? 'dev-secret',
            expiresIn: '8h',
        });
        const refreshToken = await this.jwtService.signAsync(refreshPayload, {
            secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
            expiresIn: '7d',
        });

        return {
            accessToken,
            refreshToken,
            user,
        };
    }
}

