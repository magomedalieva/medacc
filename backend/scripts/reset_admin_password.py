import argparse
import asyncio
import sys

from app.core.database import session_factory
from app.services.admin_access_service import AdminAccessService


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reset a MedAcc administrator password.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    return parser.parse_args()


async def main() -> None:
    args = parse_args()

    async with session_factory() as session:
        await AdminAccessService(session).reset_active_admin_password(
            email=args.email,
            password=args.password,
        )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exception:
        print(str(exception), file=sys.stderr)
        raise SystemExit(1)
