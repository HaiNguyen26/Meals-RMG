import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const databaseUrl = process.env.DATABASE_URL ?? loadDatabaseUrlFromFile();
if (!databaseUrl) {
    throw new Error(
        'Missing DATABASE_URL. Set it in backend/.env before running seed.',
    );
}
process.env.DATABASE_URL = databaseUrl;

const prisma = new PrismaClient();

function loadDatabaseUrlFromFile() {
    const candidates = [
        path.resolve(__dirname, '..', '.env'),
        path.resolve(__dirname, '..', '..', '.env'),
    ];
    for (const filePath of candidates) {
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
        const line = content
            .split(/\r?\n/)
            .map((row) => row.trim())
            .find((row) => /^DATABASE_URL\s*=/.test(row));
        if (!line) continue;
        const value = line.replace(/^DATABASE_URL\s*=\s*/, '').trim();
        if (value) {
            return value.replace(/^['"]|['"]$/g, '');
        }
    }
    return null;
}

const departments = [
    'Warehouse',
    'Production',
    'Sales',
    'Purchasing',
    'Mechanical',
    'Design',
    'Automation',
    'Technical Services',
    'Service',
    'CNC',
    'HR',
];

const users = [
    {
        externalId: 'ADMIN',
        email: 'admin@meal.local',
        password: 'RMG123@',
        name: 'Admin',
        department: 'Executive',
        role: UserRole.admin,
    },
    {
        externalId: 'KITCHEN',
        email: 'kitchen@meal.local',
        password: 'RMG123@',
        name: 'Kitchen',
        department: 'Kitchen',
        role: UserRole.kitchen,
    },
    ...departments.map((department) => {
        const emailSlug = department.toLowerCase().replace(/\s+/g, '.');
        return {
            externalId: department,
            email: `${emailSlug}@meal.local`,
            password: 'RMG123@',
            name: `Manager ${department}`,
            department,
            role: UserRole.manager,
        };
    }),
];

async function main() {
    await prisma.user.deleteMany();
    for (const user of users) {
        const passwordHash = await bcrypt.hash(user.password, 10);
        await prisma.user.create({
            data: {
                externalId: user.externalId,
                email: user.email,
                passwordHash,
                name: user.name,
                department: user.department,
                role: user.role,
            },
        });
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

