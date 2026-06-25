# Development Database

قاعدة بيانات تطوير وتجارب لمشروع Yakolak.

استخدمها ككشكول مؤقت، ولا تحفظ فيها بيانات حقيقية أو مهمة.

## Turso database

```txt
Database name: database-canary-drawer
Turso Cloud ID: 019efe18-ba01-7483-8a59-b88e4a9ed006
```

## Environment variables

ضع القيم التالية في Vercel Environment Variables أو انسخ ملف `.env.public.example` إلى `.env.local` محليًا.

```env
TURSO_DATABASE_URL="libsql://database-canary-drawer-vercel-icfg-r8o7fwhpf7nh36wrug0epn3u.aws-us-east-1.turso.io"
TURSO_AUTH_TOKEN="PASTE_PUBLIC_DEV_TOKEN_HERE"
```

## Install client

```bash
npm install @libsql/client
```

## Basic client

```js
import { createClient } from '@libsql/client';

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
```

## Local setup

```bash
cp .env.public.example .env.local
```

ثم ضع قيمة `TURSO_AUTH_TOKEN` داخل `.env.local`.
