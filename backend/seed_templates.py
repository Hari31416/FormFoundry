import asyncio

from app.db import get_session_maker, init_db
from app.templates.service import ensure_seed_templates


async def seed():
    await init_db()
    session_maker = get_session_maker()
    async with session_maker() as session:
        await ensure_seed_templates(session)
    print("Templates seeded successfully.")


if __name__ == "__main__":
    asyncio.run(seed())
