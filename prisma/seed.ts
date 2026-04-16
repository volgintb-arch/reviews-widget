import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_SETTINGS: Record<string, unknown> = {
  'widget.title': 'ЧТО ГОВОРЯТ РОДИТЕЛИ НАШИХ ГОСТЕЙ',
  'widget.accent_color': '#F5A623',
  'widget.star_color': '#FFC107',
  'widget.bg_color': '#F4D8A8',
  'widget.card_bg': '#FFFFFF',
  'widget.text_color': '#2C2C2C',
  'widget.font_family': 'Inter, sans-serif',
  'widget.min_rating': 3,
  'widget.min_text_length': 20,
  'widget.cards_visible_desktop': 3,
  'widget.cards_visible_mobile': 1,
};

async function main() {
  console.log('Seeding database...');

  // Create Barnaul city
  await prisma.city.upsert({
    where: { slug: 'brn' },
    update: {},
    create: {
      slug: 'brn',
      name: 'Барнаул',
      twogisFirmId: '70000001098486101',
      yandexOrgId: '43498626415',
      siteUrl: 'https://brn.questlegends.ru',
      isActive: true,
    },
  });

  // Create default widget settings
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const stringValue = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: stringValue },
    });
  }

  console.log('Seed completed!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
