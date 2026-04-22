/**
 * One-time migration: replace /search/firm/ with /firm/ in all 2GIS review URLs
 * Run: npx tsx scripts/fix-review-urls.ts
 */
import { prisma } from '../src/lib/prisma.js';

async function main() {
  const result = await prisma.review.updateMany({
    where: {
      source: '2gis',
      reviewUrl: { contains: '/search/firm/' },
    },
    data: {
      reviewUrl: undefined, // can't do string replace in Prisma updateMany
    },
  });

  // Prisma updateMany can't do string replacement — use raw SQL
  const { count } = await prisma.$executeRaw`
    UPDATE "Review"
    SET "reviewUrl" = REPLACE("reviewUrl", '/search/firm/', '/firm/')
    WHERE source = '2gis' AND "reviewUrl" LIKE '%/search/firm/%'
  `;

  console.log(`Updated ${count} review URLs`);
  await prisma.$disconnect();
}

main().catch(console.error);
