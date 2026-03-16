#!/bin/sh
# Run this once after first deploy to seed test data
npx prisma db push
npx tsx prisma/seed.ts
echo "Seed complete!"
