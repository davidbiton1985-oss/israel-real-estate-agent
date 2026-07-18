const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.listing.count({ where: { imageUrl: { not: null }, source: "FACEBOOK" } })
  .then(async (fb) => {
    const total = await p.listing.count({ where: { imageUrl: { not: null } } });
    console.log(`fb=${fb} total=${total}`);
    await p.$disconnect();
  })
  .catch((e) => { console.log("err=" + e.message.slice(0, 60)); process.exit(1); });
