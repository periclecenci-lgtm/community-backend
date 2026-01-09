import { prisma } from "../src/shared/prisma.js";

async function main() {
  const boards = [
    {
      slug: "market-news",
      title: "Market & News",
      description: "Crypto analysis, news and major events."
    },
    {
      slug: "projects-proposals",
      title: "Projects & Proposals",
      description: "Project ideas, proposals and discussions within the SBELM community."
    }
  ];

  for (const board of boards) {
    await prisma.board.upsert({
      where: { slug: board.slug },
      update: {},
      create: board
    });
  }

  console.log("✅ Community boards seeded");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
